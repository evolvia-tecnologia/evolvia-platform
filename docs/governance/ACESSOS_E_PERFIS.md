# Acessos e perfis da Evolvia

Inventário de `develop@ab02d8d859f29061ff45ec0ebfc27f17aa0ffe3a`, em 27/11/2026. A origem das rotas é https://homologacao.evolviatecnologia.com. Os segmentos `[id]`, `[slug]`, `[code]` e `[token]` são preenchidos apenas pelo evento, trabalho ou convite real. Nenhum segredo de convite é publicado.

**Estado aplicável a cada linha:** implementação identificada no código integrado, salvo as limitações indicadas. O deploy 45313903366 registrou o SHA acima; falta atestação atual das imagens API/Web no VPS. Nenhuma conta individual foi confirmada ou entregue por canal seguro nesta rodada. Evidência de execução pública: início → catálogo → evento corporativo fictício, e API com banco pronto. Falta evidência autenticada por linha e entre duas organizações. A #721 contém os resultados por jornada; o aceite humano exige identificação do testador e do resultado. Seis famílias de *eventos* são independentes dos papéis de acesso.

[Central de Acesso](https://homologacao.evolviatecnologia.com/acesso) · [Login](https://homologacao.evolviatecnologia.com/login) · [Painel](https://homologacao.evolviatecnologia.com/painel) · [Participante](https://homologacao.evolviatecnologia.com/participante) · [Master](https://homologacao.evolviatecnologia.com/master) · [Roteiro e acessos públicos verificados](https://github.com/evolvia-tecnologia/evolvia-platform/issues/721).

| Área ou jornada | Caminho de entrada | Autenticação | Papel, permissões e dependência | Pendência de homologação |
|---|---|---|---|---|
| Proprietário da plataforma | /master | Conta + WebAuthn + sessão Master em memória | OWNER da plataforma, visão global | Primeiro cadastro de chave bloqueado na develop; composição #740/#744/#745. |
| Equipe Evolvia | /master | Conta + WebAuthn + sessão Master | DELEGADO ativo e concessão por ação/escopo | Validar concessão, revogação e trilha separadamente do proprietário. |
| Área do organizador | /painel | Login da conta | Membership da organização; criação em /eventos/novo | Selecionar organização/evento; conferir persistência. |
| Equipe administrativa | /eventos/[id]/painel | Login da conta | OWNER, ADMIN, MANAGER, OPERATOR ou VIEWER conforme operação | Validar ação permitida e negativa entre duas organizações. |
| Credenciamento e operadores | /eventos/[id]/painel/check-in | Login da equipe | OperatorCapabilityGuard, membership, capability e concessão quando o escopo está ativo | Testar busca, credenciamento e negativa no segundo evento. |
| Impressão de etiquetas | /eventos/[id]/painel/check-in#impressao | Login da equipe | credential; impressão e reimpressão têm ações distintas | Configurar em #etiquetas; comprovar legibilidade em impressora e segunda via. #741 é candidata. |
| Entrega de material e kits | /eventos/[id]/painel/check-in#kit | Login da equipe | material_delivery; entrega, estoque e reversão têm permissões próprias | Testar entrega, repetição, saldo e supervisão. |
| Controle de acesso | /eventos/[id]/painel/check-in#leitor | Login da equipe | access_control; presença por dia/atividade conforme operação | Conferir persistência, repetição e reversão. |
| Totens / Autoatendimento | /evento/[slug]/autoatendimento | Configuração pública do evento ou link emitido em /autoatendimento/acesso/[token] | Totem do evento; configuração pela equipe no balcão #totens | Validar vínculo do link, emissão e bloqueio de impressão. |
| Secretaria / inscrição no balcão | /eventos/[id]/painel/check-in#nova-inscricao | Login da equipe | Permissões de inscrição no balcão, capacidade registration | É uma operação do balcão; testar correção autorizada. |
| Portal do expositor | /evento/[slug]/expositor | Login da conta vinculada à empresa | AuthGuard e vínculo com a empresa e o evento; cotas/formulários | Testar empresa própria e recusa de outra empresa. |
| Patrocinadores | Sem rota dedicada identificada | Sem login específico identificado | O cadastro empresarial examinado aceita EXHIBITOR e PROVIDER | Confirmar o vínculo real antes de entregar acesso. |
| CAEX — atendimento por empresa | /eventos/[id]/painel/caex | Login da equipe | Permissões administrativas do evento; expositores, prestadores, formulários e cotas | Validar atendimento e limites entre empresas. |
| Prestadores de serviços | /evento/[slug]/expositor | Conta vinculada à empresa do evento | Empresa PROVIDER; CAEX atende o prestador. A cota de expositor não se aplica | Testar representante autorizado e formulários destinados a prestadores. |
| Coordenação científica | /eventos/[id]/cientifico | Login da equipe | Permissões de gestão científica por organização/evento | Testar submissões, distribuição, decisões e programação. |
| Autores | /evento/[slug]/participante | Sessão de participante vinculada ao evento | Submissões próprias, versões, arquivos, e-pôster e decisão conforme configuração | Validar autoria, arquivo e carta em outro evento. |
| Coautores | Sem rota individual identificada | Vínculo de coautoria no trabalho; entrada pessoal pela área de participante quando aplicável | Coautoria cadastrada não comprova autorização individual para editar | Pendente demonstrar quais ações a segunda pessoa pode exercer. |
| Avaliadores | /evento/[slug]/avaliador | Token do avaliador emitido para o evento | Somente atribuições disponíveis ao avaliador | Testar parecer e recusa de atribuição alheia. |
| Palestrantes / convidados científicos | /convites/cientificos/[token] | Token individual do convite | Convite da pessoa e do evento; equipe administra em /eventos/[id]/cientifico/palestrantes | Usar convite sintético dentro da validade. |
| Estação científica | /evento/[slug]/estacao | Consulta pública | Trabalhos disponibilizados pelo evento; detalhe por [code] | Validar que rascunhos e dados restritos permanecem privados. |
| E-pôster | /evento/[slug]/estacao/[code]/eposter | Consulta pública do trabalho publicado | Exposição por evento e código; envio pelo autor tem autenticação própria | Testar trabalho publicado e indisponível. |
| Área do participante | /participante | Login da conta; a área de um evento possui sessão específica | Seleção dos eventos da pessoa e funcionalidades liberadas | Testar dois eventos, comprovantes e sessão após recarga. |
| Visitantes | /evento/[slug]/inscricao | Página pública; identificação/inscrição conforme oferta | Categoria do evento; acesso posterior de participante | Usar categoria e lote vigentes; não atribuir conta de operador. |

## Cobertura da Central de Acesso

A página `/acesso` oferece Área do participante, Área do organizador (acesso ou criação de organização) e catálogo. As demais jornadas da tabela dependem da navegação do evento, de um convite, de uma empresa ou de acesso administrativo. A Central não lista individualmente essas entradas. Manter o contexto do evento e a validação da API é obrigatório em qualquer evolução da navegação.

## Índice de rotas e controles

As 70 páginas abaixo correspondem aos arquivos page.tsx da árvore verificada. O caminho por si só não concede acesso a dados. A autoridade é a API: autenticação, concessões, vínculo e verificações de recurso. Negativas entre organizações podem retornar 404. A API tem 54 arquivos de controllers no diretório src e subdiretórios; a tabela ao final lista as declarações de controller e os guards explícitos. As verificações aplicadas nos serviços também fazem parte da decisão.

- `/[slug]`
- `/acessibilidade`
- `/acesso`
- `/ajuda/[slug]`
- `/ajuda`
- `/ajuda/planejar-eposters`
- `/ajuda/planejar-inscricao-paga`
- `/ajuda/planejar-trabalhos-cientificos`
- `/cadastro`
- `/certificado/[code]`
- `/convites/cientificos/[token]`
- `/evento/[slug]/autoatendimento/acesso/[token]`
- `/evento/[slug]/autoatendimento`
- `/evento/[slug]/avaliador`
- `/evento/[slug]/estacao/[code]/eposter`
- `/evento/[slug]/estacao/[code]`
- `/evento/[slug]/estacao`
- `/evento/[slug]/expositor`
- `/evento/[slug]/inscricao/fila`
- `/evento/[slug]/inscricao/grupo`
- `/evento/[slug]/inscricao`
- `/evento/[slug]`
- `/evento/[slug]/participante/fila`
- `/evento/[slug]/participante`
- `/eventos/[id]/cientifico/avaliacao`
- `/eventos/[id]/cientifico/estrutura`
- `/eventos/[id]/cientifico/grade`
- `/eventos/[id]/cientifico`
- `/eventos/[id]/cientifico/palestrantes`
- `/eventos/[id]/cientifico/programacao`
- `/eventos/[id]/cientifico/submissoes`
- `/eventos/[id]/cientifico/trabalhos`
- `/eventos/[id]/configuracao`
- `/eventos/[id]/painel/avaliacao`
- `/eventos/[id]/painel/caex`
- `/eventos/[id]/painel/certificados`
- `/eventos/[id]/painel/check-in`
- `/eventos/[id]/painel/comunicacao`
- `/eventos/[id]/painel/comunicacoes`
- `/eventos/[id]/painel/divulgacao`
- `/eventos/[id]/painel/divulgacao/preview`
- `/eventos/[id]/painel/expositores`
- `/eventos/[id]/painel/fila-atividades`
- `/eventos/[id]/painel/financeiro`
- `/eventos/[id]/painel/inscricoes/beneficios`
- `/eventos/[id]/painel/inscricoes/categorias-lotes`
- `/eventos/[id]/painel/inscricoes/ficha`
- `/eventos/[id]/painel/inscricoes`
- `/eventos/[id]/painel/integracoes`
- `/eventos/[id]/painel/limite-atividades`
- `/eventos/[id]/painel/minhas-permissoes`
- `/eventos/[id]/painel`
- `/eventos/[id]/painel/permissoes`
- `/eventos/[id]/painel/pos-evento`
- `/eventos/[id]/painel/reembolsos`
- `/eventos/[id]/painel/relatorios`
- `/eventos/[id]/painel/reutilizar`
- `/eventos/[id]/painel/show`
- `/eventos/[id]/painel/transmissao`
- `/eventos/novo`
- `/eventos`
- `/login`
- `/master`
- `/organizacoes/[id]/dados-fiscais`
- `/`
- `/painel`
- `/participante`
- `/privacidade`
- `/termos-de-uso`
- `/verificar-email`

| Fonte em apps/api/src | Controllers declarados | Guards explícitos no arquivo |
|---|---|---|
| `activity-courtesy.controller.ts` | 'events/:eventId/activity-courtesy' | AuthGuard |
| `activity-enrollment-limit.controller.ts` | 'events/:eventId/activity-enrollment-limit' | AuthGuard |
| `activity-preference.controller.ts` | 'events/:eventId/activity-preferences' | AuthGuard |
| `activity-waitlist.controller.ts` | 'public/events/:slug/participant/activity-waitlist', (raiz) | AuthGuard |
| `asaas-checkout.controller.ts` | 'public/events/:slug/registration/reservations/:protocol', 'public/events/:slug/registration/orders/:orderId', 'webhooks/asaas' | Ver autenticação, token ou regra no serviço |
| `auth.controller.ts` | (raiz) | AuthGuard |
| `certificate-role.controller.ts` | 'events/:eventId/certificate-roles' | AuthGuard |
| `check-in.controller.ts` | 'events/:eventId/check-in' | AuthGuard |
| `credential-print-confirmation.controller.ts` | 'events/:eventId/credential-prints' | AuthGuard |
| `event-communication-audience.controller.ts` | 'events/:eventId/communication/audience' | AuthGuard |
| `event-communication.controller.ts` | 'events/:eventId/communication/drafts' | AuthGuard |
| `event-desk.controller.ts` | 'events/:eventId/desk' | AuthGuard, OperatorCapabilityGuard |
| `event-evaluation.controller.ts` | 'events/:eventId/evaluation', 'public/events/:slug/participant/evaluation' | AuthGuard |
| `event-financial-responsibility.controller.ts` | 'events/:eventId/financial-responsibility' | AuthGuard |
| `event-integrations.controller.ts` | 'events/:eventId/integrations' | AuthGuard |
| `event-publication/event-publication-public.controller.ts` | 'public/events' | Ver autenticação, token ou regra no serviço |
| `event-publication/event-publication.controller.ts` | 'events/:eventId/publication' | AuthGuard |
| `event-reuse.controller.ts` | 'events' | AuthGuard |
| `event-wizard.controller.ts` | 'event-wizard' | AuthGuard |
| `events.controller.ts` | 'events' | AuthGuard |
| `exhibitor-company.controller.ts` | 'public/events/:slug/exhibitor' | AuthGuard |
| `exhibitor-identity.controller.ts` | 'public/events/:slug/exhibitor-identity' | Ver autenticação, token ou regra no serviço |
| `exhibitor.controller.ts` | 'events/:eventId/exhibitor' | AuthGuard |
| `health.controller.ts` | 'health' | Ver autenticação, token ou regra no serviço |
| `integration-foundation.controller.ts` | 'events/:eventId/integrations', 'v1/events' | AuthGuard |
| `operator-capability.controller.ts` | 'events/:eventId/operators' | AuthGuard |
| `organizations.controller.ts` | 'organizations' | AuthGuard |
| `participant-area.controller.ts` | 'public/events/:slug/participant' | Ver autenticação, token ou regra no serviço |
| `participant-dashboard.controller.ts` | 'participant' | AuthGuard |
| `platform-master.controller.ts` | 'platform/master' | AuthGuard / AuthGuard, PlatformSessionGuard / AuthGuard, PlatformMasterGuard |
| `presence-certificate-public.controller.ts` | 'public/certificates' | Ver autenticação, token ou regra no serviço |
| `presence-certificate.controller.ts` | 'events/:eventId/certificate' | AuthGuard |
| `registration-benefits.controller.ts` | 'events/:eventId/registration-benefits' | AuthGuard |
| `registration-commercial.controller.ts` | 'events/:eventId/registration-commercial' | AuthGuard |
| `registration-forms.controller.ts` | 'events/:eventId/registration-form' | AuthGuard |
| `registration-operations.controller.ts` | 'events/:eventId/registration-operations' | AuthGuard |
| `registration-refund.controller.ts` | 'public/events/:slug/refund-policy', 'public/events/:slug/participant/refund', 'participant/events/:slug/refund', 'events/:eventId/refunds' | AuthGuard |
| `registration-reservations.controller.ts` | 'public/events/:slug/registration' | Ver autenticação, token ou regra no serviço |
| `registration-waitlist.controller.ts` | (raiz) | AuthGuard |
| `scientific-author.controller.ts` | 'public/events/:slug/participant/submissions' | Ver autenticação, token ou regra no serviço |
| `scientific-event-central.controller.ts` | 'scientific-events' | AuthGuard |
| `scientific-guests.controller.ts` | 'scientific-events', 'scientific-invitations' | AuthGuard |
| `scientific-program-public.controller.ts` | 'public/events/:slug/program' | Ver autenticação, token ou regra no serviço |
| `scientific-program.controller.ts` | 'scientific-events/:eventId/program' | AuthGuard |
| `scientific-review-distribution.controller.ts` | 'scientific-events/:eventId/reviews/distribution' | AuthGuard |
| `scientific-reviewer.controller.ts` | 'public/events/:slug/reviewer', 'scientific-events/:eventId/reviews' | AuthGuard |
| `scientific-reviews.controller.ts` | 'scientific-events/:eventId/reviews' | AuthGuard |
| `scientific-station.controller.ts` | 'public/events/:slug/station', 'scientific-events/:eventId/station' | AuthGuard |
| `scientific-structure.controller.ts` | 'scientific-events' | AuthGuard |
| `scientific-submissions.controller.ts` | 'scientific-events/:eventId/submissions' | AuthGuard |
| `self-check-in.controller.ts` | 'public/events/:slug' | Ver autenticação, token ou regra no serviço |
| `show-operations.controller.ts` | 'events/:eventId/show-operations' | AuthGuard |
| `transmission.controller.ts` | 'events/:eventId/transmission' | AuthGuard |
| `turnstile.controller.ts` | 'v1/events/:slug/turnstile' | Ver autenticação, token ou regra no serviço |
