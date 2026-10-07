'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-reviews.module.css';

type ReviewMode = 'OPEN' | 'SINGLE_BLIND' | 'DOUBLE_BLIND';
type Criterion = { id:string; label:string; description:string|null; required:boolean; minScore:number; maxScore:number; weight:number; active:boolean };
type Person = { id:string; name:string; email:string|null };
type Version = { id:string; versionNumber:number; title:string; abstractText:string|null; keywords:unknown };
type Submission = { id:string; title:string; status:string; versions:Version[]; authors:{person:{name:string}}[] };
type Assignment = { id:string; status:string; conflictStatus:string; dueAt:string|null; reviewer:{id:string;name:string}; submission:{id:string;title:string;status:string}; version:{versionNumber:number}; weightedScore:number|null };
type Management = { event:{id:string;name:string;status:string}; reviewMode:ReviewMode; reviewRules?:{reviewersPerSubmission:number|null;coordinatorDecidesStatus:boolean;evaluationStyle:'ANALYTIC'|'SYNTHETIC'}; criteria:Criterion[]; assignments:Assignment[]; people:Person[]; submissions:Submission[]; summary:{criteria:number;assigned:number;inProgress:number;submitted:number;conflicts:number}; nextAction:string };

const modeLabel:Record<ReviewMode,string>={OPEN:'Aberta',SINGLE_BLIND:'Cega simples',DOUBLE_BLIND:'Duplo-cega'};

export default function ScientificReviews({eventId}:{eventId:string}){
  if (!eventId) return <p>Escolha um evento para administrar a avaliação.</p>;
  return <ScientificReviewsPanel key={eventId} eventId={eventId} />;
}

