# Audit fonctionnel — Alt Spotify

**Date :** 1er octobre 2026 · **Branche :** `Akajox` (à jour de `main` + correctifs de l'audit)

## Méthode et périmètre

- **Environnement :** l'application complète en local. Backend lancé avec `backend/scripts/dev_server.py` (base SQLite, Redis en mémoire), front lancé avec `npm run dev`, 3 fichiers audio de test.
- **Comptes :** un admin, plus un utilisateur créé par invitation pour tester les droits.
- **API :** environ 130 appels scénarisés, couvrant les 25 modules. On vérifie le code HTTP, le contenu de la réponse et les effets de bord.
- **Interface :** 27 pages parcourues dans le navigateur, en relevant le rendu, les erreurs JS et les requêtes en échec. S'y ajoutent les parcours interactifs : lecture, file d'attente, ajout à une playlist, playlist intelligente, Jam et chat, podcasts, administration, mobile.
- **Pas testable en local :** MinIO (upload, stockage, HLS), Meilisearch, le worker de transcodage, `ffmpeg` (téléchargement YouTube) et l'application mobile. Ces points sont marqués ⚪.
- **Tests automatisés à la fin de l'audit :** 256 tests backend et 80 tests frontend, tous au vert.

**Légende :** ✅ fonctionne · 🟡 fonctionne partiellement · ❌ ne fonctionne pas · 🔧 était cassé, corrigé pendant l'audit · ⚪ non testable en local

---

## 1. État des fonctionnalités

### Comptes et accès

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Connexion / déconnexion | ✅ | Un mauvais mot de passe renvoie 401 avec un message clair. | — |
| Inscription sur invitation | ✅ | Sans invitation : refusée (403). Une invitation à usage unique ne sert qu'une fois. | Pré-remplir l'e-mail si l'invitation en contient un. |
| Rafraîchissement du token | ✅ | Le token expire au bout de 24 h et le rafraîchissement est transparent. | Le token passé dans l'URL du stream n'est pas rafraîchi (relance une fois sur 401, géré côté lecteur). |
| Changer de mot de passe | ✅ | Un mauvais mot de passe actuel est refusé. | — |
| Profil (bio, pays, avatar) | ✅ | La mise à jour fonctionne. | — |
| Comptes enfant | ✅ | Les titres explicites sont filtrés (couvert par les tests). | Pas de réglage visible pour l'admin dans la liste des utilisateurs. |
| Droits admin | ✅ | Toutes les routes admin renvoient 403 aux utilisateurs. L'espace admin attend un admin vérifié. | — |

### Lecture

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Lecture de fichiers locaux | ✅ | Le stream fonctionne avec Range (206). Sans token : 401. | — |
| **Enregistrement des écoutes** | 🔧 | Le lecteur web **n'enregistrait aucune écoute** : `playTrack()` n'était jamais appelé. L'historique, les stats, les compteurs, Découvertes, le Wrapped et les analyses admin restaient vides. Désormais, une écoute est comptée après 10 s. | — |
| Enchaînement automatique | ✅ | Constaté : fin de Tone 1, puis Tone 3 lancé tout seul. La suite de la playlist, puis des titres similaires, prennent le relais. | — |
| File d'attente (panneau) | ✅ | On peut passer à un titre, en retirer un ou vider la file. | Réorganiser la file par glisser-déposer. |
| Pause sur la piste en cours | ✅ | Le bouton passe en Pause au survol. Un clic met en pause et la reprise se fait au même endroit (vérifié : 0:10 → 0:12). | — |
| Erreurs de lecture | ✅ | Un message s'affiche et on passe au titre suivant. Le lecteur s'arrête après 3 échecs. | — |
| Fondu enchaîné / gapless | 🟡 | Couvert par le code et les tests, mais pas vérifié à l'oreille. | Test manuel à faire. |
| Égaliseur | 🟡 | Pas vérifié. Le lecteur change d'élément `<audio>` à chaque fondu, et l'égaliseur (Web Audio) risque de rester branché sur l'ancien. | Brancher l'égaliseur sur un graphe audio commun aux deux éléments. |
| HLS (128/192/320k) | ⚪ / ❌ prod | Le worker est absent en local. Sur le serveur, **0 piste transcodée** (voir le diagnostic). | Vérifier que le worker voit `/music` et `/app/downloads`. |
| Paroles synchronisées | ✅ | L'upload LRC fonctionne, ainsi que l'affichage synchronisé. | Récupération automatique (LRCLIB). |
| Téléchargement hors ligne | 🟡 | Le fichier est gardé **en mémoire** seulement : après un rechargement, la piste reste marquée « téléchargée » mais le fichier a disparu. | Stocker dans IndexedDB / Cache API, avec un service worker. |
| Touches multimédia / raccourcis | ✅ | Media Session, titre de l'onglet, Espace et flèches. | — |
| Durée des pistes scannées | 🟡 | Les WAV scannés affichent **0:00**. | Lire la durée via `mutagen`/`ffprobe` pour tous les formats. |
| Pochettes automatiques | 🟡 | Les pistes de test ont reçu une pochette **sans rapport** (« Irish Cream ») : la recherche de pochette accepte de faux positifs. | Exiger une correspondance titre + artiste, ou un score minimum. |

### Catalogue et recherche

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Recherche (local + Deezer) | 🔧 | Les pistes locales jouables passaient **après** tous les résultats Deezer (19ᵉ à 21ᵉ sur 24). Elles sont maintenant en tête. | Afficher clairement « non disponible » sur les résultats sans audio. |
| **Pollution du catalogue** | 🔧 | **Chaque recherche crée une piste vide en base** pour chaque résultat Deezer. En local, 2 recherches ont fait passer le catalogue de 4 à 55 pistes, dont 3 jouables. C'est l'origine des **805 pistes sans audio** du serveur et de l'accueil rempli de titres injouables. | **Corrigé :** la recherche réutilise les pistes déjà créées, l'accueil, Parcourir et les playlists intelligentes n'affichent que des titres jouables, et un bouton admin purge les pistes vides inutilisées. |
| Recherche Tidal | ✅ | Réponse en 3 s. | — |
| Artistes / albums (admin) | ✅ | Création, modification et pages publiques fonctionnent. | Textes « Discography » et « About the artist » en anglais. |
| Upload audio / pochette | 🔧 | Sans MinIO : erreur 500 générique **après 30 s**, avec toute l'API figée pendant ce temps. | **Corrigé :** erreur 503 « stockage indisponible » en 4 s, sans figer l'API. |
| Téléchargement YouTube | ⚪ | Échec en local faute de `ffmpeg` (inclus dans l'image Docker ; 1 844 pistes téléchargées en prod). | Afficher la raison de l'échec à l'utilisateur. |
| Scan du dossier musique | ✅ | Les fichiers déjà importés sont ignorés. | — |

### Playlists

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Créer / renommer | ✅ | — | — |
| **Supprimer** | 🔧 | **Erreur 500 dès que la playlist contient des titres** : la cascade de suppression manquait. Corrigé, avec un test de non-régression. | — |
| Ajouter / retirer un titre | ✅ | Les doublons sont refusés, avec un message. | Messages en anglais. |
| Réordonner | ❌ | Le front envoie un objet alors que l'API attend une liste (422), et aucune interface ne propose de réordonner. | Glisser-déposer et aligner le format. |
| Playlists privées | ✅ | Invisibles pour les autres (404). | — |
| Titres favoris (Liked Songs) | ✅ | Synchronisés avec les favoris. | — |
| Playlist intelligente | 🔧 | La création et le rafraîchissement fonctionnent, mais une règle **vide** est acceptée, et la playlist a pris **47 titres sans audio sur 50**. | **Corrigé :** uniquement des titres jouables, et au moins une règle complète est obligatoire. |
| Top du mois / de l'année | ✅ | Généré depuis Stats. | — |
| Import Spotify | ⚪ | Clés API non configurées : erreur 501 avec un message clair. | — |
| Import Deezer | 🔧 | Les liens copiés depuis le site (`deezer.com/fr/playlist/…`) étaient refusés. | — |
| Import / export CSV-JSON | 🟡 | L'API fonctionne (aller-retour vérifié), mais **aucun bouton dans l'interface**. | Ajouter les boutons dans la Bibliothèque et dans les playlists. |

### Découverte et statistiques

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| **Découvertes / Daily Mix** | 🔧 | **Aucun titre ne se lançait** : l'API renvoyait des pistes incomplètes (sans `id` ni fichier). Elles sont maintenant complètes et jouables, ce qui est vérifié dans le navigateur. | — |
| Radio / titres similaires | 🟡 | L'API est corrigée, mais il n'y a **pas de bouton « Radio »** dans l'interface. | Ajouter « Lancer la radio » dans le menu d'une piste. |
| Historique d'écoute | ✅ | Fonctionne depuis la correction de l'enregistrement des écoutes. | — |
| Statistiques | 🔧 | Le top des titres et des artistes fonctionne. Mais le **temps d'écoute reste à 0h 0m** (la durée envoyée est toujours 0), et la **série d'écoute reste à 0 jour** malgré des écoutes du jour. | **Corrigé :** la durée réellement écoutée est envoyée, la série est calculée correctement, et les jours actifs du Wrapped aussi. |
| Wrapped annuel | 🔧 | Il est calculé. Les heures étaient à 0 et les « jours actifs » comptaient en réalité les écoutes : corrigé. | Prévoir une page dédiée. |

### Social, partage, notifications

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Suivre un utilisateur / un artiste, fil d'actualité | 🟡 | L'API fonctionne, mais **aucune interface** ne l'utilise. | Bouton « Suivre » sur les pages artiste et profil, et page Fil. |
| Partage (lien + QR) | ❌ | L'API fonctionne (le QR est une vraie image PNG), mais la fonction du front envoie un mauvais format (422). Le composant `ShareModal` n'est utilisé nulle part, et son « QR » n'est que du texte. | Brancher « Partager » dans les menus, avec le QR de l'API. |
| Notifications | ✅ | Une notification « X a rejoint votre Jam » est générée. Le compteur et « tout marquer comme lu » fonctionnent. | — |

### Jam (écoute à plusieurs)

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Créer / rejoindre / quitter, QR | ✅ | Le code et le QR sont générés. | — |
| Temps réel (WebSocket) | ✅ | « Connecté », le morceau en cours et la liste des participants s'affichent. | — |
| Chat | ✅ | Message envoyé et affiché. | — |
| File d'attente de la Jam | 🟡 | Elle s'affiche, mais **aucun moyen d'y ajouter un titre** depuis l'interface. | Ajouter « Ajouter à la Jam » (menu d'une piste ou recherche dans la Jam). |

### Podcasts

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Import d'un flux RSS | ✅ | NPR Planet Money : 355 épisodes importés en 1,5 s. | Rafraîchissement automatique des flux. |
| Lecture d'un épisode | 🟡 | Il joue dans un **lecteur séparé**, propre à la page. Changer de page coupe l'écoute, la position n'est pas mémorisée, et l'épisode n'apparaît pas dans la barre du lecteur. | Passer par le lecteur principal, avec reprise et vitesse de lecture. |
| Page d'un podcast | 🟡 | Les 355 épisodes s'affichent d'un coup, descriptions complètes comprises (**820 000 caractères**). | Paginer et tronquer les descriptions. |

### Appareils et notifications push

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Appareils (enregistrement, activité) | ✅ | Visibles dans l'admin. | — |
| Transférer la lecture vers un appareil | 🟡 | L'API répond, mais **aucune interface** ne l'utilise. | Sélecteur d'appareil dans le lecteur, façon « Spotify Connect ». |
| Notifications push (mobile) | ⚪ | L'API fonctionne. L'envoi réel n'a pas été testé (application mobile non testée). | — |

### Administration

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Santé (par domaine) | ✅ | Pannes et avertissements détectés correctement. | — |
| Utilisateurs (rôles, activité) | ✅ | — | Réinitialiser le mot de passe d'un utilisateur. |
| Tableau de bord / analytics | ✅ | Les graphiques se remplissent depuis la correction des écoutes. | « Espace utilisé : N/A » en local. |
| Catalogue | 🟡 | Il liste aussi les pistes vides issues des recherches. | Filtre « jouables / sans audio / fichier introuvable » et suppression en masse. |
| Invitations | ✅ | — | — |
| Monitoring | 🔧 | La page affichait « NaN undefined % of NaN undefined ». L'appel `/monitoring/health` **gelait l'API 30 s** quand MinIO était hors ligne. | Elle fait doublon avec la page Santé : à fusionner. |
| Upload | ⚪ | Dépend de MinIO. | Voir « Upload » plus haut. |

### Interface générale

| Fonctionnalité | État | Constat | Amélioration |
|---|:-:|---|---|
| Stabilité | ✅ | **Aucune erreur JS ni requête en échec** sur les 27 pages parcourues. | — |
| Mobile / responsive | ✅ | Navigation mobile, menus « ⋯ », plus aucun chevauchement (corrigé aujourd'hui). | — |
| Traduction | 🟡 | Beaucoup de textes restent en anglais dans l'interface française : « Your Library », « Songs », « Discography », « About the artist », « Add to queue », « Add to playlist », « Track already in this playlist », « Edit track », « Title »… | Passer ces textes par l'i18n. |

### Sécurité (vérifié)

| Point | État | Constat |
|---|:-:|---|
| Accès sans connexion | ✅ | Seuls `openapi.json` et le QR de partage sont publics. Les métriques ne le sont plus (corrigé aujourd'hui). |
| Cloisonnement entre utilisateurs | ✅ | Les playlists privées, les routes admin et les actions sur les playlists des autres sont refusées. |
| Points à surveiller | 🟡 | Le token d'accès circule dans l'URL du stream (il apparaît donc dans les logs du proxy). Identifiants MinIO et Meilisearch par défaut. `CORS_ORIGINS=*` par défaut. Ces trois points sont signalés dans Administration › Santé. |

---

## 2. Bugs corrigés pendant l'audit

| Bug | Impact | Commit |
|---|---|---|
| Le lecteur web n'enregistrait aucune écoute | Historique, stats, Découvertes, Wrapped et analytics vides | `99b6d8c` |
| Supprimer une playlist non vide → erreur 500 | Impossible de supprimer une playlist | `99b6d8c` |
| Recherche : pistes jouables classées en dernier | Les titres disponibles étaient introuvables | `99b6d8c` |
| Import Deezer : liens `/fr/playlist/…` refusés | Import impossible avec un lien copié | `99b6d8c` |
| `/monitoring/health` gelait l'API 30 s | API figée si MinIO tombe | `99b6d8c` |
| Monitoring : « NaN undefined % » | Affichage cassé | `99b6d8c` |
| Découvertes / Daily Mix : aucun titre jouable | Pages de recommandations inutilisables | `f7b38c6` |
| Catalogue pollué par les recherches | Accueil et playlists remplis de titres injouables | `ea05f36` |
| Upload bloqué 30 s puis erreur 500 si MinIO est absent | API figée, message incompréhensible | `5206083` |
| Temps d'écoute toujours à 0, série à 0, jours actifs faux | Statistiques fausses | `1f63834` |

Tous ces correctifs sont couverts par des tests de non-régression.

---

## 3. Ajouts à faire

### Nécessaires (par priorité)

1. **Remettre la lecture en service sur le serveur.** Corriger `MUSIC_SCAN_DIR` et `MUSIC_DOWNLOAD_DIR` (voir `DIAGNOSTIC-LECTURE.md` et `scripts/update-server.sh`). Tant que ce n'est pas fait, aucune piste ne se lit.
2. ~~**Arrêter de polluer le catalogue.**~~ Fait (`ea05f36`). Sur le serveur, après mise à jour : **Administration › Catalogue › « Nettoyer N pistes vides »** pour retirer les ~805 pistes vides existantes.
3. **Faire fonctionner le transcodage HLS.** Aujourd'hui, 0 piste est transcodée en prod. Vérifier le worker et les volumes, et lancer `transcode-missing`.
4. ~~**Upload robuste.**~~ Fait (`5206083`).
5. ~~**Statistiques justes.**~~ Fait (`1f63834`). Les écoutes passées restent à 0 s : seules les nouvelles ont leur durée.
6. **Traduction complète** de l'interface.
7. **Brancher dans l'interface ce que l'API sait déjà faire :**
   - réordonner une playlist par glisser-déposer ;
   - partage avec QR ;
   - import et export CSV/JSON ;
   - suivre un utilisateur ou un artiste, et le fil d'actualité ;
   - radio depuis une piste ;
   - transfert de lecture vers un autre appareil ;
   - ajout à la file d'une Jam.
8. **Podcasts dans le lecteur principal**, avec reprise de la position et pagination des épisodes.
9. **Téléchargement hors ligne persistant** (IndexedDB + service worker).
10. **Tests de bout en bout** (Playwright) sur les parcours clés : connexion, lecture, playlist, Jam. Ils auraient détecté les écoutes non enregistrées et les recommandations injouables.

### Potentiels

- **Application installable (PWA)** avec mode hors ligne, en prolongement du point 9.
- **Paroles automatiques** via LRCLIB, avec éditeur de paroles pour les admins.
- **Playlists collaboratives** : le champ `is_collaborative` existe déjà, il manque l'interface d'invitation.
- **Scrobbling Last.fm** : les paramètres `LASTFM_*` existent déjà.
- **Page « Wrapped » animée** de fin d'année.
- **Notifications de sortie** pour les artistes suivis.
- **Diffusion** : Chromecast / AirPlay, multi-pièces.
- **Admin :** sauvegarde automatique de la base, quotas d'upload par utilisateur, journal des actions admin, réinitialisation du mot de passe d'un utilisateur.
- **Recherche tolérante aux fautes** via Meilisearch : il est déployé, mais la recherche principale passe par `ILIKE` + Deezer.
