import type { PostEventReport } from './post-event-report';

export type ReportModuleLink = { id: string; title: string; description: string; group: string; href: string };

// These are existing module screens, not new exports or aggregate metrics.
// API permissions remain mandatory on each destination.
export function eventReportLinks(report: PostEventReport): ReportModuleLink[] {
  const base = '/eventos/' + encodeURIComponent(report.event.id);
  const links: ReportModuleLink[] = [
    { id: 'people', group: 'Inscrições e participantes', title: 'Inscritos e presença', description: 'Consultar os registros individuais autorizados e as opções de exportação da lista.', href: base + '/painel/inscricoes' },
    { id: 'evaluation', group: 'Avaliação e pós-evento', title: 'Respostas da avaliação', description: 'Consultar as respostas coletadas e exportá-las na avaliação do evento.', href: base + '/painel/avaliacao' },
    { id: 'certificates', group: 'Avaliação e pós-evento', title: 'Certificados emitidos', description: 'Consultar emissões e elegibilidade na gestão de certificados.', href: base + '/painel/certificados' },
  ];
  if (report.attendanceEnabled) links.push({ id: 'desk', group: 'Credenciamento e operação', title: 'Operação e material', description: 'Abrir o posto e suas consultas de presença e entrega de material.', href: base + '/painel/check-in' });
  if (report.scientific) links.push(
    { id: 'submissions', group: 'Científico', title: 'Trabalhos e autores', description: 'Consultar trabalhos por situação nos filtros da gestão científica.', href: base + '/cientifico/trabalhos' },
    { id: 'reviews', group: 'Científico', title: 'Avaliações e decisões', description: 'Consultar pareceres e decisões com as permissões do módulo.', href: base + '/cientifico/avaliacao' },
    { id: 'program', group: 'Científico', title: 'Programação e atividades', description: 'Consultar sessões, locais, horários e trabalhos vinculados.', href: base + '/cientifico/grade' },
  );
  if ((report.enabledModules ?? []).includes('exhibitor')) links.push(
    { id: 'exhibitors', group: 'Expositores e serviços', title: 'Empresas, credenciais e pedidos', description: 'Consultar os cadastros e usar a aba Exportar para separar pedidos de expositores e prestadores.', href: base + '/painel/expositores' },
    { id: 'caex', group: 'Expositores e serviços', title: 'Credenciamento do expositor e prestador', description: 'Abrir as consultas operacionais do CAEX deste evento.', href: base + '/painel/caex' },
  );
  return links;
}
