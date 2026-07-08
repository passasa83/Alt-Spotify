#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "=== Alt Spotify Backup - $TIMESTAMP ==="

# PostgreSQL backup
echo "Backing up PostgreSQL..."
docker compose exec -T postgres pg_dump -U altspotify altspotify \
    | gzip > "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"

# MinIO backup
echo "Backing up MinIO data..."
docker run --rm \
    -v altspotify_minio_data:/data:ro \
    -v "$(pwd)/$BACKUP_DIR":/backup \
    alpine tar czf "/backup/minio_$TIMESTAMP.tar.gz" -C /data .

# Compress everything
echo "Compressing backup..."
tar czf "$BACKUP_DIR/altspotify_full_$TIMESTAMP.tar.gz" \
    -C "$BACKUP_DIR" \
    "postgres_$TIMESTAMP.sql.gz" \
    "minio_$TIMESTAMP.tar.gz"

# Cleanup individual files
rm -f "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz" \
      "$BACKUP_DIR/minio_$TIMESTAMP.tar.gz"

# Rotate old backups
echo "Rotating backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "altspotify_full_*.tar.gz" -mtime +$KEEP_DAYS -delete

echo "=== Backup Complete: $BACKUP_DIR/altspotify_full_$TIMESTAMP.tar.gz ==="
