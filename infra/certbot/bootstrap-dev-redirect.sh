#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly LEGACY_DOMAIN="dev.evolviatecnologia.com"
readonly CANONICAL_DOMAIN="homologacao.evolviatecnologia.com"
EXPECTED_IPV4="${EVOLVIA_HOMOLOGATION_IPV4:-64.181.174.36}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_CONFIG="${REPO_ROOT}/infra/nginx/evolvia-dev-redirect.conf"
TARGET="${EVOLVIA_DEV_REDIRECT_SITE:-/etc/nginx/sites-available/evolvia-dev-redirect}"
TARGET_LINK="${EVOLVIA_DEV_REDIRECT_LINK:-/etc/nginx/sites-enabled/evolvia-dev-redirect}"
WEBROOT="${EVOLVIA_ACME_WEBROOT:-/var/www/certbot}"
CERT_DIR="/etc/letsencrypt/live/${LEGACY_DOMAIN}"
BACKUP_ROOT="${EVOLVIA_BACKUP_ROOT:-/opt/evolvia/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/dev-redirect-${STAMP}"
BACKUP_SITE="${BACKUP_DIR}/nginx-site.before"
HAD_SITE=0
HAD_LINK=0
PREVIOUS_LINK_TARGET=""
CONFIG_CHANGED=0
CHALLENGE_PATH=""
CERTBOT_CONTACT_ARGS=(--register-unsafely-without-email)

if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  CERTBOT_CONTACT_ARGS=(--email "$CERTBOT_EMAIL")
fi

log() { printf '[EVOLVIA DEV REDIRECT] %s\n' "$*"; }

rollback() {
  local code="${1:-$?}"
  trap - ERR
  set +e

  if [[ -n "$CHALLENGE_PATH" ]]; then
    rm -f "$CHALLENGE_PATH"
  fi

  if [[ "$CONFIG_CHANGED" == "1" ]]; then
    if [[ "$HAD_SITE" == "1" && -f "$BACKUP_SITE" ]]; then
      install -m 0644 "$BACKUP_SITE" "$TARGET"
    else
      rm -f "$TARGET"
    fi

    if [[ "$HAD_LINK" == "1" ]]; then
      ln -sfn "$PREVIOUS_LINK_TARGET" "$TARGET_LINK"
    else
      rm -f "$TARGET_LINK"
    fi

    if nginx -t >/dev/null 2>&1; then
      systemctl reload nginx || true
    fi
  fi

  printf '[EVOLVIA DEV REDIRECT] Rollback concluído. Backup: %s\n' "$BACKUP_DIR" >&2
  exit "$code"
}
trap rollback ERR

fail() {
  printf '[EVOLVIA DEV REDIRECT] ERRO: %s\n' "$*" >&2
  rollback 1
}

[[ "$(id -u)" -eq 0 ]] || fail "Execute como root com sudo."
[[ -f "$SOURCE_CONFIG" && ! -L "$SOURCE_CONFIG" ]] \
  || fail "Configuração versionada ausente ou inválida: ${SOURCE_CONFIG}."
[[ ! -L "$TARGET" ]] || fail "O alvo Nginx não pode ser link simbólico: ${TARGET}."
[[ ! -e "$TARGET_LINK" || -L "$TARGET_LINK" ]] \
  || fail "O link Nginx esperado é um arquivo real e não será sobrescrito: ${TARGET_LINK}."

for command in awk certbot curl getent grep install ln nginx openssl readlink sort systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "Comando necessário ausente: ${command}."
done

resolve_ipv4() {
  getent ahostsv4 "$1" | awk '{print $1}' | sort -u | head -n1 || true
}

LEGACY_IPV4="$(resolve_ipv4 "$LEGACY_DOMAIN")"
CANONICAL_IPV4="$(resolve_ipv4 "$CANONICAL_DOMAIN")"
[[ "$LEGACY_IPV4" == "$EXPECTED_IPV4" ]] \
  || fail "${LEGACY_DOMAIN} resolve para ${LEGACY_IPV4:-nenhum IPv4}; esperado: ${EXPECTED_IPV4}."
[[ "$CANONICAL_IPV4" == "$EXPECTED_IPV4" ]] \
  || fail "${CANONICAL_DOMAIN} resolve para ${CANONICAL_IPV4:-nenhum IPv4}; esperado: ${EXPECTED_IPV4}."

