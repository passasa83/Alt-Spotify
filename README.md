# Alt Spotify — Alternative auto-hébergée à Spotify

Plateforme de streaming musical complète, auto-hébergeable, conteneurisée (Docker), destinée à un usage privé (foyer, famille, amis proches).

## Fonctionnalités

- **Lecture musicale** : Streaming adaptatif HLS (128k/192k/320k), crossfade, ReplayGain, égaliseur paramétrable
- **Catalogue** : Upload, métadonnées ID3, pochettes, gestion artistes/albums/genres
- **Playlists** : CRUD, collaboratives, import/export CSV/JSON, drag & drop
- **Recommandations** : Discover Weekly, Daily Mix, Radio, morceaux similaires
- **Paroles synchronisées** : Affichage temps réel (format LRC)
- **Jam / Écoute collaborative** : Sessions temps réel (WebSocket), code + QR code, file d'attente partagée
- **Podcasts** : Import RSS, épisodes, lecture en arrière-plan
- **Social** : Suivi d'utilisateurs et d'artistes, fil d'activité, partage
- **Statistiques** : Wrapped annuel, top morceaux, genres, temps d'écoute
- **Filtrage** : Comptes enfants (contenu explicite), restrictions territoriales
- **Recherche** : Full-text multi-entités (morceaux, artistes, albums, playlists, podcasts)
- **Applications** : Web (React + TailwindCSS) et Mobile (React Native / Expo)
- **Administration** : Gestion catalogue, utilisateurs, monitoring système

## Architecture

| Composant | Technologie |
|---|---|
| Frontend Web | React 18+ (Vite), TypeScript, TailwindCSS, Zustand |
| Frontend Mobile | React Native (Expo) |
| Backend API | Python 3.12, FastAPI (async), Pydantic v2 |
| Temps réel | WebSocket + Redis Pub/Sub |
| Base de données | PostgreSQL 16 |
| Cache / Sessions | Redis 7 |
| Stockage fichiers | MinIO (S3-compatible) |
| Transcodage audio | FFmpeg (HLS multi-bitrate) |
| Tâches asynchrones | Celery + Redis |
| Reverse proxy | Traefik v2 (SSL Let's Encrypt) |
| Conteneurisation | Docker + Docker Compose |
| CI/CD | GitHub Actions (lint, tests, build Docker) |

## Prérequis

- Docker & Docker Compose v2
- 4 Go RAM minimum (8 Go recommandé)
- 1 To d'espace disque (pour le catalogue audio + transcodage)

## Installation rapide

```bash
# 1. Cloner le dépôt
git clone <url-du-depot> && cd Alt-Spotify

# 2. Créer le fichier .env
cp .env.example .env
# Éditer .env avec vos propres clés secrètes

# 3. Lancer tous les services
docker compose up -d

# 4. Accéder à l'application
# Frontend  → http://localhost:3000
# API Docs  → http://localhost:8000/docs
# MinIO     → http://localhost:9001
```

## Variables d'environnement

Voir `.env.example` pour la liste complète. Variables critiques :

| Variable | Description |
|---|---|
| `SECRET_KEY` | Clé secrète JWT (changer en production !) |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `MINIO_ACCESS_KEY` | Clé d'accès MinIO |
| `MINIO_SECRET_KEY` | Clé secrète MinIO |
| `MEILI_MASTER_KEY` | Clé maître Meilisearch |

## Structure du projet

```
Alt-Spotify/
├── backend/            # API FastAPI (Python)
│   ├── app/
│   │   ├── api/v1/     # Routes API
│   │   ├── core/       # Config, sécurité, utilitaires
│   │   ├── models/     # Modèles SQLAlchemy
│   │   ├── schemas/    # Schémas Pydantic
│   │   ├── services/   # Logique métier
│   │   └── utils/      # Dépendances, helpers
│   ├── alembic/        # Migrations base de données
│   └── tests/          # Tests unitaires (pytest)
├── frontend/           # Application web React
│   └── src/
│       ├── api/        # Clients API
│       ├── components/ # Composants UI
│       ├── hooks/      # Hooks React
│       ├── pages/      # Pages/routes
│       ├── stores/     # État global (Zustand)
│       └── types/      # Types TypeScript
├── mobile/             # Application mobile React Native (Expo)
│   └── src/
├── worker/             # Celery workers (transcodage FFmpeg)
├── monitoring/         # Prometheus + Grafana
├── traefik/            # Configuration reverse proxy
├── scripts/            # Scripts utilitaires (backup, setup)
└── docker-compose.yml  # Orchestration Docker
```

## Commandes utiles

```bash
# Lancer en développement
docker compose up -d

# Voir les logs
docker compose logs -f backend
docker compose logs -f worker

# Arrêter
docker compose down

# Reconstruire une image
docker compose build backend --no-cache

# Exécuter les migrations
docker compose exec backend alembic upgrade head

# Tests backend
cd backend && pytest -v

# Tests frontend
cd frontend && npm test
```

## Déploiement NAS + VPS

Pour un déploiement hybride (NAS local + VPS cloud) :

1. **NAS** : Héberger MinIO, PostgreSQL, Redis, Meilisearch, Celery workers, FFmpeg
2. **VPS** : Héberger Traefik (reverse proxy + SSL) et l'API FastAPI
3. **Tunnel** : Connecter NAS ↔ VPS via Tailscale ou WireGuard

## Licence

Usage strictement privé, sans commercialisation.
