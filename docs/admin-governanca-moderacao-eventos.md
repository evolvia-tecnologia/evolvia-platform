# Evolvia — Administração da plataforma, governança e moderação de eventos

## Objetivo

Criar um backoffice interno da Evolvia para que a equipe da plataforma consiga acompanhar o catálogo, identificar eventos vencidos ou suspeitos, revisar denúncias e sinais de risco, suspender/restaurar eventos com segurança e manter rastreabilidade integral das decisões.

Este domínio é de **administração da plataforma Evolvia**. Ele não usa nem amplia artificialmente papéis de organizador (`OrganizationMembership`). Um funcionário da Evolvia não deve precisar ser OWNER/ADMIN da organização do cliente para moderar um evento.

## Princípios obrigatórios

1. **Deny by default.** Toda rota `/platform-admin/**` exige credencial autenticada e vínculo interno ativo da Evolvia.
2. **Separação de funções.** Papéis internos da Evolvia são independentes dos papéis do organizador.
3. **Sem hard delete de evento por moderação.** Suspeitas e golpes são suspensos, não apagados.
4. **Auditoria imutável.** Toda ação registra ator, data, caso, motivo, estado anterior/novo e metadados seguros.
5. **Motivo obrigatório.** Suspensão, restauração, encerramento e cancelamento nunca são ações sem justificativa.
6. **Sem exposição pública de estados internos de investigação.** O portal recebe somente o estado público resultante.
7. **Dados mínimos.** Não armazenar cartão, documento sensível ou evidência bruta desnecessária no log. Evidências futuras devem usar referência/objeto seguro com retenção.
8. **Evento passado ≠ fraude.** Encerramento de ciclo de vida é tratado separadamente de Trust & Safety.
9. **Reversibilidade.** Suspensão pode ser restaurada com trilha completa; exclusão destrutiva não faz parte do fluxo normal.
10. **Integração com o portal público.** Evento `SUSPENDED` deixa imediatamente de ser elegível ao catálogo e à página pública. O contrato público deve continuar deny-by-default.

## Papéis internos da Evolvia

### SUPER_ADMIN
- visão completa do backoffice;
- concede/revoga acesso interno;
- suspende/restaura/finaliza/cancela eventos;
- revisa casos críticos;
- acessa auditoria de plataforma.

### TRUST_SAFETY
- recebe e investiga casos;
- suspende e restaura eventos;
- marca caso resolvido/descartado;
- classifica risco e registra evidência/referência;
- não concede acesso administrativo à plataforma.

### SUPPORT
- consulta eventos e organizações;
- abre/escalona caso de moderação;
- adiciona nota interna segura;
- não suspende/restaura por padrão.

### ANALYST
- leitura de filas, indicadores e auditoria;
- sem mutações.

## Estados do evento e significado operacional

- `PUBLISHED`: elegível ao portal público.
- `SUSPENDED`: indisponível publicamente por risco, abuso, fraude, segurança ou decisão administrativa; dados preservados.
- `FINISHED`: evento encerrado normalmente; inscrições/ações futuras fechadas. A política de página histórica/SEO é separada do estado de moderação.
- `CANCELLED`: evento cancelado pelo fluxo de negócio ou decisão administrativa fundamentada.

`DRAFT`, `SETUP`, `HOMOLOGATION` e `READY_TO_PUBLISH` continuam estados do processo do organizador e não devem aparecer no catálogo público.

## Casos de moderação

Um evento pode possuir vários casos ao longo de sua vida. Cada caso registra:

- evento;
- estado do caso;
- código de motivo;
- severidade;
- origem do sinal;
- resumo objetivo e não sensível;
- responsável interno opcional;
- quem abriu;
- timestamps de abertura/resolução;
- histórico de ações.

### Estado do caso

- `OPEN`
- `IN_REVIEW`
- `ACTION_REQUIRED`
- `RESOLVED`
- `DISMISSED`

### Motivos iniciais

- `SUSPECTED_FRAUD`
- `IMPERSONATION`
- `MISLEADING_CONTENT`
- `PAYMENT_RISK`
- `ILLEGAL_CONTENT`
- `SPAM`
- `DUPLICATE`
- `SECURITY`
- `ABUSE`
- `PAST_EVENT`
- `OTHER`

### Origem

- `STAFF`
- `USER_REPORT`
- `AUTOMATED_SIGNAL`
- `SYSTEM_LIFECYCLE`

### Severidade

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

## Ações auditáveis

- abrir caso;
- assumir/atribuir caso;
- adicionar nota;
- escalar;
- suspender evento;
- restaurar evento;
- marcar como finalizado;
- cancelar evento;
- descartar caso;
- resolver caso.

Cada ação registra obrigatoriamente o `EventStatus` anterior e posterior quando houver mudança de estado.

## Fluxo de suspeita de golpe

1. Caso entra por denúncia, sinal automatizado ou revisão manual.
2. Trust & Safety revisa identidade, conteúdo público, histórico do organizador, comportamento transacional disponível e demais sinais permitidos.
3. Se o risco justificar retirada imediata, o evento muda atomicamente para `SUSPENDED`.
4. A mudança de estado e o log de moderação são gravados na mesma transação.
5. O portal público deixa de listar/servir o evento porque apenas estados explicitamente elegíveis podem ser públicos.
6. O organizador não perde dados do evento pela moderação.
7. A restauração exige motivo e nova entrada de auditoria.

## Fluxo de evento passado

