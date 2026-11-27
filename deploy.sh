#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

HOMOLOGATION_DOMAIN="homologacao.evolviatecnologia.com"
CERT_DIR="/etc/letsencrypt/live/${HOMOLOGATION_DOMAIN}"
BUILD_CACHE_MAX_AGE="${EVOLVIA_BUILD_CACHE_MAX_AGE:-72h}"
AUTO_TLS_BOOTSTRAP="${EVOLVIA_AUTO_TLS_BOOTSTRAP:-1}"

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

# O SHA é calculado UMA vez, aqui, antes do build.
#
# Antes ele era calculado só na hora de aplicar o Nginx. Com duas leituras de
# `git rev-parse` no mesmo script, um commit que chegasse entre elas faria a
# imagem ser construída de um SHA e o diretório de backup registrar outro — e o
# registro do deploy passaria a apontar para código que não é o que está no ar.
# Uma leitura, um valor, os dois usos.
DEPLOY_SHA="$(git rev-parse --verify HEAD)"

# Vai para o .env porque é de lá que o Compose interpola o argumento de build.
# Assim o SHA entra na IMAGEM, e `/health` responde de qual código o binário
# veio — não o que este deploy alega.
ensure_env_var "EVOLVIA_BUILD_SHA" "$DEPLOY_SHA"

# As quatro variáveis que a inscrição da Área Master exige em homologação.
#
# Estavam documentadas e não configuradas: `janelaDeInscricao` responde 404 por
# projeto quando qualquer uma delas não casa, e o default do Compose é
# `localhost`. O ensaio do primeiro acesso falhava por configuração, não por
# código, e o operador não tinha como perceber — 404 é o que a rota responde
# também quando está tudo certo e o segredo está errado.
#
# `EVOLVIA_PUBLIC_BASE_URL` já é definida acima e tem de coincidir com o origin.
ensure_env_var "EVOLVIA_AMBIENTE" "homologacao"
ensure_env_var "PLATFORM_MASTER_RP_ID" "${HOMOLOGATION_DOMAIN}"
ensure_env_var "PLATFORM_MASTER_ORIGIN" "https://${HOMOLOGATION_DOMAIN}"

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

# O que subiu tem de ser o que foi construído.
#
# Esta é a guarda contra o modo de falha mais silencioso do deploy: imagem
# reaproveitada do cache, contêiner que não reiniciou, ou build que falhou sem
# derrubar o script. Nos três casos os serviços respondem — e respondem código
# velho. Sem esta conferência, o deploy termina dizendo "disponível" e ninguém
# descobre até alguém ensaiar contra o SHA errado.
#
# Falha o deploy de propósito: publicar sem saber o que foi publicado é o que
# torna todo ensaio de aceite inatribuível.
#
# `|| true` nao e descuido: com `set -Eeuo pipefail`, um curl que falha derruba
# a atribuicao e o script morre ANTES da mensagem abaixo. O operador receberia
# um erro de curl em vez do diagnostico. Com o `|| true`, a falha vira valor
# vazio e cai no `if`, que diz o que aconteceu.
BUILD_SERVIDO="$(curl -fsS --max-time 10 http://127.0.0.1:4000/health 2>/dev/null \
  | sed -n 's/.*"build"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
if [[ "$BUILD_SERVIDO" != "$DEPLOY_SHA" ]]; then
  echo "[EVOLVIA] ERRO: a API responde o build '${BUILD_SERVIDO:-ausente}', e o deploy construiu ${DEPLOY_SHA}."
  echo "[EVOLVIA] Imagem do cache, contêiner não reiniciado, ou build silenciosamente falho. Nada foi publicado no Nginx."
  docker compose ps --all
  exit 1
fi
echo "[EVOLVIA] Build servido conferido: ${DEPLOY_SHA}."

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

docker compose ps

echo "[EVOLVIA] Uso de disco Docker após o deploy:"
docker system df || true

echo "EVOLVIA homologação disponível em ${PUBLIC_URL}"
