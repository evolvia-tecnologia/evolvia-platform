# Gate 11 — Avaliação do evento

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
