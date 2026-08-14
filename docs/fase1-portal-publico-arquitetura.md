# Fase 1 — Portal público, descoberta e SEO da Evolvia

Status: arquitetura canônica para implementação incremental na Fase 1 — Divulgação.

## 1. Objetivo

Transformar o domínio principal da Evolvia em três experiências coerentes no mesmo produto:

1. portal institucional da Evolvia;
2. vitrine/descoberta pública de eventos reais publicados;
3. entrada clara para os produtos autenticados do organizador e do participante.

O portal não é uma fase 12. Ele nasce na Divulgação e amadurece conforme Inscrição, Área Reservada, Programação, Operação e Pós-evento disponibilizam dados reais.

## 2. Referência e princípio de diferenciação

Referência funcional: Even3, especialmente a combinação entre descoberta de eventos, páginas por tipo/formato, funcionalidades da plataforma e entrada para organizar eventos.

A Evolvia deve evitar copiar identidade visual, textos, URLs ou composição. O diferencial de arquitetura deve ser reduzir densidade cognitiva e organizar por intenção:

- "Quero encontrar/participar de um evento";
- "Quero organizar um evento";
- "Quero entender a Evolvia e suas soluções".

A home não deve parecer um painel administrativo nem um catálogo de todos os recursos. Profundidade fica em megamenus e páginas internas.

## 3. Navegação global

### Desktop

Header público persistente, leve e com contraste AA:

- EVOLVIA — link para `/`;
- Eventos;
- Soluções;
- Para quem;
- Conteúdos;
- Sobre a Evolvia;
- Área do participante;
- Área do organizador;
- CTA primário: Criar evento.

"Área do participante" e "Área do organizador" devem ser visualmente diferentes de links editoriais porque representam mudança de contexto/produto.

### Mobile

- logo + menu + CTA principal compacto;
- drawer em primeiro nível com as mesmas cinco áreas editoriais;
- bloco separado "Acessar" com participante e organizador;
- submenus em accordion nativo/acessível;
- preservar foco, `aria-expanded`, Escape, retorno de foco e alvo mínimo de toque.

## 4. Megamenus

### Eventos

Colunas:

**Descobrir**
- Todos os eventos
- Próximos de você
- Em destaque
- Em alta
- Gratuitos
- Online e híbridos
- Com submissões abertas

**Por tipo**
- Congresso
- Simpósio
- Seminário
- Jornada
- Workshop
- Curso
- Feira/exposição
- Palestra
- Evento corporativo
- Show/entretenimento
- Outros tipos canônicos futuros

**Por área**
- áreas reais do catálogo, ordenadas por relevância/volume;
- "Ver todas as áreas".

**Por local**
- regiões;
- estados com oferta real;
- cidades em destaque conforme eventos publicados.

### Soluções

Organizar por problema/resultado, não por estrutura interna da plataforma:

- Divulgação e site do evento
- Inscrições e pagamentos
- Área do participante
- Trabalhos científicos
- Avaliação e decisão
- Programação e palestrantes
- Credenciamento e operação
- Certificados e pós-evento
- Eventos online e híbridos
- Expositores e patrocinadores
- Relatórios e BI
- Integrações e automações

Não exibir como disponível uma solução que ainda não exista funcionalmente. Enquanto futura, pode aparecer apenas em roadmap/conteúdo editorial se a comunicação for inequivocamente prospectiva.

### Para quem

Separar por pessoa/organização:

- Organizadores e produtoras
- Empresas
- Universidades e instituições de ensino
- Associações e sociedades científicas
- Participantes
- Autores
- Avaliadores
- Palestrantes
- Expositores e patrocinadores

Cada página deve explicar necessidades, jornada e recursos relevantes, sem duplicar a mesma copy trocando apenas o nome do público.

### Conteúdos

- Todos os conteúdos
- Organização de eventos
- Eventos científicos e acadêmicos
- Eventos corporativos
- Feiras e exposições
- Shows e entretenimento
- Eventos online/híbridos
- Tecnologia para eventos
- Acessibilidade e inclusão
- Marketing e divulgação
- Inscrições, pagamentos e financeiro
- Trabalhos científicos
- Operação, credenciamento e segurança
- Tendências e pesquisas
- Novidades da Evolvia

### Sobre a Evolvia

- O que é a Evolvia
- Quem somos
- Onde estamos
- Missão e princípios
- Segurança e privacidade
- Acessibilidade
- Contato
- Imprensa/Marca, quando houver conteúdo real
- Trabalhe conosco, somente quando houver processo real

## 5. Home pública — ordem recomendada

### 5.1 Header
Navegação global e acessos autenticados.

### 5.2 Hero orientado por intenção

H1 curto e não genérico. Exemplo de direção editorial: "Eventos melhores começam com uma experiência melhor para todos." A copy final precisa ser revisada quando posicionamento comercial estiver fechado.

Duas ações explícitas:
- `Encontrar eventos` — principal para público geral;
- `Criar meu evento` — principal para organizador.