install -d -m 0700 "$BACKUP_DIR"
install -d -m 0755 "$WEBROOT" "$(dirname "$TARGET")" "$(dirname "$TARGET_LINK")"
if [[ -f "$TARGET" ]]; then
  install -m 0600 "$TARGET" "$BACKUP_SITE"
  HAD_SITE=1
fi
if [[ -L "$TARGET_LINK" ]]; then
  PREVIOUS_LINK_TARGET="$(readlink "$TARGET_LINK")"
  [[ -n "$PREVIOUS_LINK_TARGET" ]] || fail "Link Nginx anterior inválido: ${TARGET_LINK}."
  HAD_LINK=1
fi

TEMP_HTTP="${BACKUP_DIR}/nginx-http.conf"
cat >"$TEMP_HTTP" <<EOF
server {
    server_tokens off;
    listen 80;
    listen [::]:80;
    server_name ${LEGACY_DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root ${WEBROOT};
        default_type "text/plain";
        try_files \$uri =404;
    }

    location / {
        return 308 https://${CANONICAL_DOMAIN}\$request_uri;
    }
}
EOF

install -m 0644 "$TEMP_HTTP" "$TARGET"
ln -sfn "$TARGET" "$TARGET_LINK"
CONFIG_CHANGED=1
nginx -t
systemctl reload nginx

CHALLENGE="evolvia-dev-redirect-${STAMP}-$(openssl rand -hex 8)"
CHALLENGE_PATH="${WEBROOT}/${CHALLENGE}"
printf '%s' "$CHALLENGE" >"$CHALLENGE_PATH"
chmod 0644 "$CHALLENGE_PATH"
PUBLIC_CHALLENGE="$(curl -fsS --max-time 15 \
  "http://${LEGACY_DOMAIN}/.well-known/acme-challenge/${CHALLENGE}")"
rm -f "$CHALLENGE_PATH"
CHALLENGE_PATH=""
[[ "$PUBLIC_CHALLENGE" == "$CHALLENGE" ]] \
  || fail "O desafio ACME público do domínio legado não retornou o conteúdo esperado."

if [[ ! -s "${CERT_DIR}/fullchain.pem" || ! -s "${CERT_DIR}/privkey.pem" ]]; then
  certbot certonly \
    --webroot \
    --webroot-path "$WEBROOT" \
    --cert-name "$LEGACY_DOMAIN" \
    --domain "$LEGACY_DOMAIN" \
    "${CERTBOT_CONTACT_ARGS[@]}" \
    --agree-tos \
    --non-interactive \
    --keep-until-expiring
else
  log "Certificado legado existente encontrado; emissão ignorada."
fi

[[ -s "${CERT_DIR}/fullchain.pem" ]] || fail "Certificado legado ausente."
[[ -s "${CERT_DIR}/privkey.pem" ]] || fail "Chave privada do certificado legado ausente."

install -m 0644 "$SOURCE_CONFIG" "$TARGET"
nginx -t
systemctl reload nginx

HTTP_HEADERS="${BACKUP_DIR}/http-headers.txt"
HTTPS_HEADERS="${BACKUP_DIR}/https-headers.txt"
curl -fsSI --max-time 15 "http://${LEGACY_DOMAIN}/" >"$HTTP_HEADERS"
curl -fsSI --max-time 15 "https://${LEGACY_DOMAIN}/" >"$HTTPS_HEADERS"

for headers in "$HTTP_HEADERS" "$HTTPS_HEADERS"; do
  grep -Eiq '^HTTP/[0-9.]+ 308([[:space:]]|$)' "$headers" \
    || fail "O domínio legado não respondeu com redirecionamento permanente 308."
  grep -Eiq "^location: https://${CANONICAL_DOMAIN}/" "$headers" \
    || fail "O domínio legado não redirecionou para a homologação canônica."
  if grep -Eiq '^server: nginx/[0-9]' "$headers"; then
    fail "A versão do Nginx continua exposta no domínio legado."
  fi
done

CONFIG_CHANGED=0
trap - ERR
log "Redirecionamento TLS legado ativo para https://${CANONICAL_DOMAIN}/. Backup: ${BACKUP_DIR}"
