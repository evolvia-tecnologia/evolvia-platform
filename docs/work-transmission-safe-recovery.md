# WORK-01 — Recuperação segura da Transmissão

Contrato de 05/11/2026. Responsável: Work. Coordenação: issue #571.
Base: `develop@01932c88bd7a5e8268700c9c065b111528c6064d`.
Branch: `work/transmission-safe-recovery`.

## Problema e decisão

O formulário permitia salvar antes de terminar o GET inicial ou depois de uma
falha nessa consulta. Assim, uma configuração desconhecida podia ser substituída.
Dois eventos de envio no mesmo ciclo também podiam produzir dois PUTs.

Decisão: editar somente após leitura bem-sucedida; usar trava síncrona entre
comandos; após resultado de escrita desconhecido, exigir consulta explícita do
estado persistido. Não repetir PUT automaticamente. Erros de validação 400/422
preservam a orientação do servidor e permitem correção. Os demais erros de escrita
mantêm o formulário bloqueado até uma consulta bem-sucedida.

Alternativa descartada: reabilitar imediatamente após qualquer erro de escrita.
É mais rápida, mas uma resposta perdida não comprova que a transação falhou.
O custo da opção adotada é um GET explícito antes de continuar.

## Escopo e dependências

- Componente `apps/web/components/event-transmission.tsx` e teste de interação
  próprio. Sem alterações em branches ou contratos de outros agentes.
- Reutiliza GET/PUT `/events/:eventId/transmission`, EventCapability e auditoria
  transacional existentes. Sem entidade, API, dependência ou migration nova.
- Preserva bloqueio por formato do #631, ACL e isolamento no backend. O GET
  continua autenticado. Nenhum envio externo é realizado.
- Fora de escopo: financeiro/etiquetas de Codex, operadores/expositor de Claude,
  científico/Sports de Gemini, revisão global do cliente API e infraestrutura.

## Aceite e validação

Teste React do componente real com API simulada: leitura pendente/falha, retry,
gravação duplicada, remoção concorrente, resultado desconhecido após escrita,
validação e descarte de resposta tardia ao trocar de evento.
Comando: `node --test apps/web/tests/event-transmission-interaction.test.mjs`.

Evidência local usa Node24.22.1, React/react-test-renderer19.2.8 e TypeScript5.9.3.
Não equivale a navegador, PostgreSQL, Node22, ARM64, CI ou homologação.
CI aplicável, revisão independente e ensaio visual/autenticado permanecem
pendentes até evidência própria no PR. Sem mudança na matriz I/T/D/F.

## Limites e rollback

A trava evita repetição no mesmo formulário; não resolve concorrência entre duas
sessões de organizadores, pois a API vigente não oferece revisão/CAS. Se o evento
mudar de formato durante a edição, o backend permanece responsável por recusar.
O usuário pode precisar reeditar campos após recuperar o estado persistido.
Rollback: reverter somente este corte; configurações e auditoria permanecem.
