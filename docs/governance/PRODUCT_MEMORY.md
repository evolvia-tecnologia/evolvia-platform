# Memória permanente do produto Evolvia

Este documento consolida princípios e decisões de produto que precisam sobreviver
à troca de conversa, agente ou ciclo de desenvolvimento. Ele registra **o que o
Evolvia deve ser**; o estado realmente implementado continua sendo comprovado por
código, migrations, testes, PRs, checks e `PROJECT_STATE.md`.

## Como usar esta memória

- Ler este arquivo antes de planejar produto, UX, benchmark, EVA ou jornada.
- Não marcar item como entregue apenas porque está descrito aqui.
- Os itens 1 a 11 do roadmap permanecem em sua ordem, com seus próprios critérios
  e Gates. Esta consolidação não fecha, renumera nem permite pular nenhum deles.
- Em caso de conflito, prevalece a hierarquia do `AGENTS.md`; registrar e resolver
  a divergência antes de implementar.
- Estado, prioridade e dependências vivas devem ser revalidados no GitHub.

## Visão e princípios

O Evolvia é uma plataforma brasileira de gestão de eventos **self-service assistida
pela EVA**. O cliente deve conseguir criar, configurar, testar, homologar, publicar,
operar, analisar e reutilizar um evento sem depender de atendimento humano no
fluxo normal. Ajuda humana é exceção escalável, não requisito da jornada.

O produto aplica o princípio IICEE:

- **Inteligência:** defaults, recomendações e alertas relevantes ao contexto.
- **Integração:** módulos compartilham identidades, estados e dados canônicos.
- **Confiabilidade:** autorização, idempotência, auditoria, observabilidade e
  recuperação segura.
- **Experiência:** linguagem simples, jornada curta e acessibilidade WCAG 2.2 AA.
- **Evolução:** configuração reutilizável, aprendizado autorizado e melhoria
  contínua sem quebrar contratos existentes.

Um evento simples deve nascer rapidamente com defaults e modelos inteligentes. O
organizador confirma ou edita o necessário; QA, segurança, desempenho e correções
são responsabilidade interna do Evolvia, nunca uma transferência ao cliente.

## Perfis, atores e jornada

Perfis de referência:

- Entretenimento;
- Corporativo;
- Científico;
- Feira.

O perfil orienta defaults e capacidades, mas não cria produtos separados nem
limita configurações autorizadas.

Atores que a plataforma e a EVA devem reconhecer pelo contexto:

- organizador e equipe da organização;
- participante ou inscrito;
- autor;
- avaliador;
- convidado, palestrante ou expositor;
- operação e staff;
- administrador interno, apenas no escopo explicitamente autorizado.

Jornada-base:

1. criar o evento;
2. selecionar ou inferir o perfil;
3. aplicar pré-configuração inteligente;
4. percorrer os itens 1 a 11 na ordem canônica;
5. testar e homologar;
6. obter Go/No-Go quando aplicável;
7. publicar;
8. operar;
9. analisar, prestar contas e reutilizar.

Nenhuma sugestão da EVA, conveniência visual ou pressão de prazo pode antecipar
capacidade, Gate, CTA ou estado inexistente.

## Domínios e regras permanentes

A plataforma deve evoluir de modo integrado, incluindo, conforme a fase correta:

- organização, evento, identidade, equipes e permissões;
- páginas públicas, agenda, comunicação e captação de interesse;
- inscrição, categorias, lotes, cupons, adicionais e pedidos;
- pagamentos, split, conciliação, recibos, webhooks, ledger e relatórios;
- credenciais, QR Code, check-in e operação;
- submissão científica, modalidade, área, subárea, avaliação e decisão;
- palestrantes, patrocinadores, expositores, entregáveis e evidências;
- programação, notificações, pós-evento, indicadores e reuso.

Regras críticas:

- escopo multi-organização e por evento derivado no servidor;
- autorização `deny-by-default`, RBAC/ABAC e DTO mínimo;
- ambiguidade de permissão ou precedência bloqueia e gera evidência segura;
- no científico, a precedência é modalidade → área/subárea → evento → padrão,
  sempre respeitando ACL e estado;
- efeitos externos exigem comando explícito, idempotência, auditoria sanitizada e
  compensação ou rollback;
- migrations seguem expandir → migrar → validar → restringir;
- segredos, tokens, hashes, e-mails e outros dados pessoais não entram em logs,
  auditoria ou URLs públicas;
- compatibilidade Ubuntu/ARM64, PostgreSQL, Redis, Nginx e Docker é obrigatória.

## Contrato da EVA

A EVA é inteligência operacional transversal, não um chat decorativo. Ela deve:

- orientar cada ator nas tarefas que ele está autorizado a executar;
- explicar regras, estados, bloqueios e próximos passos em linguagem simples;
- recomendar configurações e capacidades coerentes com perfil e fase;
- detectar inconsistências e riscos antes de publicação ou operação;
- apoiar importação, mapeamento, comunicação, prazos e rotinas;
- resumir indicadores e anomalias somente no escopo autorizado;
- usar APIs e comandos oficiais do Evolvia, nunca acesso lateral ao banco;
- separar claramente sugestão de execução;
- pedir confirmação explícita para ação sensível;
- oferecer fallback determinístico para operação crítica;
- registrar ação e justificativa de forma auditável, mínima e sanitizada.

A EVA não publica, cobra, cancela, aprova, rejeita, concede acesso administrativo
ou altera dado sensível silenciosamente.

