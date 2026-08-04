# Segurança e Autorização

## Regras obrigatórias

1. Toda rota autenticada resolve o usuário pelo token no servidor.
2. Toda operação organizacional verifica membership ativo.
3. Toda consulta de evento inclui `organizationId`.
4. IDs recebidos do frontend não conferem autorização.
5. O backend verifica o papel necessário para cada ação.
6. Erros de acesso não revelam existência de dados de outra organização.
7. Convites e alteração de papéis serão auditados.
8. `OWNER` não poderá remover o último proprietário da organização.
9. O usuário não poderá elevar o próprio papel.
10. Dados de organizações diferentes não serão retornados na mesma consulta.

## Matriz inicial

| Ação | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
|---|---:|---:|---:|---:|---:|
| Ver organização | Sim | Sim | Sim | Sim | Sim |
| Editar organização | Sim | Sim | Não | Não | Não |
| Gerenciar membros | Sim | Sim | Não | Não | Não |
| Criar evento | Sim | Sim | Sim | Não | Não |
| Editar evento | Sim | Sim | Sim | Limitado | Não |
| Configurar capabilities | Sim | Sim | Sim | Não | Não |
| Excluir/cancelar evento | Sim | Sim | Não | Não | Não |
| Ver eventos | Sim | Sim | Sim | Sim | Sim |

A matriz poderá ser refinada, mas permissões mais amplas não serão assumidas
sem decisão explícita.

## Sessão e tokens

A v0.2 não ampliará a exposição do token atual. A migração futura para cookie
seguro será tratada em entrega própria, com proteção CSRF e estratégia de
renovação, para não misturar duas mudanças críticas na mesma release.
