# Recuperação do SSL do ambiente de desenvolvimento

## Incidente

O Chrome bloqueia `https://dev.evolviatecnologia.com` com
`NET::ERR_CERT_COMMON_NAME_INVALID`. O site público deve apresentar um certificado
cuja SAN contenha exatamente `dev.evolviatecnologia.com`; não é permitido reutilizar
o certificado ou o site Nginx da homologação.

## Fonte versionada

A correção canônica está em
`infra/certbot/bootstrap-dev-tls.sh`. Toda correção operacional feita no host deve
permanecer representada no repositório Evolvia. Alterações manuais sem equivalente
versionado não encerram o incidente.

## Execução administrativa

O script precisa estar na release do ambiente de desenvolvimento e deve ser executado
uma única vez por administrador:

```bash
sudo env CERTBOT_EMAIL="E-MAIL-DE-OPERACAO" \
  bash /opt/evolvia/environments/dev/current/infra/certbot/bootstrap-dev-tls.sh
```

O e-mail é dado operacional do Let's Encrypt. Não deve ser salvo no Git, em issue,
comentário, log público ou mensagem.

Se a release estiver em outro diretório, use o caminho real do checkout. Se o arquivo
de ambiente não estiver em `/opt/evolvia/environments/dev/.env`, informe somente o
caminho, sem expor seu conteúdo:

```bash
sudo env \
  CERTBOT_EMAIL="E-MAIL-DE-OPERACAO" \
  EVOLVIA_DEV_ENV_FILE="/caminho/real/.env" \
  bash /caminho/real/infra/certbot/bootstrap-dev-tls.sh
```

## Controles

- aceita exclusivamente `dev.evolviatecnologia.com`;
- confirma API e Web locais antes de alterar Nginx;
- confirma DNS IPv4 `64.181.174.36`;
- usa site separado `evolvia-dev`;
- usa certificado separado `/etc/letsencrypt/live/dev.evolviatecnologia.com`;
- cria backup privado antes da alteração;
- valida o desafio ACME publicamente;
- testa o Nginx antes de cada reload;
- restaura a configuração anterior se qualquer etapa falhar;
- mantém TLS 1.2/1.3, HSTS e cabeçalhos defensivos;
- instala hook de renovação e executa `certbot renew --dry-run`;
- não altera homologação, produção, containers, volumes ou dados.

## Validação obrigatória

```bash
bash infra/certbot/diagnose-dev-tls.sh

curl --fail --silent --show-error --head \
  https://dev.evolviatecnologia.com/

curl --fail --silent --show-error \
  https://dev.evolviatecnologia.com/api/health/ready
```

Também deve ser comprovado:

1. `openssl s_client` com SNI e validação do hostname sem erro;
2. HTTP redirecionando 301/308 para o mesmo hostname em HTTPS;
3. SAN contendo exatamente o domínio de desenvolvimento;
4. `nginx -t` verde;
5. `certbot renew --dry-run` verde;
6. aplicação renderizada em desktop e mobile.

## Rollback

O script restaura automaticamente o site anterior se falhar. Os backups ficam em
`/opt/evolvia/backups/ssl-dev-<data-hora>`. Não apagar certificados, backups ou
configurações de homologação durante a recuperação.

