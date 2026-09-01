#!/usr/bin/env bash
# Idempotent Docker Engine bootstrap for the Evolvia Cloud Agent environment.
#
# Cloud Agent VMs run nested inside a container without systemd, so the Docker
# daemon has to be installed, configured for that nested context, and launched
# by hand. This script is safe to run repeatedly (during `install` and on every
# `start`) and returns only once the daemon answers `docker info`.
set -Eeuo pipefail

DOCKERD_LOG=/var/log/docker/dockerd.log

log() { echo "[bootstrap-docker] $*"; }

ensure_packages() {
  if command -v docker >/dev/null 2>&1 \
    && command -v fuse-overlayfs >/dev/null 2>&1 \
    && docker compose version >/dev/null 2>&1; then
    return 0
  fi
  log "Installing docker.io, docker compose plugin and fuse-overlayfs..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    -o Dpkg::Options::="--force-confold" \
    docker.io docker-compose-v2 fuse-overlayfs
}

write_daemon_config() {
  # fuse-overlayfs: the kernel overlay driver cannot mount inside the nested VM.
  # containerd-snapshotter=false: keep the classic graph-driver store so
  #   fuse-overlayfs is actually honoured.
  # registry-mirrors: avoid anonymous Docker Hub pull-rate limits.
  sudo mkdir -p /etc/docker /var/log/docker
  local desired
  desired='{
  "storage-driver": "fuse-overlayfs",
  "features": { "containerd-snapshotter": false },
  "registry-mirrors": ["https://mirror.gcr.io"]
}'
  if [[ "$(cat /etc/docker/daemon.json 2>/dev/null || true)" != "$desired" ]]; then
    log "Writing /etc/docker/daemon.json"
    echo "$desired" | sudo tee /etc/docker/daemon.json >/dev/null
  fi
}

fix_forward_policy() {
  # Cloud Agent VMs boot with the legacy iptables FORWARD chain defaulting to
  # DROP. With bridge-nf-call-iptables=1 that silently drops container-to-
  # container traffic even though Docker's nftables rules allow it, so force it
  # back to ACCEPT. Docker owns the nftables FORWARD chain itself.
  if command -v iptables-legacy >/dev/null 2>&1; then
    sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null || true
  fi
}

daemon_ready() { sudo docker info >/dev/null 2>&1; }

start_daemon() {
  if daemon_ready; then
    return 0
  fi
  if pgrep -x dockerd >/dev/null 2>&1; then
    log "dockerd process present but not ready yet; waiting..."
  else
    log "Starting dockerd..."
    sudo bash -c "nohup dockerd >>'$DOCKERD_LOG' 2>&1 &"
  fi
  for _ in $(seq 1 30); do
    if daemon_ready; then
      log "Docker daemon is ready."
      return 0
    fi
    sleep 1
  done
  log "Docker daemon did not become ready in time. Recent log:"
  sudo tail -n 40 "$DOCKERD_LOG" 2>/dev/null || true
  return 1
}

grant_docker_group() {
  # Let the agent user run docker without sudo in future shells.
  if getent group docker >/dev/null 2>&1; then
    sudo usermod -aG docker "${USER:-ubuntu}" 2>/dev/null || true
  fi
}

ensure_packages
write_daemon_config
fix_forward_policy
start_daemon
grant_docker_group
