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
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Grade científica.'))
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
    if (!personRole.personId || !personRole.roleId) return setError('Escolha o membro da programação científica e o tipo de participação.');
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
    if (!member.committeeId || !member.personId) return setError('Escolha a comissão e o membro da programação científica.');
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
    return <main className={styles.page}><div className={styles.loading}><strong>EVA</strong><p>Preparando a Grade científica...</p></div></main>;
  }

  if (!payload) {
    return <main className={styles.page}><section className={styles.container}><div className={styles.error}>{error || 'A Grade científica não pôde ser carregada.'}</div><Link href="/painel" className={styles.button}>Voltar ao painel</Link></section></main>;
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
          <p className={styles.eyebrow}>GATE A3 · GRADE CIENTÍFICA</p>
          <h1>{payload.event.name}</h1>
          <p className={styles.lead}>Monte a Grade científica definindo os membros da programação, os tipos de participação, as comissões e as áreas de conhecimento. Cada campo explica para que serve e traz um exemplo prático.</p>
        </div>
        <div className={styles.eva}><strong>EVA</strong><p>Você não precisa preencher tudo de uma vez. Use somente o que fizer sentido para seu evento; os exemplos abaixo ajudam a decidir o que realmente precisa ser cadastrado.</p></div>
      </div>

      <div className={styles.metrics}>
        <div><strong>{payload.summary.people}</strong><span>Membros da Programação Científica</span></div>
        <div><strong>{payload.summary.roles}</strong><span>Tipos de participação</span></div>
        <div><strong>{payload.summary.committees}</strong><span>Comissões</span></div>
        <div><strong>{payload.summary.areas}</strong><span>Áreas</span></div>
        <div><strong>{payload.summary.subareas}</strong><span>Subáreas</span></div>
      </div>

      {error && <div className={styles.error} role="alert">{error}</div>}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>1</span><h2>Membros da Programação Científica</h2></div><p>Cadastre quem terá alguma participação científica no evento. O mesmo cadastro poderá ser reutilizado nos próximos Gates.</p></div>
          <form className={styles.form} onSubmit={submitPerson}>
            <label>Nome do Membro da Programação Científica
              <span className={styles.fieldHelp}>Quem é: nome que identifica o membro na organização científica e nos módulos seguintes. Ex.: Dra. Ana Paula Ribeiro.</span>
              <input required minLength={2} maxLength={120} placeholder="Ex.: Dra. Ana Paula Ribeiro" value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} />
            </label>
            <div className={styles.formRow}>
              <label>E-mail <small>opcional</small>
                <span className={styles.fieldHelp}>Use quando o membro receberá convite, comunicação ou acesso futuro. Ex.: ana.ribeiro@universidade.br.</span>
                <input type="email" placeholder="Ex.: ana.ribeiro@universidade.br" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} />
              </label>
              <label>Instituição <small>opcional</small>
                <span className={styles.fieldHelp}>Informe a universidade, empresa, hospital ou entidade à qual o membro está vinculado. Ex.: Universidade Federal de Minas Gerais.</span>
                <input placeholder="Ex.: Universidade Federal de Minas Gerais" value={person.institution} onChange={(e) => setPerson({ ...person, institution: e.target.value })} />
              </label>
            </div>
            <label>ORCID <small>opcional</small>
              <span className={styles.fieldHelp}>Use principalmente para pesquisadores e autores que possuem identificador ORCID. Se não existir, deixe em branco. Ex.: 0000-0002-1825-0097.</span>
              <input placeholder="Ex.: 0000-0002-1825-0097" value={person.orcid} onChange={(e) => setPerson({ ...person, orcid: e.target.value })} />
            </label>
            <button disabled={Boolean(busy)}>{busy === 'person' ? 'Salvando…' : 'Adicionar membro'}</button>
          </form>
          <div className={styles.list}>
            {payload.people.length === 0 ? <p className={styles.empty}>Nenhum membro da programação científica cadastrado ainda.</p> : payload.people.map((item) => <div className={styles.listItem} key={item.id}><div><strong>{item.name}</strong><span>{item.institution || item.email || 'Sem instituição informada'}</span></div><div className={styles.chips}>{item.roleAssignments.map((assignment) => <span key={assignment.id}>{assignment.role.label}</span>)}</div></div>)}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>2</span><h2>Tipo de participação</h2></div><p>Crie as formas de participação que existem na sua Grade científica e depois vincule cada membro à participação correta.</p></div>
          <form className={styles.form} onSubmit={submitRole}>
            <label>Nome do tipo de participação
              <span className={styles.fieldHelp}>Use para dizer qual responsabilidade ou atuação o membro terá. Ex.: Coordenador científico, Avaliador, Membro da Comissão Científica.</span>
              <input required minLength={2} maxLength={100} placeholder="Ex.: Coordenador científico" value={role.label} onChange={(e) => setRole({ ...role, label: e.target.value })} />
            </label>
            <label>Descrição <small>opcional</small>
              <span className={styles.fieldHelp}>Explique quando esse tipo deve ser usado. Ex.: Responsável por coordenar a seleção de temas e acompanhar a comissão científica.</span>
              <textarea placeholder="Ex.: Responsável por coordenar a seleção de temas e acompanhar a comissão científica." value={role.description} onChange={(e) => setRole({ ...role, description: e.target.value })} />
            </label>
            <button disabled={Boolean(busy)}>{busy === 'role' ? 'Salvando…' : 'Criar tipo de participação'}</button>
          </form>
          <div className={styles.chipCloud}>{payload.roles.map((item) => <span key={item.id}>{item.label}</span>)}</div>
          <form className={`${styles.form} ${styles.subform}`} onSubmit={submitPersonRole}>
            <h3>Vincular tipo de participação</h3>
            <p className={styles.subformHelp}>Exemplo: selecione “Dra. Ana Paula Ribeiro” e depois “Coordenador científico”. Isso registra como ela participa da Grade científica.</p>
            <div className={styles.formRow}>
              <label>Nome do Membro da Programação Científica
                <span className={styles.fieldHelp}>Escolha um membro já cadastrado no bloco anterior.</span>
                <select value={personRole.personId} onChange={(e) => setPersonRole({ ...personRole, personId: e.target.value })}><option value="">Selecione o membro</option>{payload.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>
              <label>Tipo de participação
                <span className={styles.fieldHelp}>Escolha como este membro participa. Ex.: Coordenador científico.</span>
                <select value={personRole.roleId} onChange={(e) => setPersonRole({ ...personRole, roleId: e.target.value })}><option value="">Selecione o tipo</option>{payload.roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              </label>
            </div>
            <button disabled={Boolean(busy) || !payload.people.length || !payload.roles.length}>{busy === 'person-role' ? 'Salvando…' : 'Vincular participação'}</button>
          </form>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>3</span><h2>Comissões</h2></div><p>Use quando o evento tiver grupos formais de trabalho, como Comissão Científica, Comissão Avaliadora ou Comissão Organizadora.</p></div>
          <form className={styles.form} onSubmit={submitCommittee}>
            <label>Nome da comissão
              <span className={styles.fieldHelp}>Crie somente as comissões que realmente existirem no evento. Ex.: Comissão Científica.</span>
              <input required minLength={2} maxLength={120} placeholder="Ex.: Comissão Científica" value={committee.name} onChange={(e) => setCommittee({ ...committee, name: e.target.value })} />
            </label>
            <label>Descrição <small>opcional</small>
              <span className={styles.fieldHelp}>Explique a responsabilidade da comissão. Ex.: Responsável por definir áreas temáticas e acompanhar a avaliação dos trabalhos.</span>
              <textarea placeholder="Ex.: Responsável por definir áreas temáticas e acompanhar a avaliação dos trabalhos." value={committee.description} onChange={(e) => setCommittee({ ...committee, description: e.target.value })} />
            </label>
            <button disabled={Boolean(busy)}>{busy === 'committee' ? 'Salvando…' : 'Criar comissão'}</button>
          </form>
          <form className={`${styles.form} ${styles.subform}`} onSubmit={submitMember}>
            <h3>Adicionar integrante</h3>
            <p className={styles.subformHelp}>Exemplo: incluir “Dra. Ana Paula Ribeiro” na “Comissão Científica” como “Coordenador científico”.</p>
            <label>Comissão
              <span className={styles.fieldHelp}>Escolha em qual comissão o membro atuará.</span>
              <select value={member.committeeId} onChange={(e) => setMember({ ...member, committeeId: e.target.value })}><option value="">Selecione a comissão</option>{payload.committees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </label>
            <div className={styles.formRow}>
              <label>Nome do Membro da Programação Científica
                <span className={styles.fieldHelp}>Escolha quem fará parte da comissão.</span>
                <select value={member.personId} onChange={(e) => setMember({ ...member, personId: e.target.value })}><option value="">Selecione o membro</option>{payload.people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>
              <label>Tipo de participação na comissão <small>opcional</small>
                <span className={styles.fieldHelp}>Use quando precisar registrar a função específica dentro da comissão. Ex.: Coordenador científico. Pode ficar vazio para integrante sem função diferenciada.</span>
                <select value={member.roleId} onChange={(e) => setMember({ ...member, roleId: e.target.value })}><option value="">Sem tipo específico</option>{payload.roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
              </label>
            </div>
            <label className={styles.check}><input type="checkbox" checked={member.isChair} onChange={(e) => setMember({ ...member, isChair: e.target.checked })} /> Responsável principal pela comissão</label>
            <span className={styles.fieldHelp}>Marque somente para quem lidera ou responde oficialmente pela comissão. Ex.: presidente ou coordenador da Comissão Científica.</span>
            <button disabled={Boolean(busy) || !payload.committees.length || !payload.people.length}>{busy === 'member' ? 'Salvando…' : 'Adicionar à comissão'}</button>
          </form>
          <div className={styles.list}>{payload.committees.map((item) => <div className={styles.committee} key={item.id}><strong>{item.name}</strong><span>{item.memberships.length} integrante(s)</span>{item.memberships.map((membership) => <p key={membership.id}>{membership.isChair ? '★ ' : ''}{membership.person.name}{membership.role ? ` · ${membership.role.label}` : ''}</p>)}</div>)}</div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}><div><span>4</span><h2>Áreas, subáreas e temas</h2></div><p>Use esta classificação quando trabalhos, palestras ou avaliações precisarem ser organizados por assunto. A sequência é Área → Subárea → Tema.</p></div>
          <form className={styles.form} onSubmit={submitTaxonomy}>
            <div className={styles.formRow}>
              <label>Nível
                <span className={styles.fieldHelp}>Área é o grupo principal; Subárea detalha uma área; Tema é o assunto mais específico. Ex.: Saúde → Cardiologia → Insuficiência cardíaca.</span>
                <select value={taxonomy.level} onChange={(e) => setTaxonomy({ ...taxonomy, level: e.target.value as TaxonomyLevel, parentId: '' })}><option value="AREA">Área</option><option value="SUBAREA">Subárea</option><option value="TOPIC">Tema</option></select>
              </label>
              {taxonomy.level !== 'AREA' && <label>{taxonomy.level === 'SUBAREA' ? 'Área superior' : 'Subárea superior'}
                <span className={styles.fieldHelp}>{taxonomy.level === 'SUBAREA' ? 'Escolha a área à qual esta subárea pertence. Ex.: Cardiologia dentro de Saúde.' : 'Escolha a subárea à qual este tema pertence. Ex.: Insuficiência cardíaca dentro de Cardiologia.'}</span>
                <select value={taxonomy.parentId} onChange={(e) => setTaxonomy({ ...taxonomy, parentId: e.target.value })}><option value="">Selecione</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>}
            </div>
            <label>Nome
              <span className={styles.fieldHelp}>{taxonomy.level === 'AREA' ? 'Ex.: Saúde.' : taxonomy.level === 'SUBAREA' ? 'Ex.: Cardiologia.' : 'Ex.: Insuficiência cardíaca.'}</span>
              <input required minLength={2} maxLength={140} placeholder={taxonomy.level === 'AREA' ? 'Ex.: Saúde' : taxonomy.level === 'SUBAREA' ? 'Ex.: Cardiologia' : 'Ex.: Insuficiência cardíaca'} value={taxonomy.name} onChange={(e) => setTaxonomy({ ...taxonomy, name: e.target.value })} />
            </label>
            <label>Descrição <small>opcional</small>
              <span className={styles.fieldHelp}>Use se o nome sozinho não deixar claro o que deve ser classificado aqui. Ex.: Trabalhos sobre diagnóstico, tratamento e prevenção de doenças cardiovasculares.</span>
              <textarea placeholder="Ex.: Trabalhos sobre diagnóstico, tratamento e prevenção de doenças cardiovasculares." value={taxonomy.description} onChange={(e) => setTaxonomy({ ...taxonomy, description: e.target.value })} />
            </label>
            <button disabled={Boolean(busy)}>{busy === 'taxonomy' ? 'Salvando…' : `Adicionar ${levelLabels[taxonomy.level].toLowerCase()}`}</button>
          </form>
          <div className={styles.taxonomyTree}>
            {areas.length === 0 ? <p className={styles.empty}>Comece criando a primeira área da Grade científica. Ex.: Saúde, Tecnologia, Educação ou outra área compatível com seu evento.</p> : areas.map((area) => <div className={styles.area} key={area.id}><strong>{area.name}</strong>{subareas.filter((item) => item.parentId === area.id).map((subarea) => <div className={styles.subarea} key={subarea.id}><span>{subarea.name}</span>{payload.taxonomy.filter((item) => item.level === 'TOPIC' && item.parentId === subarea.id).map((topic) => <small key={topic.id}>{topic.name}</small>)}</div>)}</div>)}
          </div>
        </section>
      </div>

      <div className={styles.footerNote}><strong>Grade científica em configuração</strong><p>Nenhuma dessas alterações publica o evento. Palestrantes, programação, submissões e avaliação continuam nos Gates seguintes.</p></div>
    </section>
  </main>;
}
