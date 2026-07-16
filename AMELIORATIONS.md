# Améliorations possibles — Alt-Spotify

> Document généré automatiquement. Classé par priorité et catégorie.

---

## 🔴 Haute priorité

### Sécurité

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| S.1 | **CORS trop permissif** | `main.py` | `allow_headers=["*"]` et `allow_methods=["*"]` — restreindre à `Authorization`, `Content-Type` et `GET/POST/PUT/DELETE` |
| S.2 | **SECRET_KEY avec fallback par défaut** | `config.py:20` | La valeur par défaut `"CHANGE-ME-IN-PRODUCTION..."` est utilisée si `.env` manque — valider au démarrage |
| S.3 | **Pas de révocation JWT** | `security.py` | Les refresh tokens ne sont pas révocables — ajouter un denylist Redis |
| S.4 | **Pas de reset mot de passe** | `auth.py` | Le lien "Forgot password?" dans le mobile mène nulle part |
| S.5 | **Pas de lockout après tentatives** | `auth.py` | Rate limiting par IP mais pas par email — potentiel brute-force |
| S.6 | **Stream sans authentification** | `stream.py` | Les endpoints HLS (`/master.m3u8`, segments) n'exigent aucune auth — anyone with URL can stream |
| S.7 | **`/metrics` sans auth** | `monitoring.py` | Endpoint Prometheus accessible publiquement, pas de `require_admin` |
| S.8 | **UUID inline import** | `admin.py:112,137,157` | `__import__("uuid").UUID(user_id)` au lieu du type `uuid.UUID` en paramètre |
| S.9 | **Body `dict` non validé** | `admin.py:107`, `tracks.py:208` | Pas de schéma Pydantic pour certains body POST/PUT |
| S.10 | **CSP incomplet** | `security_enhanced.py` | Manque `connect-src`, `img-src`, `media-src`, `font-src` |

### Intégrité des données

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| D.1 | **Territoire/explicit check dupliqué 5 fois** | `tracks.py` | Même bloc de 8 lignes copié-collé dans `get_track`, `play_track`, `stream_track`, `download_track`, `list_tracks` — extraire en dependency |
| D.2 | **Upload metadata swallow errors** | `upload.py:77` | `except Exception: pass` masque les erreurs mutagen — logger |
| D.3 | **ALLOWED_AUDIO_TYPES dupliqué** | `upload.py:19` vs `validation.py:36` | Deux sets différents — synchroniser |
| D.4 | **Soft-delete ne masque pas tout le PII** | `admin.py:166-168` | Email remplacé mais `avatar_url`, `bio`, `password_hash` restent |

### Docker / Déploiement

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| K.1 | **Mots de passe par défaut** | `docker-compose.yml` | `changeme`, `minioadmin` — pas de validation `.env` au démarrage |
| K.2 | **Redis sans mot de passe** | `docker-compose.yml:21` | Exposé sans `requirepass` |
| K.3 | **Pas de healthcheck worker** | `docker-compose.yml` | Le worker Celery n'a pas de healthcheck |
| K.4 | **Pas de backup/restore** | CDC Phase 5 | Aucun script ou service de backup |

---

## 🟠 Moyenne priorité

### Performance frontend

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| P.1 | **Heartbeat jamais nettoyé** | `playerStore.ts` | `setInterval` non clear au unmount — fuite mémoire |
| P.2 | **Blobs Audio dans Zustand** | `playerStore.ts:33` | Stocker des `Blob` dans le state Zustand = pression mémoire |
| P.3 | **Audio element pas nettoyé** | `Player.tsx` | `audioRef` jamais release au unmount |
| P.4 | **Pas de debounce sur volume** | `Player.tsx:296` | Chaque `onChange` du slider déclenche un re-render |
| P.5 | **Crossfade fuite Audio** | `useCrossfade.ts:34` | `nextAudioRef` peut leak si crossfade déclenché rapidement |
| P.6 | **Pas de code splitting** | `pages/` | 27 pages importées en eager — utiliser `React.lazy()` |
| P.7 | **Search pas caché** | `Search.tsx` | Chaque navigation = nouvel appel API — ajouter stale-while-revalidate |

### Tests

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| T.1 | **3 tests frontend seulement** | `frontend/tests/` | Manque : TrackDetail, AlbumDetail, PlaylistDetail, Stats, Settings, Library, Jam, Admin |
| T.2 | **Backend: pas de tests admin/devices/favorites/push/import-export/notifications/stream** | `backend/tests/` | 15 fichiers de tests, beaucoup de modules non testés |
| T.3 | **0 tests mobile** | `mobile/` | Aucun fichier test, aucun runner configuré |
| T.4 | **CI: lint/build silencieux** | `ci.yml` | `npm run lint \|\| true` — les erreurs ne fail pas CI |
| T.5 | **SQLite pour les tests** | `conftest.py` | Tests avec SQLite manque ARRAY, JSONB, UUID — failles potentielles en prod |

