#!/usr/bin/env bash
# Evolvia Cloud Agent — install phase.
#
# Runs after the repository is checked out. Prepares durable state that can be
# baked into the environment build snapshot: the Docker daemon, the local .env
# secrets, and the pre-built application images. It is idempotent and must
# terminate (no long-running processes here).
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "[install] Bootstrapping Docker Engine..."
bash .cursor/bootstrap-docker.sh

echo "[install] Ensuring the nginx reverse proxy is installed..."
bash .cursor/bootstrap-nginx.sh

# Local secrets/config for docker-compose. Mirrors the repo's deploy.sh so the
# development stack matches production wiring. Kept out of git via .gitignore.
if [[ ! -f .env ]]; then
  echo "[install] Generating .env with random secrets..."
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  cat > .env <<EOF
POSTGRES_DB=evolvia
POSTGRES_USER=evolvia
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
EOF
  chmod 600 .env
else
  echo "[install] Reusing existing .env"
fi

echo "[install] Building application images (api, web, migrate)..."
sudo docker compose build

# Leave the disk in a clean, snapshot-safe state. Environment builds snapshot
# the VM right after install; a running dockerd with active fuse-overlayfs
# mounts prevents that snapshot from completing. The built images remain on
# disk under /var/lib/docker and the daemon is restarted per boot by start.sh.
echo "[install] Stopping Docker daemon for a clean snapshot..."
sudo docker compose down --remove-orphans >/dev/null 2>&1 || true
if [[ -f /var/run/docker.pid ]]; then
  sudo kill "$(cat /var/run/docker.pid)" >/dev/null 2>&1 || true
fi
for _ in $(seq 1 20); do
  pgrep -x dockerd >/dev/null 2>&1 || break
  sleep 1
done
# Release any lingering docker-managed fuse-overlayfs / overlay mounts so the
# snapshot sees a fully quiesced filesystem.
while read -r _dev mnt _rest; do
  case "$mnt" in
    /var/lib/docker/*) sudo umount -l "$mnt" >/dev/null 2>&1 || true ;;
  esac
done < <(grep -E 'fuse-overlayfs|overlay' /proc/mounts 2>/dev/null || true)

echo "[install] Install phase complete."
