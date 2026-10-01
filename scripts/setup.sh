#!/bin/bash
set -euo pipefail

echo "=== Alt Spotify - Setup ==="

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Create .env if missing
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ".env created. Please review and update passwords."
fi

# .env is gitignored and .env.example ships SECRET_KEY empty, so generate it
# whenever it is missing, too short (< 32 chars) or still one of the example
# values that backend/app/core/config.py rejects at startup.
SECRET_CURRENT="$(grep -E '^SECRET_KEY=' .env | head -n 1 | cut -d= -f2-)"
case "$SECRET_CURRENT" in
    changeme|change-me-to-a-random-secret-key|change-me-in-production-use-openssl-rand-hex-32)
        SECRET_CURRENT="" ;;
esac

if [ "${#SECRET_CURRENT}" -lt 32 ]; then
    SECRET_KEY=$(openssl rand -hex 32 2>/dev/null \
        || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null \
        || true)
    if [ -z "$SECRET_KEY" ]; then
        echo "ERROR: could not generate SECRET_KEY (openssl/python3 missing)." >&2
        exit 1
    fi
    if grep -q '^SECRET_KEY=' .env; then
        sed -i "s/^SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    else
        printf '\nSECRET_KEY=%s\n' "$SECRET_KEY" >> .env
    fi
    echo "SECRET_KEY generated in .env."
fi

# Build and start services
echo "Building Docker images..."
docker compose build

echo "Starting services..."
docker compose up -d

# Wait for services
echo "Waiting for services to be ready..."
sleep 10

# Check health
echo "Checking service health..."
docker compose ps

echo ""
echo "=== Setup Complete ==="
echo "Frontend: http://localhost:3000"
echo "API: http://localhost:8000/docs"
echo "MinIO Console: http://localhost:9001"
echo "Meilisearch: http://localhost:7700"
