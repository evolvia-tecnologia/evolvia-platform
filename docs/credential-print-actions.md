# Credenciamento: impressão e ações do posto

Pedido do PO em 27/10/2026. Base verificada `61e9c577986d57e76581aaf71345e45abb3bc234`.
Contrato de ownership Codex: #571/6450711871 e #571/6450722860.
Sem acionamento Cursor/Composer. Gemini faz análise/revisão, sem editar os paths.

## Problemas e comportamento esperado

- A captura do PO mostra quatro páginas na impressão, incluindo navegação,
  assistente e etapas do painel. A folha agora usa um portal direto no body:
  somente a superfície de impressão participa da paginação. A etiqueta usa suas
  dimensões em milímetros; a lista usa A4. O primeiro comando prepara a etiqueta
  e abre a impressão após montar a folha; o botão da prévia permite reimprimir.
  Trocar pessoa, busca ou função remove o documento anterior.
- Desfazer exige motivo de 3 a 160 caracteres, conforme a política existente.
  O posto explica por que os botões estão desabilitados; não remove a auditoria
  nem enfraquece a exigência do backend.
- Alterar cadastro leva o foco ao formulário. A ficha é vinculada ao ID da
  inscrição; respostas antigas de busca/ficha não substituem a pessoa atual.
  Após salvar, os campos refletem os valores normalizados pelo servidor.
- Configuração de etiqueta já existente: nome `preferred_name`, empresa
  `institution`, linhas `job_title` e `city_state`, QR ligado e categoria opcional.
  `city_state` combina `city` e `state` com ` / `, sem separador órfão. Campos
  ausentes permanecem ausentes: configurar não inventa dados nem altera a ficha.
  Documento/e-mail/telefone continuam bloqueados para impressão.

## Validação local

16 testes focais API/Web aprovados, incluindo motivo/payload de estorno,
resposta atrasada de outra pessoa, revisão/Idempotency-Key, normalização do
cadastro e erro de API visível. Tipos e build Next de um laboratório isolado
com os componentes reais aprovados; ambiente local Node24, CI Node22 obrigatório.

Navegador Chromium153 com API fictícia controlada, em320/390/1366px: clique de
estorno habilita após motivo, entrada e presença mudam de estado, edição salva,
resposta atrasada é ignorada, impressão dispara uma vez e portal é removido ao
trocar pessoa. Sem erroJS ou overflow nesses cenários. PDFs inspecionados e
renderizados: uma página de90,00×39,88mm (arredondamento do Chromium), nome,
instituição, cargo, cidade/UF eQR, sem painel/wizard. Isso não comprova hardware,
autenticação real, banco ou fluxo Asaas.

## Jornada completa solicitada: pendências explícitas

A auditoria consultiva Gemini foi ampliada em#607/6450652040 e vinculada em
#570/6450711479: inscrição, avaliação, resultado/carta reservada, finais/ePosterPDF,
autoatendimento/credenciamento, cadastro, programação/acesso, relatórios eCRM.
Pedido enviado não significa resposta recebida ou simulação executada.

Homologação abriu em `/login`, sem sessão autenticada disponível nesta execução.
Nenhum congresso/feira híbrido, participante, cobrança ou mensagem foi criado no
ambiente compartilhado. Ainda faltam a autenticação autorizada pelo mecanismo
seguro, acessos Asaas sandbox e a execução documentada das jornadas. Inscrição
isenta por cupom100% não valida cobrança nem webhook. Não enviar e-mails reais,
movimentar dinheiro real ou criar chaves/escopos CRM sem contrato próprio.

#607 está integrado em61e9, mas publicação bloqueada por React418 residual no
pós-merge40528996224. Este corte não declara esse erro resolvido. CI aplicável,
revisão Gemini do SHA novo, threads resolvidas e prova de publicação são exigidos
antes de anunciar disponibilidade. Matriz e I/T/D/F não recebem crédito antecipado;
0/11 Gates encerrados, sem Go de lançamento.

Rollback: reverter a aplicação deste corte, preservando configurações, dados,
histórico e auditoria. Sem migration/dependência/infra/main/produção/secrets/billing.
