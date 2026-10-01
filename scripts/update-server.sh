#!/usr/bin/env bash
# Met à jour une instance Alt Spotify déployée avec docker compose.
# À lancer SUR LE SERVEUR, depuis le dossier qui contient docker-compose.yml.
#
#   ./scripts/update-server.sh [--music-dir /chemin/hote/musique]
#                              [--download-dir /chemin/hote/telechargements]
#                              [--promote-admin <pseudo>]
#
# 1. Vérifie / corrige MUSIC_SCAN_DIR et MUSIC_DOWNLOAD_DIR dans .env
# 2. Génère METRICS_TOKEN s'il manque
# 3. docker compose pull && docker compose up -d
# 4. Passe un compte en admin (optionnel)
# 5. Vérifie que le backend voit bien les fichiers audio
#
# .env est sauvegardé (.env.bak-<date>) avant toute modification.
set -euo pipefail

MUSIC_DIR=""
DOWNLOAD_DIR=""
PROMOTE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --music-dir) MUSIC_DIR="$2"; shift 2 ;;
    --download-dir) DOWNLOAD_DIR="$2"; shift 2 ;;
    --promote-admin) PROMOTE="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 1 ;;
  esac
done

say() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ -f docker-compose.yml ] || die "Lancez ce script depuis le dossier qui contient docker-compose.yml"
[ -f .env ] || die ".env introuvable dans $(pwd)"
command -v docker >/dev/null || die "docker introuvable"

env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- || true; }
env_set() {
  local key="$1" value="$2"
  if grep -qE "^$key=" .env; then
    # Delimiter | : the value is a path or a hex token.
    sed -i "s|^$key=.*|$key=$value|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}
count_audio() {
  find "$1" -type f \( -iname '*.mp3' -o -iname '*.flac' -o -iname '*.ogg' -o -iname '*.wav' \
    -o -iname '*.m4a' -o -iname '*.aac' -o -iname '*.opus' \) 2>/dev/null | wc -l
}

BACKUP=".env.bak-$(date +%Y%m%d-%H%M%S)"
cp .env "$BACKUP"
say "Sauvegarde de .env -> $BACKUP"

# --- 1. Dossiers musique --------------------------------------------------
say "Dossiers musique"
[ -n "$MUSIC_DIR" ] && env_set MUSIC_SCAN_DIR "$MUSIC_DIR"
[ -n "$DOWNLOAD_DIR" ] && env_set MUSIC_DOWNLOAD_DIR "$DOWNLOAD_DIR"
for key in MUSIC_SCAN_DIR MUSIC_DOWNLOAD_DIR; do
  value="$(env_get "$key")"
  default="./music"; [ "$key" = MUSIC_DOWNLOAD_DIR ] && default="./data/downloads"
  path="${value:-$default}"
  if [ -z "$value" ]; then
    warn "$key absent de .env : docker utilise $default (relatif à $(pwd))"
  fi
  if [ -d "$path" ]; then
    echo "$key = $path : $(count_audio "$path") fichiers audio sur l'hôte"
  else
    warn "$key = $path : ce dossier n'existe pas sur l'hôte"
  fi
done

# Where the running backend actually reads from (before the update).
OLD_BACKEND="$(docker compose ps -q backend 2>/dev/null || true)"
if [ -n "$OLD_BACKEND" ]; then
  echo "Montages actuels du backend :"
  docker inspect "$OLD_BACKEND" --format '{{range .Mounts}}  {{.Source}} -> {{.Destination}}{{println}}{{end}}'
fi

# --- 2. METRICS_TOKEN -----------------------------------------------------
say "METRICS_TOKEN"
if [ -z "$(env_get METRICS_TOKEN)" ]; then
  TOKEN="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  env_set METRICS_TOKEN "$TOKEN"
  echo "Généré et ajouté à .env"
  if [ -f monitoring/prometheus.yml ] && grep -q "replace-with-METRICS_TOKEN" monitoring/prometheus.yml; then
    sed -i "s|replace-with-METRICS_TOKEN|$TOKEN|" monitoring/prometheus.yml
    echo "Recopié dans monitoring/prometheus.yml"
  fi
else
  echo "Déjà défini"
fi

# --- 3. Mise à jour des images --------------------------------------------
say "docker compose pull"
docker compose pull
say "docker compose up -d"
docker compose up -d

say "Attente du backend"
for _ in $(seq 1 30); do
  if docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" >/dev/null 2>&1; then
    echo "Backend prêt"; break
  fi
  sleep 2
done

# --- 4. Compte admin ------------------------------------------------------
if [ -n "$PROMOTE" ]; then
  say "Passage de '$PROMOTE' en admin"
  PGUSER="$(env_get POSTGRES_USER)"; PGUSER="${PGUSER:-altspotify}"
  PGDB="$(env_get POSTGRES_DB)"; PGDB="${PGDB:-altspotify}"
  # Pseudo passed as a psql variable: no SQL injection through the argument.
  docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -v pseudo="$PROMOTE" \
    -c "UPDATE users SET role='ADMIN' WHERE pseudo = :'pseudo' RETURNING pseudo, role;"
  echo "Reconnectez-vous sur le site pour que le rôle soit pris en compte."
fi

# --- 5. Vérification ------------------------------------------------------
say "Ce que voit le backend"
docker compose exec -T backend sh -c '
  for d in "${MUSIC_SCAN_DIR:-/music}" "${MUSIC_DOWNLOAD_DIR:-/app/downloads}"; do
    if [ -d "$d" ]; then
      n=$(find "$d" -type f | wc -l)
      echo "  $d : $n fichiers"
    else
      echo "  $d : ABSENT"
    fi
  done'

say "Terminé"
echo "Ouvrez Administration > Santé sur le site pour le détail (panneau Lecture)."
echo "En cas de problème, restaurez .env avec : cp $BACKUP .env && docker compose up -d"
