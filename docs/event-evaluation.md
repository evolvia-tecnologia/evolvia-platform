# Gate 11 — Avaliação do evento

## Resumo visual por pergunta

A área administrativa pode carregar explicitamente os resultados pelo endpoint existente de respostas do evento. As perguntas de nota mostram média, quantidade de notas válidas e distribuição de 1 a 5; valores ausentes e inválidos ficam separados do cálculo. Perguntas de texto têm busca sem distinção de acentos e páginas de dez comentários, sem incluir identidade do participante.

O CSV de resumo contém os agregados por pergunta, sem os corpos dos comentários. A exportação detalhada de respostas continua no fluxo próprio. Células de texto da exportação são protegidas contra interpretação como fórmula em planilhas. Trocar o evento cancela a consulta anterior e reinicia o estado; atualizar limpa a consulta anterior antes do novo carregamento, inclusive em caso de falha.

### Exportação dos comentários selecionados

Em Resultados da avaliação, escolher uma pergunta de texto e buscar uma palavra
habilita **Exportar comentários filtrados CSV**. O arquivo contém todos os
comentários correspondentes daquela pergunta nas respostas já carregadas,
incluindo todas as páginas, com título, pergunta, busca e contagem do recorte.
A busca usa a mesma normalização de acentos e maiúsculas da tela. Sem busca,
exporta os comentários da pergunta selecionada; sem correspondências, o botão
fica desabilitado. Notas, respostas de outras perguntas e identificadores dos
participantes não entram. O texto fornecido pelo participante é preservado e
pode conter dados pessoais; isso não torna o arquivo anônimo.

CSV UTF-8 com BOM, ponto e vírgula, aspas escapadas e proteção de fórmulas em
todas as células, inclusive título, rótulo e busca. Não faz nova chamada à API,
não persiste arquivo no servidor nem altera respostas. Reutiliza o acesso
administrativo existente, sem migration. Rollback: reverter o botão e o
exportador, preservando os dados. Testes cobrem todas as páginas, pergunta e
busca, ausência de IDs, fórmulas, valores inválidos e download/falha na UI.

O endpoint atual retorna o conjunto completo de respostas: a paginação de comentários acontece na interface e não estabelece capacidade para grandes volumes. Não há NPS nem taxa de resposta dos inscritos; cada média representa somente as notas válidas enviadas àquela pergunta.

## Resultado do corte

O organizador configura um questionário curto (1–20 perguntas) e decide explicitamente quando ele está aberto. Uma inscrição confirmada responde uma vez pela mesma sessão já usada na área do participante. O organizador consulta as respostas do próprio evento para exportação pela interface.

Perguntas podem ser nota de 1 a 5 ou texto de até 1.000 caracteres. Perguntas obrigatórias são validadas no servidor.

## Segurança e LGPD

- toda configuração e leitura administrativa exige papel editor na organização;
- toda consulta aplica `organizationId + eventId`;
- a resposta exige sessão de inscrição confirmada;
- uma inscrição gera no máximo uma resposta;
- a repetição da mesma `Idempotency-Key` e conteúdo é segura; reutilização com conteúdo diferente é negada;
- a resposta administrativa não inclui documento, e-mail nem histórico de outros eventos;
- auditoria registra ator organizador na configuração e somente contagem de perguntas no envio.

## Rollback

As tabelas são aditivas. O rollback operacional desliga a avaliação e reverte aplicação/UI, preservando respostas já coletadas. Remoção destrutiva não faz parte deste corte.

## Validação antes de integrar

Prisma validate/generate, build e testes da API, migration em PostgreSQL descartável e repetição idempotente, Web typecheck/build/testes, ARM64 e revisão do HEAD exato. Homologação deve provar: inscrição confirmada, negativa para inscrição não confirmada, resposta, replay, exportação isolada e teclado/foco.

## Consistência entre configuração e primeira resposta

Configurar e responder usam isolamento Serializable. A leitura da abertura/perguntas, validação da resposta, escrita e auditoria participam do mesmo snapshot. Isso impede confirmar uma resposta incompatível durante troca/fechamento do questionário; o teste de ausência de respostas da configuração também participa do snapshot. P2034 retorna 409 com orientação para atualizar e tentar novamente, sem retry silencioso.

Sete regressões locais executam o serviço real recompilado com banco substituído: snapshot da resposta, avaliação fechada, pergunta retirada, imutabilidade após resposta, fechamento permitido, conflito de configuração e de resposta. Essas regressões não provam concorrência PostgreSQL real; CI e ensaio operacional continuam necessários.

## Retomada do envio no navegador

A interface mantém a chave de idempotência e o corpo da tentativa enquanto o conteúdo não mudar. Falha de rede ou retorno inválido não descartam essa tentativa: reenviar permite confirmar por replay uma resposta já gravada. Conteúdo alterado recebe nova chave e continua sujeito à resposta única no servidor. Uma trava síncrona também impede dois envios antes de o React renderizar o estado ocupado. O estado fica em memória da sessão do componente; trocar evento/identidade ou recarregar descarta a tentativa, e a consulta do questionário recupera a confirmação gravada.

Quatro regressões executam os handlers reais da interface transpilada, substituindo React/fetch: duplo envio, retorno perdido/replay, correção de conteúdo e sucesso com JSON inválido. Com as três verificações existentes de UI, 7/7 passaram localmente. Não substituem CI Node22 nem ensaio em homologação.
