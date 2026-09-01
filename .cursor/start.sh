#!/usr/bin/env bash
# Evolvia Cloud Agent — start phase (runs on every boot).
#
# Reconciles the runtime: makes sure the Docker daemon is up, then brings the
# docker-compose stack (postgres, redis, migrate, api, web) online and waits
# for it to report healthy. Idempotent and returns once the stack is ready.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "[start] Ensuring Docker Engine is running..."
bash .cursor/bootstrap-docker.sh

echo "[start] Starting the Evolvia stack (docker compose up -d)..."
sudo docker compose up -d

echo "[start] Waiting for the API health check..."
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then
    echo "[start] API is healthy."
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo "[start] API did not become healthy in time. Recent logs:"
    sudo docker compose logs --tail=80 migrate api
    exit 1
  fi
  sleep 3
done

echo "[start] Waiting for the web front-end..."
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
    echo "[start] Web is serving."
    break
  fi
  if [[ "$i" -eq 40 ]]; then
    echo "[start] Web did not respond in time. Recent logs:"
    sudo docker compose logs --tail=80 web
    exit 1
  fi
  sleep 3
done

echo "[start] Configuring the nginx reverse proxy (:80 -> web + /api)..."
bash .cursor/bootstrap-nginx.sh

echo "[start] Verifying the app through the proxy..."
curl -fsS -o /dev/null -w "[start] proxy home HTTP %{http_code}\n" http://127.0.0.1/
curl -fsS -o /dev/null -w "[start] proxy /api/health HTTP %{http_code}\n" http://127.0.0.1/api/health

echo "[start] Stack is up:"
sudo docker compose ps
echo "[start] App (via nginx): http://localhost"
echo "[start] Web (direct):    http://localhost:3000"
echo "[start] API (direct):    http://localhost:4000/health"
