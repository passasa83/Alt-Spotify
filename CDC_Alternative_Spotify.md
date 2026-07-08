# Cahier des Charges
## Plateforme de streaming musical — Alternative à Spotify

**Version :** 1.0
**Date :** Juillet 2026

---

## 1. Contexte et objectifs

### 1.1 Contexte
Le projet consiste à développer une plateforme de streaming musical complète, auto-hébergeable, capable de reproduire l'essentiel des fonctionnalités de Spotify, avec une architecture moderne, conteneurisée (Docker) et facilement déployable (serveur perso, VPS, cloud, cluster).

### 1.2 Objectifs
- Offrir une expérience d'écoute fluide, multi-device, avec synchronisation en temps réel.
- Couvrir les fonctionnalités phares de Spotify : lecture, playlists, recherche, recommandations, paroles synchronisées, sessions collaboratives (Jam), podcasts, statistiques d'écoute.
- Garantir une architecture scalable, sécurisée, et facilement déployable via Docker / Docker Compose / Kubernetes.
- Permettre une maintenance et une évolution simples grâce à une séparation claire backend/frontend.

### 1.3 Cadre d'usage
Le projet est destiné à un **usage strictement privé, sans commercialisation** : diffusion en cercle fermé (foyer, famille, amis proches) d'un catalogue personnel, hébergé et administré par les utilisateurs eux-mêmes. Aucun modèle économique, aucune vente d'abonnement, aucune publicité.

Ce cadre change plusieurs hypothèses de conception par rapport à une plateforme commerciale :
- Pas de gestion de paiement/Stripe, pas de plans d'abonnement (Free/Premium/Famille).
- Pas de gestion de territoires/droits par pays.
- Le volet juridique reste néanmoins à garder à l'esprit : même en usage privé, la diffusion de contenus protégés doit rester dans un cercle réellement privé (accès fermé, authentifié, non exposé publiquement sur Internet).

### 1.4 Échelle cible
- **Utilisateurs** : une dizaine d'utilisateurs simultanés maximum (dimensionnement "petit collectif", pas "grand public").
- **Catalogue** : minimum 1 To de fichiers audio (+ pochettes, métadonnées, éventuels fichiers hors-ligne mis en cache).
- **Hébergement** : hybride — le stockage volumineux (audio) peut être auto-hébergé (NAS/serveur perso), pendant que l'API, le reverse proxy et les sauvegardes tournent sur un VPS cloud, le tout relié via VPN/tunnel sécurisé (ex. WireGuard, Tailscale, Cloudflare Tunnel).

---

## 2. Périmètre fonctionnel

### 2.1 Gestion des comptes et profils
| Fonctionnalité | Description |
|---|---|
| Inscription / connexion | Email + mot de passe, OAuth optionnel (Google), invitation par l'admin (pas d'inscription publique ouverte) |
| Profils utilisateurs | Avatar, bio, playlists, followers/following (au sein du cercle privé) |
| Comptes enfants | Compte avec contenu filtré (optionnel selon composition du foyer) |
| Rôles | Admin (gestion catalogue), Utilisateur standard |
| Multi-appareils | Sessions simultanées, pas de limite technique nécessaire (usage privé) |

### 2.2 Catalogue et contenu
- Upload et gestion de morceaux (métadonnées ID3, pochettes, artistes, albums, genres)
- **Prise en charge de tous les formats audio courants en entrée** : MP3, FLAC, WAV, AAC/M4A, OGG/Vorbis, ALAC, Opus, WMA. Le pipeline de transcodage (FFmpeg) normalise ensuite ces formats source vers des formats de diffusion adaptés au streaming (HLS en AAC ou Opus, avec option de conserver le FLAC original pour un téléchargement "haute qualité" si souhaité).
- Extraction automatique des métadonnées et de la pochette embarquée, avec complément manuel possible si absentes
- Gestion des artistes, albums, labels (back-office admin)
- Podcasts et épisodes (flux audio + RSS import)
- Paroles synchronisées (format LRC) avec affichage temps réel type karaoké
- Gestion des droits/territoires par morceau (activable/désactivable selon pays)

