# Gate 11 — Relatórios de Pós-evento

Direção autorizada por Berg Martins em 04/10/2026, issue #414. As 19 capturas
fornecidas orientam o conteúdo; a apresentação usa componentes, cores, tipografia
e espaçamentos do Evolvia. Não importar dados ou reproduzir interfaces externas.

## Disponibilidade por configuração

O perfil contextualiza o relatório; os módulos `ACTIVE` e os campos habilitados
da ficha determinam quais grupos aparecem. Inscrição é a base comum às seis
famílias. `credential`/`access_control` habilitam credenciamento, `payment` ou
modo pago habilitam pagamentos, `scientific_submission` habilita produção
científica. Capability configurada não comprova uma engine concluída.

Sexo aparece apenas quando o campo correspondente está habilitado. Data de
nascimento habilitada gera faixa etária na data de início do evento no seu fuso,
nunca na data da consulta. Escolaridade, profissão, instituição e origem
geográfica são agrupadas se coletadas. Opções estruturadas personalizadas
também geram distribuições; texto livre arbitrário, nomes, documentos, contatos,
fotos e texto de acessibilidade não são expostos por esta consulta agregada.

Os rótulos e condições vêm da versão preenchida. Respeitar a aplicação por
categoria e resolver condições pelo código do campo referenciado por ID.
`Não informado`, `não coletado nessa versão` e `não se aplica` têm significados
distintos. Em múltiplas escolhas a pessoa conta uma vez por opção; percentuais
podem somar mais de 100%. A população elegível aparece no rodapé de cada tabela.

## Primeiro corte funcional

- Inscrições confirmadas, presentes, sem credenciamento e taxa de credenciamento.
- Categorias com totais e percentuais de inscritos/presentes.
- Reservas pendentes, expiradas efetivas e canceladas separadas da população.
- Primeiro credenciamento por dia e hora no fuso do evento, com filtro de dia.
- Campos estatísticos habilitados, incluindo sexo, faixa etária e escolaridade.
- Pagamentos de inscrições confirmadas: pago, isento, em revisão e sem confirmação;
  valor dos checkouts PAID separado do preço das inscrições confirmadas.
- Trabalhos por estado registrado e quantidade de atividades planejadas, quando
  o módulo científico está ativo.
- Filtro por grupo, CSV agregado de todos os grupos e impressão do grupo visível
  com opção de salvar PDF pelo navegador; metadados e denominadores incluídos.

O relatório pode acompanhar eventos em andamento, identificando que ainda não
foram finalizados. Não encerra nem publica o evento e não emite certificados.
O primeiro check-in não comprova presença diária, permanência ou fluxo completo.
Planejamento científico não comprova apresentação. Checkout PAID não é caixa
presencial, receita líquida ou documento fiscal.

## API e isolamento

`GET /events/:eventId/registration-form/post-event-report` é servido pela ficha
já registrada, evitando alterar `app.module.ts`/schema ocupados pelo Cursor.
Apenas OWNER/ADMIN/MANAGER da organização do evento têm acesso. A autorização
precede todas as consultas. Leituras incluem organização e evento, em transação
RepeatableRead; capabilities usam a relação com a organização do evento.

Reservas são lidas em páginas de 500; agregadores limitam cardinalidade de texto.
Acima de 50 mil registros a consulta recusa explicitamente sem retornar resultado
parcial. Processamento em lote será um corte próprio. DTO retorna agregados,
sem respostas individuais, identificadores de inscrições, contatos ou documentos.
CSV usa UTF-8/BOM, delimitador ponto e vírgula, aspas e proteção de fórmulas.

## Próximos cortes por perfil e módulos

| Família/módulo | Ampliação prevista | Evidência necessária |
| --- | --- | --- |
| Todos | Síntese financeira por categoria/lote, visitas, origem e fechamento | Fonte/denominador, rastreamento e conciliação implementados |
| Científico | Área, apresentação, avaliador, parecer, decisão, final/ePoster | Integração da entrega #411, estados canônicos e ACL |
| Corporativo/capacitação | Presença por atividade/dia, conclusão, avaliação | Coleta específica de presença e avaliação |
| Feira/exposição | Expositor, prestador, montador, credenciais e serviços | #408 integrado com prova de posse da identidade |
| Entretenimento | Equipe, entradas/repetições e caixa do evento | Fontes de acesso e pagamentos locais, sem deduzir saídas |
| Comunidade/esporte/outros | Dimensões configuradas e atividades aplicáveis | Campos e módulos efetivamente habilitados |
| Certificados | Emitidos por presença/papel, validação e revogação | Engine Gate 11 e prova de elegibilidade |

Não apresentar zero para métricas sem coleta/engine. Mailing nominal exige
contrato separado com finalidade, autorização e exportação própria.

## Visitas da página pública

`POST /public/events/:slug/visit` soma uma abertura do evento publicado no dia
do fuso desse evento. A tabela guarda organização, evento, dia e quantidade.
Não guarda pessoa, IP, navegador nem origem. O pedido do navegador não leva
corpo nem cookie e usa `referrerPolicy: no-referrer`. Cabeçalhos e metadados
de rede podem existir no transporte; esta entrega não afirma o que a
infraestrutura registra no log.

Cada processo da API aceita 120 reservas do mesmo slug numa janela fixa de 60
segundos, contada pelo relógio do pedido. A reserva só ocorre depois de
confirmar que o evento existe e está publicado. Slug inexistente ou em rascunho
responde 404 e não ocupa o mapa. No limite, a resposta é 429 e não há escrita.
A janela seguinte recomeça a contagem. O mapa é só deste processo: instâncias
não compartilham o teto, e o limite efetivo acompanha a quantidade de processos.
Não há IP nem identificador de visitante nessa reserva. Webhooks não entram
nesta janela. Até 5 mil eventos publicados com janela viva cabem no mapa; um
evento publicado novo além disso é recusado sem escrita até expirar alguma
janela.

## Validação e rollback

Testes de agregação, versões, condições, idade, status efetivo, ACL, tenant e
exportação. CI completo confirma tipos, testes, migrations existentes e ARM64.
Validar ainda navegação, impressão e teclado/leitor de tela em homologação.
Não converter teste automatizado em WCAG humana ou aceite formal. Sem migration;
rollback pelo revert do código, preservando todas as fontes de dados.
