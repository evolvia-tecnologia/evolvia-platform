# Gate A5 — Programação científica

## Fluxo de experiência

A experiência principal segue a sequência **Quando acontece? → Onde acontece? → O que acontece? → Quem participa? → Informações adicionais (opcional) → Revisar conflitos**.

O organizador começa com poucos campos. Descrição, taxonomia e observações operacionais ficam recolhidas como opcionais. A EVA explica conflitos e sugere correções, mas não altera horário, espaço, participante ou estado de revisão silenciosamente.

## Invariantes

- intervalo válido exige `endAt > startAt`;
- atividades devem permanecer dentro das datas do evento quando elas estiverem definidas;
- intervalos são semiabertos: `10:00–11:00` e `11:00–12:00` não conflitam;
- uma sala não pode receber duas atividades sobrepostas;
- uma pessoa não pode participar de duas atividades sobrepostas;
- ao editar início ou término de uma atividade, revalidar todas as pessoas já
  vinculadas antes da gravação; conflitos recusam a alteração sem mudar horários
  ou espaço. Atividades consecutivas permanecem permitidas;
- `organizationId + eventId` acompanha entidades e FKs A5 para impedir vínculo cruzado;
- pessoas são sempre reutilizadas de `ScientificPerson`; não existe cadastro paralelo no A5;
- taxonomia reutiliza `ScientificTaxonomyNode` do A3;
- convite recusado, cancelado ou ainda não confirmado gera alerta contextual, não exclusão automática da programação;
- `READY_FOR_REVIEW` só é permitido quando a atividade não possui conflito bloqueante.

## Edição e reagendamento na interface (Gate 9)

Cada atividade oferece **Editar ou reagendar** para corrigir título, tipo, início,
término e espaço. O formulário mostra o fuso do navegador usado pelos campos,
assim como o cadastro atual. Instantes não alterados preservam segundos e frações,
inclusive na transição de horário de verão. Campos alterados são convertidos a
ISO UTC; horários inexistentes e término anterior ou igual ao início são recusados.

Somente os campos modificados são enviados ao PATCH existente. Pessoas,
descrição, taxonomia e notas operacionais permanecem intactas. Cancelar ou salvar
sem mudanças não emite mutação. A edição retorna a atividade a rascunho para nova
revisão; conflitos de sala/pessoa são decididos no servidor. Em caso de recusa, o
formulário mantém os valores e apresenta o erro para correção. A resposta do PATCH
atualiza a grade sem depender de uma segunda requisição.

O espaço atual pode ser substituído por outro ativo. A API atual não oferece
remoção de vínculo de espaço; a interface não anuncia essa ação. Eventos e
organizações continuam autorizados pela política existente no backend. Não há
migration nem vínculo automático de comunicação aprovada à programação.

Testes de edição cobrem fusos UTC, São Paulo, Kolkata e Auckland, precisão dos
instantes, intervalo inválido e horário de verão. Validação humana de teclado,
leitor de tela e WCAG permanece necessária para aceite formal.

## Certificate-ready

A programação mantém referências canônicas de pessoa, atividade e Tipo de participação. Data e horário permitem derivar duração. Planejamento não é tratado como presença: check-in/presença posterior deverá complementar a evidência antes de certificados.

## Rollback

A migration A5 é expansiva. O rollback operacional preferencial é reverter o código e manter as novas tabelas sem uso até correção; remoção destrutiva de tabelas ou enums não é automatizada.

## Validação obrigatória antes de merge

- Prisma validate/generate;
- typecheck/build da API;
- testes unitários, incluindo política A5;
- typecheck/build da Web;
- migration em PostgreSQL descartável;
- segunda execução sem migration pendente;
- smoke geral, A4 e `CI_SMOKE_A5_OK`;
- build Docker API/Web ARM64;
- confirmação de arquitetura ARM64;
- merge somente em `develop` quando todos os gates estiverem verdes.

