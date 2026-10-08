import { postEventReportCsv, reportCsvCell, reportPercent, submissionStatusLabels, type PostEventReport } from './post-event-report';

export type ReportOption = { id: string; title: string; description: string; group: string };
export function postEventReportOptions(report: PostEventReport): ReportOption[] {
  const options: ReportOption[] = [
    { id: 'all', title: 'Visão geral', description: 'Resumo e todos os relatórios disponíveis.', group: 'Visão geral' },
    { id: 'registration', title: 'Inscrições por categoria', description: report.attendanceEnabled ? 'Inscrições confirmadas e credenciamento por categoria.' : 'Inscrições confirmadas por categoria.', group: 'Inscrições' },
    { id: 'registration-status', title: 'Situação das inscrições e reservas', description: 'Confirmadas, pendentes, expiradas e canceladas.', group: 'Inscrições' },
  ];
  if (report.attendanceEnabled) options.push(
    { id: 'attendance', title: 'Resumo do credenciamento', description: 'Primeiro credenciamento por dia e horário.', group: 'Credenciamento' },
    { id: 'attendance-day', title: 'Credenciados por dia', description: 'Data do primeiro credenciamento de cada inscrição.', group: 'Credenciamento' },
    { id: 'attendance-hour', title: 'Credenciados por horário', description: 'Primeiro credenciamento por hora, com filtro de dia.', group: 'Credenciamento' },
  );
  if (report.fields.length) options.push({ id: 'fields', title: 'Perfil dos participantes', description: 'Todos os campos estatísticos habilitados na ficha.', group: 'Perfil dos participantes' });
  for (const field of report.fields) options.push({ id: 'field:' + field.code, title: field.label, description: report.attendanceEnabled ? 'Respostas e credenciamento neste campo.' : 'Distribuição das respostas neste campo.', group: 'Perfil dos participantes' });
  if (report.payment) {
    options.push({ id: 'payment', title: 'Resumo de pagamentos', description: 'Valores e situações dos pagamentos registrados.', group: 'Financeiro' });
    if (Array.isArray(report.payment.categories)) options.push({ id: 'payment-category', title: 'Pagamentos por categoria', description: 'Quantidades e valores das inscrições confirmadas.', group: 'Financeiro' });
  }
  if (report.scientific) options.push({ id: 'scientific', title: 'Situação dos trabalhos científicos', description: 'Trabalhos agrupados pela situação registrada.', group: 'Científico' });
  options.push(
    { id: 'visits', title: 'Visitas da página', description: 'Aberturas agregadas da página pública, sem identificar visitantes.', group: 'Resultados' },
    { id: 'sales', title: 'Vendas no período', description: 'Checkouts pagos por dia e valor recebido.', group: 'Resultados' },
  );
  return options;
}

