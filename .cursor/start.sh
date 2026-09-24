#!/usr/bin/env bash
# Start phase: bring up per-boot runtime services (dockerd, the Compose stack and
# the Nginx proxy). Must tolerate restarts and reach a clear ready state.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$REPO_ROOT"

ensure_dockerd
ensure_env_file

start_nginx() {
  # Reconcile the reverse-proxy site, then start or reload nginx.
  if [[ ! -e /etc/nginx/sites-enabled/evolvia ]]; then
    sudo cp "$REPO_ROOT/infra/nginx/evolvia.conf" /etc/nginx/sites-available/evolvia
    sudo ln -sfn /etc/nginx/sites-available/evolvia /etc/nginx/sites-enabled/evolvia
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
  sudo nginx -t
  if pgrep -x nginx >/dev/null 2>&1; then
    sudo nginx -s reload
  else
    sudo nginx
  fi
}

log "starting the Evolvia stack (docker compose up -d)"
sudo docker compose up -d

log "waiting for the API to become healthy"
api_ok=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then api_ok=1; break; fi
  sleep 3
done
if [[ "$api_ok" -ne 1 ]]; then
  log "ERROR: API did not become healthy in time"
  sudo docker compose ps
  sudo docker compose logs --tail=80 api migrate
  exit 1
fi
log "API is healthy"

start_nginx

log "waiting for the web app (via nginx) to respond"
for _ in $(seq 1 40); do
  if curl -fsS http://127.0.0.1/ >/dev/null 2>&1; then break; fi
  sleep 3
done

log "stack is up:"
sudo docker compose ps
log "Open http://localhost/ for the web app; the API is proxied under http://localhost/api/"