Busca pública pode estar dentro do hero ou imediatamente abaixo, com campos simples: palavra-chave + local e botão. Filtros avançados ficam em `/eventos`.

A EVA não deve virar chat flutuante obrigatório. No portal público ela pode aparecer como orientação contextual, por exemplo "Não sabe por onde começar? A EVA ajuda a encontrar o tipo de evento certo".

### 5.3 Descoberta prioritária

Blocos dinâmicos somente com eventos reais publicados:
- em destaque, se houver curadoria real;
- próximos de você, somente após localização consentida ou cidade selecionada;
- em alta, com critério documentado e anti-manipulação;
- por área;
- por tipo;
- online/híbridos;
- com submissões abertas quando o fluxo científico estiver funcional.

Não renderizar carrosséis vazios. Preferir grids responsivos com `Ver todos`.

### 5.4 Tipos de evento

Cards de navegação editorial para os perfis canônicos do Evolvia, com descrição curta e link estável. Tipos devem compartilhar a mesma taxonomia usada pelo Wizard/evento para evitar duas ontologias concorrentes.

### 5.5 Para organizadores

Seção que explica a jornada completa sem listar 40 features. Estrutura:
- planeje;
- publique;
- inscreva;
- opere;
- analise.

CTA `Conhecer as soluções` + `Criar evento`.

### 5.6 Soluções em destaque

6 a 8 capacidades maduras no máximo por renderização. Demais ficam em `/solucoes`.

### 5.7 Para quem

Cards de organizadores/empresas/universidades/associações e demais segmentos que já tenham conteúdo real.

### 5.8 Conteúdo editorial

Últimas matérias + guias pilares. Objetivo: utilidade e autoridade temática, não volume por palavras-chave.

### 5.9 Prova e confiança

Quando houver dados reais:
- cases;
- logos autorizados;
- métricas verificáveis;
- políticas de segurança/LGPD;
- acessibilidade;
- suporte.

Nunca publicar números inventados, estimativas comerciais como fatos ou depoimentos sem autorização.

### 5.10 CTA final e footer

CTA conforme intenção do usuário + footer denso, porém organizado por grupo.

## 6. Página `/eventos`

### Busca
- palavra-chave;
- cidade/local;
- data;
- tipo;
- área;
- formato presencial/online/híbrido;
- gratuito/pago quando preço real existir;
- submissões abertas quando real.

### UX
- filtros persistentes no desktop e bottom-sheet/drawer no mobile;
- URL deve preservar estado compartilhável sem indexar infinitas combinações;
- ordenação: relevância, data e distância quando possível;
- resultado em cards sem informação irrelevante;
- estados de loading, vazio, erro e sem permissão de localização;
- teclado, foco e leitura por screen reader.

### Card de evento

Prioridade visual:
1. imagem/identidade do evento;
2. título;
3. data;
4. cidade ou Online;
5. tipo/área se útil;
6. preço a partir de / Grátis, quando real;
7. sinais reais: submissões abertas, últimas vagas, etc.

Evitar badges em excesso.

## 7. Páginas de descoberta indexáveis

Rotas candidatas:

- `/eventos/tipo/{slug}`
- `/eventos/area/{slug}`
- `/eventos/regiao/{slug}`
- `/eventos/estado/{slug}`
- `/eventos/cidade/{slug}`
- `/eventos/formato/{slug}`

Regra SEO: uma rota só deve ser indexável se houver valor próprio. Página sem massa crítica, vazia, quase duplicada ou gerada apenas para keyword deve usar `noindex`/não entrar no sitemap até atingir critérios editoriais e de catálogo.

Combinações arbitrárias de filtros continuam sendo resultados de busca, não landing pages SEO.

## 8. Página pública individual do evento

Integrar diretamente o `EventPublication` da Fase 1.

Ordem sugerida:
- identidade visual do evento;
- título + data + local/formato;
- CTA contextual de inscrição quando disponível;
- descrição/resumo;
- programação quando publicada;
- palestrantes quando publicados;
- trabalhos/submissões quando aplicável;
- patrocinadores/expositores quando aplicável;
- acessibilidade do evento;
- contato público;
- mapa/local quando adequado;
- informações de organização;
- compartilhamento;
- conteúdos relacionados somente quando úteis.

A Evolvia deve ficar como plataforma discreta; a marca do evento é protagonista.

## 9. Hub editorial `/conteudos`

### Taxonomia
Categoria editorial + tags controladas. Não criar tags livres ilimitadas.

### Artigo
- H1 único;
- resumo;
- autor real;
- data de publicação e atualização;
- imagem principal otimizada;
- índice opcional para long-form;
- conteúdo semanticamente estruturado;
- referências/fontes quando aplicável;
- relacionados editoriais e por entidade;
- CTA contextual sem interromper leitura;
- Article JSON-LD com dados reais;
- breadcrumbs.

## 10. Páginas institucionais

### `/sobre`
Explica Evolvia, proposta, princípios e visão do produto.

### `/quem-somos`
Equipe/empresa somente com fatos autorizados.