1. Um processo de lifecycle pode sinalizar eventos cuja `endDate` passou.
2. O sistema **não deve assumir automaticamente** que todo evento vencido deve sumir: eventos híbridos/online podem manter conteúdo on-demand e eventos passados podem ter valor histórico/SEO.
3. O backoffice mostra fila `encerramento pendente` com data final, estado, formato e indicadores disponíveis.
4. Quando aplicável, equipe ou regra de ciclo de vida aprovada muda para `FINISHED`.
5. `FINISHED` deve bloquear novas operações incompatíveis, mas a política de página histórica será definida no renderer público/SEO.

## Fila administrativa

A visão inicial do backoffice deve oferecer:

- busca por nome/slug/id;
- filtros por estado do evento;
- casos abertos/em revisão/ação necessária;
- severidade;
- motivo;
- origem;
- data de início/fim;
- eventos com `endDate` vencida ainda não finalizados;
- eventos recentemente publicados;
- eventos suspensos;
- responsável interno.

Nenhum contador deve ser inventado; todos os indicadores vêm do banco.

## Tela de detalhe do evento no backoffice

Deve reunir, sem obrigar a equipe a entrar como organizador:

- identidade canônica do evento;
- organização responsável;
- status e formato;
- datas/local;
- resumo da publicação pública;
- checklist de integridade disponível;
- casos de moderação;
- linha do tempo de ações;
- auditoria relacionada;
- ações permitidas conforme papel interno.

Ações críticas usam confirmação explícita, motivo obrigatório e resumo do impacto antes de executar.

## Segurança

- rotas internas nunca usam apenas esconder link na UI;
- autorização obrigatória no backend;
- nenhum papel de `OrganizationMembership` concede acesso ao `/platform-admin`;
- consultas de fila não retornam segredo, password hash, token, dado de cartão ou conteúdo de auditoria sensível;
- respostas 403/404 devem evitar enumeração desnecessária;
- logs não armazenam evidência confidencial em texto livre quando uma referência segura for suficiente;
- rate limit e MFA/step-up para ações críticas entram no hardening do backoffice antes de produção;
- sessões administrativas devem ter política mais restrita que a área comum no roadmap de segurança.

## LGPD e retenção

- dados de moderação têm finalidade de prevenção a fraude, segurança, cumprimento contratual e proteção da plataforma;
- armazenar apenas dados necessários à investigação;
- notas internas devem ser factuais, profissionais e não discriminatórias;
- política de retenção deve diferenciar log de auditoria, caso encerrado e evidências;
- acesso a evidências deve ser mais restrito que acesso à fila.

## Integração com Financeiro/Pagamentos

Quando o motor financeiro existir, a fila poderá receber **sinais**, nunca conclusões automáticas sem regra definida, como:

- chargeback anormal;
- divergência de beneficiário/organizador quando legalmente disponível;
- padrão atípico de reembolsos;
- volume transacional incompatível com configuração;
- falhas de conciliação relevantes.

Dados sensíveis de cartão continuam no provedor de pagamentos e não entram no backoffice Evolvia.

## Integração com EVA

A EVA pode:

- resumir sinais reais do caso;
- apontar pendências de revisão;
- explicar por que um caso foi priorizado;
- sugerir checklist.

A EVA **não pode suspender, restaurar, cancelar ou finalizar silenciosamente** um evento. Ação irreversível/sensível exige decisão humana ou regra operacional explicitamente aprovada e auditada.

## Métricas futuras do backoffice

- eventos publicados;
- eventos suspensos;
- casos abertos e tempo até primeira revisão;
- casos por motivo/severidade;
- taxa de restauração após suspensão;
- eventos vencidos aguardando encerramento;
- tempo de resolução;
- ações por papel interno.

Métricas só aparecem quando calculadas a partir de dados reais.

## Estratégia de implementação

### Lote G1 — Fundação de acesso e domínio
- `PlatformStaffAccess` e papéis internos;
- `EventModerationCase`;
- `EventModerationActionLog`;
- migration e rollback documentado;
- serviço deny-by-default;
- testes de autorização.

### Lote G2 — API administrativa
- fila paginada;
- detalhe do evento;
- abrir/atribuir/escalonar caso;
- suspender/restaurar/finalizar com transação;
- auditoria e testes de concorrência/estado.

### Lote G3 — UI do backoffice
- shell próprio `/platform-admin`;
- dashboard de integridade;
- fila e filtros;
- detalhe + timeline;
- confirmação acessível de ações críticas;
- mobile para consulta, desktop otimizado para operação.

### Lote G4 — lifecycle e sinais
- fila de eventos passados;
- sinais de pagamentos quando o financeiro existir;
- denúncias de usuário;
- regras/score explicáveis;
- notificações internas.

### Lote G5 — hardening
- MFA/step-up conforme suporte de identidade;
- rate limit;
- retenção/evidências;
- exportação segura de auditoria;
- testes de abuso;
- Gate final de segurança/LGPD/WCAG/performance.

## Definition of Done

Um evento só é considerado moderável de forma pronta quando:

- autorização de plataforma é independente e deny-by-default;
- suspensão é atômica e auditada;
- restauração é auditada;
- evento suspenso não aparece no portal público;
- evento de outro tenant pode ser moderado apenas por papel de plataforma autorizado, nunca por organizador externo;
- nenhum dado privado adicional é exposto pelo backoffice;
- ações críticas possuem motivo obrigatório;
- concorrência não permite sobrescrever decisão mais recente silenciosamente;
- testes cobrem permissões, estados, suspensão/restauração, auditoria e casos inexistentes;
- migrations e rollback são validados;
- CI, integração, idempotência e ARM64 passam antes de `develop`.
