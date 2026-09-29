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
├── nginx/             # Exemple de config reverse proxy (voir ci-dessous)
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

## Reverse proxy (nginx)

Le stack ne publie aucun port sur le réseau (tout est bindé sur `127.0.0.1`) :
`backend` et `frontend` rejoignent le réseau Docker partagé avec votre reverse
proxy externe.

**1. Rejoindre le réseau depuis le compose du reverse proxy :**

```yaml
services:
  nginx:
    networks:
      - proxy

networks:
  proxy:
    external: true
    name: altspotify-proxy   # valeur de PROXY_NETWORK dans le .env
```

**2. Proxy API + WebSockets (dans votre `server` block) :**

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /api/ {
    proxy_pass              http://backend:8000;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    # Edge = on écrase (et on n'append pas) : uvicorn lit la PREMIÈRE entrée.
    proxy_set_header        X-Forwarded-For   $remote_addr;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_http_version      1.1;
    proxy_read_timeout      300s;
    client_max_body_size    100m;   # uploads audio (100 Mo max)
}

# WebSockets : /api/v1/notifications/ws et /api/v1/jam/{id}/ws
location ~ ^/api/v1/(notifications|jam)/.*ws$ {
    proxy_pass              http://backend:8000;
    proxy_http_version      1.1;
    proxy_set_header        Upgrade             $http_upgrade;
    proxy_set_header        Connection          $connection_upgrade;
    proxy_set_header        Host                $host;
    proxy_set_header        X-Forwarded-For     $remote_addr;
    proxy_set_header        X-Forwarded-Proto   $scheme;
    proxy_read_timeout      86400s;   # pas de heartbeat sur ces sockets
}
```

Le frontend se sert sur `http://frontend:80`.

**Pourquoi c'est important :**

- uvicorn tourne avec `--proxy-headers --forwarded-allow-ips=*` : le rate
  limiting est cléé sur `request.client.host`, donc sans ces flags **tous les
  visiteurs partagent l'IP du proxy** (100 req/min global, 10 req/min sur
  l'auth).
- Comme tout le monde est "trusted", un client qui atteindrait `backend:8000`
  directement pourrait spoof `X-Forwarded-For` : d'où le bind `127.0.0.1` et le
  réseau `proxy` réservé au reverse proxy.
- `nginx/nginx.conf` est un exemple de config complète (front + API) ; le vrai
  reverse proxy vit dans son propre projet Docker.

## Déploiement NAS + VPS

Pour un déploiement hybride (NAS local + VPS cloud) :

1. **NAS** : Héberger MinIO, PostgreSQL, Redis, Meilisearch, Celery workers, FFmpeg
2. **VPS** : Héberger nginx (reverse proxy + SSL) et l'API FastAPI
3. **Tunnel** : Connecter NAS ↔ VPS via Tailscale ou WireGuard

## Licence

Usage strictement privé, sans commercialisation.
