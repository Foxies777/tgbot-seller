#!/usr/bin/env sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy .env.production.example to .env and fill secrets." >&2
  exit 1
fi

echo "Building and starting production stack..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo
echo "Stack is up. Next steps:"
echo "  1. Configure HTTPS reverse proxy (see DEPLOY.md)"
echo "  2. Create admin:"
echo "     docker compose -f $COMPOSE_FILE exec app python -m app.cli create-admin --username admin --password 'YourPassword8'"
echo "  3. Check health:"
echo "     curl -fsS http://127.0.0.1:8000/healthz"
echo "  4. Set WEBHOOK_BASE_URL=https://your-domain.example in .env and restart app if needed"
