#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${EVOLVIA_HOMOLOGATION_DOMAIN:-homologacao.evolviatecnologia.com}"
EXPECTED_IPV4="${EVOLVIA_HOMOLOGATION_IPV4:-64.181.174.36}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEBROOT="/var/www/certbot"
CERT_DIR="/etc/letsencrypt/live/${DOMAIN}"
NGINX_SITE="/etc/nginx/sites-available/evolvia"
BACKUP_DIR="/opt/evolvia/backups/nginx"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ $EUID -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

log() {
  printf '[EVOLVIA TLS] %s\n' "$*"
}

fail() {
  printf '[EVOLVIA TLS] ERRO: %s\n' "$*" >&2
  exit 1
}

[[ -f "${REPO_ROOT}/infra/nginx/evolvia.conf" ]] || fail "Configuração HTTP do Evolvia não encontrada."
[[ -f "${REPO_ROOT}/infra/nginx/evolvia-https.conf" ]] || fail "Configuração HTTPS do Evolvia não encontrada."

RESOLVED_IPV4="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | head -n1 || true)"
[[ -n "$RESOLVED_IPV4" ]] || fail "O domínio ${DOMAIN} ainda não resolve em IPv4."
[[ "$RESOLVED_IPV4" == "$EXPECTED_IPV4" ]] || fail "O domínio resolve para ${RESOLVED_IPV4}, mas o IPv4 esperado é ${EXPECTED_IPV4}."

log "DNS validado: ${DOMAIN} -> ${RESOLVED_IPV4}."

$SUDO mkdir -p "$WEBROOT" "$BACKUP_DIR"
if $SUDO test -f "$NGINX_SITE"; then
  $SUDO cp "$NGINX_SITE" "${BACKUP_DIR}/evolvia-pre-tls-${STAMP}.conf"
fi

# Garante uma configuração HTTP conhecida e restrita ao domínio para o desafio ACME.
$SUDO install -m 0644 "${REPO_ROOT}/infra/nginx/evolvia.conf" "$NGINX_SITE"
$SUDO ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/evolvia
$SUDO rm -f /etc/nginx/sites-enabled/default
$SUDO nginx -t
$SUDO systemctl reload nginx

CHALLENGE="evolvia-acme-${STAMP}"
printf '%s' "$CHALLENGE" | $SUDO tee "${WEBROOT}/${CHALLENGE}" >/dev/null
if ! curl -fsS --max-time 10 "http://${DOMAIN}/.well-known/acme-challenge/${CHALLENGE}" | grep -Fxq "$CHALLENGE"; then
  $SUDO rm -f "${WEBROOT}/${CHALLENGE}"
  fail "O desafio HTTP não ficou acessível publicamente em ${DOMAIN}:80."
fi
$SUDO rm -f "${WEBROOT}/${CHALLENGE}"
log "Desafio HTTP público validado."

if ! command -v snap >/dev/null 2>&1; then
  log "Instalando snapd..."
  $SUDO apt-get update
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y snapd
fi

$SUDO systemctl enable --now snapd.socket >/dev/null 2>&1 || true
$SUDO snap wait system seed.loaded >/dev/null 2>&1 || true

if ! $SUDO snap list certbot >/dev/null 2>&1; then
  log "Instalando Certbot via Snap..."
  if ! $SUDO snap list core >/dev/null 2>&1; then
    $SUDO snap install core
  fi
  $SUDO snap refresh core >/dev/null 2>&1 || true
  $SUDO snap install --classic certbot
fi

$SUDO ln -sfn /snap/bin/certbot /usr/local/bin/certbot
CERTBOT_BIN="/usr/local/bin/certbot"

CERTBOT_CONTACT_ARGS=()
if [[ -n "$CERTBOT_EMAIL" ]]; then
  CERTBOT_CONTACT_ARGS=(--email "$CERTBOT_EMAIL")
else
  CERTBOT_CONTACT_ARGS=(--register-unsafely-without-email)
  log "Aviso: CERTBOT_EMAIL não informado; conta ACME será criada sem e-mail de contato."
fi

if ! $SUDO test -s "${CERT_DIR}/fullchain.pem" || ! $SUDO test -s "${CERT_DIR}/privkey.pem"; then
  log "Emitindo certificado para ${DOMAIN}..."
  $SUDO "$CERTBOT_BIN" certonly \
    --webroot \
    --webroot-path "$WEBROOT" \
    --domain "$DOMAIN" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring \
    "${CERTBOT_CONTACT_ARGS[@]}"
else
  log "Certificado existente encontrado; nova emissão não é necessária."
fi

$SUDO test -s "${CERT_DIR}/fullchain.pem" || fail "fullchain.pem não foi criado."
$SUDO test -s "${CERT_DIR}/privkey.pem" || fail "privkey.pem não foi criado."

$SUDO install -m 0644 "${REPO_ROOT}/infra/nginx/evolvia-https.conf" "$NGINX_SITE"
$SUDO nginx -t
$SUDO systemctl reload nginx

$SUDO install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
cat <<'EOF' | $SUDO tee /etc/letsencrypt/renewal-hooks/deploy/reload-evolvia-nginx.sh >/dev/null
#!/usr/bin/env bash
set -Eeuo pipefail
nginx -t
systemctl reload nginx
EOF
$SUDO chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-evolvia-nginx.sh

curl -fsSI --max-time 15 "https://${DOMAIN}/" >/dev/null || fail "HTTPS foi configurado, mas a URL pública não respondeu com sucesso."

if [[ "${CERTBOT_SKIP_DRY_RUN:-0}" != "1" ]]; then
  log "Validando renovação automática com dry-run..."
  $SUDO "$CERTBOT_BIN" renew --dry-run
fi

log "HTTPS ativo em https://${DOMAIN}"
