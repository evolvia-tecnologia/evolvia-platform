#!/usr/bin/env bash
# Install phase: prepare durable state (system packages + built container images).
# Runs after checkout; must be idempotent and terminate.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$REPO_ROOT"

install_system_packages() {
  if ! command -v docker >/dev/null 2>&1; then
    log "installing Docker Engine + Compose from the official apt repository"
    sudo install -m 0755 -d /etc/apt/keyrings
    if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
      curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      sudo chmod a+r /etc/apt/keyrings/docker.gpg
    fi
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt-get update -qq
  fi
  log "ensuring docker, compose, fuse-overlayfs and nginx are installed"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    -o Dpkg::Options::="--force-confold" \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    fuse-overlayfs nginx >/dev/null
  # Let the ubuntu user talk to the docker socket without sudo in future shells.
  sudo usermod -aG docker "${USER:-ubuntu}" >/dev/null 2>&1 || true
}

configure_nginx() {
  log "configuring nginx reverse proxy (port 80 -> web:3000, /api -> api:4000)"
  sudo cp "$REPO_ROOT/infra/nginx/evolvia.conf" /etc/nginx/sites-available/evolvia
  sudo ln -sfn /etc/nginx/sites-available/evolvia /etc/nginx/sites-enabled/evolvia
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
}

install_system_packages
configure_docker_daemon
ensure_dockerd
ensure_env_file
configure_nginx

log "building container images (docker compose build)"
sudo docker compose build

log "install complete"
