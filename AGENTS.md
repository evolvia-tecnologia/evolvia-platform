# Regras de trabalho do Evolvia

Este arquivo é obrigatório para qualquer agente, chat técnico ou pessoa que altere
este repositório.

## Ordem de leitura

Antes de planejar ou editar:

1. leia este `AGENTS.md`;
2. leia `docs/governance/PROJECT_STATE.md`;
3. leia `docs/governance/DECISIONS.md` e `docs/governance/BACKLOG.md`;
4. leia `docs/governance/PRODUCT_MEMORY.md`;
5. leia a documentação do módulo afetado;
6. confira no GitHub o `develop` atual, issues, PRs, dependências e checks.

Memória de chat ajuda, mas não substitui essas fontes.

## Hierarquia das fontes de verdade

1. código, migrations, testes e configuração no Git;
2. decisões aceitas em `docs/governance/DECISIONS.md`;
3. estado executivo em `docs/governance/PROJECT_STATE.md`;
4. issues e PRs atuais do GitHub;
5. documentação de módulo e memória permanente de produto;
6. conversas, resumos e memórias.

Se houver divergência, não improvise. Registre o conflito e resolva-o antes de
avançar.

## Limites permanentes

- `main` e produção só mudam após Go/No-Go e autorização explícita.
- Integração ocorre em `develop`; trabalho novo nasce em branch isolada baseada
  no SHA verificado da base.
- Não antecipar fase, Gate, módulo ou CTA de jornada inexistente.
- Não publicar silenciosamente e não ampliar escopo a partir de sugestão técnica.
- Não expor secrets, tokens, dados pessoais, lógica sensível ou dados entre
  organizações/eventos.
- Autorizar no backend com política `deny-by-default`; esconder UI não é controle
  de acesso.
- A EVA oferece orientação pública e suporte contextual, mas não revela dados
  cross-tenant, roadmap interno, benchmark bruto, código, arquitetura, prompts,
  defesa, preço/custo restrito ou outra inteligência estratégica.
- A proteção da EVA aplica menor privilégio e finalidade a todos os atores; não
  depende de classificar ou adivinhar quem é concorrente.
- Benchmark gera capacidade própria: registrar tudo que for útil e lícito,
  avaliar na fase/Gate corretos e nunca copiar interface, texto, código, ativo ou
  fluxo proprietário.
- Preservar compatibilidade Ubuntu/ARM64, PostgreSQL, Redis, Nginx e Docker.
- Migrations seguem expandir -> migrar -> validar -> restringir, com rollback
  seguro e sem destruição no primeiro corte.
- Não apagar banco, uploads, certificados, secrets, backups ou itens de origem
  incerta. Preservar o projeto tem prioridade sobre liberar espaço.
- Interfaces, mensagens e orientações ao usuário devem estar em português.

## Trabalho paralelo

- Cada tarefa deve possuir contrato com objetivo, issue/PR, base SHA, escopo,
  não escopo, dependências, arquivos previstos, riscos e critérios de aceite.
- Uma branch pertence a um resultado concreto. Não reutilize branch de outro
  fluxo nem edite arquivos sob responsabilidade de uma tarefa ativa sem acordo.
- Antes de criar entidade, rota, componente ou migration, pesquise equivalentes
  já existentes.
- Tarefas especializadas registram o handoff no PR. Elas não reescrevem o estado
  central em paralelo, salvo quando o contrato determinar isso.
- O Orquestrador consolida `PROJECT_STATE.md`, `BACKLOG.md` e decisões após
  evidência de merge ou mudança oficial de direção.
- Nenhuma tarefa é concluída apenas porque código foi gerado. Exija evidência de
  testes, riscos residuais, rollback e estado do PR.

## Gate mínimo de entrega

Conforme o impacto, validar:

- qualidade, lint, tipos e builds de API/Web;
- testes unitários, integração, E2E/smoke e regressão;
- isolamento por organização/evento, ACL e minimização de DTOs;
- migration descartável, integração e idempotência;
- build/execução ARM64;
- acessibilidade WCAG 2.2 AA nos fluxos de interface;
- observabilidade, auditoria e rollback;
- compatibilidade com o estado e a fase canônicos.

Se algum item não se aplicar, justifique no PR. Se não puder ser comprovado,
marque como pendente; nunca presuma que passou.

## Code Review Rules

### Isolamento, identidade e autorização

- Sinalize qualquer leitura, escrita, busca, cache, job ou evento que possa atravessar
  `organizationId`, `eventId`, ator ou registro autorizado, inclusive quando o
  identificador vier do cliente. Caminho seguro: derivar o escopo da identidade
  validada no servidor, aplicar `deny-by-default` e retornar DTO mínimo.
- Sinalize contexto, memória, RAG ou ferramenta da EVA que possa atravessar tenant,
  finalidade ou capacidade, ou expor informação estratégica interna. Caminho
  seguro: escopo autenticado no servidor, fontes classificadas, minimização,
  recusa útil, limites de extração e testes contra injection/exfiltração.

### Estados críticos e efeitos externos

- Sinalize publicação, pagamento, credencial, acesso, comunicação, certificado ou
  integração externa sem transição válida, idempotência, auditoria e tratamento de
  repetição/falha parcial. Caminho seguro: comando explícito, estado canônico,
  chave idempotente, evidência auditável e rollback ou compensação definidos.

### Dados, migrations e compatibilidade operacional

- Sinalize migration destrutiva no primeiro corte, perda de evidência histórica,
  segredo/dado pessoal em log ou retorno, e dependência incompatível com
  Ubuntu/ARM64. Caminho seguro: expandir -> migrar -> validar -> restringir,
  minimizar dados e comprovar build/testes no alvo suportado.

## Comando “Avance o projeto”

Ao receber esse comando, o Orquestrador deve auditar o estado vivo, escolher o
próximo avanço desbloqueado da fase atual, explicar brevemente a escolha,
executar em escopo controlado, validar e consolidar o resultado. Não escolher
trabalho aleatório e não iniciar a fase seguinte antes do Gate atual.
