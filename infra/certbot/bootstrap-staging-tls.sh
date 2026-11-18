#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DOMAIN="${EVOLVIA_HOMOLOGATION_DOMAIN:-homologacao.evolviatecnologia.com}"
EXPECTED_IPV4="${EVOLVIA_HOMOLOGATION_IPV4:-64.181.174.36}"
ENV_FILE="${EVOLVIA_STAGING_ENV_FILE:-/opt/evolvia/environments/staging/.env}"
NGINX_SITE="${EVOLVIA_NGINX_SITE:-/etc/nginx/sites-available/evolvia-homologacao}"
NGINX_LINK="${EVOLVIA_NGINX_LINK:-/etc/nginx/sites-enabled/evolvia-homologacao}"
WEBROOT="${EVOLVIA_ACME_WEBROOT:-/var/www/certbot}"
CERT_DIR="${EVOLVIA_CERT_DIR:-/etc/letsencrypt/live/${DOMAIN}}"
BACKUP_ROOT="${EVOLVIA_BACKUP_ROOT:-/opt/evolvia/backups}"
HOOKS_DIR="${EVOLVIA_RENEWAL_HOOKS_DIR:-/etc/letsencrypt/renewal-hooks/deploy}"
CERTBOT_BIN="${EVOLVIA_CERTBOT_BIN:-$(command -v certbot || true)}"
CERTBOT_SNAP_BIN="${EVOLVIA_CERTBOT_SNAP_BIN:-/snap/bin/certbot}"
DEFAULT_LINK="${EVOLVIA_NGINX_LEGACY_LINK:-$(dirname "$NGINX_LINK")/default}"
OLD_SITE="$(dirname "$NGINX_SITE")/evolvia"
OLD_LINK="$(dirname "$NGINX_LINK")/evolvia"
HOOK="$HOOKS_DIR/reload-evolvia-nginx.sh"
MODE="${1:-staging}"
BACKUP_DIR=''
CHALLENGE_FILE=''
CONFIG_CHANGED=0

log() { printf '[EVOLVIA TLS] %s\n' "$*"; }
fail() { printf '[EVOLVIA TLS] ERRO: %s\n' "$*" >&2; exit 1; }

# cp -a preserva inclusive o alvo literal de links relativos ou pendentes.
restore() {
  local dest="$1" saved="$2"
  rm -f -- "$dest" || return 1
  if [[ -e "$saved" || -L "$saved" ]]; then
    cp -a -- "$saved" "$dest"
  fi
}

finish() {
  local code=$? failed=0
  trap - EXIT HUP INT TERM
  set +e
  if [[ -n "$CHALLENGE_FILE" ]]; then rm -f -- "$CHALLENGE_FILE" || failed=1; fi
  if [[ "$code" != 0 && "$CONFIG_CHANGED" == 1 ]]; then
    restore "$NGINX_SITE" "$BACKUP_DIR/site" || failed=1
    restore "$NGINX_LINK" "$BACKUP_DIR/link" || failed=1
    if [[ "$RETIRE_OLD" == 1 ]]; then restore "$OLD_LINK" "$BACKUP_DIR/old-link" || failed=1; fi
    restore "$HOOK" "$BACKUP_DIR/hook" || failed=1
    nginx -t && systemctl reload nginx || failed=1
    if [[ "$failed" == 0 ]]; then log "Configuração anterior restaurada e recarregada."; fi
  fi
  if [[ "$failed" != 0 ]]; then
    printf 'Recuperação incompleta. Inspecione o backup %s e o serviço Nginx.\n' "$BACKUP_DIR" >&2
    exit 2
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

[[ "$MODE" == staging || "$MODE" == homologacao ]] || fail "Modo de bootstrap inválido."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || fail "Domínio inválido."
for dir in "$WEBROOT" "$CERT_DIR"; do
  [[ "$dir" =~ ^/[a-zA-Z0-9._/-]+$ ]] || fail "Caminho incompatível com a configuração do Nginx."
done
[[ "$(id -u)" -eq 0 ]] || fail "Execute como root com sudo."

for command in awk curl getent grep install nginx flock mktemp systemctl; do
  command -v "$command" >/dev/null 2>&1 || fail "Comando necessário ausente: ${command}"
done

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, ""); print; exit}' "$ENV_FILE"
}

if [[ "$MODE" == staging ]]; then
  [[ -f "$ENV_FILE" ]] || fail "Ambiente de homologação ausente: ${ENV_FILE}"
  WEB_PORT="$(env_value WEB_HOST_PORT)"
  API_PORT="$(env_value API_HOST_PORT)"
