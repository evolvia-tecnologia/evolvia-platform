'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
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
    accessibilitySummary: string | null;
    themeConfig: Partial<ThemeConfig> | null;
    revision: number;
    updatedAt: string | null;
  };
  permissions: {
    canEdit: boolean;
    canEditSections: boolean;
    canPreparePreview: boolean;
  };
  checklist: {
    items: Array<{
      code: string;
      label: string;
      ready: boolean;
      required: boolean;
    }>;
    blockingCount: number;
    recommendedPendingCount: number;
  };
};

type FormState = {
  shortDescription: string;
  fullDescription: string;
  publicContactEmail: string;
  publicContactPhone: string;
  accessibilitySummary: string;
  preset: ThemeConfig['preset'];
  fontScale: ThemeConfig['fontScale'];
  contentWidth: ThemeConfig['contentWidth'];
};

const EMPTY_FORM: FormState = {
  shortDescription: '',
  fullDescription: '',
  publicContactEmail: '',
  publicContactPhone: '',
  accessibilitySummary: '',
  preset: 'DEFAULT',
  fontScale: 'DEFAULT',
  contentWidth: 'STANDARD',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  SETUP: 'Em configuração',
  HOMOLOGATION: 'Em homologação',
  READY_TO_PUBLISH: 'Pronto para publicar',
  PUBLISHED: 'Publicado',
  SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
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
    accessibilitySummary: payload.publication.accessibilitySummary ?? '',
    preset: theme.preset === 'HIGH_CONTRAST' ? 'HIGH_CONTRAST' : 'DEFAULT',
    fontScale: theme.fontScale === 'LARGE' ? 'LARGE' : 'DEFAULT',
    contentWidth: theme.contentWidth === 'WIDE' ? 'WIDE' : 'STANDARD',
  };
}

