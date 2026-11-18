#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DOMAIN="${EVOLVIA_DEV_DOMAIN:-dev.evolviatecnologia.com}"
EXPECTED_IPV4="${EVOLVIA_DEV_IPV4:-64.181.174.36}"
ENV_FILE="${EVOLVIA_DEV_ENV_FILE:-/opt/evolvia/environments/dev/.env}"
NGINX_SITE="${EVOLVIA_NGINX_SITE:-/etc/nginx/sites-available/evolvia-dev}"
NGINX_LINK="${EVOLVIA_NGINX_LINK:-/etc/nginx/sites-enabled/evolvia-dev}"
WEBROOT="${EVOLVIA_ACME_WEBROOT:-/var/www/certbot}"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
BACKUP_ROOT="/opt/evolvia/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/ssl-dev-${STAMP}"
BACKUP_SITE="${BACKUP_DIR}/nginx-site.before"
HAD_SITE=0
CONFIG_CHANGED=0

log() { printf '[EVOLVIA TLS] %s\n' "$*"; }
fail() {
  printf '[EVOLVIA TLS] ERRO: %s\n' "$*" >&2
  rollback 1
}

rollback() {
  local code="${1:-$?}"
  trap - ERR
  set +e

  if [[ "$CONFIG_CHANGED" == "1" ]]; then
    if [[ "$HAD_SITE" == "1" && -f "$BACKUP_SITE" ]]; then
      install -m 0644 "$BACKUP_SITE" "$NGINX_SITE"
      ln -sfn "$NGINX_SITE" "$NGINX_LINK"
    else
      rm -f "$NGINX_SITE" "$NGINX_LINK"
    fi

    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx || true
    fi
  fi

  printf '[EVOLVIA TLS] Rollback do Nginx concluído. Backup: %s\n' "$BACKUP_DIR" >&2
  exit "$code"
}
trap rollback ERR

[[ "$(id -u)" -eq 0 ]] || fail "Execute como root com sudo."
[[ "$DOMAIN" == "dev.evolviatecnologia.com" ]] \
  || fail "Domínio recusado: este script altera exclusivamente dev.evolviatecnologia.com."
[[ -f "$ENV_FILE" ]] || fail "Ambiente de desenvolvimento ausente: ${ENV_FILE}"
CERTIFICATE_PRESENT=0
if [[ -s "${CERT_DIR}/fullchain.pem" && -s "${CERT_DIR}/privkey.pem" ]]; then
  CERTIFICATE_PRESENT=1
fi

if [[ "$CERTIFICATE_PRESENT" == "0" && -z "${CERTBOT_EMAIL:-}" ]]; then
  fail "Informe CERTBOT_EMAIL para emitir o certificado e receber avisos da conta ACME."
fi

for command in awk curl getent grep install nginx openssl ss systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "Comando necessário ausente: ${command}"
done

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}

WEB_PORT="$(env_value WEB_HOST_PORT)"
API_PORT="$(env_value API_HOST_PORT)"
[[ "$WEB_PORT" =~ ^[0-9]{2,5}$ ]] || fail "WEB_HOST_PORT inválida ou ausente em ${ENV_FILE}."
[[ "$API_PORT" =~ ^[0-9]{2,5}$ ]] || fail "API_HOST_PORT inválida ou ausente em ${ENV_FILE}."

curl -fsS --max-time 10 "http://127.0.0.1:${API_PORT}/health" >/dev/null \
  || fail "API da desenvolvimento não responde em 127.0.0.1:${API_PORT}."
curl -fsSI --max-time 10 "http://127.0.0.1:${WEB_PORT}/" >/dev/null \
  || fail "Web da desenvolvimento não responde em 127.0.0.1:${WEB_PORT}."

RESOLVED_IPV4="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | head -n1 || true)"
[[ -n "$RESOLVED_IPV4" ]] || fail "${DOMAIN} ainda não resolve em IPv4 a partir do servidor."
[[ "$RESOLVED_IPV4" == "$EXPECTED_IPV4" ]] \
  || fail "${DOMAIN} resolve para ${RESOLVED_IPV4}; esperado: ${EXPECTED_IPV4}."

mkdir -p "$BACKUP_DIR" "$WEBROOT" "$(dirname "$NGINX_SITE")" "$(dirname "$NGINX_LINK")"
chmod 700 "$BACKUP_DIR"

