#!/usr/bin/env bash
# Idempotent Nginx reverse-proxy bootstrap for the Evolvia Cloud Agent env.
#
# The docker-compose stack publishes the API on 127.0.0.1:4000 and the web
# front-end on 127.0.0.1:3000. The browser-side code calls the API same-origin
# under /api, so (exactly like the project's deploy.sh + infra/nginx/evolvia.conf)
# an Nginx reverse proxy on :80 fronts both services. Safe to run repeatedly.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

log() { echo "[bootstrap-nginx] $*"; }

if ! command -v nginx >/dev/null 2>&1; then
  log "Installing nginx..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::="--force-confold" nginx
fi

log "Applying infra/nginx/evolvia.conf"
sudo cp infra/nginx/evolvia.conf /etc/nginx/sites-available/evolvia
sudo ln -sfn /etc/nginx/sites-available/evolvia /etc/nginx/sites-enabled/evolvia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t

# No systemd in the Cloud Agent VM: run the master process directly, reloading
# it in place if it is already running.
if pgrep -x nginx >/dev/null 2>&1; then
  log "Reloading nginx"
  sudo nginx -s reload
else
  log "Starting nginx"
  sudo nginx
fi
