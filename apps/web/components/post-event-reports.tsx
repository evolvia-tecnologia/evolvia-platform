'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getToken } from '../lib/api';
import { formatEventDate } from '../lib/event-time-zone';
import { postEventReportCsv, reportPercent, submissionStatusLabels, type PostEventBucket, type PostEventReport } from '../lib/post-event-report';
import styles from './post-event-reports.module.css';
import PostEventOverview from './post-event-overview';
import ReportCatalog from './post-event-report-catalog';
import { postEventReportOptions, selectedReportCsv } from '../lib/post-event-report-options';

const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

function Distribution({ title, buckets = [], registered, present, attendanceEnabled }: { title: string; buckets: PostEventBucket[]; registered: number; present: number; attendanceEnabled: boolean }) {
  return <div className={styles.scroll}><table className={styles.table}>
    <caption>{title}</caption>
    <thead><tr><th scope="col">Grupo</th><th scope="col">Inscritos</th><th scope="col">% inscritos</th>{attendanceEnabled && <><th scope="col">Presentes</th><th scope="col">% presentes</th></>}</tr></thead>
    <tbody>{(buckets ?? []).length ? (buckets ?? []).map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th><td>{count(row.registered)}</td><td>{reportPercent(row.registered, registered)}<progress max={Math.max(registered, 1)} value={row.registered} aria-label={`${row.label}: ${reportPercent(row.registered, registered)} dos inscritos elegíveis`} /></td>{attendanceEnabled && <><td>{count(row.present)}</td><td>{reportPercent(row.present, present)}</td></>}</tr>) : <tr><td colSpan={attendanceEnabled ? 5 : 3}>Nenhum registro nesta população.</td></tr>}</tbody>
    <tfoot><tr><th scope="row">População elegível</th><td>{count(registered)}</td><td>{registered ? '100%' : '—'}</td>{attendanceEnabled && <><td>{count(present)}</td><td>{present ? '100%' : '—'}</td></>}</tr></tfoot>
  </table></div>;
}

function CountTable({ caption, rows }: { caption: string; rows: Array<{ label: string; count: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <div className={styles.scroll}><table className={styles.table}><caption>{caption}</caption><thead><tr><th scope="col">Grupo</th><th scope="col">Quantidade</th><th scope="col">Percentual</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{count(row.count)}</td><td>{reportPercent(row.count, total)}</td></tr>) : <tr><td colSpan={3}>Nenhum registro disponível.</td></tr>}</tbody><tfoot><tr><th scope="row">Total</th><td>{count(total)}</td><td>{total ? '100%' : '—'}</td></tr></tfoot></table></div>;
}