export function selectedReportCsv(report: PostEventReport, id: string, day = 'all'): string {
  const option = postEventReportOptions(report).find((item) => item.id === id);
  if (!option) throw new Error('Este relatório não está disponível no evento.');
  if (id === 'all') return postEventReportCsv(report);
  const rows: unknown[][] = [
    ['Evento', report.event.name], ['Relatório selecionado', option.title], ['Consulta em UTC', report.generatedAt],
    ['Fuso do evento', report.event.timeZone], ['Revisão da ficha', report.formRevision],
  ];
  const distribution = (title: string, buckets: PostEventReport['categories'], eligible: number, present: number) => {
    rows.push(['Relatório', 'Grupo', 'Inscrições confirmadas', 'Credenciados', '% inscritos elegíveis', '% credenciados elegíveis']);
    for (const row of buckets ?? []) rows.push([title, row.label, row.registered, report.attendanceEnabled ? row.present : 'Não habilitado', reportPercent(row.registered, eligible), report.attendanceEnabled ? reportPercent(row.present, present) : 'Não habilitado']);
    rows.push([title, 'População elegível', eligible, report.attendanceEnabled ? present : 'Não habilitado']);
  };
  const counted = (title: string, buckets: Array<{label: string; count: number}>) => {
    rows.push(['Relatório', 'Grupo', 'Quantidade', 'Percentual']);
    const total = buckets.reduce((sum, row) => sum + row.count, 0);
    for (const row of buckets ?? []) rows.push([title, row.label, row.count, reportPercent(row.count, total)]);
    rows.push([title, 'Total do recorte', total]);
  };
  if (id === 'registration') distribution(option.title, report.categories, report.registration.confirmed, report.registration.present);
  if (id === 'registration-status') counted(option.title, [
    {label:'Confirmadas', count:report.registration.confirmed}, {label:'Reservas pendentes', count:report.registration.pending},
    {label:'Reservas expiradas', count:report.registration.expired}, {label:'Canceladas', count:report.registration.cancelled},
  ]);
  if (id.startsWith('attendance')) {
    rows.push(['Dia selecionado', day === 'all' ? 'Todos os dias com registro' : day], ['Critério', 'Cada inscrição conta uma vez, no primeiro credenciamento. Não representa fluxo de entradas e saídas.']);
    if (id !== 'attendance-hour') counted('Credenciados por dia', (report.firstCheckInByDay ?? []).filter((row) => day === 'all' || row.label === day));
    if (id !== 'attendance-day') counted('Credenciados por horário', (report.firstCheckInByHour ?? []).filter((row) => day === 'all' || row.label.startsWith(day + ' ')));
  }
  if (id === 'fields' || id.startsWith('field:')) for (const field of report.fields.filter((field) => id === 'fields' || id === 'field:' + field.code)) {
    rows.push(['Campo', field.label], ['Não coletados nesta versão', field.notCollected], ['Não se aplica', field.notApplicable]);
    if (field.code === 'birth_date') rows.push(['Data de referência da idade', report.ageReferenceDay ?? 'Data não definida']);
    if (field.multiple) rows.push(['Critério', 'Múltiplas escolhas: os percentuais podem ultrapassar 100%.']);
    distribution(field.label, field.buckets, field.eligible, field.presentEligible);
  }
  if (id === 'payment' && report.payment) {
    const p = report.payment;
    counted(option.title, [{label:'Pagas',count:p.paid},{label:'Isentas',count:p.exempt},{label:'Em revisão',count:p.review},{label:'Sem confirmação de pagamento',count:p.unverified}]);
    rows.push(['Valor recebido em centavos',p.receivedCents],['Valor previsto em centavos',p.confirmedPriceCents],['Critério','Somente inscrições confirmadas. Valor recebido é o valor de pagamentos confirmados no checkout; não representa caixa presencial ou receita líquida.']);
  }
  if (id === 'payment-category' && report.payment?.categories) {
    rows.push(['Categoria','Confirmadas','Pagas','Isentas','Em revisão','Sem confirmação de pagamento','Valor recebido em centavos','Valor previsto em centavos']);
    for (const row of report.payment.categories) rows.push([row.label,row.confirmed,row.paid,row.exempt,row.review,row.unverified,row.receivedCents,row.confirmedPriceCents]);
    rows.push(['Critério','Somente inscrições confirmadas. Valores recebidos e preços previstos são distintos; não representam caixa presencial ou receita líquida.']);
  }
  if (id === 'visits') {
    counted(option.title, report.visits?.byDay ?? []);
    rows.push(['Total', report.visits?.total ?? 0], ['Critério', 'Quantidade agregada de aberturas da página pública. Não identifica pessoa, navegador, IP nem origem.']);
  }
  if (id === 'sales') {
    rows.push(['Dia', 'Vendas', 'Valor recebido em centavos']);
    for (const row of report.salesByDay ?? []) rows.push([row.label, row.sales, row.receivedCents]);
    rows.push(['Critério', 'Checkout pago pela data de confirmação, no fuso do evento. Não representa caixa presencial nem receita líquida.']);
  }
  if (id === 'scientific' && report.scientific) {
    counted(option.title, report.scientific.submissions.map((row) => ({label:submissionStatusLabels[row.status] ?? row.status,count:row.count})));
    rows.push(['Atividades planejadas',report.scientific.plannedActivities ?? 0],['Critério','Aceite e planejamento não comprovam apresentação ou presença.']);
  }
  return '\uFEFF' + rows.map((row) => row.map(reportCsvCell).join(';')).join('\r\n') + '\r\n';
}
