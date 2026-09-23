#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

HOMOLOGATION_DOMAIN="homologacao.evolviatecnologia.com"
CERT_DIR="/etc/letsencrypt/live/${HOMOLOGATION_DOMAIN}"
BUILD_CACHE_MAX_AGE="${EVOLVIA_BUILD_CACHE_MAX_AGE:-72h}"
AUTO_TLS_BOOTSTRAP="${EVOLVIA_AUTO_TLS_BOOTSTRAP:-1}"
DEV_REDIRECT_BOOTSTRAP="${EVOLVIA_DEV_REDIRECT_BOOTSTRAP:-1}"

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

ensure_env_var() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*$|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

# Homologação é sempre não indexável. Produção futura deve habilitar indexação explicitamente.
ensure_env_var "EVOLVIA_PUBLIC_BASE_URL" "https://${HOMOLOGATION_DOMAIN}"
ensure_env_var "EVOLVIA_PUBLIC_INDEXING" "0"

echo "[EVOLVIA] Uso de disco Docker antes da manutenção:"
docker system df || true

echo "[EVOLVIA] Removendo somente cache de build não utilizado com mais de ${BUILD_CACHE_MAX_AGE}..."
if ! docker builder prune --all --force --filter "until=${BUILD_CACHE_MAX_AGE}"; then
  echo "[EVOLVIA] Aviso: não foi possível limpar o cache de build; o deploy seguirá sem remover imagens ou volumes."
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

sudo mkdir -p /opt/evolvia/backups/nginx /var/www/certbot

NGINX_TEMPLATE="infra/nginx/evolvia.conf"
PUBLIC_URL="http://${HOMOLOGATION_DOMAIN}"
if sudo test -s "${CERT_DIR}/fullchain.pem" && sudo test -s "${CERT_DIR}/privkey.pem"; then
  NGINX_TEMPLATE="infra/nginx/evolvia-https.conf"
  PUBLIC_URL="https://${HOMOLOGATION_DOMAIN}"
  echo "[EVOLVIA] Certificado encontrado; ativando configuração HTTPS persistente."
else
  echo "[EVOLVIA] Certificado ainda não encontrado; mantendo HTTP restrito ao domínio para emissão ACME."
fi

DEPLOY_SHA="$(git rev-parse --verify HEAD)"
NGINX_SOURCE="$(mktemp /tmp/evolvia-nginx.XXXXXX.conf)"
trap 'rm -f "$NGINX_SOURCE"' EXIT
install -m 0600 "$NGINX_TEMPLATE" "$NGINX_SOURCE"
sudo rm -f /etc/nginx/sites-enabled/default
sudo bash infra/nginx/apply-staging-nginx.sh "$NGINX_SOURCE" "$DEPLOY_SHA"
rm -f "$NGINX_SOURCE"
trap - EXIT

if [[ "$PUBLIC_URL" == http://* && "$AUTO_TLS_BOOTSTRAP" == "1" ]]; then
  echo "[EVOLVIA] Iniciando bootstrap TLS da homologação..."
  bash infra/certbot/bootstrap-homologacao.sh
  PUBLIC_URL="https://${HOMOLOGATION_DOMAIN}"
fi

if [[ "$DEV_REDIRECT_BOOTSTRAP" == "1" ]]; then
  echo "[EVOLVIA] Validando certificado e redirecionamento do alias legado dev..."
  sudo env CERTBOT_EMAIL="${CERTBOT_EMAIL:-}" \
    bash infra/certbot/bootstrap-dev-redirect.sh
fi

docker compose ps

echo "[EVOLVIA] Uso de disco Docker após o deploy:"
docker system df || true

echo "EVOLVIA homologação disponível em ${PUBLIC_URL}"
