# Backlog e ordem de execução

GitHub Issues contém as unidades de trabalho. Este arquivo mantém a ordem executiva e impede que ideias ou frentes técnicas antecipem a sequência 1→11.

## Classificação

| Classe | Uso |
| --- | --- |
| P0 — Crítico | segurança, perda de dados, produção ou bloqueio absoluto |
| P1 — Gate atual | necessário para decidir o Gate em curso |
| P2 — Próximo item | aprovado, mas bloqueado pelo Gate atual |
| P3 — Futuro aprovado | valor reconhecido, sem autorização para execução agora |
| IDEIA | requer avaliação e decisão antes de implementação |

## P1 — Item 1 / Gate 1

| Frente | Estado verificável | Próxima ação |
| --- | --- | --- |
| #32/#56 — Go/No-Go da Divulgação | aberto / No-Go temporário | concluir critérios externos e humanos |
| #85 — matriz e documentação do Gate | Draft; deve permanecer documental | manter sincronizado e registrar evidências humanas |
| #121 — design system do painel/Wizard/autenticação | HEAD `0a95eea1`, CI #416 aprovado, mesclável | revisão; transição Ready depende de conector/manual |
| #122 — perfil e porte públicos + EVA | HEAD `57eaa5ba`, CI #418 aprovado, Ready e mesclável | revisão e integração autorizada |
| #99 — contrato de locales | HEAD `85328060`, CI #376 aprovado, 35 atrás | sincronizar sem reescrever histórico antes de revisão final |
| #68/#108 — Nginx ativo | aplicação/HTTPS funcionais; cabeçalhos ausentes e versão exposta | intervenção administrativa autorizada |
| #30/#41 — matriz WCAG/UX humana | automação ampliada; prova humana incompleta | testar SHA integrado/implantado |
| #88 — jurídico e privacidade | fundação/minutas técnicas; conteúdo vigente não aprovado | validação jurídica antes de aceite real |

## Frentes transversais preservadas

| Frente | Estado real | Regra |
| --- | --- | --- |
| #72/#40/#42/#67 — recuperação e confirmação de e-mail | código aprovado no HEAD `06f0d3b4`; bloqueado por gateway, implantação e prova real | não criar PR duplicado, não inventar envio |
| #29 — EVA transversal | cortes determinísticos do item 1 integrados e ampliados no PR #122 | nenhum prompt livre ou ação sensível prematura |
| #95/#99 — internacionalização | fundação segura em revisão; somente pt-BR habilitado | não expor idioma parcial |
| #112/#113 — integrações/API | fundação documental em Draft | não implementar conectores antes da fase fonte |
| #114 — mapa canônico | sequência 1→11 recuperada; documentação central em reconciliação | Git/CI/merge prevalecem sobre memória |
| #115 — operação de disco/backups | política e readiness em acompanhamento | nenhuma limpeza destrutiva |
| #64 — Flow Guard | código versionado; ativações administrativas não comprovadas | não presumir proteção ativa |
| #69 — modo economia | cortes técnicos integrados | preservar Gates essenciais |

## Sequência bloqueada

| Nº | Item | Classe/estado |
| ---: | --- | --- |
| 2 | Inscrição | P2 — bloqueada pelo Gate 1 |
| 3 | Área reservada do inscrito | P3 — bloqueada pelo item 2 |
| 4 | Configuração de trabalhos científicos | P3 — bloqueada; PR #28 preservado |
| 5 | Submissão pelo autor | P3 — bloqueada; PR #27 preservado |
| 6 | Avaliação científica | P3 — bloqueada |
| 7 | Decisão científica | P3 — bloqueada; PR #23 preservado |
| 8 | Pós-aprovação — arquivo final/ePoster | P3 — bloqueada |
| 9 | Programação científica definitiva | P3 — bloqueada |
| 10 | Operação do evento | P3 — bloqueada |
| 11 | Pós-evento | P3 — bloqueada |

Trabalho transversal preparatório só pode avançar quando não expuser CTA, rota, contrato ou estado prematuro.

## Regras de escolha do próximo macrolote

1. revalidar `develop`, PRs, issues, checks, comentários e evidências;
2. confirmar que o ciclo anterior chegou a estado terminal;
3. selecionar o menor item aberto com predecessor e Gate satisfeitos;
4. pesquisar código/branch/PR equivalente antes de criar qualquer coisa;
5. preferir jornada funcional completa, não polimento isolado;
6. preservar UX em português, WCAG 2.2 AA, isolamento, idempotência, auditoria e ARM64;
7. usar um push e um CI natural sempre que possível;
8. não fazer rerun cego nem force-push;
9. distinguir código, CI, merge, homologação e produção;
10. não iniciar o item 2 antes do Go explícito do Gate 1.

## Benchmark

Consultar primeiro a issue #36. Registrar oportunidade nova na fase correta. Benchmark não autoriza copiar interface, texto, ativo, código, identidade ou fluxo proprietário e não equivale a implementação automática.

## Entrada de ideia

1. identificar ator, problema e valor;
2. mapear item 1→11, Gate e dependências;
3. avaliar segurança, LGPD, acessibilidade, integração e operação;
4. registrar como IDEIA ou prioridade proposta;
5. implementar somente após caber na fase autorizada.
