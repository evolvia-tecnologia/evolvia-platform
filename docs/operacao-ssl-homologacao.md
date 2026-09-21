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

## Endereço legado de desenvolvimento

`dev.evolviatecnologia.com` não é um segundo ambiente e não pode servir uma cópia
divergente da aplicação. Depois que o domínio resolver para o mesmo IPv4 da
homologação, um administrador pode ativar um redirecionamento TLS permanente para o
domínio canônico:

```bash
sudo env CERTBOT_EMAIL="SEU_EMAIL_DE_OPERACAO" \
  bash /opt/evolvia/staging/current/infra/certbot/bootstrap-dev-redirect.sh
```

O script cria configuração e certificado separados para o alias legado, preserva o
site canônico, faz backup do alvo, valida `nginx -t`, recarrega o serviço e restaura a
configuração anterior em caso de falha. HTTP e HTTPS respondem `308` para
`https://homologacao.evolviatecnologia.com`, preservando caminho e consulta.

O e-mail é fornecido somente no ambiente administrativo e não deve ser salvo no Git.
Depois da primeira emissão, execuções posteriores reutilizam o certificado existente.
