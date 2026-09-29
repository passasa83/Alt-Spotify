# Changements — branche `Akajox`, fusionnée dans `main`

Récapitulatif des corrections apportées au projet, fusionnées avec les nouveautés de `main`
(scanner de musique locale, Tidal, yt-dlp, pochettes). Les consignes de déploiement sont en
premier : à lire **avant** de mettre à jour le serveur.

---

## ⚠️ À faire au déploiement

1. **`SECRET_KEY` obligatoire.** Le backend refuse de démarrer si elle est absente, fait
   moins de 32 caractères ou vaut une valeur d'exemple (`changeme`…). Pour en générer une :
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
   Changer la clé déconnecte tous les utilisateurs.
   `docker compose` refuse aussi de démarrer si elle est absente du `.env`.
2. **Récupérer les nouvelles images** (construites par GitHub Actions au push sur `main` ;
   nouvelles dépendances : Celery côté backend, psycopg côté worker) :
   ```bash
   docker compose pull && docker compose up -d
   ```
   Le worker monte maintenant les mêmes dossiers de musique que le backend (lecture seule),
   pour pouvoir transcoder les fichiers locaux.
3. **Générer le HLS des morceaux existants** (fichiers locaux, téléchargements YouTube et
   uploads) : la chaîne de transcodage était cassée, aucun morceau n'a encore ses variantes HLS.
   Une fois connecté en admin : `POST /api/v1/upload/transcode-missing`.
4. **Inscription sur invitation** : les comptes existants ne changent pas. Les nouveaux membres
   ont besoin d'un lien créé depuis la page admin « Invitations ».
5. **Connexion obligatoire sur toute l'API** (catalogue, paroles, podcasts, playlists, Tidal…).
   Un outil externe qui appelait l'API sans token recevra désormais une erreur 401.

---

## Streaming et transcodage HLS

