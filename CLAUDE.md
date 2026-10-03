# Alt Spotify — contexte pour Claude

Plateforme de streaming musical auto-hébergée (usage privé : foyer, amis), clone de Spotify.
Dépôt : `github.com/passasa83/Alt-Spotify`. Production : https://app.musicgratos.duckdns.org (gérée par une autre personne, pas d'accès SSH depuis ici).

**Langue : l'utilisateur écrit en français, répondre en français.** Code, commentaires et messages de commit en anglais.

## Architecture

| Dossier | Contenu |
|---|---|
| `backend/` | FastAPI (async SQLAlchemy, PostgreSQL), API sous `/api/v1`. Routes : `app/api/v1/*.py`, logique : `app/services/`, utilitaires : `app/utils/`, cœur : `app/core/` |
| `frontend/` | React 18 + Vite + TypeScript + Tailwind v4 + Zustand. Servi par nginx (`frontend/nginx.conf`, qui proxifie `/api` vers le backend) |
| `worker/` | Celery (Redis) : transcodage HLS avec ffmpeg, upload des segments dans MinIO |
| `mobile/` | App Expo 52 / React Native 0.76 : démarre et se compile (CI : typecheck + bundle Android), jamais testée sur un vrai téléphone |
| `docker-compose.yml` | Stack prod : postgres, redis, minio, meilisearch, backend, worker, frontend. Images `ghcr.io/passasa83/alt-spotify-*:main` |

