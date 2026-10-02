# Serveur Alt Spotify — à faire

Toutes les commandes se lancent **dans le dossier du projet**, celui qui contient `docker-compose.yml`.

## 1. Mettre à jour (5 min)

```bash
git pull
docker compose pull
docker compose up -d
```

## 2. Changer les secrets (10 min, important)

Une ancienne faille, maintenant corrigée, permettait de lire les secrets du serveur. Il faut donc les remplacer.

Dans `.env`, remplacer ces valeurs par des valeurs aléatoires (une par ligne, générées avec `openssl rand -hex 32`) :

```
SECRET_KEY=...
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MEILISEARCH_MASTER_KEY=...
POSTGRES_PASSWORD=...
```

Pour Postgres, il faut **en plus** appliquer le nouveau mot de passe dans la base. Mettre la même valeur qu'à la ligne `POSTGRES_PASSWORD` :

```bash
docker compose exec postgres psql -U altspotify -c "ALTER USER altspotify PASSWORD 'LE_NOUVEAU_MOT_DE_PASSE';"
```

Puis relancer :

```bash
docker compose up -d
```

→ Tout le monde devra se reconnecter, c'est normal.

## 3. Corriger la limite de requêtes (1 min)

Dans `.env`, **supprimer** la ligne `RATE_LIMIT_DEFAULT=100/minute`, ou la remplacer par :

```
RATE_LIMIT_DEFAULT=300/minute
```

Puis :

```bash
docker compose up -d backend
```

## 4. Vérifier (2 min)

Sur le site, ouvrir **Administration › Santé** :

- **Lecture** : pas d'erreur. Le transcodage HLS progresse tout seul, il faut compter environ 2 h 30 au total.
- **Sécurité** : plus d'alerte « identifiants par défaut ».

## Si quelque chose casse

```bash
docker compose logs --tail=100 backend
```

Pour revenir en arrière sur `.env`, `update-server.sh` en a laissé une sauvegarde (`.env.bak-…`) :

```bash
cp .env.bak-AAAAMMJJ-HHMMSS .env
docker compose up -d
```

## Optionnel

Le backend est joignable directement sur le **port 8000** depuis Internet. Si le site passe par le reverse proxy, mettre `BIND_IP=127.0.0.1` dans `.env`, ou fermer le port 8000 au pare-feu.
