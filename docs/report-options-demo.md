# Relatórios por dimensão e pagamentos por categoria

Pedido de Berg em 05/10/2026: revisar textos e aproveitar dados coletados como
fontes de relatórios conforme os modelos de 04/10. Contrato: issue #427.
Base: develop@f9dd963918e02ae4a1f6a891c0c187fcae4395a5.

## Entrega

- Catálogo de opções condicionado ao relatório autorizado e aos módulos.
- Relatório individual para cada campo estatístico habilitado: sexo, faixa
  etária na data do evento, escolaridade, país/estado/cidade, profissão e outros
  campos previstos na ficha. Ausências seguem a semântica original da coleta.
- Situação das inscrições/reservas e primeiro credenciamento por dia/horário.
- CSV do relatório selecionado com seu filtro de dia; exportação geral preservada.
- Matriz de pagamentos por categoria das inscrições confirmadas, no mesmo
  snapshot autorizado e acumulador existente. Recebido usa checkout PAID;
  previsto usa preço registrado. Isenção, revisão e falta de confirmação
  são contadas separadamente. Canceladas/pendentes não entram nessa população.
- Revisão dos títulos e de singular/plural, incluindo agenda e indicadores.
- Reflow do seletor e matriz com rolagem horizontal acessível em celular.

## Roteiro

Abrir resultados do evento; escolher um campo da ficha no catálogo, conferir
população e exportar somente esse relatório. Escolher credenciados por horário,
selecionar um dia e conferir o recorte no CSV. Em evento com pagamento habilitado,
abrir pagamentos por categoria e conferir a conciliação com o resumo.
Exportar todos continua contendo os demais grupos. Impressão acompanha seleção.

## Fontes e limites

Foram inspecionados os prints de pagamentos por categoria, síntese de
credenciados por dia e menu de operação/caixa; também foram recuperados
os modelos de países/estados e estatísticas científicas. Eles orientam este
corte, preservando as situações e as populações da Evolvia.

Relatórios sobre caixa/operador/coletor, entradas e saídas, áreas/avaliadores,
certificados, avaliação do evento, leads/extras e exportações nominais exigem
fontes e permissões específicas em seus módulos. Esses modelos permanecem
na evolução da issue; não há CTA simulando dados ainda ausentes.
Todos os dados de negócio podem alimentar uma consulta adequada; isso não
transforma secrets ou texto pessoal sensível em dimensão estatística geral.
O corte não altera autenticação, ACL, schema, migrations ou infraestrutura.

## Evidência

Testes de acumulação financeira/cauda e conciliação, módulos/legado, exportação
individual, dia, proteção contra fórmulas e preservação da exportação geral.
Browser local usa componentes reais e fixture explicitamente fictícia; os
checks abrangem quatro larguras, seleção/foco, filtro e download CSV real.
Não equivale a ensaio autenticado em homologação. CI, review e deploy precisam
ser comprovados no HEAD final. Rollback: revert, sem alteração de dados.

## Robustez após revisão — 06/10/2026

O CI do candidato d2defcb passou integralmente. A revisão seguinte apontou
arrays ausentes e falha de exportação não tratada: a tela, o CSV selecionado
e a exportação geral agora toleram dias, horários e distribuições ausentes.
O aviso de exportação orienta atualizar a consulta e tentar novamente.
Categoria ausente recebe o mesmo rótulo nas duas distribuições, preservando
quantidades e valores. Não infere registros nem altera permissões.

Validação deste ajuste: 35 testes Web, 3 testes API e typecheck focal Web
aprovados. Inclui execução do componente para credenciamento sem arrays e
exportação indisponível. Inspeção mobile anterior em quatro larguras permanece
evidência do corte original; não foi repetida neste ajuste. CI do novo HEAD
e ensaio autenticado em homologação permanecem necessários.

Direção vigente do Product Owner: priorizar Gates funcionais e adiar
a comprovação de Nginx/TLS até 95% de conclusão funcional comprovada.
Isso não dispensa checks, altera infraestrutura nem autoriza produção.