else
  WEB_PORT=3000
  API_PORT=4000
fi
[[ "$WEB_PORT" =~ ^[0-9]{2,5}$ ]] || fail "WEB_HOST_PORT inválida ou ausente em ${ENV_FILE}."
[[ "$API_PORT" =~ ^[0-9]{2,5}$ ]] || fail "API_HOST_PORT inválida ou ausente em ${ENV_FILE}."

if [[ "$MODE" == staging ]]; then
  curl -fsS --max-time 10 "http://127.0.0.1:${API_PORT}/health" >/dev/null \
    || fail "API da homologação não responde em 127.0.0.1:${API_PORT}."
  curl -fsSI --max-time 10 "http://127.0.0.1:${WEB_PORT}/" >/dev/null \
    || fail "Web da homologação não responde em 127.0.0.1:${WEB_PORT}."
fi

RESOLVED_IPV4="$(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u | head -n1 || true)"
[[ -n "$RESOLVED_IPV4" ]] || fail "${DOMAIN} ainda não resolve em IPv4 a partir do servidor."
[[ "$RESOLVED_IPV4" == "$EXPECTED_IPV4" ]] \
  || fail "${DOMAIN} resolve para ${RESOLVED_IPV4}; esperado: ${EXPECTED_IPV4}."

mkdir -p -- "$BACKUP_ROOT" "$(dirname "$NGINX_SITE")" "$(dirname "$NGINX_LINK")"
# Serializa os dois pontos de entrada sem remover o arquivo de lock entre execuções.
exec 9>"$BACKUP_ROOT/bootstrap-nginx.lock"
flock -n 9 || fail "Outra atualização do Nginx está em andamento."
CERTIFICATE_PRESENT=0
if [[ ( -e "$CERT_DIR/fullchain.pem" || -L "$CERT_DIR/fullchain.pem" || -e "$CERT_DIR/privkey.pem" || -L "$CERT_DIR/privkey.pem" ) && ( ! -s "$CERT_DIR/fullchain.pem" || ! -s "$CERT_DIR/privkey.pem" ) ]]; then
  fail "Certificado existente incompleto. Preserve os arquivos para inspeção."
fi
if [[ -s "${CERT_DIR}/fullchain.pem" && -s "${CERT_DIR}/privkey.pem" ]]; then
  CERTIFICATE_PRESENT=1
fi

if [[ "$CERTIFICATE_PRESENT" == "0" && -z "${CERTBOT_EMAIL:-}" && "$MODE" == staging ]]; then
  fail "Informe CERTBOT_EMAIL para emitir o certificado e receber avisos da conta ACME."
fi

BACKUP_DIR="$(mktemp -d "$BACKUP_ROOT/ssl-homologacao-XXXXXXXX")"

snapshot() {
  local path="$1" name="$2"
  if [[ -e "$path" || -L "$path" ]]; then
    [[ -L "$path" || -f "$path" ]] || fail "Arquivo inesperado em $path."
    cp -a -- "$path" "$BACKUP_DIR/$name"
  fi
}
[[ ! -L "$NGINX_SITE" ]] || fail "Inspecione o link no lugar do arquivo de configuração."
[[ ! -e "$NGINX_LINK" || -L "$NGINX_LINK" ]] || fail "O site habilitado não é um link."
snapshot "$NGINX_SITE" site
snapshot "$NGINX_LINK" link
snapshot "$HOOK" hook
RETIRE_OLD=0
if [[ "$OLD_LINK" != "$NGINX_LINK" && ( -L "$OLD_LINK" || -e "$OLD_LINK" ) ]]; then
  templates="$(dirname "${BASH_SOURCE[0]}")/../nginx"
  [[ -L "$OLD_LINK" && "$(realpath -e "$OLD_LINK")" == "$OLD_SITE" ]] &&
    { cmp -s "$OLD_SITE" "$templates/evolvia.conf" || cmp -s "$OLD_SITE" "$templates/evolvia-https.conf"; } ||
    fail "Site antigo de origem incerta em $OLD_LINK. Revise antes da migração."
  snapshot "$OLD_LINK" old-link
  RETIRE_OLD=1
fi

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
        proxy_hide_header Strict-Transport-Security;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header Referrer-Policy;
        proxy_hide_header X-Frame-Options;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

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
        proxy_hide_header Strict-Transport-Security;
        proxy_hide_header X-Content-Type-Options;
        proxy_hide_header Referrer-Policy;
        proxy_hide_header X-Frame-Options;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

