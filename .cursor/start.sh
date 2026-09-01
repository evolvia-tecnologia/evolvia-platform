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

# infra/nginx/evolvia.conf serves the application on a single canonical
# server_name and answers every other Host from a default_server that returns
# 444 (connection closed with no response). The probe below must therefore
# present that Host; addressing the proxy as 127.0.0.1 exercises the guard
# instead of the application. The name is read from the config so the probe
# follows the proxy rather than duplicating a hardcoded host.
proxy_host="$(awk '$1 == "server_name" { sub(/;$/, "", $2); if ($2 != "_") { print $2; exit } }' infra/nginx/evolvia.conf)"
if [[ -z "$proxy_host" ]]; then
  echo "[start] Could not read the canonical server_name from infra/nginx/evolvia.conf."
  exit 1
fi

echo "[start] Verifying the app through the proxy (Host: $proxy_host)..."
curl -fsS --resolve "$proxy_host:80:127.0.0.1" -o /dev/null \
  -w "[start] proxy home HTTP %{http_code}\n" "http://$proxy_host/"
curl -fsS --resolve "$proxy_host:80:127.0.0.1" -o /dev/null \
  -w "[start] proxy /api/health HTTP %{http_code}\n" "http://$proxy_host/api/health"

# Guard against "fixing" a failing probe by loosening the proxy: an unknown Host
# must keep getting no response at all from the default_server. Only curl exit 52
# ("Empty reply from server") together with an empty status line proves the
# `return 444`. A 404, a 500, a timeout or a refused connection also make the
# request fail, for unrelated reasons, so accepting "any failure" here would
# approve a proxy that is broken rather than protected.
guard_exit=0
guard_http="$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1/")" || guard_exit=$?
if [[ "$guard_exit" -ne 52 || "$guard_http" != "000" ]]; then
  echo "[start] An unknown Host did not get the default_server 444: curl exit" \
    "$guard_exit, HTTP $guard_http (expected curl exit 52, HTTP 000)."
  exit 1
fi
echo "[start] default_server still refuses unknown hosts (curl exit 52, HTTP 000)."

echo "[start] Stack is up:"
sudo docker compose ps
echo "[start] App (via nginx): http://localhost (only served for Host: $proxy_host)"
echo "[start] Web (direct):    http://localhost:3000"
echo "[start] API (direct):    http://localhost:4000/health"
