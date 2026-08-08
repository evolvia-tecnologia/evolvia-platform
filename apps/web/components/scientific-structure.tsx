'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '../lib/api';
import styles from './scientific-structure.module.css';

type Role = { id: string; label: string; description?: string | null };
type Person = {
  id: string;
  name: string;
  email?: string | null;
  institution?: string | null;
  orcid?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  roleAssignments: Array<{ id: string; role: Role }>;
};
type CommitteeMembership = {
  id: string;
  isChair: boolean;
  person: Person;
  role?: Role | null;
};
type Committee = {
  id: string;
  name: string;
  description?: string | null;
  memberships: CommitteeMembership[];
};
type TaxonomyLevel = 'AREA' | 'SUBAREA' | 'TOPIC';
type TaxonomyNode = {
  id: string;
  parentId?: string | null;
  level: TaxonomyLevel;
  name: string;
  description?: string | null;
  sortOrder: number;
  active: boolean;
};
type Payload = {
  event: {
    id: string;
    name: string;
    status: string;
    organization: { id: string; name: string };
  };
  summary: {
    people: number;
    roles: number;
    committees: number;
    areas: number;
    subareas: number;
    topics: number;
  };
  people: Person[];
  roles: Role[];
  committees: Committee[];
  taxonomy: TaxonomyNode[];
};

const levelLabels: Record<TaxonomyLevel, string> = {
  AREA: 'Área',
  SUBAREA: 'Subárea',
  TOPIC: 'Tema',
};

