'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, getToken } from '../lib/api';
import { formatEventDate } from '../lib/event-time-zone';
import { postEventReportCsv, reportPercent, submissionStatusLabels, type PostEventBucket, type PostEventReport } from '../lib/post-event-report';
import styles from './post-event-reports.module.css';

const count = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);

function Distribution({ title, buckets, registered, present, attendanceEnabled }: { title: string; buckets: PostEventBucket[]; registered: number; present: number; attendanceEnabled: boolean }) {
  return <div className={styles.scroll}><table className={styles.table}>
    <caption>{title}</caption>
    <thead><tr><th scope="col">Grupo</th><th scope="col">Inscritos</th><th scope="col">% inscritos</th>{attendanceEnabled && <><th scope="col">Presentes</th><th scope="col">% presentes</th></>}</tr></thead>
    <tbody>{buckets.length ? buckets.map((row, index) => <tr key={`${row.label}-${index}`}><th scope="row">{row.label}</th><td>{count(row.registered)}</td><td>{reportPercent(row.registered, registered)}<progress max={Math.max(registered, 1)} value={row.registered} aria-label={`${row.label}: ${reportPercent(row.registered, registered)} dos inscritos elegíveis`} /></td>{attendanceEnabled && <><td>{count(row.present)}</td><td>{reportPercent(row.present, present)}</td></>}</tr>) : <tr><td colSpan={attendanceEnabled ? 5 : 3}>Nenhum registro nesta população.</td></tr>}</tbody>
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

  function exportCsv() {
    if (!data) return;
    const blob = new Blob([postEventReportCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `evolvia-pos-evento-${eventId}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setNotice('CSV de todos os grupos exportado com os dados desta consulta. Os filtros de tela não restringem a exportação.');
  }

  if (view.eventId !== eventId || view.loading) return <section className={styles.panel} aria-busy="true"><h1>Relatórios de Pós-evento</h1><p>A EVA está consolidando os registros do evento...</p></section>;
  if (!data) return <section className={styles.panel}><h1>Relatórios de Pós-evento</h1><p className={styles.error} role="alert">{view.error}</p><button className={styles.secondary} onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></section>;
  const r = data.registration;
  const show = (name: string) => section === 'all' || section === name;

  return <section className={styles.panel} aria-labelledby="post-event-title">
    <header className={styles.header}><div><span className={styles.eyebrow}>GATE 11 · PÓS-EVENTO</span><h1 id="post-event-title">Resultados do evento</h1><p>{data.event.name} · {data.event.profileLabel}</p><p>Consulta em {formatEventDate(data.generatedAt, data.event.timeZone, { dateStyle: 'short', timeStyle: 'short' })}. Fuso: {data.event.timeZone}{!data.event.timeZoneConfirmed && ' (fuso do evento não confirmado)'}. Ficha: revisão {data.formRevision}.</p></div><div className={styles.actions}><button className={styles.secondary} onClick={() => setReload((value) => value + 1)}>Atualizar consulta</button><button className={styles.secondary} onClick={() => window.print()}>Imprimir / salvar PDF</button><button className={styles.button} onClick={exportCsv}>Exportar resumo CSV</button></div></header>
    <div role="status" aria-live="polite">{notice}</div>
    {data.event.status !== 'FINISHED' && <p className={styles.notice}>Este é um acompanhamento dos registros atuais. O evento ainda não foi marcado como finalizado.</p>}
    <div className={styles.metrics}><article className={styles.metric}><span>Inscrições confirmadas</span><strong>{count(r.confirmed)}</strong><small>População dos relatórios da ficha</small></article>{data.attendanceEnabled && <><article className={styles.metric}><span>Presentes</span><strong>{count(r.present)}</strong><small>Com primeiro credenciamento</small></article><article className={styles.metric}><span>Sem credenciamento</span><strong>{count(r.absent)}</strong><small>Inscrição confirmada sem check-in</small></article><article className={styles.metric}><span>Taxa de credenciamento</span><strong>{reportPercent(r.present, r.confirmed)}</strong><small>Presentes ÷ confirmados</small></article></>}</div>
    <div className={styles.toolbar}><label>Grupo de relatórios<select value={section} onChange={(e) => setSection(e.target.value)}><option value="all">Todos os grupos disponíveis</option><option value="registration">Inscrição e categorias</option>{data.attendanceEnabled && <option value="attendance">Credenciamento</option>}<option value="fields">Perfil dos participantes</option>{data.payment && <option value="payment">Pagamentos</option>}{data.scientific && <option value="scientific">Científico</option>}</select></label><p className={styles.help}>A ficha e os módulos habilitados definem os relatórios disponíveis. A impressão segue o grupo selecionado; o CSV contém todos os grupos.</p></div>
    {show('registration') && <section className={styles.card}><h2>Inscrição e categorias</h2><p className={styles.help}>Além das confirmadas: {count(r.pending)} reservas pendentes · {count(r.expired)} expiradas · {count(r.cancelled)} canceladas.</p><Distribution title={data.attendanceEnabled ? 'Inscritos e presentes por categoria' : 'Inscritos por categoria'} buckets={data.categories} registered={r.confirmed} present={r.present} attendanceEnabled={data.attendanceEnabled} /></section>}
    {show('attendance') && data.attendanceEnabled && <section className={styles.card}><h2>Primeiro credenciamento</h2><p className={styles.help}>Cada inscrição é contada uma vez. Estes dados não representam presença diária nem o fluxo completo de entradas e saídas.</p><label>Dia para detalhar por hora <select value={day} onChange={(e) => setDay(e.target.value)}><option value="all">Todos os dias com registro</option>{data.firstCheckInByDay.map((row) => <option key={row.label} value={row.label}>{row.label}</option>)}</select></label><div className={styles.tables}><CountTable caption="Primeiro credenciamento por dia" rows={data.firstCheckInByDay} /><CountTable caption="Primeiro credenciamento por hora" rows={data.firstCheckInByHour.filter((row) => day === 'all' || row.label.startsWith(day))} /></div></section>}
    {show('fields') && <section><h2>Perfil dos participantes</h2><p className={styles.help}>Somente campos estatísticos habilitados na ficha. Percentuais usam a população à qual o campo se aplicava na versão preenchida.</p>{!data.fields.length && <p className={styles.notice}>Nenhum campo estatístico habilitado na ficha. Configure os campos desejados para coleta; dados anteriores não serão inferidos.</p>}<div className={styles.tables}>{data.fields.map((field) => <article className={styles.card} key={field.code}><h2>{field.label}</h2>{field.code === 'birth_date' && <p className={styles.help}>Idade na data de início do evento: {data.ageReferenceDay ?? 'data ainda não definida'}.</p>}<p className={styles.help}>{count(field.notCollected)} não coletados nessa versão · {count(field.notApplicable)} não se aplicam.{field.multiple && ' Múltiplas escolhas: percentuais podem ultrapassar 100%.'}</p><Distribution title={`${field.label}: inscritos${data.attendanceEnabled ? ' e presentes' : ''}`} buckets={field.buckets} registered={field.eligible} present={field.presentEligible} attendanceEnabled={data.attendanceEnabled} /></article>)}</div></section>}
    {show('payment') && data.payment && <section className={styles.card}><h2>Pagamentos registrados</h2><div className={styles.metrics}><article className={styles.metric}><span>Valor pago</span><strong>{money(data.payment.receivedCents)}</strong><small>Checkouts com status PAID</small></article><article className={styles.metric}><span>Preço das confirmadas</span><strong>{money(data.payment.confirmedPriceCents)}</strong><small>Não equivale ao valor recebido</small></article></div><CountTable caption="Situação das inscrições confirmadas" rows={[{ label: 'Pagamento confirmado no checkout', count: data.payment.paid }, { label: 'Isentas', count: data.payment.exempt }, { label: 'Pagamento em revisão', count: data.payment.review }, { label: 'Sem confirmação de checkout', count: data.payment.unverified }]} /><p className={styles.help}>Não inclui caixa presencial, taxas, estornos ou emissão fiscal. Reservas pendentes e canceladas estão no resumo de inscrições.</p></section>}
    {show('scientific') && data.scientific && <section className={styles.card}><h2>Produção científica</h2><CountTable caption="Trabalhos por estado registrado" rows={data.scientific.submissions.map((row) => ({ label: submissionStatusLabels[row.status] ?? row.status, count: row.count }))} /><p className={styles.help}>{count(data.scientific.plannedActivities ?? 0)} atividades planejadas. Planejamento não comprova apresentação ou presença.</p></section>}
    <details className={styles.card}><summary>Como interpretar os relatórios</summary><ul>{data.limitations.map((text) => <li key={text}>{text}</li>)}</ul></details>
  </section>;
}
