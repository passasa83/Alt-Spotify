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
    SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")
    sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env
    echo ".env created. Please review and update passwords."
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
