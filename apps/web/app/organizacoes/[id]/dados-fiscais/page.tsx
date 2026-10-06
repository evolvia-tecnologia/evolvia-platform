'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ApiError, api, getToken } from '../../../../lib/api';
import styles from './page.module.css';

type Kind = 'PERSON' | 'COMPANY';
type Profile = {
  kind: Kind; legalName: string; tradeName: string | null; taxId: string;
  contactEmail: string; postalCode: string; street: string; number: string;
  complement: string | null; district: string; city: string; state: string;
  asaasWalletId: string | null;
};
type Response = { profile: Profile | null; revision: number; verified: false };
const empty: Profile = {
  kind: 'COMPANY', legalName: '', tradeName: '', taxId: '', contactEmail: '',
  postalCode: '', street: '', number: '', complement: '', district: '', city: '', state: '',
  asaasWalletId: '',
};

export default function OrganizationLegalPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>(empty);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!id) return;
    if (!getToken()) { router.replace('/login'); return; }
    setError('');
    setLoadFailed(false);
    setLoading(true);
    api<Response>(`/organizations/${encodeURIComponent(id)}/legal-profile`)
      .then((result) => {
        if (result.profile) setProfile(result.profile);
        setRevision(result.revision);
      })
      .catch((reason) => { setLoadFailed(true); setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados da organização.'); })
      .finally(() => setLoading(false));
  }, [id, router]);

  function set(field: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const result = await api<Response>(`/organizations/${encodeURIComponent(id)}/legal-profile`, {
        method: 'PUT', body: JSON.stringify({ ...profile, expectedRevision: revision }),
      });
      if (result.profile) setProfile(result.profile);
      setRevision(result.revision);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 409
        ? 'Os dados foram alterados em outra sessão ou exigem revisão. Recarregue a página antes de editar novamente.'
        : reason instanceof Error ? reason.message : 'Não foi possível salvar.');
    } finally { setSaving(false); }
  }

  return <main className={styles.page} id="main-content">
    <Link className={styles.back} href="/painel">← Voltar ao painel</Link>
    <header className={styles.header}>
      <p className={styles.eyebrow}>ORGANIZAÇÃO · DADOS LEGAIS</p>
      <h1>Quem responde pela organização?</h1>
      <p>Informe a pessoa física ou jurídica responsável. A conta de acesso continua pessoal; esses dados pertencem somente a esta organização.</p>
    </header>
    <div className={styles.notice}>Dados informados, ainda não verificados. Antes de vender inscrições, será necessário configurar e homologar o responsável financeiro e a emissão de documentos do evento.</div>
    {error && <div className={styles.error} role="alert">{error}</div>}
    {saved && <div className={styles.success} role="status">Dados salvos. A entidade ainda não foi verificada para emissão fiscal.</div>}
    {loading ? <p role="status">Carregando dados…</p> : loadFailed ? null : <form className={styles.card} onSubmit={submit}>
      <fieldset className={styles.kind}>
        <legend>Tipo de responsável</legend>
        <label><input type="radio" name="kind" checked={profile.kind === 'COMPANY'} onChange={() => set('kind', 'COMPANY')} /> Pessoa jurídica</label>
        <label><input type="radio" name="kind" checked={profile.kind === 'PERSON'} onChange={() => set('kind', 'PERSON')} /> Pessoa física</label>
      </fieldset>
      <div className={styles.grid}>
        <label className={styles.full}>{profile.kind === 'COMPANY' ? 'Razão social' : 'Nome completo'}
          <input required maxLength={160} autoComplete="organization" value={profile.legalName} onChange={(e) => set('legalName', e.target.value)} />
        </label>
        {profile.kind === 'COMPANY' && <label>Nome fantasia (opcional)
          <input maxLength={160} value={profile.tradeName ?? ''} onChange={(e) => set('tradeName', e.target.value)} />
        </label>}
        <label>{profile.kind === 'COMPANY' ? 'CNPJ' : 'CPF'}
          <input required maxLength={24} inputMode={profile.kind === 'PERSON' ? 'numeric' : 'text'} autoComplete="off" value={profile.taxId} onChange={(e) => set('taxId', e.target.value)} aria-describedby="document-help" />
          <small id="document-help">O CNPJ pode conter letras. Conferimos os dígitos verificadores ao salvar.</small>
        </label>
        <label>E-mail de contato
          <input required type="email" maxLength={160} autoComplete="email" value={profile.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
        </label>
      </div>
      <h2>Endereço da entidade</h2>
      <div className={styles.grid}>
        <label>CEP<input required inputMode="numeric" maxLength={10} autoComplete="postal-code" value={profile.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></label>
        <label className={styles.full}>Logradouro<input required maxLength={160} autoComplete="street-address" value={profile.street} onChange={(e) => set('street', e.target.value)} /></label>
        <label>Número<input required maxLength={20} value={profile.number} onChange={(e) => set('number', e.target.value)} /></label>
        <label>Complemento (opcional)<input maxLength={100} value={profile.complement ?? ''} onChange={(e) => set('complement', e.target.value)} /></label>
        <label>Bairro<input required maxLength={100} value={profile.district} onChange={(e) => set('district', e.target.value)} /></label>
        <label>Cidade<input required maxLength={100} autoComplete="address-level2" value={profile.city} onChange={(e) => set('city', e.target.value)} /></label>
        <label>UF<input required maxLength={2} autoComplete="address-level1" value={profile.state} onChange={(e) => set('state', e.target.value)} /></label>
        <label className={styles.full}>Carteira Asaas para repasse
          <input maxLength={36} autoComplete="off" spellCheck={false} value={profile.asaasWalletId ?? ''} onChange={(e) => set('asaasWalletId', e.target.value)} aria-describedby="wallet-help" />
          <small id="wallet-help">Identificador da carteira que o Asaas mostra na conta. Não cole chave de API, token nem senha. Sem esta carteira, a inscrição paga não abre.</small>
        </label>
      </div>
      <button className={styles.submit} disabled={saving} type="submit">{saving ? 'Salvando…' : 'Salvar dados da organização'}</button>
    </form>}
  </main>;
}
