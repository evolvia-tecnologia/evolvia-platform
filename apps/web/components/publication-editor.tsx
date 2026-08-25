'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '../lib/api';
import PublicationEvaGuidance, { PublicationEvaGuidanceData } from './publication-eva-guidance';
import PublicationReleaseGate from './publication-release-gate';
import PublicationSectionsEditor, { PublicationSection } from './publication-sections-editor';
import styles from './publication-editor.module.css';

type ThemeConfig = {
  preset: 'DEFAULT' | 'HIGH_CONTRAST';
  fontScale: 'DEFAULT' | 'LARGE';
  contentWidth: 'STANDARD' | 'WIDE';
};

type PublicationPayload = {
  event: {
    id: string;
    name: string;
    slug: string;
    status: string;
    format: 'IN_PERSON' | 'ONLINE' | 'HYBRID';
    startDate: string | null;
    endDate: string | null;
    venue: string | null;
  };
  publication: {
    shortDescription: string | null;
    fullDescription: string | null;
    publicContactEmail: string | null;
    publicContactPhone: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    accessibilitySummary: string | null;
    themeConfig: Partial<ThemeConfig> | null;
    revision: number;
    updatedAt: string | null;
  };
  sections: PublicationSection[];
  permissions: {
    canEdit: boolean;
    canEditSections: boolean;
    canPreparePreview: boolean;
    canSubmitForHomologation: boolean;
    canReturnToSetup: boolean;
    canApproveHomologation: boolean;
    canPublish: boolean;
  };
  checklist: {
    items: Array<{ code: string; label: string; ready: boolean; required: boolean }>;
    blockingCount: number;
    recommendedPendingCount: number;
  };
  evaGuidance: PublicationEvaGuidanceData;
};

