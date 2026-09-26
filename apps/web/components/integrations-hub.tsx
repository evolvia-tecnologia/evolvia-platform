'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import styles from './integrations-hub.module.css';

type IntegrationCategoryCode =
  | 'PLATFORM'
  | 'CRM'
  | 'MARKETING'
  | 'FINANCE'
  | 'ANALYTICS'
  | 'PRODUCTIVITY'
  | 'COMMUNITY';

type IntegrationItem = {
  code: string;
  name: string;
  category: IntegrationCategoryCode;
  categoryLabel: string;
  summary: string;
  useCases: string[];
  requirements: string[];
  dataShared: string[];
  authType: 'OAUTH' | 'API_KEY' | 'WEBHOOK' | 'MANUAL';
  authTypeLabel: string;
  availability: 'PLANNED' | 'PREPARING';
  availabilityLabel: string;
  availabilityHint: string;
  connectable: false;
  documentationUrl?: string;
};

type IntegrationsPayload = {
  event: { id: string; name: string; organizationId: string };
  guidance: { title: string; summary: string };
  categories: Array<{ code: IntegrationCategoryCode; label: string }>;
  items: IntegrationItem[];
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export default function IntegrationsHub({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IntegrationCategoryCode | 'ALL'>('ALL');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<IntegrationsPayload>(`/events/${eventId}/integrations`)
      .then((result) => {
        if (active) setPayload(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o catálogo de integrações.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [eventId]);

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = normalize(query.trim());
    return payload.items.filter((item) => {
      if (category !== 'ALL' && item.category !== category) return false;
      if (!needle) return true;
      const haystack = normalize([
        item.name,
        item.summary,
        item.categoryLabel,
        item.availabilityLabel,
        ...item.useCases,
        ...item.requirements,
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [payload, query, category]);

  const selected = filtered.find((item) => item.code === selectedCode) ?? null;

  useEffect(() => {
    if (selectedCode && !filtered.some((item) => item.code === selectedCode)) {
      setSelectedCode(null);
    }
  }, [filtered, selectedCode]);

  if (loading) {
    return <div className={styles.hub} aria-busy="true"><p className={styles.status}>A EVA está organizando o catálogo de integrações...</p></div>;
  }

  if (!payload) {
    return <div className={styles.hub}><div className={styles.error} role="alert">{error || 'Não foi possível carregar as integrações deste evento.'}</div></div>;
  }

  return <div className={styles.hub}>
    <section className={styles.hero} aria-labelledby="integrations-title">
      <div>
        <p className={styles.eyebrow}>CATÁLOGO DO EVENTO</p>
        <h1 id="integrations-title">Integrações</h1>
        <p>Entenda finalidade, requisitos e dados previstos de cada conector. Nada é habilitado, autorizado ou enviado a fornecedores nesta tela.</p>
      </div>
    </section>

    <section className={styles.eva} aria-labelledby="integrations-eva-title">
      <div className={styles.evaMark} aria-hidden="true">EVA</div>
      <div>
        <h2 id="integrations-eva-title">{payload.guidance.title}</h2>
        <p>{payload.guidance.summary}</p>
      </div>
    </section>

    <div className={styles.toolbar}>
      <label className={styles.search} htmlFor="integrations-search">
        <span>Buscar integrações</span>
        <input
          id="integrations-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome, finalidade ou descrição"
          autoComplete="off"
        />
      </label>

      <div className={styles.filters} role="group" aria-label="Filtrar por categoria">
        <button
          type="button"
          className={category === 'ALL' ? styles.filterActive : styles.filter}
          aria-pressed={category === 'ALL'}
          onClick={() => setCategory('ALL')}
        >
          Todas
        </button>
        {payload.categories.map((item) => (
          <button
            key={item.code}
            type="button"
            className={category === item.code ? styles.filterActive : styles.filter}
            aria-pressed={category === item.code}
            onClick={() => setCategory(item.code)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>

    {filtered.length === 0 ? (
      <p className={styles.empty} role="status">Nenhuma integração encontrada para esta busca. Ajuste o nome, a finalidade ou a categoria.</p>
    ) : (
      <ul className={styles.grid} aria-label="Integrações do evento">
        {filtered.map((item) => {
          const expanded = selected?.code === item.code;
          return <li key={item.code}>
            <button
              type="button"
              className={expanded ? styles.cardActive : styles.card}
              aria-expanded={expanded}
              aria-controls="integration-detail"
              onClick={() => setSelectedCode(expanded ? null : item.code)}
            >
              <span className={styles.icon} aria-hidden="true">{item.name.slice(0, 1)}</span>
              <span className={styles.cardBody}>
                <strong>{item.name}</strong>
                <small>{item.summary}</small>
              </span>
              <span className={item.availability === 'PREPARING' ? styles.statePreparing : styles.statePlanned}>
                {item.availabilityLabel}
              </span>
            </button>
          </li>;
        })}
      </ul>
    )}

    <section
      id="integration-detail"
      className={styles.detail}
      aria-labelledby="integration-detail-title"
      aria-live="polite"
    >
      {selected ? <>
        <p className={styles.eyebrow}>{selected.categoryLabel}</p>
        <h2 id="integration-detail-title">{selected.name}</h2>
        <p className={styles.detailLead}>{selected.summary}</p>
        <span className={selected.availability === 'PREPARING' ? styles.statePreparing : styles.statePlanned}>
          {selected.availabilityLabel}
        </span>
        <dl className={styles.detailList}>
          <div>
            <dt>Como funciona</dt>
            <dd>{selected.summary}</dd>
          </div>
          <div>
            <dt>Quando usar</dt>
            <dd>
              <ul>{selected.useCases.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </dd>
          </div>
          <div>
            <dt>O que é necessário</dt>
            <dd>
              <ul>{selected.requirements.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </dd>
          </div>
          <div>
            <dt>Dados compartilhados</dt>
            <dd>
              <ul>{selected.dataShared.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            </dd>
          </div>
          <div>
            <dt>Estado da disponibilidade</dt>
            <dd>
              <p><strong>{selected.availabilityLabel}</strong></p>
              <p>{selected.availabilityHint}</p>
            </dd>
          </div>
        </dl>
      </> : (
        <p id="integration-detail-title">Selecione um card para ler como a integração funcionará, quando usá-la e quais dados poderão ser compartilhados no futuro.</p>
      )}
    </section>
  </div>;
}
