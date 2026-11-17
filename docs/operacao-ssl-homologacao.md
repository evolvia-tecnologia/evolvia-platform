# Recuperação do SSL da homologação

## Diagnóstico confirmado

O domínio canônico é `homologacao.evolviatecnologia.com`.

O deploy automático atual usa uma chave SSH com comando forçado que aceita somente
`deploy <SHA>`. Esse gateway chama o wrapper persistente
`/usr/local/sbin/evolvia-deploy-homologacao`, que publica os containers do ambiente
isolado, mas não executa o `deploy.sh` versionado da release. Portanto, alterações de
Nginx e Certbot presentes no repositório não são aplicadas pelo deploy comum.

Essa restrição deve ser preservada: ela impede que a chave do GitHub obtenha shell ou
execute comandos arbitrários no servidor.

> **Consequência que se repete em diagnósticos.** Como o wrapper não executa o
> `deploy.sh` versionado, um cabeçalho público divergente — por exemplo `Server:
> nginx/1.24.0` reprovando a prova "Versão do proxy exposta" — **não** se corrige
> publicando commits. O `server_tokens off` já está nas configurações versionadas; o
> que falta é a sincronização administrativa descrita em "Sincronização segura do
> Nginx ativo". Atribuir essa classe de falha ao `deploy.sh` leva a conclusões erradas.

## Recuperação segura

O script `infra/certbot/bootstrap-staging-tls.sh` deve ser executado uma única vez por
um administrador no servidor, depois que este arquivo estiver presente na release
atual de homologação.

```bash
sudo env CERTBOT_EMAIL="SEU_EMAIL_DE_OPERACAO" \
  bash /opt/evolvia/staging/current/infra/certbot/bootstrap-staging-tls.sh
```

O e-mail não deve ser salvo no repositório nem enviado em mensagens. Ele é usado pelo
Let's Encrypt para avisos de expiração e recuperação da conta ACME.

## Controles do script

- exige execução como root;
- lê `WEB_HOST_PORT` e `API_HOST_PORT` do ambiente isolado de homologação;
- confirma API e Web localmente antes de alterar o Nginx;
- confirma que o domínio resolve para `64.181.174.36`;
- cria backup do site Nginx atual;
- altera somente o site `evolvia-homologacao`;
- valida o desafio HTTP público antes de solicitar o certificado;
- instala Certbot somente se ainda estiver ausente;
- habilita TLS 1.2/1.3 e redirecionamento HTTP 308;
- instala hook de renovação com `nginx -t` antes do reload;
- restaura a configuração anterior do Nginx se alguma etapa falhar;
- não remove containers, imagens, volumes ou dados;
- não altera `main`, produção ou sites de outros projetos.

## Sincronização segura do Nginx ativo

O gateway SSH do CI continua restrito a `deploy <SHA>` e não recebe permissão de
administrador. Quando uma alteração versionada de Nginx precisar chegar ao host,
publique primeiro a release e execute no servidor:

```bash
sudo env CERTBOT_SKIP_DRY_RUN=1 \
  bash /opt/evolvia/staging/current/infra/certbot/bootstrap-staging-tls.sh
```

Com um certificado já existente, `CERTBOT_EMAIL` não é exigido e nenhuma nova emissão
é tentada. O script lê as portas da homologação, cria backup, instala apenas o site
`evolvia-homologacao`, executa `nginx -t`, recarrega o serviço e restaura a configuração
anterior se houver falha. Remova `CERTBOT_SKIP_DRY_RUN=1` quando também quiser validar
a renovação do certificado.

Depois da sincronização, o workflow de `develop` deve comprovar os cabeçalhos públicos
e registrar `evolvia/homologacao: success` no SHA implantado.

## Gate final

Depois da execução administrativa:

1. `https://homologacao.evolviatecnologia.com/` deve responder com certificado válido;
2. `http://homologacao.evolviatecnologia.com/` deve redirecionar para HTTPS;
3. `/api/health` deve responder através do domínio público;
4. `certbot renew --dry-run` deve passar;
5. o próximo push em `develop` deve deixar o status `evolvia/homologacao` verde.

Se o Nginx local estiver correto e o HTTPS externo continuar indisponível, a porta TCP
443 deve ser liberada na regra de entrada da rede Oracle para o endereço público do
servidor. Essa alteração de rede não é feita automaticamente pelo script.

## Endereço legado de desenvolvimento (desativado)

`dev.evolviatecnologia.com` foi **desativado por decisão do PO**. O registro DNS foi
removido pelo PO e as dependências versionadas saíram do repositório:

| Removido | O que era |
| --- | --- |
| `infra/certbot/bootstrap-dev-redirect.sh` | bootstrap de certificado e redirecionamento do alias |
| `infra/certbot/diagnose-dev-tls.sh` | diagnóstico somente leitura do alias |
| `infra/nginx/evolvia-dev-redirect.conf` | site Nginx do alias |
| bloco `DEV_REDIRECT_BOOTSTRAP` em `deploy.sh` | invocação do bootstrap durante o deploy |

**Não há procedimento de recuperação, e nenhum comando deve ser executado para esse
alias.** `scripts/validate-readiness-contract.mjs` passou a exigir a ausência desses
arquivos e de qualquer menção ao domínio legado em `deploy.sh` e nas configurações
Nginx canônicas: reintroduzi-los reprova o CI.

Se o alias voltar a resolver para o IPv4 da homologação por engano, o bloco
`default_server` de `infra/nginx/evolvia.conf` responde `444` e encerra a conexão sem
servir conteúdo.

O histórico das execuções anteriores permanece no Git e nos registros de CI; nada foi
reescrito.
