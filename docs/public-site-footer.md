# Rodapé público Evolvia

## Resultado e escopo

O rodapé compacto da home passa a apresentar a Evolvia e organizar a navegação em contextos de evento, recursos e acessos. Implementação autorizada pelo fundador com referência visual externa; contrato de lançamento na issue #655 e reserva na #571/6700501404.

A referência informa somente a hierarquia: marca, grupos de links e faixa legal. Textos, composição, cores e componente são próprios da Evolvia. Nenhum dado, logo, selo, endereço, CNPJ, depoimento ou rede social de terceiros é reutilizado.

## Decisões

- Identidade em navy/azul pelos tokens existentes, contraste AA para textos e indicador de foco.
- Chamada institucional separada da navegação, com destino existente /cadastro.
- Contextos derivados de PUBLIC_EVENT_PROFILES e do filtro profile já aceito em /eventos; sem taxonomia ou catálogo paralelo.
- Recursos direcionam aos artigos de ajuda existentes. Não antecipam funcionalidades ainda não publicadas.
- Acessos existentes de organizador e participante; não introduz login ou autorização.
- Termos, privacidade e acessibilidade mantêm destinos existentes e o estado do documento de destino.
- Português (Brasil) é informação de idioma, não seletor de países/idiomas sem implementação.
- O footer fica fora do main da home, para expor o landmark contentinfo.
- Desktop em quatro colunas; tablet em duas; celular em uma, com alvos de pelo menos44px. Impresso não exibe o rodapé.
- Escopo inicial home, com componente reutilizável. Não inserir globalmente no RootLayout para evitar rodapé comercial dentro de painéis operacionais ou páginas de impressão.

Alternativas: mega-menu/rodapé extenso por tipo de evento aumentaria duplicação e densidade; adotada navegação por seis perfis canônicos e recursos existentes. Selos/redes/preços/contato comercial entram somente quando houver dados e destinos oficiais aprovados.

## Segurança e compatibilidade

Sem chamadas de API novas, captura de dados, cookies, scripts, dependências, acesso autenticado, schema ou migrations. Os links da navegação pública não concedem autorização; backend permanece autoridade. Preserva prestart do wizard, descoberta de eventos e área participante. Compatibilidade Ubuntu/ARM64 depende somente da aplicação existente.

## Validação

Teste public-site-footer.test.mjs renderiza o componente com ReactDOM SSR, substituindo somente Next Link por âncora e CSS Modules por nomes estáveis; confere destinos contra rotas/artigos reais, perfis canônicos, nomes dos grupos, estabilidade do HTML, estrutura main/footer e contraste dos tokens.
Regressões home-event-profiles e public-discovery preservam prestart, catálogo e links após extrair o footer. A atualização do teste de descoberta acompanha a composição real do componente; não remove a verificação dos links jurídicos/ajuda/acessibilidade e de reflow.

Após a primeira execução do CI apontar duas asserções presas ao footer antigo, os testes legal-foundation e public-text-spacing foram ajustados para validar a nova composição e o novo CSS, preservando requisitos de acesso aos documentos, quebra de linha e alvo44px. O novo CSS foi incluído também na proteção contra truncagem de texto.

No ensaio local ampliado:28testes passaram em5suítes. Tipos/build completos e testes globais ficam no CI do SHA do PR. Browser local não executado: instalação Chromium retornou arquivo de download inválido. Não confundir SSR/contraste calculado com prova visual, Axe, teclado ou reflow em navegador. Esses itens permanecem na validação runtime aplicável do CI e revisão visual do candidato.

## Correção da prova de árvore acessível

O CI85164c69 aprovou hidratação, acessibilidade runtime e espaçamento, mas a prova AX interpretou o título do footer como primeiro título. O artefato13555783823 mostrou os títulos do footer antes dos títulos do main apesar da composição DOM correta: a coleção plana de nós CDP veio em ordem de profundidade.

A prova agora percorre childIds a partir de RootWebArea em ordem de leitura e preserva nós desconectados/fixtures, sem descartar controles. Os critérios continuam exigindo h1 inicial e recusando saltos/hierarquia inválida.15testes inline passaram;2regressões novas detectam retorno à ordem plana (mutação aplicada,2falhas esperadas). Não alteramos o título do footer para h1 nem relaxamos a validação.

## Implantação e rollback

Integração por PR em develop com CI e revisão; disponibilidade requer prova do SHA publicado. Nenhuma promoção main/produção. Reverter o commit restaura rodapé e estilos anteriores; nenhum dado é alterado. Não cria critério novo nem avanço na matriz93/11.
