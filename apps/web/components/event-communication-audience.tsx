'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import styles from './event-communication.module.css';
type Preview = { audience?: string; matchedAuthors?: number; total: number; matchedRegistrations: number; missingEmail: number; duplicates: number; page: number; pageSize: number; items: {name:string;email:string}[] };
export default function EventCommunicationAudience({eventId}:{eventId:string}) {
  return <ScopedAudience key={eventId} eventId={eventId} />;
}
function ScopedAudience({eventId}:{eventId:string}) {
  const [categories,setCategories]=useState<{id:string;name:string}[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [payment,setPayment]=useState('ALL');
  const [audience,setAudience]=useState('CONFIRMED_REGISTRATIONS');
  const [submissionStatus,setSubmissionStatus]=useState('ALL');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [message,setMessage]=useState('');
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const live=useRef(false),request=useRef(0);
  const endpoint=`/events/${eventId}/communication/audience`;
  useEffect(()=>{live.current=true;let active=true;api<{id:string;name:string}[]>(`${endpoint}/categories`).then(rows=>{if(active){setCategories(rows);setReady(true);}}).catch(()=>{if(active)setMessage('Não foi possível carregar as categorias. Recarregue a página para tentar novamente.');});return()=>{active=false;live.current=false;};},[endpoint]);
  async function show(page=1) {
    const serial=++request.current;setBusy(true);setMessage('');setPreview(null);
    try { const result=await api<Preview>(`${endpoint}/preview`,{method:'POST',body:JSON.stringify(audience === 'CORRESPONDING_AUTHORS' ? {audience,submissionStatus,page} : {categoryIds:selected,payment,page})});if(live.current&&request.current===serial)setPreview(result); }
    catch(error){if(live.current&&request.current===serial)setMessage(error instanceof Error?error.message:'Não foi possível conferir os destinatários.');}
    finally{if(live.current&&request.current===serial)setBusy(false);}
  }
  function invalidate(){request.current++;setBusy(false);setPreview(null);setMessage('');}
  return <section className={styles.card} aria-labelledby="communication-audience-title">
    <h2 id="communication-audience-title">Conferir destinatários</h2>
    <label>Público<select aria-label="Público" disabled={!ready||busy} value={audience} onChange={event=>{invalidate();setAudience(event.target.value);setSelected([]);setPayment('ALL');setSubmissionStatus('ALL');}}><option value="CONFIRMED_REGISTRATIONS">Inscrições confirmadas</option><option value="CORRESPONDING_AUTHORS">Autores correspondentes</option></select></label>
    <p>{audience === 'CORRESPONDING_AUTHORS' ? 'Pessoas ativas marcadas como autor correspondente em trabalhos efetivamente submetidos. Não exige inscrição confirmada; agrupa o mesmo e-mail em vários trabalhos. Não inclui todos os coautores.' : 'Somente inscrições confirmadas, conforme categorias e situação financeira.'}</p>
    {audience === 'CORRESPONDING_AUTHORS' && <label>Situação do trabalho<select aria-label="Situação do trabalho" disabled={!ready||busy} value={submissionStatus} onChange={event=>{invalidate();setSubmissionStatus(event.target.value);}}><option value="ALL">Todos os trabalhos submetidos</option><option value="SUBMITTED">Submetidos</option><option value="UNDER_REVIEW">Em avaliação</option><option value="ACCEPTED">Aceitos</option><option value="REJECTED">Recusados</option><option value="ACCEPTED_WITH_CHANGES">Aceitos com alterações</option></select></label>}
    <fieldset disabled={!ready||busy||audience !== 'CONFIRMED_REGISTRATIONS'}><legend>Categorias</legend><p>Nenhuma marcada inclui todas. Categorias marcadas se somam (OU); a situação financeira restringe o resultado (E).</p>
      {categories.map(category=><label key={category.id}><input type="checkbox" checked={selected.includes(category.id)} onChange={event=>{const checked=event.target.checked;invalidate();setSelected(ids=>checked?[...ids,category.id]:ids.filter(id=>id!==category.id));}} />{category.name}</label>)}
    </fieldset>
    <label>Situação financeira<select aria-label="Situação financeira" disabled={!ready||busy||audience !== 'CONFIRMED_REGISTRATIONS'} value={payment} onChange={event=>{invalidate();setPayment(event.target.value);}}><option value="ALL">Todas as confirmadas</option><option value="PAID">Pagamento confirmado no checkout</option><option value="ZERO">Gratuitas ou isentas: valor final zero</option></select></label>
    <button type="button" disabled={!ready||busy} onClick={()=>void show()}>{busy?'Conferindo…':'Conferir público'}</button>
    {message&&<p role="status">{message}</p>}
    {preview&&<div role="region" aria-label="Prévia dos destinatários"><p role="status">{preview.total} e-mails únicos em {preview.audience === 'CORRESPONDING_AUTHORS' ? `${preview.matchedAuthors ?? 0} autorias correspondentes` : `${preview.matchedRegistrations} inscrições`}; {preview.missingEmail} sem e-mail válido; {preview.duplicates} contatos repetidos agrupados.</p><p>Esta lista não é autorização nem confirmação de envio. A seleção será conferida novamente antes de um futuro disparo.</p><ul className={styles.list}>{preview.items.map(item=><li key={item.email}><strong>{item.name}</strong><span>{item.email}</span></li>)}</ul><div className={styles.actions}><button type="button" disabled={busy||preview.page<=1} onClick={()=>void show(preview.page-1)}>Anterior</button><span>Página {preview.page}</span><button type="button" disabled={busy||preview.page*preview.pageSize>=preview.total} onClick={()=>void show(preview.page+1)}>Próxima</button></div></div>}
  </section>;
}