### `/onde-estamos`
Endereço e área de atuação reais; mapa apenas se houver benefício e sem penalizar desempenho inicial.

### `/para-quem`
Hub de públicos e organizações atendidas.

### `/contato`
Canais reais, horário e escopo de atendimento; proteção anti-spam no formulário.

## 11. SEO técnico

- conteúdo principal renderizado no HTML/SSR sempre que possível;
- metadata do Next.js por rota;
- `title` e description únicos;
- canonical absoluto e consistente;
- sitemap particionado se o volume crescer;
- robots com regras explícitas para busca/filtros/áreas autenticadas;
- Event JSON-LD somente na página individual do evento e somente com propriedades reais;
- Organization JSON-LD na home/institucional quando dados oficiais estiverem definidos;
- Article JSON-LD em conteúdo editorial;
- BreadcrumbList quando corresponde ao breadcrumb visível;
- Open Graph e social cards;
- status HTTP correto, incluindo 404/410/redirects;
- histórico de eventos encerrados preservado quando ainda útil, com status claro;
- URLs de eventos estáveis após publicação; mudança de slug exige redirect permanente.

## 12. Performance

Metas operacionais quando houver medição de campo:
- LCP <= 2,5 s;
- INP < 200 ms;
- CLS < 0,1.

Diretrizes:
- Server Components por padrão;
- JavaScript cliente apenas onde houver interação real;
- imagens com tamanhos explícitos, formatos modernos e `srcset`/Next Image quando adequado;
- hero sem vídeo pesado autoplay;
- fontes enxutas e sem múltiplas famílias desnecessárias;
- cache de catálogo público;
- consultas paginadas e indexadas;
- CDN/object storage para mídia pública;
- evitar bibliotecas de carrossel/ícones quando CSS/HTML ou assets existentes bastarem.

## 13. Acessibilidade

Definition of Done WCAG 2.2 AA:
- landmarks e headings coerentes;
- skip link;
- foco visível;
- navegação 100% por teclado;
- menus/accordions semanticamente corretos;
- contraste AA;
- zoom/reflow 400%;
- alvos de toque adequados;
- movimento reduzido;
- imagens com alt significativo ou `alt=""` quando decorativas;
- resultados/filtros anunciados sem excesso de `aria-live`;
- localização sempre opcional e com alternativa manual.

## 14. Modelo de dados e busca — princípios

Não criar um segundo cadastro público do evento. Catálogo deve derivar de entidades canônicas do evento e de `EventPublication` publicado.

Campos de descoberta precisam ter origem definida:
- tipo canônico;
- áreas/categorias controladas;
- formato;
- data;
- país/UF/cidade;
- geolocalização quando válida;
- preço mínimo quando inscrições reais existirem;
- status de submissão quando módulo científico real existir;
- destaque/curadoria com regra auditável.

Pesquisa deve começar simples, com banco + índices adequados. Serviço de busca externo só entra se volume/qualidade comprovarem necessidade.

## 15. Fases de implementação

### Portal Lote A — fundação pública
- novo public shell/header/footer;
- home institucional/descoberta sem dados fictícios;
- `/eventos` com empty state real;
- estrutura de rotas institucionais;
- metadata/canonical/robots/sitemap-base;
- Design System público responsivo.

### Portal Lote B — catálogo real
- endpoint/repository público minimizado para eventos PUBLISHED;
- cards e busca;
- tipo/área/formato/local;
- paginação/cache;
- testes de isolamento e não exposição de draft.

### Portal Lote C — página pública do evento
- renderização de `EventPublication`;
- identidade do evento;
- Event JSON-LD;
- acessibilidade e SEO;
- preview administrativo separado da URL indexável.

### Portal Lote D — SEO programático controlado
- páginas de tipo/área/cidade/estado/região/formato;
- critérios de indexabilidade por qualidade/massa crítica;
- sitemap dinâmico;
- redirects e histórico.

### Portal Lote E — conteúdo editorial
- modelo editorial mínimo;
- listagem/categorias;
- Article JSON-LD;
- fluxo editorial/publicação/auditoria;
- somente então escalar conteúdo.

## 16. Gates específicos

Antes de merge de cada lote:
- noindex/robots/sitemap testados;
- nenhuma página draft/privada indexável;
- sem PII no catálogo público;
- sem conteúdo fictício para preencher layout;
- mobile 320px+;
- teclado e contraste;
- typecheck/build/audit/testes;
- migration/idempotência quando houver schema;
- ARM64 no Gate consolidado;
- avaliação de tamanho de bundle e imagens;
- validação de structured data quando aplicável.

## 17. Critério de sucesso

A home deve permitir que um usuário novo responda em poucos segundos:

1. O que é a Evolvia?
2. Posso encontrar eventos aqui?
3. A plataforma atende o meu tipo de evento?
4. Como entro como participante?
5. Como entro como organizador?
6. Como começo a criar um evento?
7. Onde encontro informações confiáveis sobre eventos?

Se a página precisar explicar a própria navegação, a arquitetura falhou.