Points clés du fonctionnement :
- **Musique locale** : le scanner (`api/v1/music_scanner.py`) indexe `MUSIC_SCAN_DIR` (`/music`) ; `file_url = "local:<chemin dans le conteneur>"`. Téléchargements YouTube (yt-dlp) dans `MUSIC_DOWNLOAD_DIR` (`/app/downloads`). Fichiers uploadés dans MinIO (`file_url` = nom d'objet).
- **Lecture** : `GET /tracks/{id}/stream` (Range) ou HLS `/stream/{id}/master.m3u8`. `<audio>` ne peut pas envoyer d'en-tête : les URL média portent `?token=` avec un **token « média »** (6 h, streaming et pochettes uniquement, `GET /auth/media-token`). Front : `frontend/src/api/mediaToken.ts`, `withToken()` dans `api/tracks.ts`.
- **Lecteur web** (`components/Player.tsx`) : deux éléments `<audio>` (préchargement, fondu enchaîné, gapless). Erreurs : 401 → refresh puis nouvel essai ; 429 → attente puis nouvel essai ; 404 → message et titre suivant. Écoute enregistrée à la fin si ≥ 10 s (durée réelle envoyée).
- **File d'attente** (`stores/playerStore.ts`) : contexte playlist/album, sinon autoplay de titres similaires (`GET /recommendations/autoplay/{id}`).
- **Auth** : JWT avec `jti` et `iat`. Access 30 min, refresh 7 j avec **rotation** (réutilisation au-delà de 30 s = vol → toutes les sessions révoquées). Révocations stockées dans Redis (`core/sessions.py`, tolérant si Redis est absent). `/auth/logout`, `/auth/logout-all`. Verrouillage après 10 échecs de connexion par compte. Le front ne lance qu'un refresh à la fois (`api/client.ts`).
- **Sécurité** : fichiers locaux servis **uniquement** dans les dossiers musique (`utils/local_files.py`). `TrustedProxyMiddleware` : `X-Forwarded-For` accepté seulement depuis des IP privées. Limiteur de débit par utilisateur (`core/rate_limit.py` : général 300/min, médias 600/min). CSP stricte dans `frontend/nginx.conf`.
- **Admin** : espace séparé `/admin` (`components/AdminLayout.tsx`). Page Santé = `GET /admin/overview` (contrôles par domaine). Catalogue : fusion des doublons introuvables, nettoyage des pistes vides (`include_used`), filtre `GET /tracks?playable=`. Bouton de transcodage HLS (`POST /upload/transcode-missing`) avec suivi en direct (`GET /upload/transcode-status`).
- **Signalements de bugs** : bouton dans la barre du haut (`components/BugReportButton.tsx`, joint page, navigateur, titre en cours et erreurs récentes de `utils/diagnostics.ts`), onglet admin `/admin/bug-reports` (`api/v1/bug_reports.py`, table `bug_reports`).

## Travailler en local (Windows, sans Docker)

Docker n'est pas installé sur cette machine. On utilise :
- **API** : `python backend/scripts/dev_server.py` (SQLite + Redis simulé). Données dans `backend/.local-dev/` (ignoré par git) : base, `music/` (3 tonalités de test), et **`test-accounts.txt`** (identifiants admin et utilisateur de test, locaux uniquement).
- **Front** : `npm --prefix frontend run dev` → http://localhost:5173 (proxy `/api` vers `:8000`). Ou `npm run dev:remote` pour pointer vers la prod (`frontend/.env.remote.local`).
- `.claude/launch.json` contient `api-local`, `front-local` et `front-remote` pour le panneau navigateur (`api-local` utilise un venv Python temporaire : si absent, recréer un venv et faire `pip install -r backend/requirements.txt -r backend/requirements-test.txt`).

Tests (tous doivent passer avant un commit) :
```bash
cd backend && python -m pytest --ignore=tests/test_jam.py -q
cd frontend && npx tsc --noEmit -p . && npx vitest run
```
État au 2 octobre 2026 : 328 tests backend, 97 frontend, tous au vert.

## Pièges connus

- **Tests backend sur SQLite** : les UUID reviennent en hexadécimal sans tirets → comparer avec `uuid.UUID(str(x))`. Le limiteur de débit est **désactivé** dans les tests (`RATE_LIMIT_ENABLED=false`) : le réactiver explicitement si besoin (`tests/test_rate_limit.py`). Mot de passe de `test_user` : `TestPass123!`.
- **Client MinIO** : appels bloquants → toujours via `asyncio.to_thread` (et `get_minio_client()` interroge déjà le serveur à sa création).
- **Chemins Windows** : `os.path` diffère du serveur Linux ; les tests de chemins doivent passer sur les deux.
- **Édition de fichiers** : les heredocs bash avec apostrophes françaises cassent ; préférer l'outil Edit/Write ou un script Python écrit dans le scratchpad. Dans les fichiers i18n, échapper les apostrophes (`\'`).
- **Ne pas écraser un fichier sans l'avoir lu** (déjà arrivé avec un fichier de test).
- **Prod** : la limite de débit renvoie 429 si on enchaîne trop d'appels pendant une vérification. Rester sous ~100 requêtes/min.

## Conventions

- Branche de travail : `Akajox`. **Pousser sur les deux branches** (`git push origin Akajox:main Akajox:Akajox`) **uniquement quand l'utilisateur le demande**. Toujours faire `git fetch` d'abord ; passasa pousse aussi sur `main` (fusionner, relancer les tests).
- Commits en anglais, avec un corps qui explique le pourquoi, et la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- La CI (`.github/workflows/ci.yml`) doit passer. Les images Docker ne se construisent qu'après une CI réussie (`docker-build.yml`).
- **Vérifier dans le navigateur** (panneau intégré, local) avant d'annoncer qu'un changement d'interface fonctionne. Format mobile : preset 375×812.
- Toute action qui modifie la prod (suppression, fusion…) : **demander confirmation** avant.

## État actuel et prochaines étapes

Fait récemment :
- Audit complet (`RAPPORT-AUDIT.md`) et corrections.
- Durcissement de la sécurité, dont une faille critique de lecture de fichiers via `/local/covers`.
- Prod remise en ordre : 1 839 doublons fusionnés, 800 pistes vides supprimées, transcodage HLS lancé (1 859 pistes).

En attente côté serveur (voir `INSTRUCTIONS-SERVEUR.md`, à transmettre à l'admin du serveur) :
1. Déployer `f0df0de` (correctif de suppression de pistes utilisées).
2. Changer les secrets (`SECRET_KEY`, MinIO, Meilisearch, Postgres).
3. `RATE_LIMIT_DEFAULT` à 300/min (la prod est encore à 100).

Après ce déploiement, supprimer les **5 pistes sans audio** restantes (Admin › Catalogue › « Supprimer les N pistes sans audio »).

**Prochain chantier : le front sur téléphone**, puis une app mobile. Plan validé à l'audit mobile :
1. ~~Écran « En lecture » plein écran et mini-lecteur épuré~~ : fait (`components/NowPlayingSheet.tsx`).
2. ~~Cibles tactiles de 44 px, ligne entière cliquable~~ : fait (`utils/rowTap.ts`, variantes `pointer-coarse:`).
3. ~~Débordements et petites cibles (Parcourir, Paramètres, filtres, langue)~~ : fait.
4. ~~PWA installable~~ : fait (`public/manifest.webmanifest`, icônes générées, sans service worker pour l'instant).
App Expo (`mobile/`) remise en état (démarrage, paquets, lecture avec jeton média, SecureStore, hors ligne). Lancer : `cd mobile && npx expo start`, puis Expo Go sur le téléphone (vise la prod par défaut, `EXPO_PUBLIC_API_URL` sinon). Reste : test sur téléphone, remplacer `expo-av` (non maintenu, pas de contrôles écran verrouillé) par `react-native-track-player` (nécessite un build de développement).

Autres pistes (`RAPPORT-AUDIT.md`, `AMELIORATIONS.md`) :
- ~~cache des pochettes indexé par l'artiste~~ : corrigé ; réparer les données avec Admin › Catalogue › « Corriger N pochettes partagées » (1 732 titres concernés en prod au 3 octobre) ;
- ~~traductions françaises incomplètes~~ : faites (textes en dur remplacés ; noms générés par le serveur traduits à l'affichage, `utils/systemNames.ts`) ;
- fonctions de l'API sans interface (partage, import/export CSV, abonnements, radio, transfert d'appareil, file de la Jam) ;
- podcasts hors du lecteur principal ;
- téléchargement hors ligne non persistant.

## Documents du dépôt

- `RAPPORT-AUDIT.md` : état fonctionnel détaillé par fonctionnalité.
- `INSTRUCTIONS-SERVEUR.md` : actions restantes pour l'admin du serveur.
- `DIAGNOSTIC-LECTURE.md` : historique de la panne de lecture (dossiers musique).
- `AMELIORATIONS.md` : liste d'améliorations tenue par passasa.
- `CDC_Alternative_Spotify.md` : cahier des charges d'origine.
