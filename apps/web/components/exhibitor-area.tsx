'use client';

import { useEffect, useState } from 'react';
import styles from './exhibitor-area.module.css';

type Tab = 'home' | 'profile' | 'representatives' | 'credentials' | 'forms' | 'orders' | 'downloads' | 'message';

type Area = {
  event: { name: string; slug: string };
  sessionExpiresAt: string;
  company: {
    id: string;
    kind: 'EXHIBITOR' | 'PROVIDER';
    nationality: 'BRAZILIAN' | 'FOREIGN';
    document: string;
    loginEmail: string;
    legalName: string;
    tradeName: string;
    segment: string;
    booth: string;
    areaLabel: string;
    quotaExhibitor: number;
    quotaAssembler: number;
    quotaService: number;
    contactName: string;
    contactRole: string;
    contactEmail: string;
    postalCode: string;
    street: string;
    addressNumber: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    country: string;
    phone: string;
    remaining: { EXHIBITOR: number; ASSEMBLER: number; SERVICE: number };
  };
  credentials: Array<{
    id: string;
    companyId: string;
    kind: 'EXHIBITOR' | 'ASSEMBLER' | 'SERVICE';
    nationality: 'BRAZILIAN' | 'FOREIGN';
    document: string;
    fullName: string;
    badgeName: string;
    role: string;
    phone: string;
    mobile: string;
    credentialedAt: string | null;
    printedAt: string | null;
  }>;
  representatives: Array<{ id: string; name: string; role: string; email: string }>;
  forms: Array<{ title: string; products: Array<{ id: string; title: string; unit: string; priceCents: number }> }>;
  orders: Array<{ id: string; productTitle: string; formTitle: string; unit: string; priceCents: number; quantity: number; status: 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' }>;
  downloads: Array<{ id: string; title: string; url: string }>;
  messages: Array<{ id: string; subject: string; body: string; createdAt: string }>;
};

const KIND_LABEL = { EXHIBITOR: 'Crachá de expositor', ASSEMBLER: 'Montador', SERVICE: 'Serviço' };
const ORDER_LABEL = { REQUESTED: 'Solicitado', CONFIRMED: 'Confirmado', CANCELLED: 'Cancelado' };

function money(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function storageKey(slug: string): string {
  return `evolvia_exhibitor_${slug}`;
}

async function exhibitorApi<T>(path: string, token: string | null, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...options, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string | string[] };
  if (!response.ok) {
    const message = payload.error?.message || payload.message || 'Não foi possível concluir a operação.';
    const error = new Error(Array.isArray(message) ? message.join(' ') : message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload as T;
}

export default function ExhibitorArea({ slug }: { slug: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [area, setArea] = useState<Area | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [email, setEmail] = useState('');
  const [documentValue, setDocumentValue] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credential, setCredential] = useState<Partial<Area['credentials'][number]> | null>(null);
  const [representative, setRepresentative] = useState({ name: '', role: '', email: '' });
  const [message, setMessage] = useState({ subject: '', body: '' });
  const [profile, setProfile] = useState<Area['company'] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = window.sessionStorage.getItem(storageKey(slug));
    setToken(stored);
    setReady(true);
  }, [slug]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    exhibitorApi<Area>(`/public/events/${slug}/exhibitor/me`, token)
      .then((result) => { if (active) { setArea(result); setProfile(result.company); } })
      .catch((reason: Error & { status?: number }) => {
        if (!active) return;
        if (reason.status === 401) {
          window.sessionStorage.removeItem(storageKey(slug));
          setToken(null);
          setArea(null);
        }
        setError(reason.message);
      });
    return () => { active = false; };
  }, [slug, token]);

  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar.'); }
  }

  async function reload(current = token) {
    if (!current) return;
    const result = await exhibitorApi<Area>(`/public/events/${slug}/exhibitor/me`, current);
    setArea(result);
    setProfile(result.company);
  }

  if (!ready) return <main className={styles.page}><p>Abrindo a área do expositor...</p></main>;

  if (token && (!area || !profile)) {
    return <main className={styles.page}><p className={styles.workspace}>{error || 'Abrindo a área do expositor...'}</p></main>;
  }

  if (!token || !area || !profile) {
    return <main className={styles.page}>
      <form className={styles.card} onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const session = await exhibitorApi<{ accessToken: string }>(`/public/events/${slug}/exhibitor/sessions`, null, {
            method: 'POST',
            body: JSON.stringify({ email, document: documentValue }),
          });
          window.sessionStorage.setItem(storageKey(slug), session.accessToken);
          setToken(session.accessToken);
          setDocumentValue('');
        });
      }}>
        <p className={styles.eyebrow}>Evolvia</p>
        <h1>Área do expositor</h1>
        <p>O acesso da empresa usa o e-mail cadastrado e o documento da empresa.</p>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <label className={styles.field}>E-mail de acesso
          <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className={styles.field}>Documento da empresa
          <input value={documentValue} autoComplete="off" onChange={(event) => setDocumentValue(event.target.value)} required />
        </label>
        <button className={styles.primary} type="submit">Entrar</button>
      </form>
    </main>;
  }

  const company = area.company;

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <strong>Área do expositor</strong>
      <span>{area.event.name}</span>
      <button className={styles.secondary} type="button" onClick={() => run(async () => {
        await exhibitorApi(`/public/events/${slug}/exhibitor/sessions/current`, token, { method: 'DELETE' });
        window.sessionStorage.removeItem(storageKey(slug));
        setToken(null);
        setArea(null);
      })}>Sair</button>
    </header>
    <div className={styles.workspace}>
      <h1>{company.tradeName}</h1>
      <p>{company.legalName}{company.booth ? ` · Estande ${company.booth}` : ''}{company.areaLabel ? ` · ${company.areaLabel}` : ''}</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      <div className={styles.tabs} role="tablist" aria-label="Área da empresa">
        {([
          ['home', 'Painel'],
          ['profile', 'Dados cadastrais'],
          ['representatives', 'Representante'],
          ['credentials', 'Credenciais'],
          ['forms', 'Formulários'],
          ['orders', 'Pedidos'],
          ['downloads', 'Downloads'],
          ['message', 'Mensagem'],
        ] as const).map(([id, label]) => <button key={id} className={tab === id ? styles.tabActive : styles.tab} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>

      {tab === 'home' && <section className={styles.grid}>
        <article className={styles.card}>
          <h2>Cotas</h2>
          {company.kind === 'EXHIBITOR' && <p>Crachá de expositor: {company.remaining.EXHIBITOR} de {company.quotaExhibitor}</p>}
          <p>Montador: {company.remaining.ASSEMBLER} de {company.quotaAssembler}</p>
          <p>Serviço: {company.remaining.SERVICE} de {company.quotaService}</p>
        </article>
        <article className={styles.card}>
          <h2>Contato</h2>
          <p>{company.contactName} · {company.contactRole}</p>
          <p>{company.contactEmail}</p>
          <button className={styles.primary} type="button" onClick={() => setTab('profile')}>Editar dados da empresa</button>
        </article>
      </section>}

      {tab === 'profile' && <form className={styles.card} onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await exhibitorApi(`/public/events/${slug}/exhibitor/profile`, token, {
            method: 'PATCH',
            body: JSON.stringify({
              contactName: profile.contactName,
              contactRole: profile.contactRole,
              contactEmail: profile.contactEmail,
              postalCode: profile.postalCode,
              street: profile.street,
              addressNumber: profile.addressNumber,
              complement: profile.complement,
              district: profile.district,
              city: profile.city,
              state: profile.state,
              country: profile.country,
              phone: profile.phone,
            }),
          });
          await reload();
          setNotice('Dados da empresa atualizados.');
        });
      }}>
        <h2>Dados cadastrais</h2>
        <p>Documento {company.document}. E-mail de acesso {company.loginEmail}. Cota e documento permanecem com a organização.</p>
        <label className={styles.field}>Nome do contato<input value={profile.contactName} onChange={(event) => setProfile({ ...profile, contactName: event.target.value })} required /></label>
        <label className={styles.field}>Cargo<input value={profile.contactRole} onChange={(event) => setProfile({ ...profile, contactRole: event.target.value })} required /></label>
        <label className={styles.field}>E-mail do contato<input type="email" value={profile.contactEmail} onChange={(event) => setProfile({ ...profile, contactEmail: event.target.value })} required /></label>
        <label className={styles.field}>Telefone<input value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
        <label className={styles.field}>CEP<input value={profile.postalCode} onChange={(event) => setProfile({ ...profile, postalCode: event.target.value })} /></label>
        <label className={styles.field}>Logradouro<input value={profile.street} onChange={(event) => setProfile({ ...profile, street: event.target.value })} /></label>
        <label className={styles.field}>Número<input value={profile.addressNumber} onChange={(event) => setProfile({ ...profile, addressNumber: event.target.value })} /></label>
        <label className={styles.field}>Complemento<input value={profile.complement} onChange={(event) => setProfile({ ...profile, complement: event.target.value })} /></label>
        <label className={styles.field}>Bairro<input value={profile.district} onChange={(event) => setProfile({ ...profile, district: event.target.value })} /></label>
        <label className={styles.field}>Cidade<input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value })} /></label>
        <label className={styles.field}>UF<input value={profile.state} onChange={(event) => setProfile({ ...profile, state: event.target.value })} /></label>
        <label className={styles.field}>País<input value={profile.country} onChange={(event) => setProfile({ ...profile, country: event.target.value })} /></label>
        <button className={styles.primary} type="submit">Salvar dados</button>
      </form>}

      {tab === 'representatives' && <section className={styles.stack}>
        <form className={styles.card} onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await exhibitorApi(`/public/events/${slug}/exhibitor/representatives`, token, { method: 'POST', body: JSON.stringify(representative) });
            setRepresentative({ name: '', role: '', email: '' });
            await reload();
            setNotice('Representante incluído. O acesso dele usa este e-mail e o documento da empresa.');
          });
        }}>
          <h2>Representante</h2>
          <label className={styles.field}>Nome<input value={representative.name} onChange={(event) => setRepresentative({ ...representative, name: event.target.value })} required /></label>
          <label className={styles.field}>Cargo<input value={representative.role} onChange={(event) => setRepresentative({ ...representative, role: event.target.value })} required /></label>
          <label className={styles.field}>E-mail<input type="email" value={representative.email} onChange={(event) => setRepresentative({ ...representative, email: event.target.value })} required /></label>
          <button className={styles.primary} type="submit">Incluir representante</button>
        </form>
        <ul className={styles.list}>
          {area.representatives.map((person) => <li key={person.id}>{person.name} · {person.role} · {person.email}</li>)}
        </ul>
      </section>}

      {tab === 'credentials' && <section className={styles.stack}>
        <button className={styles.primary} type="button" onClick={() => setCredential({
          companyId: company.id,
          kind: company.kind === 'EXHIBITOR' && company.remaining.EXHIBITOR > 0 ? 'EXHIBITOR' : company.remaining.ASSEMBLER > 0 ? 'ASSEMBLER' : 'SERVICE',
          nationality: 'BRAZILIAN',
        })}>Cadastrar equipe</button>
        {credential && <form className={styles.card} onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await exhibitorApi(`/public/events/${slug}/exhibitor/credentials`, token, {
              method: 'POST',
              body: JSON.stringify({
                ...(credential.id ? { id: credential.id } : {}),
                companyId: company.id,
                kind: credential.kind,
                nationality: credential.nationality,
                document: credential.document ?? '',
                fullName: credential.fullName ?? '',
                badgeName: credential.badgeName ?? '',
                role: credential.role ?? '',
                phone: credential.phone ?? '',
                mobile: credential.mobile ?? '',
              }),
            });
            setCredential(null);
            await reload();
            setNotice('Credencial salva dentro da cota.');
          });
        }}>
          <label className={styles.field}>Tipo
            <select value={credential.kind ?? 'SERVICE'} onChange={(event) => setCredential({ ...credential, kind: event.target.value as Area['credentials'][number]['kind'] })}>
              {company.kind === 'EXHIBITOR' && <option value="EXHIBITOR">Crachá de expositor</option>}
              <option value="ASSEMBLER">Montador</option>
              <option value="SERVICE">Serviço</option>
            </select>
          </label>
          <label className={styles.field}>Nacionalidade
            <select value={credential.nationality ?? 'BRAZILIAN'} onChange={(event) => setCredential({ ...credential, nationality: event.target.value as 'BRAZILIAN' | 'FOREIGN' })}>
              <option value="BRAZILIAN">Brasileiro</option>
              <option value="FOREIGN">Estrangeiro</option>
            </select>
          </label>
          <label className={styles.field}>{credential.nationality === 'FOREIGN' ? 'Passaporte' : 'CPF'}
            <input value={credential.document ?? ''} onChange={(event) => setCredential({ ...credential, document: event.target.value })} required />
          </label>
          <label className={styles.field}>Nome completo<input value={credential.fullName ?? ''} onChange={(event) => setCredential({ ...credential, fullName: event.target.value })} required /></label>
          <label className={styles.field}>Nome no crachá<input value={credential.badgeName ?? ''} onChange={(event) => setCredential({ ...credential, badgeName: event.target.value })} required /></label>
          <label className={styles.field}>Cargo<input value={credential.role ?? ''} onChange={(event) => setCredential({ ...credential, role: event.target.value })} required /></label>
          <label className={styles.field}>Telefone<input value={credential.phone ?? ''} onChange={(event) => setCredential({ ...credential, phone: event.target.value })} /></label>
          <label className={styles.field}>Celular<input value={credential.mobile ?? ''} onChange={(event) => setCredential({ ...credential, mobile: event.target.value })} /></label>
          <button className={styles.primary} type="submit">Salvar credencial</button>
        </form>}
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Tipo</th><th>Nome</th><th>Crachá</th><th>Cargo</th><th>Credenciado</th><th>Impresso</th></tr></thead>
            <tbody>
              {area.credentials.map((item) => <tr key={item.id}>
                <td>{KIND_LABEL[item.kind]}</td>
                <td>{item.fullName}</td>
                <td>{item.badgeName}</td>
                <td>{item.role}</td>
                <td>{item.credentialedAt ? 'Sim' : 'Não'}</td>
                <td>{item.printedAt ? 'Sim' : 'Não'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>}

      {tab === 'forms' && <section className={styles.stack}>
        <p>A solicitação fica registrada para o organizador confirmar. Ela não emite boleto.</p>
        {area.forms.map((form) => <article key={form.title} className={styles.card}>
          <h2>{form.title}</h2>
          <table>
            <thead><tr><th>Descrição</th><th>Medida</th><th>Valor</th><th>Quantidade</th></tr></thead>
            <tbody>
              {form.products.map((product) => <tr key={product.id}>
                <td>{product.title}</td>
                <td>{product.unit}</td>
                <td>{money(product.priceCents)}</td>
                <td>
                  <input className={styles.quantity} type="number" min={1} max={999} value={quantities[product.id] ?? 1} onChange={(event) => setQuantities({ ...quantities, [product.id]: Number(event.target.value) })} aria-label={`Quantidade de ${product.title}`} />
                  <button className={styles.secondary} type="button" onClick={() => run(async () => {
                    await exhibitorApi(`/public/events/${slug}/exhibitor/orders`, token, {
                      method: 'POST',
                      body: JSON.stringify({ productId: product.id, quantity: Math.trunc(quantities[product.id] ?? 1) }),
                    });
                    await reload();
                    setNotice('Solicitação registrada.');
                  })}>Solicitar</button>
                </td>
              </tr>)}
            </tbody>
          </table>
        </article>)}
      </section>}

      {tab === 'orders' && <div className={styles.tableWrap}>
        <table>
          <thead><tr><th>Formulário</th><th>Descrição</th><th>Quantidade</th><th>Valor</th><th>Situação</th></tr></thead>
          <tbody>
            {area.orders.map((order) => <tr key={order.id}>
              <td>{order.formTitle}</td>
              <td>{order.productTitle}</td>
              <td>{order.quantity} {order.unit}</td>
              <td>{money(order.priceCents * order.quantity)}</td>
              <td>{ORDER_LABEL[order.status]}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}

      {tab === 'downloads' && <ul className={styles.list}>
        {area.downloads.length === 0 && <li>Nenhum arquivo publicado.</li>}
        {area.downloads.map((item) => <li key={item.id}><a href={item.url} rel="noopener noreferrer">{item.title}</a></li>)}
      </ul>}

      {tab === 'message' && <section className={styles.stack}>
        <form className={styles.card} onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await exhibitorApi(`/public/events/${slug}/exhibitor/messages`, token, { method: 'POST', body: JSON.stringify(message) });
            setMessage({ subject: '', body: '' });
            await reload();
            setNotice('Mensagem enviada à organização.');
          });
        }}>
          <h2>Mensagem</h2>
          <label className={styles.field}>E-mail do contato<input type="email" value={company.contactEmail} readOnly /></label>
          <label className={styles.field}>Assunto<input value={message.subject} onChange={(event) => setMessage({ ...message, subject: event.target.value })} required /></label>
          <label className={styles.field}>Mensagem<textarea value={message.body} onChange={(event) => setMessage({ ...message, body: event.target.value })} required /></label>
          <button className={styles.primary} type="submit">Enviar</button>
        </form>
        <ul className={styles.list}>
          {area.messages.map((item) => <li key={item.id}><strong>{item.subject}</strong><p>{item.body}</p></li>)}
        </ul>
      </section>}
    </div>
  </main>;
}
