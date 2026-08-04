# Plano de Entrega e Rollback

## Etapas

1. Documentação aprovada.
2. Schema proposto e migration revisada sem execução.
3. Testes adicionados.
4. Build local/isolado ARM64.
5. Banco descartável com dados da v0.1.1.
6. Migration e testes automáticos.
7. Ambiente de staging em portas alternativas.
8. Validação funcional.
9. Backup imediatamente anterior.
10. Deploy controlado.
11. Observação e relatório.
12. Integração em `develop`.
13. Promoção posterior para `main`.

## Critérios de bloqueio

A entrega não avança quando houver:

- teste falhando;
- migration destrutiva;
- perda de contagem;
- consulta sem escopo de organização;
- build não reproduzível;
- segredo incluído no Git;
- healthcheck inválido;
- ausência de rollback da aplicação.

## Rollback

Na primeira entrega da v0.2, o banco será expandido sem remover estruturas
existentes. Assim, o rollback principal será:

1. parar apenas API e Web novas;
2. restaurar imagens anteriores;
3. manter tabelas adicionais sem uso;
4. verificar health e dados;
5. produzir relatório da falha.

Rollback destrutivo de banco não será automatizado.
