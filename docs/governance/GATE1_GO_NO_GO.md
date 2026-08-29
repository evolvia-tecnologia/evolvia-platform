# Gate 1 — Go/No-Go da Divulgação

## Estado atual

**No-Go temporário.**

A Divulgação possui cobertura técnica ampla e está implantada em homologação até `develop@961be8471c5eeb594016b507e2e191e922ae0ada`, mas o Gate não pode ser encerrado enquanto faltarem revisão dos PRs ativos aplicáveis, configuração defensiva do Nginx, matriz humana WCAG e Go explícito do Product Owner.

Este documento não autoriza o item 2 — Inscrição.

## Evidência integrada e implantada

Push/deploy #411:

- qualidade, tipos, segurança e builds: aprovados;
- migrations, integração e idempotência: aprovadas;
- API e Web ARM64: aprovadas;
- publicação com rollback: aprovada;
- API/PostgreSQL prontos: comprovados;
- HTTPS 200: comprovado;
- HTTP→HTTPS 308: comprovado;
- prova defensiva pública: falhou corretamente.

Falha delimitada:

- HSTS ausente;
- `X-Content-Type-Options` ausente;
- `Referrer-Policy` ausente;
- `X-Frame-Options` ausente;
- `Server: nginx/1.24.0 (Ubuntu)` exposto.

A configuração versionada não está ativa no host. Não é falha da aplicação, banco, migrations ou imagens ARM64.

## Cobertura técnica existente

- publicação explícita com confirmação humana;
- state machine canônica e checklist obrigatório;
- ACL deny-by-default por organização/evento/membership/papel;
- idempotência, concorrência e auditoria sanitizada;
- rascunho e mídia privados antes de `PUBLISHED`;
- preview autenticado e projeção pública minimizada;
- página pública, catálogo, SEO, sitemap e mídia canônica;
- identidade visual controlada e contraste AA;
- timezone IANA e datas determinísticas;
- skip link, landmarks, foco, alvos de toque, reflow e movimento reduzido;
- EVA contextual do organizador e do público sem mutações ou contexto lateral;
- smoke descartável de publicação e renderização de `/eventos` e `/evento/[slug]`;
- 404 seguro para evento inexistente.

## PRs que alteram a decisão futura

| PR | Evidência | Situação |
| --- | --- | --- |
| #121 | HEAD `0a95eea1`, CI #416 aprovado | visual consolidado; Draft por falha do conector Ready |
| #122 | HEAD `57eaa5ba`, CI #418 aprovado | perfil/porte público e EVA; Ready |
| #99 | HEAD `85328060`, CI #376 aprovado | contrato de locales; divergente e exige sincronização |
| #85 | documentação do próprio Gate | deve permanecer Draft até matriz humana |

Nenhum desses PRs está integrado ou implantado apenas por possuir CI verde.

## Matriz humana obrigatória

Registrar ambiente, SHA implantado, navegador/tecnologia assistiva, viewport/zoom, resultado, evidência e defeito associado.

| Superfície | Desktop 1366×768 | Mobile/tablet | Teclado/foco | Leitor de tela | Zoom/reflow 200%/400% | Conteúdo real |
| --- | --- | --- | --- | --- | --- | --- |
| Home pública | pendente final | pendente final | pendente final | pendente | pendente final | aplicável |
| Catálogo `/eventos` | pendente final | pendente final | pendente final | pendente | pendente final | evento publicado |
| Evento `/evento/[slug]` | pendente | pendente | pendente | pendente | pendente | mídia/alt text reais |
| Login/cadastro | pendente no SHA final | pendente no SHA final | pendente no SHA final | pendente | pendente no SHA final | mensagens reais |
| Wizard/painel | pendente no SHA final | pendente no SHA final | pendente no SHA final | pendente | pendente no SHA final | fluxo autorizado |
| Editor/preview/publicação | pendente no SHA final | pendente no SHA final | pendente no SHA final | pendente | pendente no SHA final | evento autorizado |

### Casos dirigidos

1. **Evento publicado autorizado**
   - criar/configurar pelo fluxo canônico;
   - enviar logo ou capa válida;
   - informar texto alternativo quando exigido;
   - transitar `SETUP → HOMOLOGATION → READY_TO_PUBLISH → PUBLISHED`;
   - validar catálogo e página pública.

2. **Mídia**
   - confirmar bloqueio sem logo/capa;
   - confirmar remoção do bloqueio após upload válido;
   - validar alt text informativo e imagem decorativa;
   - confirmar ausência de storage key, hash e IDs internos no público.

3. **Datas**
   - escolher a mesma data em navegadores/fusos diferentes;
   - salvar e recarregar;
   - comparar Wizard, preview e página pública;
   - o dia civil precisa permanecer idêntico.

4. **Navegação e reflow**
   - testar 320 px, 200% e 400%;
   - CTAs públicos permanecem visíveis, legíveis, focáveis e acionáveis;
   - nenhum overflow horizontal ou rótulo cortado.

5. **Interação**
   - estados normal, hover, foco, active, disabled e loading perceptíveis;
   - área ativa mínima de 44 px;
   - nenhuma informação depende somente de cor.

6. **EVA**
   - orientação coerente com checklist, estado e fatos públicos;
   - dado ausente recebe recusa útil;
   - nenhuma mutação, inscrição, pagamento ou dado cross-tenant.

## Critério de Go

Somente registrar **Go** quando:

- PRs necessários ao Gate estiverem revisados e integrados;
- CI do SHA integrado estiver aprovado;
- SHA exato estiver implantado em homologação;
- cabeçalhos defensivos e ocultação do Nginx estiverem comprovados;
- matriz humana estiver preenchida sem bloqueio conhecido;
- defeitos encontrados estiverem corrigidos ou aceitos explicitamente;
- Product Owner registrar aprovação inequívoca.

Go técnico não substitui Go do produto.

## Rollback e limites

- documentação: reverter o commit/PR, sem efeito em aplicação ou dados;
- aplicação: usar rollback versionado do deploy;
- migrations permanecem expansivas; não apagar dados no rollback inicial;
- não alterar `main`, produção ou Oracle por este PR;
- não executar deploy;
- não habilitar item 2, CTA ou rota de inscrição;
- não usar GitHub Actions como ponte SSH;
- não inventar prova de e-mail, acessibilidade ou publicação.

## Rastreabilidade

- estado: issue #32;
- publicação: issue #56;
- acessibilidade: issue #30;
- UX: issue #41;
- Nginx/HTTPS: issues #68 e #108;
- EVA: issue #29;
- benchmark: issue #36;
- mapa 1→11: issue #114;
- jurídico: issue #88.
