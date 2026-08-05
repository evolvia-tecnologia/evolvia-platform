# Automação permanente de entregas por SSH restrito

## Fluxo

1. A solicitação de pull executa build, testes e integração.
2. A fusão em `develop` executa novamente as verificações.
3. Somente após sucesso, um runner hospedado pelo GitHub conecta ao servidor.
4. A chave aceita somente o comando forçado de deploy.
5. O servidor busca exatamente a ponta atual de `origin/develop`.
6. A homologação é publicada em banco, Redis, volumes e portas próprios.
7. Healthcheck e rollback são automáticos.

## Segredos utilizados

- `EVOLVIA_STAGING_SSH_KEY`
- `EVOLVIA_STAGING_KNOWN_HOSTS`

A chave não fornece shell, terminal, encaminhamento de portas ou execução de
comandos arbitrários.
