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
      if (objective !== 'ALL' && !item.objectives?.some((entry) => entry.code === objective)) return false;
      if (!needle) return true;
      const haystack = normalize([
        item.name,
        item.summary,
        item.categoryLabel,
        item.availabilityLabel,
        ...item.useCases,
        ...item.requirements,
        ...(item.objectives?.map((entry) => entry.label) ?? []),
        ...(item.recipes?.flatMap((entry) => [entry.trigger, entry.action]) ?? []),
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
    const label = payload.objectives?.find((entry) => entry.code === objective)?.label ?? objective;
    activeFilterParts.push(`o objetivo ${label}`);
  }

  return <div className={styles.hub}>
    <section className={styles.hero} aria-labelledby="integrations-title">
      <div>
        <p className={styles.eyebrow}>CATÁLOGO DO EVENTO</p>
        <h1 id="integrations-title">Integrações</h1>
        <p>Encontre a ferramenta pelo que deseja fazer. Conexões externas ainda não estão disponíveis aqui.</p>
      </div>
    </section>

    <details className={styles.help}>
      <summary>Como funcionam as integrações?</summary>
      <p>{payload.guidance.summary}</p>
    </details>

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

      <div className={styles.filterRow}>
        <label htmlFor="integrations-category">
          Categoria
          <select id="integrations-category" value={category} onChange={(event) => setCategory(event.target.value as IntegrationCategoryCode | 'ALL')}>
            <option value="ALL">Todas as categorias</option>
            {payload.categories.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label htmlFor="integrations-objective">
          Objetivo
          <select id="integrations-objective" value={objective} onChange={(event) => setObjective(event.target.value)}>
            <option value="ALL">Todos os objetivos</option>
            {payload.objectives?.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
      </div>
    </div>

    {(category === 'FINANCE' || objective === 'ISSUE_INVOICES_AND_FINANCE') && <p className={styles.fiscalNote}>
      NFS-e exige regras do município do prestador e provedor compatível. Este catálogo não emite notas nem envia dados fiscais.
    </p>}

    <div className={styles.results}>
      <p className={styles.resultMeta} role="status" aria-live="polite" aria-atomic="true">
        {filtered.length === 0
          ? `Nenhuma integração encontrada para ${joinPt(activeFilterParts)}. Ajuste a busca, a categoria ou o objetivo.`
          : filtered.length === 1
            ? '1 integração encontrada'
            : `${filtered.length} integrações encontradas`}
      </p>
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <button type="button" className={styles.clearFilters} onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <ul className={styles.grid} aria-label="Integrações do evento">
          {filtered.map((item) => {
            const expanded = selected?.code === item.code;
            return <li key={item.code}>
              <button
                type="button"
                className={expanded ? styles.cardActive : styles.card}
                aria-expanded={expanded}
                aria-controls={expanded ? `integration-detail-${item.code}` : undefined}
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
              {expanded && <div id={`integration-detail-${item.code}`} className={styles.inlineDetail}>
                <p className={styles.detailLead}>{item.availabilityHint}</p>
                <dl className={styles.detailList}>
                  <div>
                    <dt>Quando usar</dt>
                    <dd><ul>{item.useCases.map((entry) => <li key={entry}>{entry}</li>)}</ul></dd>
                  </div>
                  <div>
                    <dt>Possibilidades previstas</dt>
                    <dd><ul className={styles.recipes}>{item.recipes?.map((entry) => (
                      <li key={`${entry.trigger}|${entry.action}`}>Quando {entry.trigger}, então {entry.action}.</li>
                    ))}</ul></dd>
                  </div>
                  <div>
                    <dt>O que é necessário</dt>
                    <dd><ul>{item.requirements.map((entry) => <li key={entry}>{entry}</li>)}</ul></dd>
                  </div>
                  <div>
                    <dt>Dados previstos</dt>
                    <dd><ul>{item.dataShared.map((entry) => <li key={entry}>{entry}</li>)}</ul></dd>
                  </div>
                </dl>
              </div>}
            </li>;
          })}
        </ul>
      )}
    </div>

  </div>;
}
