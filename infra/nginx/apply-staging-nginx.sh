#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_CONFIG="${1:-}"
DEPLOY_SHA="${2:-}"
TARGET="${EVOLVIA_NGINX_SITE:-/etc/nginx/sites-available/evolvia-homologacao}"
TARGET_LINK="${EVOLVIA_NGINX_LINK:-/etc/nginx/sites-enabled/evolvia-homologacao}"
BACKUP_ROOT="${EVOLVIA_BACKUP_ROOT:-/opt/evolvia/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/nginx-promote-${STAMP}-${DEPLOY_SHA:0:12}"
BACKUP_SITE="${BACKUP_DIR}/nginx-site.before"
HAD_SITE=0
CONFIG_CHANGED=0

log() { printf '[EVOLVIA NGINX] %s\n' "$*"; }

rollback() {
  local code="${1:-$?}"
  trap - ERR
  set +e

  if [[ "$CONFIG_CHANGED" == "1" ]]; then
    if [[ "$HAD_SITE" == "1" && -f "$BACKUP_SITE" ]]; then
      install -m 0644 "$BACKUP_SITE" "$TARGET"
      ln -sfn "$TARGET" "$TARGET_LINK"
    else
      rm -f "$TARGET" "$TARGET_LINK"
    fi

    if nginx -t; then
      systemctl reload nginx || true
    fi
  fi

  rm -f "$SOURCE_CONFIG"
  printf '[EVOLVIA NGINX] Rollback concluído. Backup: %s\n' "$BACKUP_DIR" >&2
  exit "$code"
}
trap rollback ERR

[[ "$(id -u)" -eq 0 ]] || {
  printf '[EVOLVIA NGINX] ERRO: execute como root.\n' >&2
  exit 1
}
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  printf '[EVOLVIA NGINX] ERRO: SHA de deploy inválido.\n' >&2
  exit 1
}
[[ -f "$SOURCE_CONFIG" && ! -L "$SOURCE_CONFIG" ]] || {
  printf '[EVOLVIA NGINX] ERRO: configuração versionada ausente ou inválida.\n' >&2
  exit 1
}

for command in grep install ln nginx systemctl; do
  command -v "$command" >/dev/null 2>&1 || {
    printf '[EVOLVIA NGINX] ERRO: comando necessário ausente: %s\n' "$command" >&2
    exit 1
  }
done

grep -Fq 'server_name homologacao.evolviatecnologia.com;' "$SOURCE_CONFIG"
grep -Fq 'server_tokens off;' "$SOURCE_CONFIG"
grep -Fq 'proxy_hide_header Strict-Transport-Security;' "$SOURCE_CONFIG"
grep -Fq 'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' "$SOURCE_CONFIG"

install -d -m 0700 "$BACKUP_DIR"
install -d -m 0755 "$(dirname "$TARGET")" "$(dirname "$TARGET_LINK")"

if [[ -f "$TARGET" ]]; then
  install -m 0600 "$TARGET" "$BACKUP_SITE"
  HAD_SITE=1
fi

install -m 0644 "$SOURCE_CONFIG" "$TARGET"
ln -sfn "$TARGET" "$TARGET_LINK"
CONFIG_CHANGED=1

nginx -t
systemctl reload nginx

CONFIG_CHANGED=0
rm -f "$SOURCE_CONFIG"
trap - ERR
log "Configuração aplicada para ${DEPLOY_SHA}. Backup: ${BACKUP_DIR}"
