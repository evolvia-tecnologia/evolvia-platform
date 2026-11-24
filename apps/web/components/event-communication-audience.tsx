'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import styles from './event-communication.module.css';
type Preview = { audience?: string; matchedAuthors?: number; total: number; matchedRegistrations: number; missingEmail: number; duplicates: number; page: number; pageSize: number; items: {name:string;email:string}[]; sendingAvailable?: boolean };
export default function EventCommunicationAudience({eventId}:{eventId:string}) {
  return <ScopedAudience key={eventId} eventId={eventId} />;
}
function ScopedAudience({eventId}:{eventId:string}) {
  const [categories,setCategories]=useState<{id:string;name:string}[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [payment,setPayment]=useState('ALL');
  const [filterMode,setFilterMode]=useState<'AND'|'OR'>('AND');
  const [audience,setAudience]=useState('CONFIRMED_REGISTRATIONS');
  const [submissionStatus,setSubmissionStatus]=useState('ALL');
  const scientificAudience = audience !== 'CONFIRMED_REGISTRATIONS';
  const [preview,setPreview]=useState<Preview|null>(null);
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const live=useRef(false),request=useRef(0);
  const endpoint=`/events/${eventId}/communication/audience`;
  useEffect(()=>{live.current=true;let active=true;api<{id:string;name:string}[]>(`${endpoint}/categories`).then(rows=>{if(active){setCategories(rows);setReady(true);}}).catch(()=>{if(active)setMessage('Não foi possível carregar as categorias. Recarregue a página para tentar novamente.');});return()=>{active=false;live.current=false;};},[endpoint]);
  async function show(page=1) {
    const serial=++request.current;setBusy(true);setMessage('');setPreview(null);
    const body = scientificAudience
      ? {audience,submissionStatus,page}
      : {categoryIds:selected,payment,filterMode,page};
    try { const result=await api<Preview>(`${endpoint}/preview`,{method:'POST',body:JSON.stringify(body)});if(live.current&&request.current===serial)setPreview(result); }
    catch(error){if(live.current&&request.current===serial)setMessage(error instanceof Error?error.message:'Não foi possível conferir os destinatários.');}
    finally{if(live.current&&request.current===serial)setBusy(false);}
  }
  function invalidate(){request.current++;setBusy(false);setPreview(null);setMessage('');}
  return <section className={styles.card} aria-labelledby="communication-audience-title">
    <h2 id="communication-audience-title">Conferir destinatários</h2>
    <label>Público<select aria-label="Público" disabled={!ready||busy} value={audience} onChange={event=>{invalidate();setAudience(event.target.value);setSelected([]);setPayment('ALL');setFilterMode('AND');setSubmissionStatus('ALL');}}><option value="CONFIRMED_REGISTRATIONS">Inscrições confirmadas</option><option value="CORRESPONDING_AUTHORS">Autores correspondentes</option><option value="ALL_SCIENTIFIC_AUTHORS">Autores e coautores</option></select></label>
    <p>{audience === 'CORRESPONDING_AUTHORS' ? 'Pessoas ativas marcadas como autor correspondente em trabalhos efetivamente submetidos. Não exige inscrição confirmada; agrupa o mesmo e-mail em vários trabalhos. Não inclui todos os coautores.' : scientificAudience ? 'Autores e coautores ativos dos trabalhos efetivamente submetidos, mesmo sem inscrição. Contatos ausentes são informados e o mesmo e-mail aparece uma vez.' : 'Somente inscrições confirmadas. Categorias e situação financeira combinam conforme E ou OU abaixo.'}</p>
    {scientificAudience && <label>Situação do trabalho<select aria-label="Situação do trabalho" disabled={!ready||busy} value={submissionStatus} onChange={event=>{invalidate();setSubmissionStatus(event.target.value);}}><option value="ALL">Todos os trabalhos submetidos</option><option value="SUBMITTED">Submetidos</option><option value="UNDER_REVIEW">Em avaliação</option><option value="ACCEPTED">Aceitos</option><option value="REJECTED">Recusados</option><option value="ACCEPTED_WITH_CHANGES">Aceitos com alterações</option></select></label>}
    <fieldset disabled={!ready||busy||audience !== 'CONFIRMED_REGISTRATIONS'}><legend>Categorias</legend><p>Nenhuma marcada inclui todas as categorias do evento.</p>
      {categories.map(category=><label key={category.id}><input type="checkbox" checked={selected.includes(category.id)} onChange={event=>{const checked=event.target.checked;invalidate();setSelected(ids=>checked?[...ids,category.id]:ids.filter(id=>id!==category.id));}} />{category.name}</label>)}
    </fieldset>
    <label>Situação financeira<select aria-label="Situação financeira" disabled={!ready||busy||audience !== 'CONFIRMED_REGISTRATIONS'} value={payment} onChange={event=>{invalidate();setPayment(event.target.value);}}><option value="ALL">Todas as confirmadas</option><option value="PAID">Pagamento confirmado (checkout individual ou compra múltipla paga)</option><option value="ZERO">Gratuitas ou isentas: valor final zero</option></select></label>
    <label>Combinação dos filtros<select aria-label="Combinação dos filtros" disabled={!ready||busy||audience !== 'CONFIRMED_REGISTRATIONS'} value={filterMode} onChange={event=>{invalidate();setFilterMode(event.target.value as 'AND'|'OR');}}><option value="AND">E — categoria e pagamento juntos</option><option value="OR">OU — categoria ou pagamento</option></select></label>
    <p>{audience === 'CONFIRMED_REGISTRATIONS' ? (filterMode === 'OR' ? 'OU: entram inscritos que batem na categoria marcada ou na situação financeira (ainda só confirmados deste evento).' : 'E: só entram inscritos que batem nas categorias marcadas e na situação financeira ao mesmo tempo.') : null}</p>
    <p>Prévia não comprova consentimento de comunicação nem autorização de disparo. Consentimento e outbox serão revalidados no envio real, ainda indisponível enquanto a API mantém envio desligado.</p>
    <button type="button" disabled={!ready||busy} onClick={()=>void show()}>{busy?'Conferindo…':'Conferir público'}</button>
    {message&&<p role="status">{message}</p>}
    {preview&&<div role="region" aria-label="Prévia dos destinatários"><p role="status">{preview.total} e-mails únicos em {preview.audience === 'ALL_SCIENTIFIC_AUTHORS' ? `${preview.matchedAuthors ?? 0} autorias científicas` : preview.audience === 'CORRESPONDING_AUTHORS' ? `${preview.matchedAuthors ?? 0} autorias correspondentes` : `${preview.matchedRegistrations} inscrições`}; {preview.missingEmail} sem e-mail válido; {preview.duplicates} contatos repetidos agrupados.</p><p>Esta lista não é autorização nem confirmação de envio. A seleção será conferida novamente antes de um futuro disparo.</p>{preview.sendingAvailable === true ? <p role="status">A API sinalizou transporte disponível nesta prévia; aceite do gateway ainda não é e-mail recebido.</p> : <p>Envio em lote permanece indisponível nesta prévia (`sendingAvailable=false`).</p>}<ul className={styles.list}>{preview.items.map(item=><li key={item.email}><strong>{item.name}</strong><span>{item.email}</span></li>)}</ul><div className={styles.actions}><button type="button" disabled={busy||preview.page<=1} onClick={()=>void show(preview.page-1)}>Anterior</button><span>Página {preview.page}</span><button type="button" disabled={busy||preview.page*preview.pageSize>=preview.total} onClick={()=>void show(preview.page+1)}>Próxima</button></div></div>}
  </section>;
}