# Preserve o site default da distribuição. Quando ausente, rejeite Host desconhecido.
# Outra configuração com default_server no mesmo socket será rejeitada por nginx -t.
if [[ ! -e "$DEFAULT_LINK" && ! -L "$DEFAULT_LINK" ]]; then
  for config in "$BACKUP_DIR"/nginx-{http,https}.conf; do
    cat >>"$config" <<'EOF'
server {
    server_tokens off;
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 444;
}
EOF
  done
fi

activate() {
  install -m 0644 -- "$1" "$NGINX_SITE"
  ln -sfnT -- "$NGINX_SITE" "$NGINX_LINK"
  nginx -t
  systemctl reload nginx
}

# Verifique o estado de partida antes de alterar qualquer arquivo ativo.
nginx -t
CONFIG_CHANGED=1
if [[ "$RETIRE_OLD" == 1 ]]; then rm -- "$OLD_LINK"; fi
if [[ "$CERTIFICATE_PRESENT" == 1 ]]; then
  activate "$BACKUP_DIR/nginx-https.conf"
else
  activate "$BACKUP_DIR/nginx-http.conf"
fi

# O diretório e seus ancestrais precisam ser atravessáveis pelo worker Nginx.
for dir in "$WEBROOT" "$WEBROOT/.well-known" "$WEBROOT/.well-known/acme-challenge"; do
  if [[ ! -d "$dir" ]]; then install -d -m 0755 -- "$dir"; fi
done
CHALLENGE_FILE="$(mktemp "$WEBROOT/.well-known/acme-challenge/evolvia-acme-XXXXXXXXXXXX")"
token="${CHALLENGE_FILE##*/}"
printf %s "$token" >"$CHALLENGE_FILE"
chmod 0644 -- "$CHALLENGE_FILE"
PUBLIC_CHALLENGE="$(curl -fsS --max-time 15 "http://${DOMAIN}/.well-known/acme-challenge/${token}")"
[[ "$PUBLIC_CHALLENGE" == "$token" ]] || fail "O desafio ACME público retornou conteúdo inesperado."
rm -- "$CHALLENGE_FILE"
CHALLENGE_FILE=''

ensure_certbot() {
  if [[ -n "$CERTBOT_BIN" && -x "$CERTBOT_BIN" ]]; then return; fi
  if [[ ! -x "$CERTBOT_SNAP_BIN" ]]; then
    if ! command -v snap >/dev/null; then
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y snapd
    fi
    systemctl enable --now snapd.socket
    snap wait system seed.loaded
    snap list certbot >/dev/null 2>&1 || snap install --classic certbot
  fi
  CERTBOT_BIN="$CERTBOT_SNAP_BIN"
  [[ -x "$CERTBOT_BIN" ]] || fail "Executável do Certbot ausente."
}

if [[ "$CERTIFICATE_PRESENT" == 0 ]]; then
  ensure_certbot
  contact=(--register-unsafely-without-email)
  if [[ -n "${CERTBOT_EMAIL:-}" ]]; then contact=(--email "$CERTBOT_EMAIL"); fi
  "$CERTBOT_BIN" certonly --webroot --webroot-path "$WEBROOT" --cert-name "$DOMAIN" \
    --domain "$DOMAIN" "${contact[@]}" --agree-tos --non-interactive --keep-until-expiring
  [[ -s "$CERT_DIR/fullchain.pem" && -s "$CERT_DIR/privkey.pem" ]] || fail "Emissão incompleta."
  activate "$BACKUP_DIR/nginx-https.conf"
fi

cat >"$BACKUP_DIR/reload-hook" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
nginx -t
systemctl reload nginx
EOF
if [[ ! -d "$HOOKS_DIR" ]]; then install -d -m 0755 -- "$HOOKS_DIR"; fi
rm -f -- "$HOOK"
install -m 0755 "$BACKUP_DIR/reload-hook" "$HOOK"
curl -fsSI --max-time 15 "https://${DOMAIN}/" >/dev/null
if [[ "${CERTBOT_SKIP_DRY_RUN:-0}" != 1 ]]; then
  ensure_certbot
  "$CERTBOT_BIN" renew --cert-name "$DOMAIN" --dry-run
fi
CONFIG_CHANGED=0
log "HTTPS ativo em https://${DOMAIN}. Backup: ${BACKUP_DIR}"
