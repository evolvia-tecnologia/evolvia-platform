#!/usr/bin/env bash
set -Eeuo pipefail

# Mesma transação e site do bootstrap de staging; nesta entrada as portas são fixas.
export EVOLVIA_NGINX_SITE="${EVOLVIA_NGINX_SITE:-/etc/nginx/sites-available/evolvia-homologacao}"
export EVOLVIA_NGINX_LINK="${EVOLVIA_NGINX_LINK:-/etc/nginx/sites-enabled/evolvia-homologacao}"
export EVOLVIA_NGINX_LEGACY_LINK="${EVOLVIA_NGINX_LEGACY_LINK:-$(dirname "$EVOLVIA_NGINX_LINK")/default}"
export EVOLVIA_ACME_WEBROOT="${EVOLVIA_ACME_WEBROOT:-/var/www/certbot}"
export EVOLVIA_CERT_DIR="${EVOLVIA_CERT_DIR:-/etc/letsencrypt/live/${EVOLVIA_HOMOLOGATION_DOMAIN:-homologacao.evolviatecnologia.com}}"
export EVOLVIA_BACKUP_ROOT="${EVOLVIA_BACKUP_ROOT:-/opt/evolvia/backups}"
export EVOLVIA_RENEWAL_HOOKS_DIR="${EVOLVIA_RENEWAL_HOOKS_DIR:-/etc/letsencrypt/renewal-hooks/deploy}"
export EVOLVIA_CERTBOT_BIN="${EVOLVIA_CERTBOT_BIN:-$(command -v certbot || true)}"
export EVOLVIA_CERTBOT_SNAP_BIN="${EVOLVIA_CERTBOT_SNAP_BIN:-/snap/bin/certbot}"
entry="$(dirname "${BASH_SOURCE[0]}")/bootstrap-staging-tls.sh"
if [[ $EUID != 0 ]]; then
  exec sudo env EVOLVIA_HOMOLOGATION_DOMAIN="${EVOLVIA_HOMOLOGATION_DOMAIN:-homologacao.evolviatecnologia.com}" \
    EVOLVIA_HOMOLOGATION_IPV4="${EVOLVIA_HOMOLOGATION_IPV4:-64.181.174.36}" \
    CERTBOT_EMAIL="${CERTBOT_EMAIL:-}" CERTBOT_SKIP_DRY_RUN="${CERTBOT_SKIP_DRY_RUN:-0}" \
    bash "$entry" homologacao
fi
exec bash "$entry" homologacao
