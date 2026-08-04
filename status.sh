#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
docker compose ps
echo
curl -fsS http://127.0.0.1:4000/health || true
echo
sudo nginx -t
docker compose logs --tail=30 api web
