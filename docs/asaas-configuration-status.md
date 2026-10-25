# Diagnóstico do Asaas em Integrações

Continuação do contrato #592 no PR #595. Consulta somente leitura no catálogo
autenticado do evento; a autorização da organização é verificada antes do
diagnóstico. Reutiliza o gateway já registrado no módulo da API. Nenhum secret,
URL configurada ou identificador de carteira aparece na resposta.

Estados: simulação local, configuração incompleta, produção não autorizada e
configuração localizada. O último estado verifica apenas os pré-requisitos do
gateway. Não certifica carteira/responsável financeiro do evento, credenciais
aceitas remotamente, criação de cobrança, pagamento ou webhook. O catálogo
mantém o status de disponibilidade dos conectores, sem promover Asaas a READY.

A tela descarta o diagnóstico anterior durante a troca de evento. Rollback por
reversão da aplicação; não há migration, alteração de configuração ou escrita
financeira. API antiga sem esse campo continua compatível com a tela nova.

Validação local Node24: cinco testes focais passaram, incluindo nove combinações
de ambiente/configuração, ausência de chamadas externas, minimização da resposta,
ACL antes da consulta e os três testes de resposta de checkout existentes.
Harness transpila TypeScript e substitui somente decorators Nest/módulos de DI;
não substitui o gateway ou a lógica do serviço. Não equivale a build Nest/Node22.
Novo teste React cobre troca de evento e mensagem sem alegar pagamento; execução
local indisponível por ausência de react-test-renderer. Exigir CI completo,
revisão do SHA, ensaio de interface e sandbox real separadamente.
