# Reutilização segura de evento

A rota autenticada `POST /events/:eventId/reuse` cria um novo evento em `SETUP` a partir da fundação estrutural de outro evento da mesma organização. Exige papel de editor, confirmação literal do nome de origem e `Idempotency-Key`.

São copiados apenas perfil, formato, modo de inscrição, áreas, público estimado, datas novas, fuso, local opcional e códigos de capabilities. Configurações JSON, participantes, inscrições, pagamentos, trabalhos, avaliações, pessoas, arquivos, publicação, check-in, credenciais, integrações e dados financeiros nunca são copiados.

A operação usa lock transacional PostgreSQL por organização, usuário e hash da chave. A auditoria guarda somente hashes e identificadores mínimos e funciona como ledger para replay; a mesma chave com payload diferente retorna conflito.

## Rollback

Remover controller/service/policy, rota e componentes. Não há migration. Eventos já criados permanecem rascunhos independentes e auditados.

## Validação

- build e testes unitários de API e web;
- autorização/IDOR entre organização e evento;
- data futura, intervalo e timezone IANA;
- replay idempotente e conflito de chave;
- inspeção da lista explícita de exclusões;
- teclado, responsividade, foco visível e textos PT-BR.

## Datas no fuso do evento

Os campos de início e término representam a hora local do evento, independentemente do fuso do navegador. O preenchimento usa o fuso salvo no evento; se estiver ausente, usa America/Sao_Paulo, sem inferir o fuso do operador. Ao enviar, a interface resolve cada horário para um instante UTC, valida o intervalo e mantém o fuso no pedido. Alterar o fuso preserva a hora digitada e muda o instante correspondente.

Fuso inválido, data impossível e horários inexistentes ou ambíguos em transições de horário são recusados com orientação para escolher outro horário. Não há fallback silencioso para o fuso do navegador. Testes cobrem São Paulo, UTC, Nepal, Nova York e Lord Howe, incluindo deslocamentos fracionários e transições de meia hora.

Os hashes de replay mantêm o contrato anterior: objetos são montados explicitamente com chaves em ordem fixa pelo serviço, sem depender da ordem de propriedades do pedido. Alterar para arrays mudaria hashes de operações existentes; não é necessário para eliminar os achados de timezone.