function ScientificReviewsPanel({eventId}:{eventId:string}){
  const router=useRouter();
  const [management,setManagement]=useState<Management|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [criterion,setCriterion]=useState({label:'',description:'',minScore:'0',maxScore:'10',weight:'1',required:true});
  const [assignment,setAssignment]=useState({submissionId:'',versionId:'',reviewerPersonId:'',dueAt:''});

  async function loadManagement(){
    const data=await api<Management>(`/scientific-events/${eventId}/reviews/management`);
    setManagement(data);
    if(!assignment.submissionId&&data.submissions[0]){
      setAssignment((value)=>({...value,submissionId:data.submissions[0].id,versionId:data.submissions[0].versions[0]?.id??''}));
    }
  }

  useEffect(()=>{
    if(!getToken()){router.replace('/login');return;}
    loadManagement()
      .catch((reason)=>setError(reason instanceof Error?reason.message:'Não foi possível carregar a administração da avaliação científica.'))
      .finally(()=>setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[eventId,router]);

  const selectedSubmission=useMemo(()=>management?.submissions.find((submission)=>submission.id===assignment.submissionId)??null,[management,assignment.submissionId]);

  function chooseSubmission(id:string){
    const submission=management?.submissions.find((item)=>item.id===id);
    setAssignment((value)=>({...value,submissionId:id,versionId:submission?.versions[0]?.id??''}));
  }

  async function createCriterion(event:FormEvent){
    event.preventDefault();setSaving('criterion');setError('');setNotice('');
    try{
      await api(`/scientific-events/${eventId}/reviews/criteria`,{method:'POST',body:JSON.stringify({label:criterion.label,description:criterion.description||undefined,minScore:Number(criterion.minScore),maxScore:Number(criterion.maxScore),weight:Number(criterion.weight),required:criterion.required})});
      setCriterion({label:'',description:'',minScore:'0',maxScore:'10',weight:'1',required:true});
      await loadManagement();
      setNotice('Critério criado com sucesso.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível criar o critério.');}
    finally{setSaving('');}
  }

  async function createAssignment(event:FormEvent){
    event.preventDefault();setSaving('assignment');setError('');setNotice('');
    try{
      await api(`/scientific-events/${eventId}/reviews/assignments`,{method:'POST',body:JSON.stringify({...assignment,dueAt:assignment.dueAt||undefined})});
      await loadManagement();
      setNotice('Trabalho distribuído para avaliação. O preenchimento do parecer ocorrerá na área própria do avaliador.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível distribuir o trabalho.');}
    finally{setSaving('');}
  }

  async function issueAccess(personId:string){
    setSaving('access');setError('');setNotice('');
    try{
      const issued=await api<{accessPath:string}>(`/scientific-events/${eventId}/reviews/reviewers/${personId}/access`,{method:'POST'});
      setNotice(`Envie este endereço uma única vez. Ele não fica gravado como senha: ${issued.accessPath}`);
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível gerar o acesso do avaliador.');}
    finally{setSaving('');}
  }

  async function decide(submissionId:string,status:'ACCEPTED'|'REJECTED'|'ACCEPTED_WITH_CHANGES'){
    setSaving(submissionId);setError('');setNotice('');
    try{
      await api(`/scientific-events/${eventId}/reviews/submissions/${submissionId}/decision`,{method:'POST',body:JSON.stringify({status})});
      await loadManagement();
      setNotice('Decisão científica registrada.');
    }catch(reason){setError(reason instanceof Error?reason.message:'Não foi possível registrar a decisão.');}
    finally{setSaving('');}
  }

  if(loading)return <main className={styles.page}><div className={styles.loading}>A EVA está preparando a administração da avaliação científica...</div></main>;
  if(!management)return <main className={styles.page}><div className={styles.error}>{error||'Administração da avaliação científica indisponível.'}</div></main>;

  return <main className={styles.page}>
    <header className={styles.topbar}><Link className={styles.brand} href="/painel">EVOLVIA</Link><Link className={styles.back} href={`/eventos/${eventId}/cientifico/trabalhos`}>Voltar aos trabalhos</Link></header>
    <section className={styles.workspace}>
      <div className={styles.hero}>
        <div><span className={styles.eyebrow}>GATE A7 · ADMINISTRAÇÃO DA AVALIAÇÃO CIENTÍFICA</span><h1>{management.event.name}</h1><p>Configure critérios, distribua versões imutáveis e acompanhe o andamento dos pareceres. O organizador não declara conflito, atribui notas nem envia parecer em nome do avaliador.</p></div>
        <div className={styles.metrics}><div className={styles.metric}><strong>{management.summary.criteria}</strong><span>Critérios</span></div><div className={styles.metric}><strong>{management.summary.assigned}</strong><span>Atribuídos</span></div><div className={styles.metric}><strong>{management.summary.inProgress}</strong><span>Em andamento</span></div><div className={styles.metric}><strong>{management.summary.submitted}</strong><span>Pareceres recebidos</span></div></div>
      </div>

      <div className={styles.eva}><div className={styles.evaMark}>EVA</div><div><strong>Comissão administra; avaliador avalia</strong><p>{management.nextAction}</p></div></div>
      <div className={styles.card} role="note"><h2>Área do avaliador é separada</h2><p>Conflito, notas e parecer ficam na área do avaliador. O link de acesso é gerado aqui, aparece uma vez e não é uma senha gravada na ficha.</p></div>
      {error&&<div className={styles.error} role="alert">{error}</div>}{notice&&<div className={styles.success} role="status">{notice}</div>}

      <section className={styles.grid}>
        {management.reviewRules?.evaluationStyle === 'SYNTHETIC' ? <article className={styles.card}><h2>Nota única</h2><p>A avaliação deste evento usa uma nota de 0 a 10. Critérios separados não são usados nos novos pareceres.</p></article> : <article className={styles.card}><h2>Critérios</h2><p>Defina escalas objetivas e pesos. Critérios obrigatórios serão exigidos do avaliador antes do envio do parecer.</p><form className={styles.form} onSubmit={createCriterion}><label className={styles.field}>Nome<input required minLength={2} value={criterion.label} onChange={(e)=>setCriterion({...criterion,label:e.target.value})} placeholder="Qualidade metodológica" /></label><label className={styles.field}>Descrição<textarea value={criterion.description} onChange={(e)=>setCriterion({...criterion,description:e.target.value})} placeholder="O que o avaliador deve observar" /></label><div className={styles.two}><label className={styles.field}>Nota mínima<input type="number" step="0.1" value={criterion.minScore} onChange={(e)=>setCriterion({...criterion,minScore:e.target.value})}/></label><label className={styles.field}>Nota máxima<input type="number" step="0.1" value={criterion.maxScore} onChange={(e)=>setCriterion({...criterion,maxScore:e.target.value})}/></label></div><div className={styles.two}><label className={styles.field}>Peso<input type="number" min="0.000001" step="0.1" value={criterion.weight} onChange={(e)=>setCriterion({...criterion,weight:e.target.value})}/></label><label className={styles.field}>Obrigatório<select value={criterion.required?'yes':'no'} onChange={(e)=>setCriterion({...criterion,required:e.target.value==='yes'})}><option value="yes">Sim</option><option value="no">Não</option></select></label></div><button className={styles.primary} disabled={Boolean(saving)}>{saving==='criterion'?'Salvando…':'Adicionar critério'}</button></form><div className={styles.list}>{management.criteria.map((item)=><div className={styles.row} key={item.id}><div><strong>{item.label}</strong><small>{item.minScore} a {item.maxScore} · peso {item.weight}{item.required?' · obrigatório':''}</small></div><span className={styles.badge}>{item.active?'Ativo':'Inativo'}</span></div>)}</div></article>}

        <article className={styles.card}><h2>Distribuição</h2><p>Associe um avaliador à versão exata do trabalho. Autores do próprio trabalho são bloqueados pelo servidor. {management.reviewRules?.reviewersPerSubmission ? `O limite deste evento é ${management.reviewRules.reviewersPerSubmission} avaliador(es) por versão.` : 'Não há limite de avaliadores por versão.'} {management.reviewRules?.coordinatorDecidesStatus ? 'O avaliador informa a nota; o coordenador define aceite ou recusa.' : ''} {management.reviewRules?.evaluationStyle === 'SYNTHETIC' ? 'A nota é um valor único de 0 a 10.' : ''}</p><form className={styles.form} onSubmit={createAssignment}><label className={styles.field}>Trabalho<select required value={assignment.submissionId} onChange={(e)=>chooseSubmission(e.target.value)}><option value="">Selecione</option>{management.submissions.map((submission)=><option key={submission.id} value={submission.id}>{submission.title}</option>)}</select></label><label className={styles.field}>Versão<select required value={assignment.versionId} onChange={(e)=>setAssignment({...assignment,versionId:e.target.value})}><option value="">Selecione</option>{selectedSubmission?.versions.map((version)=><option key={version.id} value={version.id}>Versão {version.versionNumber}</option>)}</select></label><label className={styles.field}>Avaliador<select required value={assignment.reviewerPersonId} onChange={(e)=>setAssignment({...assignment,reviewerPersonId:e.target.value})}><option value="">Selecione</option>{management.people.filter((person)=>person.email).map((person)=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className={styles.field}>Prazo<input type="datetime-local" value={assignment.dueAt} onChange={(e)=>setAssignment({...assignment,dueAt:e.target.value})}/></label><button className={styles.primary} disabled={Boolean(saving)||!assignment.versionId||!assignment.reviewerPersonId}>{saving==='assignment'?'Distribuindo…':'Distribuir para avaliação'}</button></form></article>

        <article className={`${styles.card} ${styles.wide}`}><h2>Acompanhamento</h2><p>Modo de avaliação: <strong>{modeLabel[management.reviewMode]}</strong>. O painel apenas acompanha status, conflitos informados e pareceres recebidos.</p><div className={styles.list}>{management.assignments.length===0?<p>Nenhuma atribuição criada ainda.</p>:management.assignments.map((item)=><div className={styles.row} key={item.id}><div><strong>{item.submission.title}</strong><small>{item.reviewer.name} · versão {item.version.versionNumber} · {item.conflictStatus==='CONFLICT'?'conflito declarado':item.status}</small></div><span className={styles.badge}>{item.weightedScore==null?'Sem nota':`Nota ${item.weightedScore.toFixed(2)}`}</span><button type="button" className={styles.secondary} disabled={Boolean(saving)} onClick={()=>void issueAccess(item.reviewer.id)}>Gerar acesso</button></div>)}</div>
          <h3>Decisão científica</h3>
          <div className={styles.list}>{management.submissions.filter((item)=>item.status==='UNDER_REVIEW').length===0?<p>Nenhum trabalho aguarda decisão.</p>:management.submissions.filter((item)=>item.status==='UNDER_REVIEW').map((item)=><div className={styles.row} key={item.id}><div><strong>{item.title}</strong></div><div><button type="button" className={styles.primary} disabled={Boolean(saving)} onClick={()=>void decide(item.id,'ACCEPTED')}>Aceitar</button><button type="button" className={styles.secondary} disabled={Boolean(saving)} onClick={()=>void decide(item.id,'ACCEPTED_WITH_CHANGES')}>Aceitar com alteração</button><button type="button" className={styles.secondary} disabled={Boolean(saving)} onClick={()=>void decide(item.id,'REJECTED')}>Recusar</button></div></div>)}</div>
        </article>
      </section>
    </section>
  </main>;
}