### UX / Accessibilité

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| U.1 | **Pas d'Error Boundary React** | `App.tsx` | Un crash dans une page crash toute l'SPA |
| U.2 | **Home "Show all" ne fait rien** | `Home.tsx:70,82,94` | 3 boutons sans onClick ni Link |
| U.3 | **Search genre cards sans onClick** | `Search.tsx:54-63` | Affichés en `cursor-pointer` mais cliquer ne fait rien |
| U.4 | **Like button non persisté** | `Player.tsx:59` | `isLiked` en state local, pas connecté à l'API favorites |
| U.5 | **Pas de skeleton loading** | Multiples pages | Toutes les pages affichent un spinner unique |
| U.6 | **Player settings pas fermable au clavier** | `Player.tsx` | `role="dialog"` sans bouton fermer ni touche Escape |
| U.7 | **Stats maxPlays buggy** | `Stats.tsx:38` | Map chaque track sur `total_plays` au lieu du play count par track |

### API

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| A.1 | **Pagination inconsistante** | Multiples | `PaginatedResponse` vs raw dict dans admin |
| A.2 | **`sort_by` défini mais jamais utilisé** | `pagination.py` | Paramètre présent mais aucun endpoint ne l'utilise |
| A.3 | **Search sans filter territory/explicit** | `search.py` | Les résultats incluent tous les tracks |
| A.4 | **Radio sans auth** | `recommendations.py:52` | `get_current_user` manquant contrairement à discover/daily-mix |
| A.5 | **Refresh token en query param** | `auth.py:96` | Devrait être dans le body ou header (les query params sont loggés) |
| A.6 | **Pas de headers ETag/Last-Modified** | API GET | Aucun cache HTTP côté client |

### Monitoring

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| M.1 | **`/metrics` ne met pas à jour les gauges** | `monitoring.py` | Requête DB mais jamais set les Gauge Prometheus |
| M.2 | **Pas de Sentry** | CDC §3.1 | "Sentry pour les erreurs" mentionné mais jamais configuré |
| M.3 | **`disk_usage` crash sur Windows** | `monitoring.py:72`, `admin.py:47` | `os.statvfs` est Unix-only |
| M.4 | **Pas de log rotation** | `config.py` | `LOG_DIR` défini mais pas de RotatingFileHandler |
| M.5 | **Grafana password par défaut** | `docker-compose.monitoring.yml:25` | `admin` comme mot de passe |

---

## 🟢 Basse priorité

### Mobile

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| MO.1 | **0 tests** | `mobile/` | Aucun test, aucun runner |
| MO.2 | **Pas d'Error Boundary** | `mobile/src/` | Pas de handler global pour crashes React Native |
| MO.3 | **Offline-first pas intégré** | `mobile/src/services/offlineStorage.ts` | Service existe mais pas connecté aux screens |
| MO.4 | **`expo-av` déprécié** | `mobile/package.json` | Remplacer par `expo-audio` (Expo SDK 52+) |
| MO.5 | **Pas de deep linking** | `mobile/src/navigation/` | Pas de config `Linking` pour URLs web |
| MO.6 | **Pas de biometrie** | `mobile/src/screens/auth/` | Pas de Face ID / empreinte |
| MO.7 | **Pas d'écrans admin** | `mobile/src/screens/` | Admin = web uniquement |

### CI/CD

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| C.1 | **Pas de push Docker image** | `ci.yml` | Build mais jamais push vers GHCR/DockerHub |
| C.2 | **Pas de security scanning** | `ci.yml` | Pas de `trivy`, `safety`, `npm audit` |
| C.3 | **Pas de déploiement** | `ci.yml` | Pas de staging/production, pas de deploy step |
| C.4 | **Pas de test frontend en CI** | `ci.yml` | `npm test` jamais exécuté |
| C.5 | **Pas de migration check** | `ci.yml` | Tests sur SQLite, jamais vérifié contre PostgreSQL |
| C.6 | **Pas de Docker layer cache** | `ci.yml` | `--no-cache` à chaque build |

### Code quality

| # | Problème | Fichier | Détail |
|---|----------|---------|--------|
| Q.1 | **`import os` dans les fonctions** | `admin.py:45,213` | Import au niveau module |
| Q.2 | **`import uuid` dans les fonctions** | `recommendations.py:57,80` | Import au niveau module |
| Q.3 | **Magic strings pour rôles** | `admin.py:122` | `"ADMIN"`, `"USER"` au lieu de `UserRole` enum |
| Q.4 | **Réponses inconsistantes** | Multiples | `{"message": "..."}` vs `{"detail": "..."}` vs objet direct |

### Fonctionnalités CDC manquantes

| # | Fonctionnalité | Section CDC | Détail |
|---|---------------|-------------|--------|
| F.1 | **OAuth Google** | 2.1 | Optionnel mais mentionné |
| F.2 | **Édition collaborative real-time** | 2.5 | `is_collaborative` existe mais pas de WebSocket sync |
| F.3 | **Feed d'activité temps réel** | 2.7 | Follow model existe mais pas de feed endpoint |
| F.4 | **Notifications nouvelles sorties** | 2.8 | Modèle existe mais pas de trigger |
| F.5 | **Kubernetes manifests** | 3.5 | Docker Compose seulement, pas de K8s |

---

## Résumé

| Priorité | Nombre | Thèmes principaux |
|----------|--------|-------------------|
| 🔴 Haute | 16 | Sécurité, intégrité données, Docker |
| 🟠 Moyenne | 28 | Performance, tests, UX, API, monitoring |
| 🟢 Basse | 18 | Mobile, CI/CD, code quality, CDC |
| **Total** | **62** | |

---

*Pour chaque amélioration, implémenter dans l'ordre : Haute → Moyenne → Basse.*