export default function PublicationEditor({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<PublicationPayload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api<PublicationPayload>(`/events/${eventId}/publication`);
      setPayload(result);
      setForm(formFromPayload(result));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Divulgação.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eventId é a identidade estável desta tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const requiredReady = useMemo(() => {
    if (!payload) return { ready: 0, total: 0 };
    const required = payload.checklist.items.filter((item) => item.required);
    return { ready: required.filter((item) => item.ready).length, total: required.length };
  }, [payload]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setSuccess('');
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payload?.permissions.canEdit || saving) return;

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api<PublicationPayload>(`/events/${eventId}/publication`, {
        method: 'PATCH',
        body: JSON.stringify({
          revision: payload.publication.revision,
          shortDescription: form.shortDescription,
          fullDescription: form.fullDescription,
          publicContactEmail: form.publicContactEmail,
          publicContactPhone: form.publicContactPhone,
          accessibilitySummary: form.accessibilitySummary,
          themeConfig: {
            preset: form.preset,
            fontScale: form.fontScale,
            contentWidth: form.contentWidth,
          },
        }),
      });
      setPayload(result);
      setForm(formFromPayload(result));
      setSuccess('Alterações salvas. Nada foi publicado automaticamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a Divulgação.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <main className={styles.statePage} aria-busy="true">
      <div className={styles.evaMark} aria-hidden="true">EVA</div>
      <p>Carregando a configuração da Divulgação...</p>
    </main>;
  }

  if (!payload) {
    return <main className={styles.statePage}>
      <div className={styles.alert} role="alert">{error || 'Não foi possível abrir a Divulgação.'}</div>
      <Link className={styles.secondaryButton} href={`/eventos/${eventId}/painel`}>Voltar à visão geral</Link>
    </main>;
  }

  const canEdit = payload.permissions.canEdit;

  return <main className={styles.page}>
    <a className={styles.skipLink} href="#publication-form">Pular para o formulário</a>

    <header className={styles.header}>
      <div>
        <Link className={styles.backLink} href={`/eventos/${eventId}/painel`}>← Visão geral do evento</Link>
        <p className={styles.eyebrow}>FASE 1 · DIVULGAÇÃO · EDITOR</p>
        <h1>Prepare o que o público verá</h1>
        <p>Use somente as informações necessárias. Nome, URL, datas, formato e local continuam vindo do cadastro canônico do evento.</p>
      </div>
      <div className={styles.headerStatus}>
        <span>{statusLabels[payload.event.status] ?? payload.event.status}</span>
        <strong>{requiredReady.ready}/{requiredReady.total}</strong>
        <small>itens obrigatórios prontos</small>
      </div>
    </header>

    {!canEdit && <div className={styles.notice} role="status">
      A Divulgação está em modo de leitura neste estado do evento. Você pode revisar os dados, mas não alterá-los.
    </div>}

    {error && <div className={styles.alert} role="alert">{error}</div>}
    {success && <div className={styles.success} role="status" aria-live="polite">{success}</div>}

    <section className={styles.contextCard} aria-labelledby="publication-context-title">
      <div>
        <p className={styles.eyebrow}>DADOS REUTILIZADOS</p>
        <h2 id="publication-context-title">Fundação do evento</h2>
      </div>
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
          <div>
            <p className={styles.eyebrow}>1 · APRESENTAÇÃO</p>
            <h2 id="presentation-title">Explique o evento sem sobrecarregar</h2>
            <p>A descrição curta é usada como resumo principal. A apresentação completa pode trazer contexto adicional.</p>
          </div>
          <span className={styles.counter}>{form.shortDescription.length}/280</span>
        </div>

        <label className={styles.field}>
          <span>Descrição curta <strong aria-hidden="true">*</strong></span>
          <small>Uma frase objetiva que ajude a pessoa a entender rapidamente o evento.</small>
          <textarea
            value={form.shortDescription}
            onChange={(event) => update('shortDescription', event.target.value)}
            maxLength={280}
            rows={3}
            disabled={!canEdit || saving}
            required
          />
        </label>

        <label className={styles.field}>
          <span>Apresentação completa <em>opcional</em></span>
          <small>Use para objetivos, contexto, público e informações realmente úteis. Evite repetir programação ou regras que terão fonte própria.</small>
          <textarea
            value={form.fullDescription}
            onChange={(event) => update('fullDescription', event.target.value)}
            maxLength={12000}
            rows={8}
            disabled={!canEdit || saving}
          />
          <span className={styles.fieldCounter}>{form.fullDescription.length}/12000</span>
        </label>
      </section>

      <section className={styles.card} aria-labelledby="contact-title">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>2 · CONTATO PÚBLICO</p>
            <h2 id="contact-title">Como o participante pode falar com o evento?</h2>
            <p>Informe somente canais que podem ser exibidos publicamente. Um deles já é suficiente.</p>
          </div>
        </div>

        <div className={styles.twoColumns}>
          <label className={styles.field}>
            <span>E-mail público</span>
            <input
              type="email"
              value={form.publicContactEmail}
              onChange={(event) => update('publicContactEmail', event.target.value)}
              maxLength={160}
              autoComplete="email"
              placeholder="atendimento@evento.com.br"
              disabled={!canEdit || saving}
            />
          </label>

          <label className={styles.field}>
            <span>Telefone / WhatsApp público</span>
            <input
              type="tel"
              value={form.publicContactPhone}
              onChange={(event) => update('publicContactPhone', event.target.value)}
              maxLength={40}
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              disabled={!canEdit || saving}
            />
          </label>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="accessibility-title">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>3 · ACESSIBILIDADE</p>
            <h2 id="accessibility-title">Informações públicas de acessibilidade</h2>
            <p>Descreva recursos efetivamente oferecidos pelo evento ou local. Não prometa serviço que ainda não esteja confirmado.</p>
          </div>
          <span className={styles.counter}>{form.accessibilitySummary.length}/4000</span>
        </div>

        <label className={styles.field}>
          <span>O que o público precisa saber?</span>
          <textarea
            value={form.accessibilitySummary}
            onChange={(event) => update('accessibilitySummary', event.target.value)}
            maxLength={4000}
            rows={5}
            placeholder="Ex.: entrada sem degraus, banheiros acessíveis e canal para solicitar apoio com antecedência."
            disabled={!canEdit || saving}
          />
        </label>
      </section>

      <section className={styles.card} aria-labelledby="visual-title">
        <div className={styles.cardHeading}>
          <div>
            <p className={styles.eyebrow}>4 · APRESENTAÇÃO VISUAL</p>
            <h2 id="visual-title">Preferências seguras de leitura</h2>
            <p>Este primeiro lote usa somente tokens controlados pelo Evolvia. Cores e uploads entram em lote próprio com validação de contraste e segurança.</p>
          </div>
        </div>

        <div className={styles.threeColumns}>
          <label className={styles.field}>
            <span>Preset visual</span>
            <select value={form.preset} onChange={(event) => update('preset', event.target.value as ThemeConfig['preset'])} disabled={!canEdit || saving}>
              <option value="DEFAULT">Padrão</option>
              <option value="HIGH_CONTRAST">Alto contraste</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Escala de texto</span>
            <select value={form.fontScale} onChange={(event) => update('fontScale', event.target.value as ThemeConfig['fontScale'])} disabled={!canEdit || saving}>
              <option value="DEFAULT">Padrão</option>
              <option value="LARGE">Ampliada</option>
            </select>
          </label>

          <label className={styles.field}>
            <span>Largura do conteúdo</span>
            <select value={form.contentWidth} onChange={(event) => update('contentWidth', event.target.value as ThemeConfig['contentWidth'])} disabled={!canEdit || saving}>
              <option value="STANDARD">Padrão</option>
              <option value="WIDE">Ampla</option>
            </select>
          </label>
        </div>
      </section>

      <section className={styles.evaCard} aria-labelledby="eva-publication-title">
        <div className={styles.evaMark} aria-hidden="true">EVA</div>
        <div>
          <h2 id="eva-publication-title">Revisão assistida, sem decisões silenciosas</h2>
          <p>A EVA poderá revisar clareza, excesso de informação, acessibilidade e pendências. Nesta etapa ela não publica, não altera conteúdo sem confirmação e não inventa dados oficiais do evento.</p>
        </div>
      </section>

      <footer className={styles.actions}>
        <div>
          <strong>{payload.checklist.blockingCount === 0 ? 'Base obrigatória completa' : `${payload.checklist.blockingCount} pendência(s) obrigatória(s)`}</strong>
          <small>Salvar não publica nem muda o estado do evento.</small>
        </div>
        <button className={styles.primaryButton} type="submit" disabled={!canEdit || saving}>
          {saving ? 'Salvando...' : 'Salvar Divulgação'}
        </button>
      </footer>
    </form>
  </main>;
}
