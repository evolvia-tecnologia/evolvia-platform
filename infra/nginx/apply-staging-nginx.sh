#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SOURCE_CONFIG="${1:-}"
DEPLOY_SHA="${2:-}"
TARGET="${EVOLVIA_NGINX_SITE:-/etc/nginx/sites-available/evolvia-homologacao}"
TARGET_LINK="${EVOLVIA_NGINX_LINK:-/etc/nginx/sites-enabled/evolvia-homologacao}"
LEGACY_LINK="${EVOLVIA_NGINX_LEGACY_LINK:-/etc/nginx/sites-enabled/evolvia}"
BACKUP_ROOT="${EVOLVIA_BACKUP_ROOT:-/opt/evolvia/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/nginx-promote-${STAMP}-${DEPLOY_SHA:0:12}"
BACKUP_SITE="${BACKUP_DIR}/nginx-site.before"
HAD_SITE=0
HAD_LEGACY_LINK=0
LEGACY_TARGET=""
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

    if [[ "$LEGACY_LINK" != "$TARGET_LINK" ]]; then
      if [[ "$HAD_LEGACY_LINK" == "1" ]]; then
        ln -sfn "$LEGACY_TARGET" "$LEGACY_LINK"
      else
        rm -f "$LEGACY_LINK"
      fi
    fi

    if nginx -t; then
      systemctl reload nginx || true
    fi
  fi

  if [[ "$CONFIG_CHANGED" == "1" ]]; then
    printf '[EVOLVIA NGINX] Rollback concluído. Backup restaurado de: %s\n' "$BACKUP_DIR" >&2
  else
    printf '[EVOLVIA NGINX] Implantação abortada sem alterações.\n' >&2
  fi
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

for command in grep install ln nginx readlink systemctl; do
  command -v "$command" >/dev/null 2>&1 || {
    printf '[EVOLVIA NGINX] ERRO: comando necessário ausente: %s\n' "$command" >&2
    exit 1
  }
done

require_contract() {
  local contract="$1"
  local description="$2"

  if ! grep -Fq -- "$contract" "$SOURCE_CONFIG"; then
    printf '[EVOLVIA NGINX] ERRO: contrato ausente: %s.\n' "$description" >&2
    exit 1
  fi
}

require_contract \
  'server_name homologacao.evolviatecnologia.com;' \
  'server_name da homologação'
require_contract \
  'server_tokens off;' \
  'ocultação da versão do Nginx'
require_contract \
  'proxy_hide_header Strict-Transport-Security;' \
  'deduplicação do HSTS recebido do upstream'
require_contract \
  'add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;' \
  'HSTS canônico da homologação'

install -d -m 0700 "$BACKUP_DIR"
install -d -m 0755 "$(dirname "$TARGET")" "$(dirname "$TARGET_LINK")"

if [[ -f "$TARGET" ]]; then
  install -m 0600 "$TARGET" "$BACKUP_SITE"
  HAD_SITE=1
fi

if [[ "$LEGACY_LINK" != "$TARGET_LINK" && -L "$LEGACY_LINK" ]]; then
  LEGACY_TARGET="$(readlink "$LEGACY_LINK")"
  HAD_LEGACY_LINK=1
fi

install -m 0644 "$SOURCE_CONFIG" "$TARGET"
ln -sfn "$TARGET" "$TARGET_LINK"
if [[ "$LEGACY_LINK" != "$TARGET_LINK" ]]; then
  rm -f "$LEGACY_LINK"
fi
CONFIG_CHANGED=1

nginx -t
systemctl reload nginx

CONFIG_CHANGED=0
trap - ERR
log "Configuração aplicada para ${DEPLOY_SHA}. Backup: ${BACKUP_DIR}"
