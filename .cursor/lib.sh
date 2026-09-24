#!/usr/bin/env bash
# Shared helpers for the Evolvia Cloud Agent environment.
# The whole stack runs through Docker Compose (postgres, redis, api, web) with an
# Nginx reverse proxy on port 80. This VM has no systemd and runs Docker nested on
# an overlay filesystem, so dockerd is started manually with the fuse-overlayfs
# storage driver and the legacy iptables firewall backend (the nftables backend
# does not install intra-bridge rules here, which breaks container-to-container
# networking).

set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKERD_LOG="/tmp/evolvia-dockerd.log"

log() { echo "[evolvia-env] $*"; }

ensure_env_file() {
  cd "$REPO_ROOT"
  if [[ ! -f .env ]]; then
    log "generating .env with random secrets"
    cat > .env <<EOF
POSTGRES_DB=evolvia
POSTGRES_USER=evolvia
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 48)
EOF
    chmod 600 .env
  fi
}

# Configure the Docker daemon for this nested / overlayfs environment. Idempotent.
configure_docker_daemon() {
  sudo mkdir -p /etc/docker
  printf '%s\n' '{
  "storage-driver": "fuse-overlayfs",
  "firewall-backend": "iptables",
  "iptables": true
}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
  sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
}

docker_ready() { sudo docker info >/dev/null 2>&1; }

# Start dockerd in the background if it is not already serving. Idempotent.
ensure_dockerd() {
  if docker_ready; then
    log "dockerd already running"
    return 0
  fi
  configure_docker_daemon
  log "starting dockerd (logs: $DOCKERD_LOG)"
  sudo sh -c "nohup dockerd >>'$DOCKERD_LOG' 2>&1 &"
  for _ in $(seq 1 30); do
    if docker_ready; then log "dockerd is up"; return 0; fi
    sleep 1
  done
  log "ERROR: dockerd did not become ready"
  tail -n 40 "$DOCKERD_LOG" 2>/dev/null || true
  return 1
}