if [[ -f "$NGINX_SITE" ]]; then
  cp -a "$NGINX_SITE" "$BACKUP_SITE"
  HAD_SITE=1
fi

cat >"${BACKUP_DIR}/diagnostico.before.txt" <<EOF
captured_at=$(date -Iseconds)
domain=${DOMAIN}
resolved_ipv4=${RESOLVED_IPV4}
expected_ipv4=${EXPECTED_IPV4}
web_port=${WEB_PORT}
api_port=${API_PORT}
nginx_site=${NGINX_SITE}
EOF

cat >"${BACKUP_DIR}/nginx-http.conf" <<EOF
server {
    server_tokens off;
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};
    client_max_body_size 7m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

install -m 0644 "${BACKUP_DIR}/nginx-http.conf" "$NGINX_SITE"
ln -sfn "$NGINX_SITE" "$NGINX_LINK"
CONFIG_CHANGED=1
nginx -t
systemctl reload nginx

CHALLENGE="evolvia-acme-${STAMP}-$(openssl rand -hex 8)"
printf '%s' "$CHALLENGE" >"${WEBROOT}/${CHALLENGE}"
chmod 644 "${WEBROOT}/${CHALLENGE}"

PUBLIC_CHALLENGE="$(curl -fsS --max-time 15 "http://${DOMAIN}/.well-known/acme-challenge/${CHALLENGE}")"
rm -f "${WEBROOT}/${CHALLENGE}"
[[ "$PUBLIC_CHALLENGE" == "$CHALLENGE" ]] \
  || fail "O desafio ACME público não retornou o conteúdo esperado."

if ! command -v certbot >/dev/null 2>&1; then
  command -v snap >/dev/null 2>&1 || {
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y snapd
  }
  systemctl enable --now snapd.socket >/dev/null 2>&1 || true
  snap wait system seed.loaded >/dev/null 2>&1 || true
  snap list core >/dev/null 2>&1 || snap install core
  snap refresh core >/dev/null 2>&1 || true
  snap list certbot >/dev/null 2>&1 || snap install --classic certbot
  ln -sfn /snap/bin/certbot /usr/local/bin/certbot
fi

if [[ "$CERTIFICATE_PRESENT" == "0" ]]; then
  certbot certonly \
    --webroot \
    --webroot-path "$WEBROOT" \
    --cert-name "$DOMAIN" \
    --domain "$DOMAIN" \
    --email "$CERTBOT_EMAIL" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring
else
  log "Certificado existente encontrado; emissão ignorada."
fi

[[ -s "${CERT_DIR}/fullchain.pem" ]] || fail "Certificado não foi criado."
[[ -s "${CERT_DIR}/privkey.pem" ]] || fail "Chave privada não foi criada."
openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -checkhost "$DOMAIN" \
  || fail "O certificado existente ou emitido não cobre ${DOMAIN}."
openssl x509 -in "${CERT_DIR}/fullchain.pem" -noout -checkend 604800 \
  || fail "O certificado de ${DOMAIN} expira em menos de sete dias."

cat >"${BACKUP_DIR}/nginx-https.conf" <<EOF
server {
    server_tokens off;
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 308 https://${DOMAIN}\$request_uri;
    }
}

server {
    server_tokens off;
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAIN};
    client_max_body_size 7m;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:EVOLVIA_SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://127.0.0.1:${WEB_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

install -m 0644 "${BACKUP_DIR}/nginx-https.conf" "$NGINX_SITE"
nginx -t
systemctl reload nginx

install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat >/etc/letsencrypt/renewal-hooks/deploy/reload-evolvia-nginx.sh <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
nginx -t
systemctl reload nginx
EOF
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-evolvia-nginx.sh

curl -fsSI --max-time 15 "https://${DOMAIN}/" >/dev/null \
  || fail "O Nginx local foi atualizado, mas o HTTPS público não respondeu. Verifique a porta 443 na rede Oracle."

if [[ "${CERTBOT_SKIP_DRY_RUN:-0}" != "1" ]]; then
  certbot renew --dry-run
fi

CONFIG_CHANGED=0
log "HTTPS ativo em https://${DOMAIN}. Backup: ${BACKUP_DIR}"