### Proteção contra extração competitiva e espionagem

A proteção não depende de adivinhar quem é concorrente. Todo usuário recebe a
mesma política técnica de menor privilégio, isolamento e finalidade.

A EVA pode explicar recursos públicos, orientar a jornada e prestar suporte
contextual a todos os atores autorizados. Ela **não pode** revelar, inferir,
compilar, confirmar ou exportar:

- dados, documentos, estatísticas ou conversas de outra organização ou evento;
- agregados de clientes que permitam reidentificação ou inteligência competitiva;
- roadmap não publicado, backlog interno, notas brutas de benchmark ou estratégia;
- código, arquitetura interna, algoritmos, regras antifraude, detalhes de defesa
  ou procedimentos que facilitem evasão;
- prompts, políticas internas, credenciais, segredos ou configuração operacional;
- custos internos, lógica proprietária de preço ou informação comercial restrita;
- raciocínio privado ou memória obtida de outro cliente ou conversa.

Controles mínimos:

- recuperação de contexto e ferramentas limitadas por ator, organização, evento,
  capacidade, finalidade e estado;
- isolamento de memória: conteúdo de um tenant não ensina nem responde a outro;
- minimização de PII e de contexto enviado a modelos;
- resistência a prompt injection, context injection, exfiltração e enumeração;
- limites de volume, automação e frequência, com detecção de padrão anômalo;
- respostas seguras e úteis quando uma solicitação exceder o escopo;
- testes de IDOR, cross-tenant, tool abuse, exportação em massa e extração de
  instruções;
- auditoria sanitizada, sem registrar segredo, token, hash, e-mail ou conteúdo
  pessoal desnecessário.

A EVA deve continuar útil: ao negar informação restrita, orienta o usuário para
documentação pública, funcionalidade permitida ou canal de suporte adequado.

## Benchmark e inovação própria

Referências prioritárias já alinhadas:

- EVEN3, sobretudo para eventos científicos e acadêmicos;
- Sympla, sobretudo para ingressos, inscrição e participantes;
- Mitte, pela experiência operacional conhecida;
- Adaltech, apenas por análise lícita e sem acesso indevido;
- Bizzabo, Cvent, Swapcard, Whova, Swoogo, Eventbrite e outras fontes verificadas
  no inventário vivo da issue #36.

A regra é aprender com o mercado sem copiar. Não reproduziremos interface,
identidade visual, texto, código, ativo ou fluxo proprietário. Toda capacidade
útil e lícita encontrada deve ser registrada e avaliada como candidata ao
Evolvia; isso não significa implementação automática ou fora de ordem.

Método obrigatório:

`funcionalidade → como resolve o problema → benefício → limitação observada →
como o Evolvia fará melhor → perfil/fase/Gate → prioridade → dependências`.

Uma capacidade entra no produto quando:

- resolve problema real dos atores do Evolvia;
- funciona nos perfis aplicáveis sem fragmentar a plataforma;
- pode ser mais simples, integrada, acessível ou confiável;
- respeita LGPD, segurança, isolamento e direitos de terceiros;
- cabe na fase e no Gate atuais;
- possui estados, ACL, auditoria, testes e rollback proporcionais.

O inventário detalhado permanece na issue #36. Exemplos já registrados incluem
integridade da página pública, lista de interesse, séries e ocorrências, informação
pública de presença, credencial efêmera, contratos e entregáveis de patrocínio,
presets de escala, analytics de portfólio, recomendações explicáveis e consentidas,
reuniões inteligentes com evidência, acessibilidade operacional, preferências de
notificação, regras simuláveis e pós-evento durável.

## UX, acessibilidade e conteúdo

- Interfaces e mensagens em português, claras e consistentes.
- Desktop 1366×768 deve aproveitar o espaço sem rolagem desnecessária.
- Mobile, zoom, teclado, foco visível, leitor de tela, contraste, alvos de toque e
  cores forçadas devem ser preservados.
- Não usar acessibilidade como acabamento; ela integra critérios de aceite.
- Estados vazios, carregamento, sucesso, erro, expiração e indisponibilidade
  precisam de ação seguinte correta.
- Não revelar existência de conta, e-mail, token, hash, tenant ou estado interno.

## Engenharia, entrega e evidência

- `main` e produção são protegidos; integração ocorre em `develop`.
- Trabalho novo usa branch isolada baseada no SHA vivo e PR não duplicado.
- Cada lote deve ser funcional, coeso, testável, pequeno e rastreável.
- Sincronizar com `develop` sem force-push ou reescrita de histórico.
- Usar CI natural; não fazer rerun cego e corrigir causa raiz.
- Confirmar checks do SHA exato e distinguir: código criado, CI aprovado,
  integração em `develop`, homologação e produção.
- Não inventar prova de e-mail, pagamento, integração ou deploy.
- Dependência externa deve ser registrada exatamente, preservando frentes
  independentes desbloqueadas.
- Relatar avanço por resultado e evidência, não por hora consumida ou percentual
  subjetivo.

## Referências vivas

- Estado: `docs/governance/PROJECT_STATE.md`
- Decisões: `docs/governance/DECISIONS.md`
- Backlog: `docs/governance/BACKLOG.md`
- Contrato e evolução da EVA: issue #29
- Benchmark funcional: issue #36
- Recuperação de senha: issue #40
- Verificação de e-mail: issue #42