La chaîne upload → transcodage → lecture HLS ne fonctionnait pas du tout. Elle est testée de bout
en bout dans Docker (upload d'un MP3, transcodage en ~2 s, lecture des playlists et segments).

- **Fichiers locaux** (`local:/music/…`, téléchargements yt-dlp) : le worker les lit directement
  depuis les dossiers montés et les transcode comme les uploads. Le stream direct et le
  téléchargement des fichiers locaux passent par une fonction commune qui gère correctement
  les requêtes de plages d'octets (et renvoie 416 pour une plage invalide).
- **Envoi des tâches au worker** : le backend importait `worker.tasks`, absent de son image Docker,
  et l'erreur était avalée. Il envoie maintenant les tâches par leur nom via Celery
  (`backend/app/core/tasks.py`), après le commit en base.
- **Le worker met à jour la base** : il renseigne `tracks.hls_path` en fin de transcodage
  (il reçoit `DATABASE_URL` dans `docker-compose.yml`).
- **Transcodage** (`worker/tasks.py`) :
  - les pochettes intégrées aux fichiers ne sont plus traitées comme une piste vidéo ;
  - pas de variante plus haute que la qualité source (un MP3 192k donne 128k + 192k) ;
  - la playlist principale n'est publiée qu'une fois tous les segments envoyés ;
  - un fichier illisible met la tâche en échec au lieu de publier une playlist vide.
- **Nouveaux endpoints admin** : `POST /upload/transcode/{id}` (un morceau) et
  `POST /upload/transcode-missing` (tous les morceaux sans HLS).
- **Endpoints HLS sécurisés** : authentification obligatoire, restrictions comptes enfants et
  territoires appliquées, noms de segments validés.
- **Lecteur web** : utilise hls.js quand le HLS est disponible (`frontend/src/utils/audioSource.ts`),
  avec retour au fichier d'origine en cas d'erreur. Le hook `useHlsPlayer.ts`, jamais utilisé,
  a été supprimé.
- **Worker** : suppression de deux tâches mortes (`generate_waveform`, `process_upload`).
  La tâche de nettoyage ne supprime plus que les fichiers HLS orphelins (morceaux supprimés) ;
  l'ancienne aurait cassé la lecture de tous les morceaux de plus de 30 jours.

## Sécurité

- **Inscription sur invitation** : le premier compte créé devient admin ; ensuite, une invitation
  valide est exigée (non révoquée, non expirée, pas épuisée, bon email si précisé). Le réglage
  `OPEN_REGISTRATION=true` permet de rouvrir l'inscription. Champ « Code d'invitation » ajouté
  sur le web (pré-rempli par les liens `/register?invite=…`) et sur mobile.
- **`SECRET_KEY` obligatoire** (voir plus haut). `scripts/setup.sh` écrasait aussi
  `MINIO_SECRET_KEY` en générant la clé : corrigé.
- **Playlists privées** : elles étaient lisibles par n'importe qui, même non connecté.
  Seul leur propriétaire y a accès désormais.
- **Connexion obligatoire** sur le catalogue, les paroles, les podcasts (y compris le streaming
  audio des épisodes), les recommandations, les profils utilisateurs (qui exposaient l'email)
  et le téléchargement des morceaux.
- **Tidal** : tous les endpoints étaient publics, y compris les URL de streaming, ce qui
  exposait l'abonnement Tidal à n'importe qui sur Internet. Ils exigent maintenant une connexion.
- **Recherche** : `/search` exige une connexion (il crée des fiches en base).
  `/search/jiosaavn` et `/search/enriched` sont réservés aux admins.
- **`/search/download-deezer`** : il téléchargeait n'importe quelle URL sans authentification
  (accès possible aux services internes). Réservé aux admins et limité au CDN de Deezer.
  Il plantait aussi à chaque appel : corrigé.
- **Suppression du filtre des paramètres d'URL** : il cassait les recherches (« AC/DC »,
  « Guns N' Roses ») sans apporter de sécurité.

## Fonctionnalités réparées

- **Création/modification de morceaux** : renvoyait une erreur 500.
- **Notifications en temps réel** : jamais délivrées (le serveur attendait un message du client
  qui n'arrivait jamais), et chaque déconnexion fermait le client Redis partagé par toute l'appli.
- **Jam** :
  - une connexion restait ouverte indéfiniment côté serveur après la déconnexion d'un client ;
  - n'importe quel utilisateur pouvait suivre la session et le chat : réservé aux participants ;
  - les votes pour passer un morceau sont remis à zéro à chaque changement de morceau ;
  - une session sans participant est terminée ;
  - codes de session générés avec un tirage sûr.
- **Podcasts** : la lecture n'existait pas (le bouton Play changeait juste d'icône) et la page
  épisode affichait toujours « Episode not found ». Il y a maintenant un vrai lecteur, des liens
  depuis la liste des épisodes, et un endpoint `GET /podcasts/episodes/{id}`.
- **Crossfade** : le fondu démarre avant la fin du morceau, la progression et l'enchaînement
  continuent après une transition, le morceau suivant ne repart plus de zéro, et le morceau
  affiché est bien celui qui joue (y compris en aléatoire).
- **Onglet « Tendances »** : affichait la même chose que « Nouveautés ». `/tracks` accepte
  maintenant `sort` (`created_at`, `play_count`, `title`) et `order`.
- **Suivre un utilisateur (web)** : appelait une route inexistante.
- **Appli mobile** : mauvais nom des paramètres de pagination et trois routes inexistantes
  (recherche d'albums, recherche d'artistes, top morceaux d'un artiste).
- **Notifications push** : envoyées par lots de 100 au lieu d'une requête par appareil en série.

## Tests et CI

- Backend : **244 tests passent** (contre 59 au départ). Ils ne dépendent plus d'un Redis réel
  (`fakeredis`) ni d'un Postgres réel, et tournent en ~1 min 15 au lieu de ~10 min.
- Nouveaux tests : invitations, `SECRET_KEY`, accès (playlists privées, catalogue, podcasts),
  HLS, transcodage, WebSockets Jam et notifications, push par lots, tri des morceaux.
- CI : la `SECRET_KEY` est fournie aux tests ; le frontend est vérifié (typecheck, tests, build).
- Lint : erreurs d'imports corrigées dans le code venu de `main` (Tidal, scanner, yt-dlp),
  qui faisaient échouer `ruff check`.
- Testé de bout en bout dans Docker après la fusion : upload et fichier local transcodés en
  ~2 s, playlists et segments HLS servis, stream direct et téléchargement fonctionnels.

## Pas encore corrigé

- **Migrations Alembic** : très éloignées des modèles (colonnes manquantes, types différents).
  Le schéma est créé par `create_all`, qui n'ajoute jamais de colonne à une base existante.
  Il faudrait recréer une migration de référence à partir d'une vraie base Postgres.
- **Révocation des refresh tokens** : nécessite une nouvelle colonne, donc le point précédent.
- **Fiches sans audio** : la recherche crée en base une fiche pour chaque résultat Deezer
  (titre, artiste, pochette, sans fichier audio).
- **Égaliseur et ReplayGain** : ne suivent pas le son après un crossfade.
- **Réordonnancement des playlists** : le client et l'API ne s'accordent pas sur le format
  (aucun écran ne l'utilise pour l'instant).
- **Frontend et mobile** : modifications non vérifiées par le typecheck ni les tests (Node
  absent de la machine de développement). Le build de production du frontend passe.
