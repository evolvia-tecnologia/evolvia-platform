#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

DOMAIN="${EVOLVIA_DEV_DOMAIN:-dev.evolviatecnologia.com}"
PORT="${EVOLVIA_DEV_TLS_PORT:-443}"
EXPECTED_IPV4="${EVOLVIA_DEV_EXPECTED_IPV4:-}"
HEALTH_PATH="${EVOLVIA_DEV_HEALTH_PATH:-/api/health/ready}"
LOCAL_INSPECTION="${EVOLVIA_DEV_LOCAL_INSPECTION:-0}"
TMP_DIR="$(mktemp -d)"
TLS_TRANSCRIPT="${TMP_DIR}/tls.txt"
LEAF_CERT="${TMP_DIR}/leaf.pem"
HTTP_HEADERS="${TMP_DIR}/http-headers.txt"
HTTPS_HEADERS="${TMP_DIR}/https-headers.txt"
FAILURES=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '[EVOLVIA DEV TLS] %s\n' "$*"
}

record_failure() {
  printf '[EVOLVIA DEV TLS] FALHA: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf '[EVOLVIA DEV TLS] ERRO: comando necessário ausente: %s\n' "$1" >&2
    exit 2
  }
}

for command in awk curl getent grep mktemp openssl sed sort; do
  require_command "$command"
done