export default function ScientificStructure({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [person, setPerson] = useState({ name: '', email: '', institution: '', orcid: '' });
  const [role, setRole] = useState({ label: '', description: '' });
  const [personRole, setPersonRole] = useState({ personId: '', roleId: '' });
  const [committee, setCommittee] = useState({ name: '', description: '' });
  const [member, setMember] = useState({ committeeId: '', personId: '', roleId: '', isChair: false });
  const [taxonomy, setTaxonomy] = useState<{ name: string; level: TaxonomyLevel; parentId: string; description: string }>({
    name: '',
    level: 'AREA',
    parentId: '',
    description: '',
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    let active = true;
    api<Payload>(`/scientific-events/${eventId}/structure`)
      .then((result) => active && setPayload(result))
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a estrutura científica.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId, router]);

  const areas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'AREA') ?? [], [payload]);
  const subareas = useMemo(() => payload?.taxonomy.filter((item) => item.level === 'SUBAREA') ?? [], [payload]);
  const parentOptions = taxonomy.level === 'SUBAREA' ? areas : taxonomy.level === 'TOPIC' ? subareas : [];

  async function mutate(path: string, body: unknown, key: string) {
    setBusy(key);
    setError('');
    try {
      const result = await api<Payload>(`/scientific-events/${eventId}/structure/${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPayload(result);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar esta configuração.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function submitPerson(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate('people', {
      name: person.name,
      email: person.email || undefined,
      institution: person.institution || undefined,
      orcid: person.orcid || undefined,
    }, 'person');
    if (ok) setPerson({ name: '', email: '', institution: '', orcid: '' });
  }

  async function submitRole(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate('roles', role, 'role');
    if (ok) setRole({ label: '', description: '' });
  }

  async function submitPersonRole(event: FormEvent) {
    event.preventDefault();
    if (!personRole.personId || !personRole.roleId) return setError('Escolha a pessoa e o papel.');
    const ok = await mutate('person-roles', personRole, 'person-role');
    if (ok) setPersonRole({ personId: '', roleId: '' });
  }

  async function submitCommittee(event: FormEvent) {
    event.preventDefault();
    const ok = await mutate('committees', committee, 'committee');
    if (ok) setCommittee({ name: '', description: '' });
  }

  async function submitMember(event: FormEvent) {
    event.preventDefault();
    if (!member.committeeId || !member.personId) return setError('Escolha a comissão e a pessoa.');
    const ok = await mutate('committee-members', {
      committeeId: member.committeeId,
      personId: member.personId,
      roleId: member.roleId || undefined,
      isChair: member.isChair,
    }, 'member');
    if (ok) setMember({ committeeId: '', personId: '', roleId: '', isChair: false });
  }

  async function submitTaxonomy(event: FormEvent) {
    event.preventDefault();
    if (taxonomy.level !== 'AREA' && !taxonomy.parentId) {
      return setError(taxonomy.level === 'SUBAREA' ? 'Escolha a área da subárea.' : 'Escolha a subárea do tema.');
    }
    const ok = await mutate('taxonomy', {
      name: taxonomy.name,
      level: taxonomy.level,
      parentId: taxonomy.parentId || undefined,
      description: taxonomy.description || undefined,
    }, 'taxonomy');
    if (ok) setTaxonomy({ name: '', level: taxonomy.level, parentId: '', description: '' });
  }

  if (loading) {
    return <main className={styles.page}><div className={styles.loading}><strong>EVA</strong><p>Preparando a estrutura científica...</p></div></main>;
  }

  if (!payload) {
    return <main className={styles.page}><section className={styles.container}><div className={styles.error}>{error || 'A estrutura científica não pôde ser carregada.'}</div><Link href="/painel" className={styles.button}>Voltar ao painel</Link></section></main>;
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <Link className={styles.brand} href="/painel">EVOLVIA</Link>
      <div className={styles.topActions}>
        <Link href={`/eventos/${eventId}/cientifico`} className={styles.ghostButton}>Central científica</Link>
        <Link href="/painel" className={styles.ghostButton}>Painel</Link>
      </div>
    </header>

    <section className={styles.container}>
      <div className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>GATE A3 · ESTRUTURA CIENTÍFICA</p>
          <h1>{payload.event.name}</h1>
          <p className={styles.lead}>Organize pessoas, responsabilidades, comissões e a taxonomia científica antes de abrir os próximos módulos. Tudo fica no contexto deste evento e da organização responsável.</p>
        </div>
        <div className={styles.eva}><strong>EVA</strong><p>Comece pelas áreas científicas e pelos papéis essenciais. Você pode completar a estrutura aos poucos, sem publicar nada.</p></div>
      </div>

      <div className={styles.metrics}>
        <div><strong>{payload.summary.people}</strong><span>Pessoas</span></div>
        <div><strong>{payload.summary.roles}</strong><span>Papéis</span></div>
        <div><strong>{payload.summary.committees}</strong><span>Comissões</span></div>
        <div><strong>{payload.summary.areas}</strong><span>Áreas</span></div>
        <div><strong>{payload.summary.subareas}</strong><span>Subáreas</span></div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>1</span><h2>Pessoas</h2></div><p>Cadastre quem participa da estrutura científica.</p></div>
          <form className={styles.form} onSubmit={submitPerson}>
            <label>Nome completo<input required minLength={2} maxLength={120} value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></label>
            <div className={styles.formRow}>
              <label>E-mail<input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></label>
              <label>Instituição<input value={person.institution} onChange={(e) => setPerson({ ...person, institution: e.target.value })} /></label>
            </div>
            <label>ORCID <small>opcional</small><input placeholder="0000-0000-0000-0000" value={person.orcid} onChange={(e) => setPerson({ ...person, orcid: e.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === 'person' ? 'Salvando…' : 'Adicionar pessoa'}</button>
          </form>
          <div className={styles.list}>
            {payload.people.length === 0 ? <p className={styles.empty}>Nenhuma pessoa cadastrada ainda.</p> : payload.people.map((item) => <div className={styles.listItem} key={item.id}><div><strong>{item.name}</strong><span>{item.institution || item.email || 'Sem instituição informada'}</span></div><div className={styles.chips}>{item.roleAssignments.map((assignment) => <span key={assignment.id}>{assignment.role.label}</span>)}</div></div>)}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>2</span><h2>Papéis</h2></div><p>Defina responsabilidades sem limitar o evento a uma lista fixa.</p></div>
          <form className={styles.form} onSubmit={submitRole}>
            <label>Nome do papel<input required minLength={2} maxLength={100} placeholder="Ex.: Coordenador científico" value={role.label} onChange={(e) => setRole({ ...role, label: e.target.value })} /></label>
            <label>Descrição <small>opcional</small><textarea value={role.description} onChange={(e) => setRole({ ...role, description: e.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === 'role' ? 'Salvando…' : 'Criar papel'}</button>
          </form>
          <div className={styles.chipCloud}>{payload.roles.map((item) => <span key={item.id}>{item.label}</span>)}</div>
          <form className={`${styles.form} ${styles.subform}`} onSubmit={submitPersonRole}>
            <h3>Atribuir papel</h3>
            <div className={styles.formRow}>
              <label>Pessoa<select value={personRole.personId} onChange={(e) => setPersonRole({ ...personRole, personId: e.target.value })}><option value="">Selecione</option>{payload.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Papel<select value={personRole.roleId} onChange={(e) => setPersonRole({ ...personRole, roleId: e.target.value })}><option value="">Selecione</option>{payload.roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>
            <button disabled={Boolean(busy) || !payload.people.length || !payload.roles.length}>{busy === 'person-role' ? 'Salvando…' : 'Atribuir papel'}</button>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>3</span><h2>Comissões</h2></div><p>Monte comissões com responsáveis e membros.</p></div>
          <form className={styles.form} onSubmit={submitCommittee}>
            <label>Nome da comissão<input required minLength={2} maxLength={120} placeholder="Ex.: Comissão Científica" value={committee.name} onChange={(e) => setCommittee({ ...committee, name: e.target.value })} /></label>
            <label>Descrição <small>opcional</small><textarea value={committee.description} onChange={(e) => setCommittee({ ...committee, description: e.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === 'committee' ? 'Salvando…' : 'Criar comissão'}</button>
          </form>
          <form className={`${styles.form} ${styles.subform}`} onSubmit={submitMember}>
            <h3>Adicionar integrante</h3>
            <label>Comissão<select value={member.committeeId} onChange={(e) => setMember({ ...member, committeeId: e.target.value })}><option value="">Selecione</option>{payload.committees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className={styles.formRow}>
              <label>Pessoa<select value={member.personId} onChange={(e) => setMember({ ...member, personId: e.target.value })}><option value="">Selecione</option>{payload.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Papel na comissão<select value={member.roleId} onChange={(e) => setMember({ ...member, roleId: e.target.value })}><option value="">Sem papel específico</option>{payload.roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            </div>
            <label className={styles.check}><input type="checkbox" checked={member.isChair} onChange={(e) => setMember({ ...member, isChair: e.target.checked })} /> Responsável principal pela comissão</label>
            <button disabled={Boolean(busy) || !payload.committees.length || !payload.people.length}>{busy === 'member' ? 'Salvando…' : 'Adicionar à comissão'}</button>
          </form>
          <div className={styles.list}>{payload.committees.map((item) => <div className={styles.committee} key={item.id}><strong>{item.name}</strong><span>{item.memberships.length} integrante(s)</span>{item.memberships.map((membership) => <p key={membership.id}>{membership.isChair ? '★ ' : ''}{membership.person.name}{membership.role ? ` · ${membership.role.label}` : ''}</p>)}</div>)}</div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>4</span><h2>Áreas e taxonomia</h2></div><p>Organize a árvore Área → Subárea → Tema.</p></div>
          <form className={styles.form} onSubmit={submitTaxonomy}>
            <div className={styles.formRow}>
              <label>Nível<select value={taxonomy.level} onChange={(e) => setTaxonomy({ ...taxonomy, level: e.target.value as TaxonomyLevel, parentId: '' })}><option value="AREA">Área</option><option value="SUBAREA">Subárea</option><option value="TOPIC">Tema</option></select></label>
              {taxonomy.level !== 'AREA' && <label>{taxonomy.level === 'SUBAREA' ? 'Área superior' : 'Subárea superior'}<select value={taxonomy.parentId} onChange={(e) => setTaxonomy({ ...taxonomy, parentId: e.target.value })}><option value="">Selecione</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            </div>
            <label>Nome<input required minLength={2} maxLength={140} value={taxonomy.name} onChange={(e) => setTaxonomy({ ...taxonomy, name: e.target.value })} /></label>
            <label>Descrição <small>opcional</small><textarea value={taxonomy.description} onChange={(e) => setTaxonomy({ ...taxonomy, description: e.target.value })} /></label>
            <button disabled={Boolean(busy)}>{busy === 'taxonomy' ? 'Salvando…' : `Adicionar ${levelLabels[taxonomy.level].toLowerCase()}`}</button>
          </form>
          <div className={styles.taxonomyTree}>
            {areas.length === 0 ? <p className={styles.empty}>Comece criando a primeira área científica.</p> : areas.map((area) => <div className={styles.area} key={area.id}><strong>{area.name}</strong>{subareas.filter((item) => item.parentId === area.id).map((subarea) => <div className={styles.subarea} key={subarea.id}><span>{subarea.name}</span>{payload.taxonomy.filter((item) => item.level === 'TOPIC' && item.parentId === subarea.id).map((topic) => <small key={topic.id}>{topic.name}</small>)}</div>)}</div>)}
          </div>
        </section>
      </div>

      <div className={styles.footerNote}><strong>Gate A3 em configuração</strong><p>Nenhuma dessas alterações publica o evento. Palestrantes, programação, submissões e avaliação continuam nos Gates seguintes.</p></div>
    </section>
  </main>;
}
