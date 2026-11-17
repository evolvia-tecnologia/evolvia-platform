# Layout único das entregas Evolvia — 06/10/2026

Direção do Product Owner: adaptar todas as telas já entregues ao layout do Cursor e integrar em develop após validação. Referência pública: PR #438; referência do painel: moldura EventWorkspace e tokens canônicos do develop@7d276513028adc94a677b1baae6075389b70fb02. A marca, cores, tipografia, espaçamentos e componentes existentes continuam sendo a fonte visual.

## Resultado e abrangência

A moldura do evento aplica uma única escala de títulos, controles, foco e tipografia às páginas nela incorporadas: divulgação, categorias/lotes, ficha, benefícios, inscrições, financeiro, científico, operação, transmissão, integrações e pós-evento. As páginas científicas incorporadas deixam de repetir a barra e de calcular a largura pela janela inteira. A avaliação administrativa passa a usar essa moldura. Relatórios e agenda usam as mesmas superfícies, hierarquia e controles. A estação pública segue a escala de títulos do produto. O resultado visual das avaliações reaproveita o código revisado da branch do PR #439, fechado sem merge, e o endpoint autorizado existente.

A vitrine, catálogo e página pública preservam o trabalho do Cursor no PR #438, consolidado neste PR #440 por solicitação de uniformizar todas as entregas. O #438 foi fechado como substituído, sem descarte do seu código. A home tem um h1 inicial na descoberta, mantendo a apresentação visual, e a coleção ativa aceita parâmetros de busca e paginação. A geometria e os códigos da etiqueta não recebem a escala de títulos de páginas; impressão física continua exigindo ensaio próprio.

## Contrato

Escopo: apresentação Web, moldura da avaliação e resultados já preparados. Sem alteração de API, banco, isolamento ou autenticação. Base inicial 7d2765 e base final 1e9009e (traduções #437 integradas); branch codex/cursor-layout-all-deliveries. Não aumenta Gates ou percentuais por aparência. Não autoriza main ou produção. HTTPS fica adiado até 95% de conclusão funcional comprovada conforme instrução do Product Owner.

Critérios: tipos/builds/CI do HEAD exato; navegador em 320/390/768/1440, com controles e texto ampliado; sem barras duplicadas, menu coberto ou rolagem horizontal da página. Testes com dados simulados não substituem ensaio autenticado em homologação. Migrations não se aplicam; ARM64 é validado pelo CI. Dados e médias da avaliação continuam sem NPS ou taxa inventada; comentários são dados dos participantes.

## Decisão e rollback

Escolhida a moldura compartilhada com complementos locais de CSS. Repetir layouts independentes permitiria nova divergência; regras globais de todo o site poderiam alterar credenciais, impressão e temas públicos. A moldura limita a uniformização ao painel e os módulos públicos usam regras locais. Reverter o commit de aplicação restaura a apresentação anterior, preservando dados e arquivos.

## Evidências locais

- 12 testes públicos e de fuso aprovados.
- Nove testes do modelo e dos handlers de resultados da avaliação aprovados, incluindo decimal brasileiro no CSV e estado sem respostas sem gráficos zerados.
- Nove telas em quatro larguras (36 combinações): central científica, categorias/lotes, ficha, inscrições, financeiro, posto, relatórios, configuração da avaliação e agenda. Sem overflow da página; navegação e acessibilidade no cabeçalho verificadas com dados/API simulados.
- Resultados de avaliação em quatro larguras, com carregamento, busca, paginação e CSV; quatro ensaios adicionais com texto ampliado em 150% e espaçamento maior. Componentes e CSS reais, respostas fictícias.
- CI completo e homologação devem ser registrados no SHA final. Estas evidências locais não substituem a autenticação real, aceite humano ou ensaio de impressora.

### Editores científicos incorporados

Os cinco editores existentes (estrutura, palestrantes, programação, submissões e avaliação) reutilizam EventWorkspace, sem repetir a barra superior. Estrutura e palestrantes ajustam o container à largura disponível; campos de formulário permitem redução sem cortar texto ampliado. Verificação Chromium de 20 combinações (cinco páginas × 320/390/768/1440 px), com componentes e CSS reais e API simulada, incluindo texto ampliado, menu e foco de acessibilidade: passou. Esta evidência não substitui ensaio autenticado nem fecha Gate funcional.

### Programação pública — Gate 9

A publicação de uma atividade é um estado explícito de exibição, separado da trava da fundação. O organizador só publica atividade revisada e sem conflitos bloqueantes; edição volta a rascunho e retira a atividade do público. A consulta pública limita evento/organização e só apresenta convidados ativos com convite confirmado, sem dados de contato ou links privados. Programação entra na moldura existente antes de inscrições e possui âncora no menu apenas quando há atividades públicas. O corte preserva o layout do Cursor, já integrado em #440/#441. O ensaio do Cursor com banco de duas organizações permanece evidência da branch; CI do HEAD integrado e homologação são exigidos separadamente antes de declarar Gate completo.
