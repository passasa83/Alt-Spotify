from fastapi import Request
from fastapi.openapi.utils import get_openapi
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


def custom_openapi(app):
    if app.openapi_schema:
        return app.openapi_schema

    openapi_schema = get_openapi(
        title="Alt Spotify API",
        description="""
## Alternative Spotify — API de streaming musical

API REST pour une plateforme de streaming musical auto-hébergeable.

### Fonctionnalités
- **Authentification** JWT (access + refresh tokens)
- **Catalogue** : artistes, albums, morceaux, podcasts
- **Lecture** : streaming HLS adaptatif, paroles synchronisées
- **Playlists** : CRUD, collaboratives, import CSV/JSON
- **Social** : follow, partage, activités
- **Jam** : sessions d'écoute collaborative en temps réel (WebSocket)
- **Notifications** : push mobile, notifications in-app
- **Admin** : upload, transcodage, monitoring

### Authentification
Toutes les endpoints protégées nécessitent un header `Authorization: Bearer <token>`.

### Rate Limiting
- Général : 100 requêtes/minute par IP
- Auth : 10 requêtes/minute par IP
- Upload : 10 requêtes/heure par utilisateur
- Streaming : 30 requêtes/minute par utilisateur
        """,
        version="1.0.0",
        contact={
            "name": "Alt Spotify",
            "url": "https://github.com/altspotify",
        },
        license_info={
            "name": "MIT",
            "url": "https://opensource.org/licenses/MIT",
        },
    )

    openapi_schema["tags"] = [
        {"name": "auth", "description": "Inscription, connexion, tokens"},
        {"name": "users", "description": "Profils utilisateurs et statistiques"},
        {"name": "artists", "description": "Gestion des artistes"},
        {"name": "albums", "description": "Gestion des albums"},
        {"name": "tracks", "description": "Gestion des morceaux et streaming"},
        {"name": "playlists", "description": "CRUD playlists et collaboration"},
        {"name": "search", "description": "Recherche full-text"},
        {"name": "upload", "description": "Upload audio et images (admin)"},
        {"name": "stream", "description": "Streaming HLS adaptatif"},
        {"name": "lyrics", "description": "Paroles synchronisées"},
        {"name": "jam", "description": "Sessions d'écoute collaborative"},
        {"name": "social", "description": "Follow, partage, activités"},
        {"name": "notifications", "description": "Notifications in-app et WebSocket"},
        {"name": "push", "description": "Notifications push mobile"},
        {"name": "podcasts", "description": "Podcasts et épisodes"},
        {"name": "import-export", "description": "Import/Export playlists CSV/JSON"},
        {"name": "monitoring", "description": "Health checks et métriques"},
    ]

    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT access token obtenu via /auth/login",
        }
    }

    openapi_schema["security"] = [{"BearerAuth": []}]

    app.openapi_schema = openapi_schema
    return app.openapi_schema