[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || {
  printf '[EVOLVIA DEV TLS] ERRO: hostname inválido.\n' >&2
  exit 2
}
[[ "$DOMAIN" != "homologacao.evolviatecnologia.com" ]] || {
  printf '[EVOLVIA DEV TLS] ERRO: este diagnóstico é exclusivo de dev; homologação foi recusada.\n' >&2
  exit 2
}
[[ "$PORT" =~ ^[0-9]{1,5}$ ]] || {
  printf '[EVOLVIA DEV TLS] ERRO: porta TLS inválida.\n' >&2
  exit 2
}
[[ "$HEALTH_PATH" == /* ]] || {
  printf '[EVOLVIA DEV TLS] ERRO: a rota de readiness deve começar com /.\n' >&2
  exit 2
}
[[ "$LOCAL_INSPECTION" == "0" || "$LOCAL_INSPECTION" == "1" ]] || {
  printf '[EVOLVIA DEV TLS] ERRO: EVOLVIA_DEV_LOCAL_INSPECTION aceita somente 0 ou 1.\n' >&2
  exit 2
}

log "Diagnóstico somente leitura para ${DOMAIN}:${PORT}."
log "Nenhuma validação TLS será ignorada e nenhuma configuração será alterada."

mapfile -t IPV4_ADDRESSES < <(getent ahostsv4 "$DOMAIN" | awk '{print $1}' | sort -u)
mapfile -t IPV6_ADDRESSES < <(getent ahostsv6 "$DOMAIN" | awk '{print $1}' | sort -u)

if [[ "${#IPV4_ADDRESSES[@]}" -eq 0 && "${#IPV6_ADDRESSES[@]}" -eq 0 ]]; then
  record_failure "DNS não retornou endereços A ou AAAA."
else
  [[ "${#IPV4_ADDRESSES[@]}" -eq 0 ]] || log "DNS A: ${IPV4_ADDRESSES[*]}"
  [[ "${#IPV6_ADDRESSES[@]}" -eq 0 ]] || log "DNS AAAA: ${IPV6_ADDRESSES[*]}"
fi

if [[ -n "$EXPECTED_IPV4" ]]; then
  if printf '%s\n' "${IPV4_ADDRESSES[@]}" | grep -Fxq "$EXPECTED_IPV4"; then
    log "IPv4 esperado confirmado: ${EXPECTED_IPV4}."
  else
    record_failure "IPv4 esperado ${EXPECTED_IPV4} não aparece no DNS A."
  fi
fi

set +e
openssl s_client \
  -connect "${DOMAIN}:${PORT}" \
  -servername "$DOMAIN" \
  -verify_hostname "$DOMAIN" \
  -verify_return_error \
  -showcerts \
  </dev/null >"$TLS_TRANSCRIPT" 2>&1
TLS_STATUS=$?
set -e

awk '
  /-----BEGIN CERTIFICATE-----/ { capture = 1 }
  capture { print }
  /-----END CERTIFICATE-----/ { exit }
' "$TLS_TRANSCRIPT" >"$LEAF_CERT"

if [[ ! -s "$LEAF_CERT" ]]; then
  record_failure "o servidor não apresentou certificado folha."
else
  log "Certificado folha apresentado:"
  openssl x509 -in "$LEAF_CERT" -noout -subject -issuer -dates -ext subjectAltName |
    sed 's/^/[EVOLVIA DEV TLS]   /'

  openssl x509 -in "$LEAF_CERT" -noout -checkend 0 >/dev/null \
    || record_failure "certificado expirado ou ainda não válido."
  if ! openssl x509 -in "$LEAF_CERT" -noout -checkend 604800 >/dev/null; then
    record_failure "certificado expira em menos de sete dias."
  fi
fi

if [[ "$TLS_STATUS" -ne 0 ]]; then
  VERIFY_LINE="$(grep -E 'Verify return code:|verify error:' "$TLS_TRANSCRIPT" | tail -n 1 || true)"
  record_failure "handshake/validação TLS falhou com SNI e hostname explícitos: ${VERIFY_LINE:-sem detalhe público}."
elif grep -Fq 'Verify return code: 0 (ok)' "$TLS_TRANSCRIPT"; then
  log "Cadeia, SNI e hostname validados pelo OpenSSL."
else
  record_failure "OpenSSL não comprovou Verify return code 0."
fi

HTTP_CODE="$(curl \
  --silent \
  --show-error \
  --output /dev/null \
  --dump-header "$HTTP_HEADERS" \
  --write-out '%{http_code}' \
  --max-time 15 \
  "http://${DOMAIN}/" || true)"
HTTP_LOCATION="$(awk 'BEGIN { IGNORECASE=1 } /^location:/ { sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }' "$HTTP_HEADERS")"

if [[ "$HTTP_CODE" == "301" || "$HTTP_CODE" == "308" ]]; then
  log "HTTP respondeu com redirecionamento permanente ${HTTP_CODE}."
else
  record_failure "HTTP deveria responder 301 ou 308; recebeu ${HTTP_CODE:-sem resposta}."
fi
case "$HTTP_LOCATION" in
  "https://${DOMAIN}/"*)
    log "Destino do redirecionamento preserva o hostname de dev."
    ;;
  *)
    record_failure "redirecionamento HTTP aponta para destino inesperado: ${HTTP_LOCATION:-ausente}."
    ;;
esac

set +e
HTTPS_CODE="$(curl \
  --silent \
  --show-error \
  --head \
  --output "$HTTPS_HEADERS" \
  --write-out '%{http_code}' \
  --max-time 15 \
  "https://${DOMAIN}/")"
HTTPS_STATUS=$?
set -e

if [[ "$HTTPS_STATUS" -ne 0 ]]; then
  record_failure "curl recusou a conexão HTTPS; a validação não foi contornada."
else
  case "$HTTPS_CODE" in
    200|204|301|302|307|308)
      log "HTTPS respondeu com status ${HTTPS_CODE}."
      ;;
    *)
      record_failure "HTTPS respondeu com status inesperado: ${HTTPS_CODE:-ausente}."
      ;;
  esac

  require_header() {
    local pattern="$1"
    local label="$2"
    if grep -Eiq "$pattern" "$HTTPS_HEADERS"; then
      log "Cabeçalho comprovado: ${label}."
    else
      record_failure "cabeçalho ausente ou divergente: ${label}."
    fi
  }

  require_header '^strict-transport-security: .*max-age=' 'HSTS'
  require_header '^x-content-type-options: nosniff[[:space:]]*$' 'X-Content-Type-Options nosniff'
  require_header '^referrer-policy: strict-origin-when-cross-origin[[:space:]]*$' 'Referrer-Policy'
  require_header '^x-frame-options: (sameorigin|deny)[[:space:]]*$' 'X-Frame-Options'

  if grep -Eiq '^server: nginx/[0-9]' "$HTTPS_HEADERS"; then
    record_failure "a versão do Nginx está exposta no cabeçalho Server."
  else
    log "Versão do Nginx não exposta."
  fi
  if grep -Eiq '^x-powered-by:' "$HTTPS_HEADERS"; then
    record_failure "o cabeçalho X-Powered-By expõe tecnologia."
  else
    log "X-Powered-By ausente."
  fi

  set +e
  READINESS_PAYLOAD="$(curl \
    --silent \
    --show-error \
    --max-time 15 \
    "https://${DOMAIN}${HEALTH_PATH}")"
  READINESS_STATUS=$?
  set -e
  if [[ "$READINESS_STATUS" -eq 0 ]] \
    && grep -Eiq '"status"[[:space:]]*:[[:space:]]*"ready"' <<<"$READINESS_PAYLOAD" \
    && grep -Eiq '"database"[[:space:]]*:[[:space:]]*"ok"' <<<"$READINESS_PAYLOAD"; then
    log "Readiness público comprovou aplicação e banco."
  else
    record_failure "readiness público não comprovou aplicação e banco."
  fi
fi

if [[ "$LOCAL_INSPECTION" == "1" ]]; then
  require_command nginx
  log "Inventário local selecionado do Nginx (somente leitura):"
  set +e
  nginx -T 2>&1 |
    grep -E '^[[:space:]]*(listen|server_name|ssl_certificate|ssl_certificate_key|proxy_pass|proxy_ssl_name|proxy_ssl_server_name|add_header)[[:space:]]' |
    sed 's/^/[EVOLVIA DEV TLS]   /'
  NGINX_STATUS=${PIPESTATUS[0]}
  set -e
  [[ "$NGINX_STATUS" -eq 0 ]] || record_failure "nginx -T não pôde ser inventariado."

  if command -v certbot >/dev/null 2>&1; then
    log "Inventário público de certificados do Certbot (somente leitura):"
    certbot certificates 2>&1 | sed 's/^/[EVOLVIA DEV TLS]   /'
  else
    log "Certbot não está instalado neste host."
  fi
fi

if [[ "$FAILURES" -ne 0 ]]; then
  printf '[EVOLVIA DEV TLS] Diagnóstico concluído com %s falha(s).\n' "$FAILURES" >&2
  exit 1
fi

log "Diagnóstico concluído: todos os critérios observáveis foram aprovados."
