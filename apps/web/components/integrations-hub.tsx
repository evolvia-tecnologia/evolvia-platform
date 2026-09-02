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

type IntegrationObjectiveView = { code: string; label: string };

type IntegrationRecipeView = {
  trigger: string;
  action: string;
  direction: 'PLATFORM_TO_PROVIDER' | 'PROVIDER_TO_PLATFORM' | 'PLATFORM_TO_OWN_SYSTEM';
  directionLabel: string;
  statusLabel: string;
};

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
  objectives: IntegrationObjectiveView[];
  recipes: IntegrationRecipeView[];
  connectable: false;
  documentationUrl?: string;
};

type IntegrationsPayload = {
  event: { id: string; name: string; organizationId: string };
  guidance: { title: string; summary: string };
  categories: Array<{ code: IntegrationCategoryCode; label: string }>;
  objectives: IntegrationObjectiveView[];
  items: IntegrationItem[];
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function joinPt(parts: string[]): string {
  if (parts.length === 0) return 'os filtros atuais';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

export default function IntegrationsHub({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IntegrationCategoryCode | 'ALL'>('ALL');
  const [objective, setObjective] = useState<string>('ALL');
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
      if (objective !== 'ALL' && !item.objectives.some((entry) => entry.code === objective)) return false;
      if (!needle) return true;
      const haystack = normalize([
        item.name,
        item.summary,
        item.categoryLabel,
        item.availabilityLabel,
        ...item.useCases,
        ...item.requirements,
        ...item.objectives.map((entry) => entry.label),
        ...item.recipes.flatMap((entry) => [entry.trigger, entry.action]),
      ].join(' '));
      return haystack.includes(needle);
    });
  }, [payload, query, category, objective]);

  const selected = filtered.find((item) => item.code === selectedCode) ?? null;

  useEffect(() => {
    if (selectedCode && !filtered.some((item) => item.code === selectedCode)) {
      setSelectedCode(null);
    }
  }, [filtered, selectedCode]);

  function clearFilters() {
    setQuery('');
    setCategory('ALL');
    setObjective('ALL');
  }

  if (loading) {
    return <div className={styles.hub} aria-busy="true"><p className={styles.status}>A EVA está organizando o catálogo de integrações...</p></div>;
  }

  if (!payload) {
    return <div className={styles.hub}><div className={styles.error} role="alert">{error || 'Não foi possível carregar as integrações deste evento.'}</div></div>;
  }

  const activeFilterParts: string[] = [];
  const trimmedQuery = query.trim();
  if (trimmedQuery) activeFilterParts.push(`a busca “${trimmedQuery}”`);
  if (category !== 'ALL') {
    const label = payload.categories.find((entry) => entry.code === category)?.label ?? category;
    activeFilterParts.push(`a categoria ${label}`);
  }
  if (objective !== 'ALL') {
    const label = payload.objectives.find((entry) => entry.code === objective)?.label ?? objective;
    activeFilterParts.push(`o objetivo ${label}`);
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
          placeholder="Nome, finalidade, objetivo, gatilho ou ação"
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

      <div className={styles.filters} role="group" aria-label="Filtrar por objetivo">
        <button
          type="button"
          className={objective === 'ALL' ? styles.filterActive : styles.filter}
          aria-pressed={objective === 'ALL'}
          onClick={() => setObjective('ALL')}
        >
          Todos os objetivos
        </button>
        {payload.objectives.map((item) => (
          <button
            key={item.code}
            type="button"
            className={objective === item.code ? styles.filterActive : styles.filter}
            aria-pressed={objective === item.code}
            onClick={() => setObjective(item.code)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>

    <div className={styles.results} aria-live="polite" aria-atomic="true">
      {filtered.length === 0 ? (
        <div className={styles.empty} role="status">
          <p>Nenhuma integração encontrada para {joinPt(activeFilterParts)}. Ajuste a busca, a categoria ou o objetivo.</p>
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <>
          <p className={styles.resultMeta}>
            {filtered.length === 1 ? '1 integração encontrada' : `${filtered.length} integrações encontradas`}
          </p>
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
        </>
      )}
    </div>

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
            <dt>Possibilidades</dt>
            <dd>
              <p>Receitas previstas. Nenhuma é executada neste lote.</p>
              <ul className={styles.recipes}>
                {selected.recipes.map((entry) => (
                  <li key={`${entry.trigger}|${entry.action}`}>
                    <p className={styles.recipePair}>Quando {entry.trigger} → então {entry.action}</p>
                    <p>{entry.directionLabel}. Estado: {entry.statusLabel}.</p>
                  </li>
                ))}
              </ul>
            </dd>
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
            <dt>Autenticação prevista</dt>
            <dd>{selected.authTypeLabel}</dd>
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
