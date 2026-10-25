# Benchmark Mitte — expositor e serviços

Inspeção autenticada de leitura em 24/10/2026. Contrato #592; candidato #593.
Sem alterar cadastro, cotas, pedidos, formulários ou pagamentos da referência.
Este registro não contém credenciais, dados da empresa ou listagens pessoais.

## Evidência diretamente observada

1. Administração moderna no evento selecionado:
   https://mitte.tech/sig-express/sis/adminv2/eve_resumo_principal.asp
   Painel agrupa números do evento, curva de inscrições, pagamentos, categorias,
   distribuição geográfica e idade. Busca global alterna inscrição/trabalho/expositor.
2. Menu Expositor & Serviços separado dos demais módulos:
   Cadastros (produtos, configuração de formulários, arquivos);
   Consultas (expositores/prestadores, credenciais de cada público, pagamentos);
   Relatórios (pedidos de expositores e prestadores).
3. Consulta:
   https://mitte.tech/sig-express/sis/adminv2/exp_pesquisar_expositor.asp
   Filtro por empresa, nome, e-mail, CNPJ, inscrição, cidade e UF; tipo expositor
   ou prestador. Texto opcional, tabela ordenável, seleção e paginação,
   busca dentro do resultado. Ações observadas: log, compras e editar.
   A busca solicitada localizou a empresa de teste. Não copiar credenciais
   expostas na referência para DTOs, tabelas ou documentação do Evolvia.
4. Editar abriu uma ficha no portal legado, em nova aba. A ficha reúne:
   cotas separadas de expositor/serviço/montador; nacionalidade; documento;
   dados de acesso; razão social/nome fantasia; estande e metragem;
   contato no local; endereço nacional/internacional; telefone;
   observação e logomarca. Menu lateral: dados cadastrais, formulários,
   pagamentos, downloads e coletor digital. Link de idioma disponível.
   Aviso observado: envio de logo pode perder alterações não salvas.
5. Portal moderno:
   https://mitte.tech/sig-express/sis/expositorv2/index.asp?eveId=40
   Login separa expositor, prestador e representante; oferece dois idiomas.
   Conteúdo autenticado inspecionado posteriormente, conforme detalhamento abaixo.

## Portal moderno — inspeção autenticada concluída nas áreas visíveis

- Menu superior persistente com contexto de evento/empresa, idioma, conta e
  Dados Cadastrais, Representante, Formulários, Pagamentos e Downloads.
- Dashboard identifica empresa, último acesso, editar cadastro e acompanhamento;
  a empresa de teste apresentou acompanhamento vazio.
- Cadastro agrupa dados empresariais, contato no local, endereço e logomarca.
  Mostra nacionalidade, estande/metragem e prévia/status do logo. Não foi salvo.
- Representantes têm cadastro nome/cargo/e-mail, credencial própria/confirmada,
  regra de senha8caracteres com letras/números e lista editar/excluir.
  Não foi criada conta nem acionada exibição de senha.
- Formulários: progresso geral e filtros Acessado/Acesso Pendente/Vencido/Todos;
  cartões com título, obrigatoriedade, prazo e estado. Foram observados 12 itens:
  credencial de expositor, convite, limpeza de montagem/desmontagem, credencial
  de serviço, extintor, energia, hidráulica/pia, limpeza de estande, responsabilidade,
  segurança, cadastro da montadora e coletor de leads. Todos estavam vencidos.
  Clicar no cartão de credencial não abriu seu conteúdo. Não contornar prazo.
- Pagamentos: tabela com número, descrição de produtos, vencimento, valor e
  ação de recibo ou Asaas por linha; pesquisa, ordenação e paginação.
  Não foram emitidos recibos nem iniciados checkouts. Não comprova gateway.
- Downloads: estado vazio observado. Sem arquivo disponível para teste.

## CAEX moderno — inspeção autenticada

Entrada verificada: https://mitte.tech/sig-express/sis/caexv2/starter.asp
Menu: Início, Expositores, Credenciais de Expositores, Prestadores e
Credenciais de Prestadores. Perfil exibido como operador.

- Início tem cartões separados de expositor/prestador com contagens de
  credenciais, credenciados, pendentes, progresso e acessos à consulta.
- Empresas: busca, paginação, ordenação; razão social, nome fantasia e documento
  mascarado. Ações de adicionar, editar, excluir e imprimir lote observadas.
  Busca solicitada localizou a empresa de teste. Nenhuma exclusão/impressão.
