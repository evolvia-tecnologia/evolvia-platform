#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

HOMOLOGATION_DOMAIN="homologacao.evolviatecnologia.com"
CERT_DIR="/etc/letsencrypt/live/${HOMOLOGATION_DOMAIN}"

if [[ ! -f .env ]]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  JWT_SECRET="$(openssl rand -hex 48)"
  cat > .env <<EOF
POSTGRES_DB=evolvia
POSTGRES_USER=evolvia
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
JWT_SECRET=${JWT_SECRET}
EOF
  chmod 600 .env
fi

echo "[EVOLVIA] Construindo containers..."
docker compose build
echo "[EVOLVIA] Iniciando serviços..."
docker compose up -d

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:3000/ >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    docker compose ps --all
    docker compose logs --tail=200 api web
    exit 1
  fi
  sleep 3
done

STAMP="$(date +%Y%m%d-%H%M%S)"
sudo mkdir -p /opt/evolvia/backups/nginx /var/www/certbot

if [[ -f /etc/nginx/sites-available/default ]]; then
  sudo cp /etc/nginx/sites-available/default "/opt/evolvia/backups/nginx/default-${STAMP}.conf"
fi
if [[ -f /etc/nginx/sites-available/evolvia ]]; then
  sudo cp /etc/nginx/sites-available/evolvia "/opt/evolvia/backups/nginx/evolvia-${STAMP}.conf"
fi

NGINX_TEMPLATE="infra/nginx/evolvia.conf"
PUBLIC_URL="http://${HOMOLOGATION_DOMAIN}"
if sudo test -s "${CERT_DIR}/fullchain.pem" && sudo test -s "${CERT_DIR}/privkey.pem"; then
  NGINX_TEMPLATE="infra/nginx/evolvia-https.conf"
  PUBLIC_URL="https://${HOMOLOGATION_DOMAIN}"
  echo "[EVOLVIA] Certificado encontrado; ativando configuração HTTPS persistente."
else
  echo "[EVOLVIA] Certificado ainda não encontrado; mantendo HTTP restrito ao domínio para emissão ACME."
fi

sudo install -m 0644 "$NGINX_TEMPLATE" /etc/nginx/sites-available/evolvia
sudo ln -sfn /etc/nginx/sites-available/evolvia /etc/nginx/sites-enabled/evolvia
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

docker compose ps
echo "EVOLVIA homologação disponível em ${PUBLIC_URL}"