type FormState = {
  shortDescription: string;
  fullDescription: string;
  publicContactEmail: string;
  publicContactPhone: string;
  seoTitle: string;
  seoDescription: string;
  accessibilitySummary: string;
  preset: ThemeConfig['preset'];
  fontScale: ThemeConfig['fontScale'];
  contentWidth: ThemeConfig['contentWidth'];
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = {
  shortDescription: '',
  fullDescription: '',
  publicContactEmail: '',
  publicContactPhone: '',
  seoTitle: '',
  seoDescription: '',
  accessibilitySummary: '',
  preset: 'DEFAULT',
  fontScale: 'DEFAULT',
  contentWidth: 'STANDARD',
};

const formatLabels: Record<string, string> = {
  IN_PERSON: 'Presencial',
  ONLINE: 'Online',
  HYBRID: 'Híbrido',
};

function formatDate(value: string | null): string {
  if (!value) return 'A definir';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'A definir';
  return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formFromPayload(payload: PublicationPayload): FormState {
  const theme = payload.publication.themeConfig ?? {};
  return {
    shortDescription: payload.publication.shortDescription ?? '',
    fullDescription: payload.publication.fullDescription ?? '',
    publicContactEmail: payload.publication.publicContactEmail ?? '',
    publicContactPhone: payload.publication.publicContactPhone ?? '',
    seoTitle: payload.publication.seoTitle ?? '',
    seoDescription: payload.publication.seoDescription ?? '',
    accessibilitySummary: payload.publication.accessibilitySummary ?? '',
    preset: theme.preset === 'HIGH_CONTRAST' ? 'HIGH_CONTRAST' : 'DEFAULT',
    fontScale: theme.fontScale === 'LARGE' ? 'LARGE' : 'DEFAULT',
    contentWidth: theme.contentWidth === 'WIDE' ? 'WIDE' : 'STANDARD',
  };
}

function comparableForm(form: FormState): FormState {
  return {
    ...form,
    shortDescription: form.shortDescription.trim(),
    fullDescription: form.fullDescription.trim(),
    publicContactEmail: form.publicContactEmail.trim(),
    publicContactPhone: form.publicContactPhone.trim(),
    seoTitle: form.seoTitle.trim(),
    seoDescription: form.seoDescription.trim(),
    accessibilitySummary: form.accessibilitySummary.trim(),
  };
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const shortDescription = form.shortDescription.trim();
  const email = form.publicContactEmail.trim();

  if (!shortDescription) errors.shortDescription = 'Informe uma descrição curta para a página pública.';
  if (shortDescription.length > 280) errors.shortDescription = 'A descrição curta deve ter no máximo 280 caracteres.';
  if (form.fullDescription.length > 12000) errors.fullDescription = 'A apresentação completa deve ter no máximo 12.000 caracteres.';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.publicContactEmail = 'Informe um e-mail válido ou deixe o campo em branco.';
  if (form.publicContactPhone.length > 40) errors.publicContactPhone = 'O telefone deve ter no máximo 40 caracteres.';
  if (form.seoTitle.length > 120) errors.seoTitle = 'O título para buscadores deve ter no máximo 120 caracteres.';
  if (form.seoDescription.length > 320) errors.seoDescription = 'A descrição para buscadores deve ter no máximo 320 caracteres.';
  if (form.accessibilitySummary.length > 4000) errors.accessibilitySummary = 'A informação de acessibilidade deve ter no máximo 4.000 caracteres.';

  return errors;
}

export default function PublicationEditor({
  eventId,
  embedded = false,
  supportsScientificSources = false,
}: {
  eventId: string;
  embedded?: boolean;
  supportsScientificSources?: boolean;
}) {
  const router = useRouter();
  const navigationDialogRef = useRef<HTMLDialogElement>(null);
  const allowNavigationRef = useRef(false);
  const [payload, setPayload] = useState<PublicationPayload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pendingHref, setPendingHref] = useState('');

  const isDirty = useMemo(
    () => JSON.stringify(comparableForm(form)) !== JSON.stringify(comparableForm(baseline)),
    [baseline, form],
  );

  const loadInitial = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<PublicationPayload>(`/events/${eventId}/publication`);
      const nextForm = formFromPayload(result);
      setPayload({ ...result, sections: result.sections ?? [] });
      setForm(nextForm);
      setBaseline(nextForm);
      setFieldErrors({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Divulgação.');
      throw reason;
    } finally {
      setLoading(false);
    }
  };

  const refreshAuxiliary = async () => {
    setError('');
    try {
      const result = await api<PublicationPayload>(`/events/${eventId}/publication`);
      setPayload((current) => current
        ? {
            ...result,
            publication: current.publication,
            checklist: current.checklist,
            sections: result.sections ?? [],
          }
        : { ...result, sections: result.sections ?? [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar os dados auxiliares da Divulgação.');
      throw reason;
    }
  };

  useEffect(() => {
    void loadInitial().catch(() => undefined);
    // eventId é a identidade estável desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (!isDirty) return;
    const protectUnsavedChanges = (event: BeforeUnloadEvent) => {
      if (allowNavigationRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsavedChanges);
    return () => window.removeEventListener('beforeunload', protectUnsavedChanges);
  }, [isDirty]);

  useEffect(() => {
    if (!isDirty) return;

    const protectInternalNavigation = (event: MouseEvent) => {
      if (allowNavigationRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      const staysOnPage = destination.origin === current.origin
        && destination.pathname === current.pathname
        && destination.search === current.search;
      if (staysOnPage) return;

      event.preventDefault();
      setPendingHref(destination.origin === current.origin
        ? `${destination.pathname}${destination.search}${destination.hash}`
        : destination.href);
      navigationDialogRef.current?.showModal();
    };

    document.addEventListener('click', protectInternalNavigation, true);
    return () => document.removeEventListener('click', protectInternalNavigation, true);
  }, [isDirty]);

  const cancelNavigation = () => {
    setPendingHref('');
    navigationDialogRef.current?.close();
  };

  const discardAndNavigate = () => {
    if (!pendingHref) return;
    const destination = pendingHref;
    allowNavigationRef.current = true;
    setPendingHref('');
    navigationDialogRef.current?.close();
    if (/^https?:\/\//i.test(destination)) {
      window.location.assign(destination);
      return;
    }
    router.push(destination);
  };

  const requiredReady = useMemo(() => {
    if (!payload) return { ready: 0, total: 0 };
    const required = payload.checklist.items.filter((item) => item.required);
    return { ready: required.filter((item) => item.ready).length, total: required.length };
  }, [payload]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSuccess('');
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payload?.permissions.canEdit || saving || !isDirty) return;

    const validation = validate(form);
    setFieldErrors(validation);
    const firstInvalid = Object.keys(validation)[0] as keyof FormState | undefined;
    if (firstInvalid) {
      setError('Revise os campos destacados antes de salvar.');
      document.getElementById(`publication-${firstInvalid}`)?.focus();
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<PublicationPayload>(`/events/${eventId}/publication`, {
        method: 'PATCH',
        body: JSON.stringify({
          revision: payload.publication.revision,
          shortDescription: form.shortDescription.trim(),
          fullDescription: form.fullDescription.trim() || null,
          publicContactEmail: form.publicContactEmail.trim() || null,
          publicContactPhone: form.publicContactPhone.trim() || null,
          seoTitle: form.seoTitle.trim() || null,
          seoDescription: form.seoDescription.trim() || null,
          accessibilitySummary: form.accessibilitySummary.trim() || null,
          themeConfig: {
            preset: form.preset,
            fontScale: form.fontScale,
            contentWidth: form.contentWidth,
          },
        }),
      });
      const nextForm = formFromPayload(result);
      setPayload({ ...result, sections: result.sections ?? [] });
      setForm(nextForm);
      setBaseline(nextForm);
      setFieldErrors({});
      setSuccess('Alterações salvas. Nada foi publicado automaticamente.');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setError('A Divulgação foi alterada em outra sessão. Seu rascunho foi preservado; recarregue somente quando decidir comparar com a versão mais recente.');
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a Divulgação.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={embedded ? styles.embeddedState : styles.statePage} aria-busy="true">
      <div className={styles.evaMark} aria-hidden="true">EVA</div>
      <p>Carregando a configuração da Divulgação...</p>
    </div>;
  }

  if (!payload) {
    return <div className={embedded ? styles.embeddedState : styles.statePage}>
      <div className={styles.alert} role="alert">{error || 'Não foi possível abrir a Divulgação.'}</div>
      <button className={styles.secondaryButton} type="button" onClick={() => void loadInitial().catch(() => undefined)}>Tentar novamente</button>
    </div>;
  }

  const canEdit = payload.permissions.canEdit;

  return <div className={embedded ? styles.embedded : styles.page}>
    <dialog
      ref={navigationDialogRef}
      className={styles.card}
      aria-labelledby="publication-unsaved-title"
      aria-describedby="publication-unsaved-description"
      onCancel={(event) => {
        event.preventDefault();
        cancelNavigation();
      }}
    >
      <h2 id="publication-unsaved-title">Sair sem salvar as alterações?</h2>
      <p id="publication-unsaved-description">As mudanças editoriais desta tela ainda não foram salvas. Você pode continuar editando ou descartá-las e seguir para o destino escolhido.</p>
      <div className={styles.actions}>
        <button className={styles.secondaryButton} type="button" onClick={cancelNavigation}>Continuar editando</button>
        <button className={styles.primaryButton} type="button" onClick={discardAndNavigate}>Descartar e sair</button>
      </div>
    </dialog>

    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>FASE 1 · DIVULGAÇÃO · EDITOR</p>
        <h1>Prepare o que o público verá</h1>
        <p>Nome, URL, datas, formato e local continuam vindo do cadastro canônico do evento. Aqui entram apenas os dados editoriais.</p>
      </div>
      <div className={styles.headerStatus}>
        <strong>{requiredReady.ready}/{requiredReady.total}</strong>
        <small>itens obrigatórios prontos</small>
      </div>
    </header>

    {!canEdit && <div className={styles.notice} role="status">
      A Divulgação está em modo de leitura neste estado do evento. Você pode revisar os dados, mas não alterá-los.
    </div>}

    {isDirty && canEdit && <div className={styles.notice} role="status" aria-live="polite">
      Você tem alterações editoriais ainda não salvas. Elas serão preservadas ao organizar as seções; salve antes de sair desta página.
    </div>}

    {error && <div className={styles.alert} role="alert">{error}</div>}
    {success && <div className={styles.success} role="status" aria-live="polite">{success}</div>}

    <section className={styles.contextCard} aria-labelledby="publication-context-title">
      <div><p className={styles.eyebrow}>DADOS REUTILIZADOS</p><h2 id="publication-context-title">Fundação do evento</h2></div>
      <dl className={styles.contextGrid}>
        <div><dt>Nome</dt><dd>{payload.event.name}</dd></div>
        <div><dt>URL</dt><dd>/{payload.event.slug}</dd></div>
        <div><dt>Formato</dt><dd>{formatLabels[payload.event.format] ?? payload.event.format}</dd></div>
        <div><dt>Data inicial</dt><dd>{formatDate(payload.event.startDate)}</dd></div>
        <div><dt>Data final</dt><dd>{formatDate(payload.event.endDate)}</dd></div>
        <div><dt>Local</dt><dd>{payload.event.format === 'ONLINE' ? 'Evento online' : payload.event.venue || 'A definir'}</dd></div>
      </dl>
    </section>

    <form id="publication-form" className={styles.form} onSubmit={submit} noValidate>
      <section className={styles.card} aria-labelledby="presentation-title">
        <div className={styles.cardHeading}>
          <div><p className={styles.eyebrow}>1 · APRESENTAÇÃO</p><h2 id="presentation-title">Explique o evento sem sobrecarregar</h2><p>A descrição curta é o resumo principal. A apresentação completa é opcional.</p></div>
          <span className={styles.counter}>{form.shortDescription.length}/280</span>
        </div>

        <label className={styles.field} htmlFor="publication-shortDescription">
          <span>Descrição curta <strong aria-hidden="true">*</strong></span>
          <small id="publication-shortDescription-help">Uma frase objetiva que ajude a pessoa a entender rapidamente o evento.</small>
          <textarea id="publication-shortDescription" value={form.shortDescription} onChange={(event) => update('shortDescription', event.target.value)} maxLength={280} rows={3} disabled={!canEdit || saving} required aria-invalid={Boolean(fieldErrors.shortDescription)} aria-describedby={`publication-shortDescription-help${fieldErrors.shortDescription ? ' publication-shortDescription-error' : ''}`} />
          {fieldErrors.shortDescription && <small id="publication-shortDescription-error" className={styles.fieldError}>{fieldErrors.shortDescription}</small>}
        </label>

        <label className={styles.field} htmlFor="publication-fullDescription">
          <span>Apresentação completa <em>opcional</em></span>
          <small id="publication-fullDescription-help">Use para objetivos, contexto e informações úteis, sem duplicar programação ou regras que terão fonte própria.</small>
          <textarea id="publication-fullDescription" value={form.fullDescription} onChange={(event) => update('fullDescription', event.target.value)} maxLength={12000} rows={8} disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.fullDescription)} aria-describedby={`publication-fullDescription-help${fieldErrors.fullDescription ? ' publication-fullDescription-error' : ''}`} />
          <span className={styles.fieldCounter}>{form.fullDescription.length}/12000</span>
          {fieldErrors.fullDescription && <small id="publication-fullDescription-error" className={styles.fieldError}>{fieldErrors.fullDescription}</small>}
        </label>
      </section>

      <section className={styles.card} aria-labelledby="contact-title">
        <div className={styles.cardHeading}><div><p className={styles.eyebrow}>2 · CONTATO PÚBLICO</p><h2 id="contact-title">Como o participante pode falar com o evento?</h2><p>Informe somente canais que podem ser exibidos publicamente.</p></div></div>
        <div className={styles.twoColumns}>
          <label className={styles.field} htmlFor="publication-publicContactEmail">
            <span>E-mail público</span>
            <input id="publication-publicContactEmail" type="email" value={form.publicContactEmail} onChange={(event) => update('publicContactEmail', event.target.value)} maxLength={160} autoComplete="email" placeholder="atendimento@evento.com.br" disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.publicContactEmail)} aria-describedby={fieldErrors.publicContactEmail ? 'publication-publicContactEmail-error' : undefined} />
            {fieldErrors.publicContactEmail && <small id="publication-publicContactEmail-error" className={styles.fieldError}>{fieldErrors.publicContactEmail}</small>}
          </label>
          <label className={styles.field} htmlFor="publication-publicContactPhone">
            <span>Telefone / WhatsApp público</span>
            <input id="publication-publicContactPhone" type="tel" value={form.publicContactPhone} onChange={(event) => update('publicContactPhone', event.target.value)} maxLength={40} autoComplete="tel" placeholder="(11) 99999-9999" disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.publicContactPhone)} aria-describedby={fieldErrors.publicContactPhone ? 'publication-publicContactPhone-error' : undefined} />
            {fieldErrors.publicContactPhone && <small id="publication-publicContactPhone-error" className={styles.fieldError}>{fieldErrors.publicContactPhone}</small>}
          </label>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="accessibility-title">
        <div className={styles.cardHeading}><div><p className={styles.eyebrow}>3 · ACESSIBILIDADE</p><h2 id="accessibility-title">Informações públicas de acessibilidade</h2><p>Descreva apenas recursos efetivamente oferecidos pelo evento ou local.</p></div><span className={styles.counter}>{form.accessibilitySummary.length}/4000</span></div>
        <label className={styles.field} htmlFor="publication-accessibilitySummary">
          <span>O que o público precisa saber?</span>
          <textarea id="publication-accessibilitySummary" value={form.accessibilitySummary} onChange={(event) => update('accessibilitySummary', event.target.value)} maxLength={4000} rows={5} placeholder="Ex.: entrada sem degraus, banheiros acessíveis e canal para solicitar apoio com antecedência." disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.accessibilitySummary)} aria-describedby={fieldErrors.accessibilitySummary ? 'publication-accessibilitySummary-error' : undefined} />
          {fieldErrors.accessibilitySummary && <small id="publication-accessibilitySummary-error" className={styles.fieldError}>{fieldErrors.accessibilitySummary}</small>}
        </label>
      </section>

      <section className={styles.card} aria-labelledby="seo-title">
        <div className={styles.cardHeading}><div><p className={styles.eyebrow}>4 · BUSCA E COMPARTILHAMENTO</p><h2 id="seo-title">Como a página será descrita fora do Evolvia?</h2><p>Esses campos são opcionais. Se ficarem vazios, o renderer poderá usar dados públicos canônicos como fallback no Lote 4.</p></div></div>
        <label className={styles.field} htmlFor="publication-seoTitle">
          <span>Título para buscadores <em>opcional</em></span>
          <input id="publication-seoTitle" value={form.seoTitle} onChange={(event) => update('seoTitle', event.target.value)} maxLength={120} placeholder={payload.event.name} disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.seoTitle)} aria-describedby={fieldErrors.seoTitle ? 'publication-seoTitle-error' : undefined} />
          <span className={styles.fieldCounter}>{form.seoTitle.length}/120</span>
          {fieldErrors.seoTitle && <small id="publication-seoTitle-error" className={styles.fieldError}>{fieldErrors.seoTitle}</small>}
        </label>
        <label className={styles.field} htmlFor="publication-seoDescription">
          <span>Descrição para buscadores e compartilhamento <em>opcional</em></span>
          <textarea id="publication-seoDescription" value={form.seoDescription} onChange={(event) => update('seoDescription', event.target.value)} maxLength={320} rows={3} placeholder="Resumo objetivo para mecanismos de busca e prévias de compartilhamento." disabled={!canEdit || saving} aria-invalid={Boolean(fieldErrors.seoDescription)} aria-describedby={fieldErrors.seoDescription ? 'publication-seoDescription-error' : undefined} />
          <span className={styles.fieldCounter}>{form.seoDescription.length}/320</span>
          {fieldErrors.seoDescription && <small id="publication-seoDescription-error" className={styles.fieldError}>{fieldErrors.seoDescription}</small>}
        </label>
      </section>

      <section className={styles.card} aria-labelledby="visual-title">
        <div className={styles.cardHeading}><div><p className={styles.eyebrow}>5 · APRESENTAÇÃO VISUAL</p><h2 id="visual-title">Preferências seguras de leitura</h2><p>Neste lote usamos somente tokens controlados pelo Evolvia. Cores e uploads entram em lote próprio com validação específica.</p></div></div>
        <div className={styles.threeColumns}>
          <label className={styles.field}><span>Preset visual</span><select id="publication-preset" value={form.preset} onChange={(event) => update('preset', event.target.value as ThemeConfig['preset'])} disabled={!canEdit || saving}><option value="DEFAULT">Padrão</option><option value="HIGH_CONTRAST">Alto contraste</option></select></label>
          <label className={styles.field}><span>Escala de texto</span><select id="publication-fontScale" value={form.fontScale} onChange={(event) => update('fontScale', event.target.value as ThemeConfig['fontScale'])} disabled={!canEdit || saving}><option value="DEFAULT">Padrão</option><option value="LARGE">Ampliada</option></select></label>
          <label className={styles.field}><span>Largura do conteúdo</span><select id="publication-contentWidth" value={form.contentWidth} onChange={(event) => update('contentWidth', event.target.value as ThemeConfig['contentWidth'])} disabled={!canEdit || saving}><option value="STANDARD">Padrão</option><option value="WIDE">Ampla</option></select></label>
        </div>
      </section>

      <PublicationEvaGuidance
        guidance={payload.evaGuidance}
        hasUnsavedChanges={isDirty}
      />

      <div id="publication-actions" className={styles.actions}>
        <div>
          <strong>{payload.checklist.blockingCount}</strong> bloqueio(s) obrigatório(s) · <strong>{payload.checklist.recommendedPendingCount}</strong> recomendação(ões) pendente(s)
          {isDirty && <><br /><small>Alterações editoriais aguardando salvamento. A pré-visualização usa a última versão salva.</small></>}
        </div>
        {payload.permissions.canPreparePreview ? <div className={styles.twoColumns}>
          <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel/divulgacao/preview`}>
            Pré-visualizar página
          </Link>
          <button className={styles.primaryButton} type="submit" disabled={!canEdit || saving || !isDirty}>
            {saving ? 'Salvando...' : isDirty ? 'Salvar alterações' : 'Sem alterações para salvar'}
          </button>
        </div> : <button className={styles.primaryButton} type="submit" disabled={!canEdit || saving || !isDirty}>
          {saving ? 'Salvando...' : isDirty ? 'Salvar alterações' : 'Sem alterações para salvar'}
        </button>}
      </div>
    </form>

    <PublicationSectionsEditor
      eventId={eventId}
      sections={payload.sections}
      canEdit={payload.permissions.canEditSections}
      supportsScientificSources={supportsScientificSources}
      onReload={refreshAuxiliary}
    />

    <PublicationReleaseGate
      eventId={eventId}
      eventSlug={payload.event.slug}
      status={payload.event.status}
      publicationRevision={payload.publication.revision}
      checklist={payload.checklist}
      permissions={payload.permissions}
      hasUnsavedChanges={isDirty}
      onChanged={loadInitial}
    />
  </div>;
}
