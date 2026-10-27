# CAEX — atendimento por empresa

Pedido aprovado em 24/10/2026, contrato #592. Base develop
`86d66596bc5439a3f808afd9602ce8ef61d09a7b`. Continua #537 integrado.

## Fluxo implementado no candidato

CAEX → Expositores ou Prestadores → buscar por razão social, nome fantasia,
documento ou estande → Abrir empresa → consultar cotas, credenciais e formulários.
Abas da empresa separam Credenciais, Formulários e Pedidos/serviços. Cartões
de cotas mostram liberadas/cadastradas/disponíveis e excedente por modalidade,
com contagem completa. Pedidos paginados usam preço gravado na contratação,
sem confundir confirmação operacional com pagamento.
Busca no servidor, fora do recorte da home. Páginas de 50 empresas, 100 credenciais
e 50 formulários permitem percorrer todos os registros. Voltar preserva a busca.

Autenticação, papel administrativo existente, capability de expositor e escopo
organização/evento no servidor são obrigatórios. companyId é revalidado antes
das consultas. DTOs de empresas/credenciais não retornam documento, telefone ou e-mail.
Consulta de pedidos mostra valores registrados, sob o mesmo papel administrativo.
Não concede privilégios ao operador; depende da ACL granular #367/#368.

Formulários ativos e inativos destinados ao tipo da empresa mostram:
abertura registrada para documentos; quantidade de credenciais da modalidade
(o modelo não liga cada credencial ao formId); pedidos por estado operacional.
Não representam aceite, aprovação de formulário ou pagamento. Prazo e
obrigatoriedade aparecem separados. Impressão é pelo navegador; não marca
impressão física nem altera baixa.

Respostas antigas e payload inválido são descartados. Erro sanitizado permite
nova consulta GET. Preserva escape HTML e ciclo afterprint da impressão.

## Verificação

9 testes API do serviço real transpilado com delegates controlados: escopo,
paginação, entrada inválida/allowlist, empresa estrangeira, ACL, cotas completas
e preço do pedido. 9 Web de hooks/JSX: busca/retorno, resposta tardia/inválida,
navegação, pedidos e recuperação GET. 12 testes existentes de recuperação/impressão
preservados; total 30.
Tipos isolados do serviço passam com Prisma Client gerado.
Build completo, CI Node22/ARM64, PostgreSQL real, React DOM, revisão e ensaio
autenticado/mobile/acessibilidade humana continuam pendentes.

Rollback: reversão da aplicação; sem migration nem alteração de dados.
Draft não pontua Gates.

## Lotes seguintes aprovados — #592

Integrações: configuração/diagnóstico Asaas conectado ao gateway existente,
checkout/webhook sandbox positivo/negativo/repetição/valor divergente.
Cupom100%/isenção cobre jornada gratuita, sem comprovar gateway.
Documentação oficial consultada:
https://docs.asaas.com/reference/about-this-doc e
https://docs.asaas.com/docs/checkout-events.
Demais conectores exigem adaptador, credenciais e homologação por provedor.
Não promover PLANNED apenas por mudança de rótulo.

Certificados: fonte/cor/tamanho por campo em Web/PDF, snapshot persistente da
emissão, código aleatório/link no rodapé, busca e resultado com nome/evento/data
e miniatura compacta da emissão. Reutilizar token aleatório/consulta/PDF existentes.
Hoje participação consulta texto/arte vigentes; não garante fidelidade histórica.
Identificar legados sem snapshot, sem fabricar cópia histórica. Não derivar
token público de documento pessoal. Benchmark autenticado dos três ambientes
Mitte registrado em benchmark-mitte-expositor-2026-10-24.md, com limitações explícitas.
