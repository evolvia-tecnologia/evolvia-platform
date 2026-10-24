# Layout de atendimento e portal — referência Mitte

Direção do Product Owner em24/10/2026, #592/#593: reproduzir a estrutura
do CAEX e portal Expositor/Fornecedor/Montador observados na Mitte, organizando
as funcionalidades Evolvia nesses espaços e mantendo suas cores.

## Implementação do candidato

- Portal: barra superior por evento, conta e papel; navegação Dados cadastrais,
  Representantes, Formulários, Pagamentos e Downloads; menu compacto em celular;
  cabeçalho da seção/empresa/estande; rodapé contextual.
- Formulários: resumo de acesso, filtros e cartões horizontais com ícone,
  título, estado, prazo e obrigatoriedade. Expansão nativa por details/summary
  abre os campos existentes. Colapsar não desmonta os campos nem dispara
  visita/envio. Prazo vencido preserva bloqueio existente, sem impedir consulta.
- CAEX: barra superior com Início/Expositores/Credenciais/Prestadores,
  menu responsivo e retorno ao painel; resumo com contagens/progresso;
  ficha mantém cotas e abas Credenciais/Formulários/Pedidos do corte anterior.
- As rotas do portal e CAEX usam esse cabeçalho específico, sem duplicar
  navegação pública ou sidebar do organizador. Não modifica event-workspace.
  O CAEX lê dados exclusivamente pela API autenticada já protegida por
  papel administrativo, capability e organização/evento; retirar o wrapper
  visual não concede permissões. Falta sessão oferece acesso ao login.
- Fornecedor/prestador usa o portal existente de empresa PROVIDER; montador
  permanece modalidade de credencial ASSEMBLER. Não foi inventado novo papel
  nem alterada a ACL para simular uma área ainda inexistente.

## Identidade do evento e suporte do organizador (CUR-07)

Executado pelo Cursor na mesma branch/PR (#593), por handoff do Codex em
#569, a partir do HEAD `4575df9e` (base `develop` `86d66596`).

- Reutiliza o cadastro da publicação do evento, sem migration: logo
  (`EventPublication.logoAssetId`, apenas mídia `LOGO` ativa), e-mail público
  (`publicContactEmail`) e “Telefone / WhatsApp público” (`publicContactPhone`).
- `GET /public/events/:slug/exhibitor-identity` (sem sessão, com limite de
  acesso) devolve somente nome/slug do evento, logo (URL, largura, altura) e os
  canais válidos. Mesmo escopo do portal: evento com organização, fora de
  rascunho/cancelado e área do expositor ativa; caso contrário, 404. A imagem
  é servida por `.../exhibitor-identity/logo`, ligada ao evento do slug, com
  versão do arquivo na URL. Não expõe chave de armazenamento, dados
  cadastrais/fiscais nem contatos privados da organização.
- O CAEX recebe a logo dentro da resposta autenticada já existente
  (`identity.logo`), sem ampliar ACL.
- E-mail só vira `mailto:` com endereço simples (sem `?`, `&`, `%`, `#`).
  WhatsApp vira `https://wa.me/<dígitos>`; número sem DDI é tratado como
  brasileiro. Valor inválido ou ausente é ocultado; não há fallback para
  contatos da plataforma, do expositor ou de terceiros.
- Web: logo proporcional com o nome do evento como texto alternativo, ou o
  nome quando não houver logo/ou a imagem falhar; entrada do portal, escolha
  de empresa, barra do portal e barra do CAEX. Rodapé “Suporte do organizador”
  na entrada e na área autenticada; crédito “Plataforma Evolvia” separado.
- Troca de evento: componentes remontam por slug/evento, o payload só é aceito
  se o slug e a URL da logo forem do mesmo evento e respostas atrasadas são
  descartadas.

Limites: a página global `/login` não tem contexto de evento e continua
neutra; a entrada por evento é `/evento/:slug/expositor`. Montador continua
como modalidade de credencial. Contatos não foram acionados em testes.
Evidência local (PostgreSQL + API + Web, dois eventos fictícios) em
1280/390/320 px, com teclado alcançando os canais; não equivale a
homologação nem publicação.

## Preservação e validação

42 testes Web executados em Node24: recuperação de mutações, sessão/contexto,
impressão escapada, busca/ordens e menus. Três novos casos comprovam expansão
e reabertura do menu, acesso à outra seção e resumo nativo opcional sem
registro de visita automático. Harness JSX/hooks não equivale a navegador.
CI completo Node22/API/Web/ARM64, revisão do novo SHA e comparação visual
autenticada em320/390/desktop ainda necessários.

Mantém endpoints, persistência, identidade verificada, auditoria, cotas,
valores registrados e ações existentes. Sem senha compartilhada, campos de
credencial legada, cobrança ou integração externa nova. Idioma adicional,
impressão em lote e novas contratações continuam com dependências próprias.
Não chamar a reprodução de pixel-exata antes da comparação visual.

Rollback: reverter aplicação, sem migration nem remoção de dados.
Matriz/Master recebem marcos somente após evidência aplicável de integração,
CI, publicação e aceite, separadamente.
