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
   Conteúdo autenticado desse portal ainda NÃO inspecionado.

## Cobertura ainda pendente

Ao continuar a navegação, a administração retornou ao login. Causa não
determinada. A sessão administrativa não comprova acesso ao portal moderno
nem ao CAEX. O preenchimento seguro do portal retornou locator_invalid;
é necessário autenticar essa área pelo navegador disponibilizado.
Não inferir funções internas por aparência do login.
Configuração detalhada de formulários/produtos/arquivos, pagamentos, logs,
CAEX moderno e todo ciclo externo continuam pendentes de inspeção.

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
- Idioma e formulários por público entram na comparação detalhada após
  inspeção do portal autenticado. Relatórios devem reutilizar #591.

## Critério de comparação final

Organizador configura → empresa preenche/contrata/credencia →
CAEX busca empresa e atende → organizador acompanha estados/histórico.
Registrar por passo: observado na Mitte, existente no Evolvia, lacuna, PR,
teste/CI/publicação/ensaio. Não concluir paridade enquanto houver áreas
autenticadas não inspecionadas.
