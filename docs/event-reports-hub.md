# Central de relatórios do evento

Direção de Berg em 24/10/2026. Base develop@86d66596bc5439a3f808afd9602ce8ef61d09a7b.
Contrato REPORTS-VISIBLE-20261024 na fila #571. Sem ampliação do escopo de dados.

A entrada Relatórios aparece no menu do evento e nos acessos rápidos.
A rota /eventos/{id}/painel/relatorios reutiliza PostEventReports e a API
GET /events/:eventId/registration-form/post-event-report. A rota pos-evento
continua funcionando e identifica a seção Relatórios.

Catálogo pesquisável por assunto: inscrições e reservas, categorias,
credenciamento por dia/horário, dimensões estatísticas da ficha,
pagamentos/categoria, produção científica, visitas e vendas. CSV selecionado,
CSV completo e impressão continuam usando as fontes e limites existentes.
A busca só filtra o catálogo; não altera o recorte exportado, que usa a
seleção explícita do relatório e os filtros aplicáveis.

Um bloco separado abre consultas existentes: participantes/presença,
avaliação, certificados, posto, trabalhos/avaliações/programação e
expositores/CAEX. Os links não afirmam novas métricas, exportações ou motores.
Credenciamento depende de attendanceEnabled; científico depende do DTO
scientific; expositor exige enabledModules incluindo exhibitor.
Perfis contextualizam o evento; capacidades persistidas decidem disponibilidade.

Dados agregados mantêm ACL OWNER/ADMIN/MANAGER na API e isolamento org/evento.
O operador não ganha acesso ao painel por esta entrada; cada destino mantém
sua autorização. Criar perfis delegados de relatórios é uma entrega própria,
com minimização nominal/financeira, sem habilitação implícita.

Sem migration ou alteração de API, secrets e infraestrutura. Reverter o lote
restaura a navegação anterior sem apagar relatórios nem registros. CI,
publicação e validação autenticada são evidências separadas.