### 2.3 Lecture et player
- Streaming adaptatif (bitrate variable selon connexion) via HLS/DASH
- Lecture hors-ligne (téléchargement chiffré sur l'appareil, Premium uniquement)
- File d'attente, lecture aléatoire, répétition (morceau/liste)
- Crossfade et normalisation du volume (ReplayGain)
- Égaliseur paramétrable
- Reprise de lecture multi-appareils (Spotify Connect-like)
- Radio basée sur un morceau/artiste (auto-génération de playlist similaire)

### 2.4 Jam / Écoute collaborative
- Création d'une session Jam avec code ou QR code de partage
- Ajout collaboratif de morceaux à la file d'attente en temps réel (WebSocket)
- Vote pour changer/skip le morceau en cours
- Synchronisation de la lecture entre plusieurs appareils (host + invités)
- Gestion des droits (qui peut ajouter/retirer des morceaux)

### 2.5 Playlists et bibliothèque
- Création, édition, réorganisation de playlists (drag & drop)
- Playlists collaboratives partagées
- Playlists générées automatiquement (Discover Weekly-like, Daily Mix, Wrapped annuel)
- Ajout aux favoris (morceaux, albums, artistes, podcasts)
- Import de playlists depuis fichiers CSV/JSON ou autres plateformes

### 2.6 Recherche et découverte
- Recherche full-text (morceaux, artistes, albums, playlists, podcasts)
- Filtres avancés (genre, année, durée, popularité)
- Recommandations personnalisées (moteur de recommandation basé sur l'historique d'écoute)
- Pages "Nouveautés", "Tendances", "Genres/Humeurs"

### 2.7 Social
- Suivi d'artistes et d'autres utilisateurs
- Partage de morceaux/playlists (lien, réseaux sociaux, code QR)
- Statistiques d'écoute personnelles (type "Wrapped") : top morceaux, artistes, temps d'écoute
- Fil d'activité des amis suivis (optionnel, configurable en confidentialité)

### 2.8 Notifications
- Nouvelles sorties des artistes suivis
- Invitations Jam
- Rappels d'abonnement / paiement

---

## 3. Architecture technique

### 3.1 Stack technique retenue

| Couche | Technologie |
|---|---|
| Frontend Web | React 18+ (Vite), TypeScript, TailwindCSS, Zustand/Redux pour l'état global |
| Frontend Mobile | React Native (Expo), partage du maximum de logique (hooks, appels API, types) avec le frontend web |
| Backend API | Python 3.12, FastAPI (async), Pydantic v2 |
| Temps réel (Jam, sync player) | WebSocket via FastAPI + Redis Pub/Sub |
| Base de données relationnelle | PostgreSQL 16 |
| Cache / sessions / files d'attente | Redis |
| Recherche | Meilisearch ou Elasticsearch |
| Stockage fichiers audio/images | MinIO (S3-compatible) ou stockage S3 cloud |
| Transcodage audio | FFmpeg (génération de plusieurs bitrates HLS) |
| Tâches asynchrones | Celery + Redis (broker) |
| Reverse proxy | Traefik ou Nginx |
| Conteneurisation | Docker + Docker Compose (dev/petite prod), Kubernetes (scale) |
| Authentification | JWT (access/refresh tokens), OAuth2 |
| Monitoring | Prometheus + Grafana, Sentry pour les erreurs |
| CI/CD | GitHub Actions |

### 3.2 Justification des choix clés
- **FastAPI** : performances async natives, génération automatique de la doc OpenAPI, typage fort avec Pydantic — adapté au streaming et aux nombreux appels API concurrents.
- **PostgreSQL** : robustesse relationnelle pour catalogue, utilisateurs, relations sociales, playlists.
- **Redis** : indispensable pour le Pub/Sub des sessions Jam en temps réel, le cache, et les files Celery.
- **HLS (HTTP Live Streaming)** : standard pour le streaming adaptatif, compatible navigateurs et mobile, permet le multi-bitrate.
- **MinIO** : stockage S3-compatible auto-hébergeable, cohérent avec l'objectif "tourne sur Docker".

### 3.3 Architecture globale (vue logique)

```
[Client React] <--HTTPS/WSS--> [Traefik/Nginx]
                                     |
                     -----------------------------------
                     |                                 |
             [API FastAPI (REST)]            [WebSocket Gateway (Jam, sync)]
                     |                                 |
        --------------------------            [Redis Pub/Sub]
        |            |            |
 [PostgreSQL]   [Redis Cache]  [Celery Workers] -- [MinIO (audio/images)]
                                     |
                          [FFmpeg transcodage]
                                     |
                         [Meilisearch/Elasticsearch]
```

### 3.4 Conteneurisation Docker

Services prévus dans `docker-compose.yml` :

```yaml
services:
  frontend:      # React build servi via Nginx
  backend:       # FastAPI (Uvicorn/Gunicorn workers)
  websocket:     # Service dédié Jam/sync (ou intégré au backend)
  worker:        # Celery (transcodage, recommandations, emails)
  postgres:
  redis:
  minio:
  meilisearch:
  traefik:       # reverse proxy + certificats SSL (Let's Encrypt)
  prometheus:
  grafana:
```

Chaque service dispose de son propre `Dockerfile`, avec des images multi-stage pour minimiser la taille (notamment le frontend : build puis serve statique).

### 3.5 Scalabilité
Vu l'échelle cible (≈10 utilisateurs), Kubernetes n'est pas nécessaire : **Docker Compose seul suffit largement** pour ce projet. On garde toutefois une architecture propre (services séparés) pour rester évolutif si le besoin change.

- Backend FastAPI mono-instance suffisant, avec possibilité de scaler horizontalement plus tard si besoin.
- WebSocket Jam via Redis Pub/Sub, prêt à supporter plusieurs instances si nécessaire un jour.
- Transcodage audio (Celery) sur un worker unique au départ, extensible.

### 3.6 Dimensionnement stockage et hébergement hybride

**NAS confirmé** : le NAS dispose déjà de Docker Compose, il peut donc directement héberger les services lourds en stockage/calcul (MinIO, PostgreSQL, Redis, Meilisearch, workers Celery de transcodage). Le VPS cloud se limite alors à un rôle de point d'entrée léger (reverse proxy + éventuellement un service de secours).

| Composant | Emplacement recommandé | Raison |
|---|---|---|
| Fichiers audio (MinIO), PostgreSQL, Redis, Meilisearch, worker Celery/FFmpeg | NAS (Docker Compose) | Le NAS a déjà l'espace disque (1 To+) et le calcul suffisant pour le transcodage à cette échelle |
| API FastAPI | NAS ou VPS selon la puissance du NAS ; VPS conseillé si le NAS est un petit modèle (peu de RAM/CPU) | Garde le NAS disponible pour ses tâches disque-intensives |
| Reverse proxy (Traefik) + certificat SSL | VPS cloud | Point d'entrée public stable avec IP fixe, évite d'exposer directement le NAS |
| Sauvegardes | Second disque du NAS + copie froide externalisée (cloud object storage) | Redondance en cas de panne du NAS |

**Comparatif des grands fournisseurs VPS** (pour le composant cloud léger — reverse proxy, éventuellement l'API) :

| Fournisseur | Points forts | Points d'attention |
|---|---|---|
| **Hetzner** | Excellent rapport prix/performance, datacenters EU (Allemagne, Finlande) | Pas de datacenter en France |
| **OVHcloud** | Français, datacenters FR, bon support RGPD par défaut | Un peu plus cher que Hetzner à specs égales |
| **Scaleway** | Français, bonne offre "petit VPS", écosystème simple | Catalogue d'instances parfois moins avantageux que Hetzner |
| **DigitalOcean** | Interface très simple, bonne doc, marketplace d'images prêtes | Prix légèrement supérieur pour l'entrée de gamme |
| **AWS Lightsail / GCP / Azure** | Solides si évolution vers du multi-service cloud plus tard | Complexité et coût inutiles pour ce projet à cette échelle |

Pour ce projet (juste un reverse proxy + peut-être l'API), un VPS d'entrée de gamme suffit largement (2 vCPU / 4 Go RAM) : Hetzner ou OVHcloud sont les choix les plus adaptés au rapport coût/simplicité, avec une préférence pour OVHcloud si l'hébergement des données en France est important.

**Solution de tunnel** : puisqu'aucune préférence n'est fixée, voici un comparatif pour trancher :

| Solution | Avantages | Inconvénients |
|---|---|---|
| **Tailscale** | Très simple à mettre en place (mesh VPN automatique), gratuit jusqu'à 100 appareils, NAT traversal automatique | Dépendance à un service tiers pour la coordination (le trafic reste chiffré peer-to-peer, mais l'auth passe par Tailscale) |
| **WireGuard (manuel)** | Léger, très performant, aucune dépendance tierce, contrôle total | Configuration manuelle des clés et du routage, un peu plus technique |
| **Cloudflare Tunnel** | Pas besoin d'ouvrir de port du tout, protection DDoS/CDN incluse, gratuit | Le trafic (même chiffré) transite par l'infrastructure Cloudflare ; moins adapté si on veut éviter tout tiers sur le flux audio |

**Recommandation** : Tailscale offre le meilleur compromis simplicité/contrôle pour ce projet (mise en place en quelques minutes, pas de port à ouvrir sur le NAS, connexion directe NAS ↔ VPS). WireGuard manuel reste la meilleure option si on préfère n'avoir strictement aucune dépendance à un service tiers.

Prévoir au moins 1,5 à 2 To de stockage réel sur le NAS (marge pour transcodage multi-bitrate : un même morceau peut exister en 2-3 qualités différentes) et des sauvegardes régulières (rsync/restic vers un second disque ou un stockage cloud froid, type Backblaze B2).

---

## 4. Modèle de données (entités principales)

- **User** : id, email, mot de passe (hash), pseudo, avatar, rôle, date de création, plan d'abonnement
- **Artist** : id, nom, bio, image, liens réseaux sociaux
- **Album** : id, titre, artist_id, date de sortie, pochette
- **Track** : id, titre, album_id, artist_id, durée, fichier audio (référence storage), genre, paroles (LRC)
- **Playlist** : id, titre, owner_id, description, visibilité, collaborative (bool)
- **PlaylistTrack** : playlist_id, track_id, position, ajouté_par
- **Podcast** / **Episode** : structure similaire à Album/Track
- **JamSession** : id, host_id, code, statut, créé_le
- **JamParticipant** : session_id, user_id, rôle (host/invité)
- **ListeningHistory** : user_id, track_id, timestamp, durée écoutée
- **Follow** : follower_id, followed_id (artiste ou utilisateur)
- **Subscription** : user_id, plan, statut, date_renouvellement

---

## 5. Exigences non-fonctionnelles

| Exigence | Détail |
|---|---|
| Performance | Latence API < 150 ms (hors streaming), démarrage lecture < 1s |
| Disponibilité | Best effort (usage privé, pas de SLA formel) |
| Sécurité | HTTPS obligatoire, mots de passe hashés (Argon2/bcrypt), tokens JWT courte durée + refresh token, accès fermé sur invitation |
| Confidentialité | Pas de RGPD réglementaire strict (usage privé, pas de collecte à des fins commerciales), mais bonnes pratiques conservées (chiffrement, pas de tracking tiers) |
| Compatibilité | Navigateurs modernes (Chrome, Firefox, Safari, Edge) + apps mobiles iOS/Android via React Native |

---

## 6. Phases de réalisation (roadmap indicative)

### Phase 1 — MVP (fondations)
- Authentification, gestion utilisateurs
- Upload et catalogue de morceaux (admin)
- Player de base (lecture, pause, file d'attente)
- Playlists (CRUD)
- Recherche simple
- Déploiement Docker Compose fonctionnel

### Phase 2 — Fonctionnalités avancées
- Streaming adaptatif HLS + lecture hors-ligne
- Paroles synchronisées
- Recommandations personnalisées
- Statistiques d'écoute utilisateur

### Phase 3 — Social et Jam
- Sessions Jam en temps réel (WebSocket)
- Fonctionnalités sociales (follow, partage)
- Notifications

### Phase 4 — Application mobile
- Portage React Native (Expo) : authentification, player, playlists, recherche
- Lecture en arrière-plan et notifications push (nouveaux morceaux, invitations Jam)
- Synchronisation multi-device (web ↔ mobile) via l'API existante

### Phase 5 — Confort et robustesse
- Podcasts complets
- Monitoring léger (Prometheus/Grafana) pour surveiller l'espace disque et la santé des services
- Sauvegardes automatisées du catalogue et de la base de données

---

## 7. Livrables attendus

- Code source backend (FastAPI) versionné sur Git, avec tests unitaires (pytest)
- Code source frontend (React) versionné sur Git, avec tests (Vitest/Jest)
- `docker-compose.yml` complet + `Dockerfile` par service
- Documentation API (OpenAPI/Swagger auto-générée par FastAPI)
- Documentation technique de déploiement (README, variables d'environnement `.env.example`)
- Scripts de migration base de données (Alembic)
- Pipeline CI/CD (GitHub Actions) : lint, tests, build images Docker

---

## 8. Décisions prises

| Question | Décision |
|---|---|
| Nature du contenu | Usage privé, pas de commercialisation |
| Formats audio | Tous formats courants pris en charge en entrée (MP3, FLAC, WAV, AAC, OGG, ALAC, Opus, WMA), transcodage automatique vers HLS |
| Application mobile | Oui, React Native (Expo), phase 4 de la roadmap |
| Modèle économique | Aucun |
| Hébergement | NAS (déjà équipé Docker Compose) pour stockage/calcul + VPS cloud pour le reverse proxy |
| Fournisseur VPS | Pas de fournisseur imposé — comparatif fourni, Hetzner ou OVHcloud recommandés |
| Tunnel | Pas de préférence — Tailscale recommandé (WireGuard manuel en alternative) |
| Utilisateurs | ~10 utilisateurs simultanés maximum |
| Catalogue | 1 To minimum, prévoir 1,5-2 To réels avec marge de transcodage |

## 9. Points restants à préciser

1. Modèle et specs du NAS (marque, CPU, RAM) pour confirmer sa capacité à faire tourner MinIO + PostgreSQL + transcodage FFmpeg simultanément.
2. Débit montant de la connexion internet du domicile (impacte la fluidité du streaming pour les utilisateurs distants).
3. Choix final du fournisseur VPS parmi le comparatif (Hetzner/OVHcloud recommandés).
4. Validation du choix de tunnel (Tailscale recommandé par défaut sauf préférence contraire).