- Ficha da empresa organiza Expositor, Credenciais e Produtos em abas.
- Cadastro reúne documento/nacionalidade, empresa e contato/endereço/telefone.
- Credenciais mostram cotas separadas de expositor, serviço e montador:
  liberadas, cadastradas, disponíveis e barra de utilização. Lista por empresa
  com tipo/nome/cargo, data de credenciamento e impressão em lote. Modal editar
  abriu: tipo, nome fantasia, nacionalidade, documento, nome completo/crachá,
  cargo, documento complementar/emissor e telefones. Modal foi cancelado.
- Produtos: descrição/unidade/preço/quantidade; forma e status do pagamento,
  observação e processamento explícito. Formas vistas: boleto, cartão, cheque,
  isento, depósito, dinheiro, DOC e empenho. Estados: pago/não pago/isento/cancelado.
  Histórico lista compras e itens, total registrado, estado e ações de recibo
  ou exclusão. Não processar compra real como parte do benchmark.
- Valores atuais de catálogo e totais de compras antigas diferem na tela;
  a causa não foi investigada. Decisão Evolvia: mostrar preço do pedido e
  separar catálogo atual, sem substituir snapshot histórico ao consultar.
- Credenciais gerais: filtro por nome e tipo; busca na tabela e paginação;
  empresa, pessoa/nome de crachá/cargo, credenciamento e impressão em lote.
  Ações editar/excluir/imprimir e estornar baixa vistas, sem execução.
- Prestadores: mesma estrutura de empresas; credenciais limitam tipo a
  montador/serviço. Só foram lidos cabeçalhos/filtros/ações dessa listagem.

## Cobertura ainda pendente

A administração retornou ao login ao continuar a navegação; causa não
atribuída. Configuração administrativa detalhada de formulários/produtos/arquivos
não foi concluída. Formulários externos vencidos impediram percorrer seus
campos internos. Não houve teste de gravação/compra/gateway/recibo/impressão,
validação de ACL do sistema referência, comparação em todos os idiomas,
mobile ou dispositivos físicos. Acesso aos três ambientes não significa
paridade integral nem prova desses fluxos.

## Decisões aplicáveis ao Evolvia

- Manter Expositor em bloco próprio e agrupar configuração, consultas e
  acompanhamento, com cores/tipografia do Evolvia.
- Incorporar já ao #593 seletor de campo de busca: empresa, contato, e-mail,
  documento, estande, cidade e UF. Consultas no servidor, allowlist explícita,
  escopo organização/evento e sem ampliar os dados pessoais retornados.
- Priorizar ficha unificada da empresa: credenciais/cotas, formulários e
  estados observados, pedidos, documentos e histórico. O modelo já possui
  vários desses dados; não criar duplicatas.
- Preservar edição não salva ao enviar mídia; prévia e upload devem ser
  independentes de salvar cadastro. Não reproduzir o risco observado.
- Acesso externo deve manter identidade verificada e representantes
  revogáveis; não reproduzir senha compartilhada nem expor senha em tabelas.
- Não confundir abertura de documento com aceite, pedido com pagamento ou
  impressão pelo navegador com impressão física comprovada.
- Reutilizar #591 para relatórios. Preservar filtros/prazos e separação de
  públicos, sem apresentar abertura como preenchimento/aprovação.

## Critério de comparação final

Organizador configura → empresa preenche/contrata/credencia →
CAEX busca empresa e atende → organizador acompanha estados/histórico.
Registrar por passo: observado na Mitte, existente no Evolvia, lacuna, PR,
teste/CI/publicação/ensaio. Não concluir paridade enquanto houver áreas
autenticadas não inspecionadas.

## Delta aplicado no candidato #593

Busca servidor por campo e perfil da empresa receberam abas Credenciais,
Formulários e Pedidos/serviços. Cartões de cota usam contagens completas por
modalidade, não a página visível; não geram cotas pagas automaticamente.
Consulta paginada de pedidos mostra preço unitário e total do snapshot gravado
no pedido. Nomes/unidades de produto são descritivos atuais; a plataforma ainda
não guarda snapshot desses rótulos. Não representa conciliação nem comprovante.

Próximos deltas: portal com painel de pendências/formulários por público e
prazos, compra de adicionais com gateway canônico, pagamentos/recibos auditáveis
e integração da ACL restrita. Esses deltas ainda não estão entregues.
