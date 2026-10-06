# Gates 9/11 — agenda e resultados visuais

Pedido de Berg Martins em 05/10/2026: avanço visível para reunião em 06/10.
Contrato: issue #423. Base: develop@277b8e8c315e69b64aa8dc6e7df64f4e50b7c3f0.

## Decisão de implementação

Reutilizar programação e relatórios já persistidos. A alternativa de criar um
painel com números de exemplo seria rápida, mas não demonstraria a operação.
Adotado: componentes reais sobre as APIs autorizadas existentes, sem novas
migrations ou dependências. A EVA resume cálculos determinísticos; não gera
previsões nem altera dados. HTTPS permanece adiado até 95% por direção do PO.

## Roteiro da reunião

1. No evento científico, abrir a Central científica e Programação.
2. A agenda mostra dia, horários, sala, funções, rascunho/prontidão e conflitos.
3. Buscar pessoa/instituição, combinar dia/sala e limpar os filtros.
4. Editar atividade abre o editor existente; salvar usa o PATCH já autorizado,
   preservando a revisão e a recusa de conflitos do servidor.
5. Abrir Painel do evento → Pós-evento. Na opção Todos os grupos aparece a visão
   executiva: taxa de credenciamento, categorias, horários e estados científicos.
6. Conferir números nas tabelas; exportar CSV ou imprimir. O CSV continua completo,
   e o gráfico explicita quando mostra só oito categorias/seis horários.

Usar evento de teste com dados configurados. Não preencher números de
produção fictícios nem alterar identidade/autenticação para a demonstração.
Sem registros, as telas mostram orientação/ausência de população.

## Limites e segurança

Agenda é planejamento privado do organizador; não equivale a programação
publicada ou agenda pessoal. Horários usam o fuso persistido; legado sem fuso
usa UTC com aviso. Primeiro credenciamento não é presença diária nem fluxo
de entradas. Trabalho aceito não significa apresentado. Métricas sem módulo
habilitado não aparecem. Nenhum dado nominal novo é enviado ao relatório.
API da programação acrescenta apenas timeZone após autorização existente.
Troca de evento invalida payload e impede retorno atrasado da consulta anterior.

## Evidências deste corte

- Testes focais de filtros reais, ação de edição, fuso, ordenação, população,
  empates, módulos, limites do gráfico e regressões CSV/editor.
- Typecheck local dos componentes e dependências atuais.
- Componentes renderizados localmente com React usando fixtures fictícias.
- 27 testes focais passaram, incluindo renderização React real do resumo e
  PATCH atrasado de outro evento sem substituição do payload/aviso atual.
- Inspeção Chromium dos componentes reais com fixtures fictícias em 320,
  390, 768 e 1366 px: oito verificações sem overflow horizontal ou erro.
  Capturas em docs/evidence/gates-visual identificam os dados como demonstração.
  Esta evidência local não equivale a ensaio autenticado na homologação.
- Agenda interativa no Chromium real em quatro larguras: busca, filtros
  combinados, estado vazio, limpeza, callback de edição, teclado e foco
  passaram. O callback de demonstração não realiza PATCH na homologação.
- CI completo, ARM64, revisão Gemini, merge, deploy e ensaio autenticado são
  pendências até evidência no HEAD final. Este documento não encerra Gates.

Rollback: revert do commit do corte; não altera arquivos enviados ou dados.
