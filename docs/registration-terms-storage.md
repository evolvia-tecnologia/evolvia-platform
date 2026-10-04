# Termos PDF — armazenamento e recuperação operacional

Issue #416, corte de armazenamento. Base verificada: develop@33ae23b10082faf218fbf7483ea947db162c5743.

EVOLVIA_TERMS_ROOT continua sendo a configuração explícita do volume. Sem ela, o diretório é data/registration-terms sob o diretório de execução. No container com WORKDIR /app, o destino permanece /app/data/registration-terms; não mover nem apagar o volume existente.

O upload grava em temporário exclusivo, fecha o arquivo e renomeia atomicamente. Falha de armazenamento responde HTTP 503 com orientação em português, sem divulgar caminho interno. Somente o temporário criado por essa tentativa é removido; arquivos anteriores e registros de aceite permanecem intactos. A autorização e o versionamento do serviço existente continuam aplicáveis.

Testes usam filesystem real em diretórios temporários e cobrem gravação/leitura/rollback, padrão local, volume configurado inválido, falha de rename e traversal. O administrador ainda deve assegurar montagem/permissão do volume. Não ampliar privilégios nem conceder chmod global.

Pendências da issue #416: checklist exigir termos antes da reserva pública e anexação recuperável após publicação com lock/versionamento/auditoria; programação pública canônica, link da atividade, foto/horários, mobile e textos da EVA. Este corte não comprova essas entregas nem encerra Gates 1/2/9.

Rollback: reverter o código, mantendo volume, PDFs, tabelas e aceites. Sem migration neste corte. CI Node22/ARM64 e ensaio no host ainda devem ser comprovados antes de declarar homologação concluída.