export default function PostEventReports({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [view, setView] = useState<{ eventId: string; data: PostEventReport | null; loading: boolean; error: string }>({ eventId, data: null, loading: true, error: '' });
  const [reload, setReload] = useState(0);
  const [section, setSection] = useState('all');
  const [day, setDay] = useState('all');
  const [notice, setNotice] = useState('');
  const data = view.eventId === eventId ? view.data : null;
  const reportBody = useRef<HTMLDivElement>(null);
  useEffect(() => { reportBody.current?.focus(); }, [section]);

  useEffect(() => {
    let active = true;
    setView({ eventId, data: null, loading: true, error: '' });
    setSection('all'); setDay('all'); setNotice('');
    if (!getToken()) { router.replace('/login'); return () => { active = false; }; }
    api<PostEventReport>(`/events/${encodeURIComponent(eventId)}/registration-form/post-event-report`)
      .then((result) => {
        if (!active) return;
        if (result.event.id !== eventId) throw new Error('Não foi possível carregar o relatório deste evento.');
        setView({ eventId, data: result, loading: false, error: '' });
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) router.replace('/login');
        setView({ eventId, data: null, loading: false, error: reason instanceof ApiError && reason.status === 400 ? reason.message : 'Não foi possível carregar os relatórios. Confira seu acesso ao evento e tente novamente.' });
      });
    return () => { active = false; };
  }, [eventId, router, reload]);

  function exportCsv(selected = false) {
    if (!data) return;
    try {
      const blob = new Blob([selected ? selectedReportCsv(data, section, day) : postEventReportCsv(data)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `evolvia-relatorio-${selected ? section.replace(/[^a-z0-9-]/gi, '-') : 'todos'}-${eventId}.csv`;
      document.body.appendChild(link);
      try { link.click(); } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
      setNotice(selected && section !== 'all' ? 'CSV do relatório selecionado exportado com os filtros aplicáveis.' : 'CSV de todos os relatórios exportado com os dados desta consulta. Os filtros de tela não restringem esta exportação.');
    } catch {
      setNotice('Não foi possível exportar o relatório. Atualize a consulta e tente novamente.');
    }
  }

  if (view.eventId !== eventId || view.loading) return <section className={styles.panel} aria-busy="true"><h1>Relatórios do evento</h1><p>A EVA está consolidando os registros do evento...</p></section>;
  if (!data) return <section className={styles.panel}><h1>Relatórios do evento</h1><p className={styles.error} role="alert">{view.error}</p><button className={styles.secondary} onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></section>;
  const r = data.registration;
  const options = postEventReportOptions(data);
  const selectedOption = options.find((option) => option.id === section);
  const registrationRows = [{ label: 'Confirmadas', count: r.confirmed }, { label: 'Reservas pendentes', count: r.pending }, { label: 'Reservas expiradas', count: r.expired }, { label: 'Canceladas', count: r.cancelled }];
  const show = (name: string) => section === 'all' || section === name;

  return <section className={styles.panel} aria-labelledby="post-event-title">
    <header className={styles.header}><div><span className={styles.eyebrow}>RELATÓRIOS DO EVENTO</span><h1 id="post-event-title">Resultados do evento</h1><p>{data.event.name} · {data.event.profileLabel}</p><p>Consulta em {formatEventDate(data.generatedAt, data.event.timeZone, { dateStyle: 'short', timeStyle: 'short' })}. Fuso: {data.event.timeZone}{!data.event.timeZoneConfirmed && ' (fuso do evento não confirmado)'}. Ficha: revisão {data.formRevision}.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={() => setReload((value) => value + 1)}>Atualizar consulta</button><button className={styles.secondary} onClick={() => window.print()}>Imprimir / salvar PDF</button><button className={styles.button} onClick={() => exportCsv(true)}>Exportar relatório selecionado</button><button className={styles.secondary} onClick={() => exportCsv()}>Exportar todos os relatórios</button></div></header>
    <div role="status" aria-live="polite">{notice}</div>
    {data.event.status !== 'FINISHED' && <p className={styles.notice}>Este é um acompanhamento dos registros atuais. O evento ainda não foi marcado como finalizado.</p>}
    <div className={styles.metrics}><article className={styles.metric}><span>Inscrições confirmadas</span><strong>{count(r.confirmed)}</strong><small>Inscrições consideradas nos relatórios</small></article>{data.attendanceEnabled && <><article className={styles.metric}><span>Presentes</span><strong>{count(r.present)}</strong><small>Com primeiro credenciamento</small></article><article className={styles.metric}><span>Sem credenciamento</span><strong>{count(r.absent)}</strong><small>Inscrição confirmada sem check-in</small></article><article className={styles.metric}><span>Taxa de credenciamento</span><strong>{reportPercent(r.present, r.confirmed)}</strong><small>Presentes ÷ confirmados</small></article></>}</div>
    <ReportCatalog options={options} selected={section} onSelect={setSection} />
    <div className={styles.toolbar}><label>Relatório selecionado<select value={section} onChange={(e) => setSection(e.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.title}</option>)}</select></label><p className={styles.help}>A impressão segue o relatório selecionado. Escolha exportar este relatório ou todos os dados agregados disponíveis.</p></div>
    <div ref={reportBody} tabIndex={-1} className={styles.reportBody} role="region" aria-label={`Relatório selecionado: ${selectedOption?.title ?? 'Relatório não disponível'}`}>
    {show('registration-status') && <section className={styles.card}><h2>Situação das inscrições e reservas</h2><p className={styles.help}>Inclui todas as situações listadas. Os demais relatórios da ficha usam somente inscrições confirmadas.</p><CountTable caption="Registros por situação" rows={registrationRows} /></section>}
    {section === 'all' && <PostEventOverview report={data} />}
    {show('registration') && <section className={styles.card}><h2>Inscrição e categorias</h2><p className={styles.help}>Além das confirmadas: {count(r.pending)} reservas pendentes · {count(r.expired)} expiradas · {count(r.cancelled)} canceladas.</p><Distribution title={data.attendanceEnabled ? 'Inscritos e presentes por categoria' : 'Inscritos por categoria'} buckets={data.categories} registered={r.confirmed} present={r.present} attendanceEnabled={data.attendanceEnabled} /></section>}
    {(show('attendance') || section === 'attendance-day' || section === 'attendance-hour') && data.attendanceEnabled && <section className={styles.card}><h2>Credenciamento por dia e horário</h2><p className={styles.help}>Cada inscrição é contada uma vez. Estes dados não representam presença diária nem o fluxo completo de entradas e saídas.</p><label>Dia do primeiro credenciamento <select value={day} onChange={(e) => setDay(e.target.value)}><option value="all">Todos os dias com registro</option>{(data.firstCheckInByDay ?? []).map((row) => <option key={row.label} value={row.label}>{row.label}</option>)}</select></label><div className={styles.tables}>{section !== 'attendance-hour' && <CountTable caption="Credenciados por dia" rows={(data.firstCheckInByDay ?? []).filter((row) => day === 'all' || row.label === day)} />}{section !== 'attendance-day' && <CountTable caption="Credenciados por horário" rows={(data.firstCheckInByHour ?? []).filter((row) => day === 'all' || row.label.startsWith(day + ' '))} />}</div></section>}
    {(show('fields') || section.startsWith('field:')) && <section><h2>Perfil dos participantes</h2><p className={styles.help}>Somente campos estatísticos habilitados na ficha. Percentuais usam a população à qual o campo se aplicava na versão preenchida.</p>{!data.fields.length && <p className={styles.notice}>Nenhum campo estatístico habilitado na ficha. Configure os campos desejados para coleta; dados anteriores não serão inferidos.</p>}<div className={styles.tables}>{data.fields.filter((field) => !section.startsWith('field:') || section === 'field:' + field.code).map((field) => <article className={styles.card} key={field.code}><h2>{field.label}</h2>{field.code === 'birth_date' && <p className={styles.help}>Idade na data de início do evento: {data.ageReferenceDay ?? 'data ainda não definida'}.</p>}<p className={styles.help}>Respostas não coletadas nesta versão: {count(field.notCollected)} · Não se aplicam: {count(field.notApplicable)}.{field.multiple && ' Múltiplas escolhas: percentuais podem ultrapassar 100%.'}</p><Distribution title={`${field.label}: inscritos${data.attendanceEnabled ? ' e presentes' : ''}`} buckets={field.buckets} registered={field.eligible} present={field.presentEligible} attendanceEnabled={data.attendanceEnabled} /></article>)}</div></section>}
    {show('payment') && data.payment && <section className={styles.card}><h2>Pagamentos registrados</h2><div className={styles.metrics}><article className={styles.metric}><span>Valor pago</span><strong>{money(data.payment.receivedCents)}</strong><small>Pagamentos confirmados no checkout</small></article><article className={styles.metric}><span>Valor previsto das inscrições confirmadas</span><strong>{money(data.payment.confirmedPriceCents)}</strong><small>Não equivale ao valor recebido</small></article></div><CountTable caption="Situação das inscrições confirmadas" rows={[{ label: 'Pagamento confirmado no checkout', count: data.payment.paid }, { label: 'Isentas', count: data.payment.exempt }, { label: 'Pagamento em revisão', count: data.payment.review }, { label: 'Sem confirmação de checkout', count: data.payment.unverified }]} /><p className={styles.help}>Não inclui caixa presencial, taxas, estornos ou emissão fiscal. Reservas pendentes e canceladas estão no resumo de inscrições.</p></section>}
    {show('visits') && <section className={styles.card}><h2>Visitas da página</h2><div className={styles.metrics}><article className={styles.metric}><span>Aberturas aceitas</span><strong>{count(data.visits?.total ?? 0)}</strong><small>Quantidade agregada. Não há perfil de visitante.</small></article></div><CountTable caption="Visitas por dia" rows={data.visits?.byDay ?? []} /><p className={styles.help}>Cada abertura aceita soma um; não representa visitante único. Cada instância conta até 120 aberturas do mesmo evento por minuto. Aberturas recusadas acima do limite ou sem JavaScript não entram no total. A consulta não guarda pessoa, navegador, IP nem origem.</p></section>}
    {show('sales') && <section className={styles.card}><h2>Vendas no período</h2><p className={styles.help}>Checkouts pagos, agrupados pelo dia da confirmação no fuso do evento. Sem data de confirmação, a venda aparece em Não informada. A soma dos dias equivale ao valor recebido. Esse valor não é caixa presencial nem receita líquida.</p><div className={styles.scroll}><table className={styles.table}><caption>Vendas e valor recebido por dia</caption><thead><tr><th scope="col">Dia</th><th scope="col">Vendas</th><th scope="col">Recebido</th></tr></thead><tbody>{(data.salesByDay ?? []).length ? data.salesByDay!.map((row) => <tr key={row.label}><th scope="row">{row.label}</th><td>{count(row.sales)}</td><td>{money(row.receivedCents)}</td></tr>) : <tr><td colSpan={3}>Nenhuma venda paga neste recorte.</td></tr>}</tbody></table></div></section>}
    {show('scientific') && data.scientific && <section className={styles.card}><h2>Produção científica</h2><CountTable caption="Trabalhos por situação registrada" rows={data.scientific.submissions.map((row) => ({ label: submissionStatusLabels[row.status] ?? row.status, count: row.count }))} /><p className={styles.help}>Atividades planejadas: {count(data.scientific.plannedActivities ?? 0)}. Planejamento não comprova apresentação ou presença.</p></section>}
    {show('payment-category') && Array.isArray(data.payment?.categories) && <section className={styles.card}><h2>Pagamentos por categoria</h2><p className={styles.help}>Somente inscrições confirmadas. Valores recebidos correspondem aos pagamentos confirmados no checkout. Valores previstos são os preços registrados; não representam receita líquida ou caixa presencial.</p><div className={styles.scroll} tabIndex={0} role="region" aria-label="Tabela de pagamentos por categoria com rolagem horizontal"><table className={`${styles.table} ${styles.paymentTable}`}><caption>Quantidades e valores por categoria</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Confirmadas</th><th scope="col">Pagas</th><th scope="col">Isentas</th><th scope="col">Em revisão</th><th scope="col">Sem confirmação</th><th scope="col">Recebido</th><th scope="col">Previsto</th></tr></thead><tbody>{data.payment.categories!.length ? data.payment.categories!.map((row, index) => <tr key={index}><th scope="row">{row.label}</th><td>{count(row.confirmed)}</td><td>{count(row.paid)}</td><td>{count(row.exempt)}</td><td>{count(row.review)}</td><td>{count(row.unverified)}</td><td>{money(row.receivedCents)}</td><td>{money(row.confirmedPriceCents)}</td></tr>) : <tr><td colSpan={8}>Nenhuma inscrição confirmada neste recorte.</td></tr>}</tbody><tfoot><tr><th scope="row">Total</th><td>{count(r.confirmed)}</td><td>{count(data.payment!.paid)}</td><td>{count(data.payment!.exempt)}</td><td>{count(data.payment!.review)}</td><td>{count(data.payment!.unverified)}</td><td>{money(data.payment!.receivedCents)}</td><td>{money(data.payment!.confirmedPriceCents)}</td></tr></tfoot></table></div></section>}
    </div>
    <details className={styles.card}><summary>Como interpretar os relatórios</summary><ul>{data.limitations.map((text) => <li key={text}>{text}</li>)}</ul></details>
  </section>;
}
