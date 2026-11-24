'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  availability: 'PLANNED' | 'PREPARING' | 'READY';
  availabilityLabel: string;
  availabilityHint: string;
  objectives: IntegrationObjectiveView[];
  recipes: IntegrationRecipeView[];
  connectable: false;
  foundation: 'api' | 'webhook' | 'presence' | null;
  documentationUrl?: string;
};

type IntegrationsPayload = {
  asaas?: {
    state: 'SIMULATED' | 'BLOCKED' | 'NOT_CONFIGURED' | 'CONFIGURED';
    environment: 'local' | 'sandbox' | 'production';
    message: string;
  };
  event: { id: string; name: string; organizationId: string };
  guidance: { title: string; summary: string };
  categories: Array<{ code: IntegrationCategoryCode; label: string }>;
  objectives: IntegrationObjectiveView[];
  items: IntegrationItem[];
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

type FoundationKind = 'api' | 'webhook' | 'presence';
type WebhookRow = { id: string; url: string; enabled: boolean };
type KeyRow = {
  id: string;
  label: string;
  prefix: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt?: string | null;
};
type PresenceView = { publicUrl: string | null; snippet: string | null; note: string };

function FoundationDesk({ eventId, kind }: { eventId: string; kind: FoundationKind }) {
  const [webhooks, setWebhooks] = useState<WebhookRow[] | null>(null);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [presence, setPresence] = useState<PresenceView | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const loadVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const version = ++loadVersion.current;
    const fail = (reason: unknown) => {
      if (active && version === loadVersion.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar esta configuração.');
    };
    if (kind === 'webhook') {
      api<{ items: WebhookRow[] }>(`/events/${eventId}/integrations/webhooks`)
        .then((result) => { if (active && version === loadVersion.current) setWebhooks(result.items); })
        .catch(fail);
    } else if (kind === 'api') {
      api<{ items: KeyRow[] }>(`/events/${eventId}/integrations/api-keys`)
        .then((result) => { if (active && version === loadVersion.current) setKeys(result.items); })
        .catch(fail);
    } else {
      api<PresenceView>(`/events/${eventId}/integrations/presence`)
        .then((result) => { if (active && version === loadVersion.current) setPresence(result); })
        .catch(fail);
    }
    return () => { active = false; };
  }, [eventId, kind]);

  async function run(action: () => Promise<void>) {
    loadVersion.current += 1;
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a operação.'); }
    finally { setBusy(false); }
  }

  async function copySnippet(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice('Trecho copiado.');
      setError('');
    } catch {
      setError('Não foi possível copiar. Selecione o trecho e copie manualmente.');
    }
  }

  return <section className={styles.foundation} aria-label={kind === 'webhook' ? 'Webhooks deste evento' : kind === 'api' ? 'Chaves de leitura deste evento' : 'Trecho para o site'}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {kind === 'webhook' && <>
      <p role="note">Endpoint ativo não comprova entrega validada no destino. Confirme o recebimento na sua infraestrutura antes de operar em produção.</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const created = await api<{ id: string; url: string; secret: string }>(`/events/${eventId}/integrations/webhooks`, {
            method: 'POST',
            body: JSON.stringify({ url }),
          });
          setSecret(created.secret);
          setUrl('');
          setWebhooks((current) => [{ id: created.id, url: created.url, enabled: true }, ...(current ?? [])]);
        });
      }}>
        <label htmlFor="webhook-url">URL HTTPS
          <input id="webhook-url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={300} autoComplete="off" required />
        </label>
        <button type="submit" disabled={busy}>Criar endpoint</button>
      </form>
      {secret && <label htmlFor="webhook-secret">Segredo, exibido uma única vez
        <input id="webhook-secret" readOnly value={secret} />
      </label>}
      <ul>
        {(webhooks ?? []).map((item) => <li key={item.id}>
          <span>{item.url}</span>
          <span>{item.enabled ? 'Ativo' : 'Desativado'}</span>
          {item.enabled && <button type="button" disabled={busy} onClick={() => void run(async () => {
            await api(`/events/${eventId}/integrations/webhooks/${item.id}/disable`, { method: 'POST', body: '{}' });
            setWebhooks((current) => (current ?? []).map((row) => row.id === item.id ? { ...row, enabled: false } : row));
          })}>Desativar</button>}
        </li>)}
      </ul>
    </>}
    {kind === 'api' && <>
      <form onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const created = await api<{ id: string; label: string; prefix: string; expiresAt: string; token: string }>(`/events/${eventId}/integrations/api-keys`, {
            method: 'POST',
            body: JSON.stringify({ label: label.trim() || undefined }),
          });
          setToken(created.token);
          setLabel('');
          setKeys((current) => [{ id: created.id, label: created.label, prefix: created.prefix, expiresAt: created.expiresAt, revokedAt: null }, ...(current ?? [])]);
        });
      }}>
        <label htmlFor="api-key-label">Nome da chave
          <input id="api-key-label" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} autoComplete="off" />
        </label>
        <button type="submit" disabled={busy}>Emitir chave</button>
      </form>
      {token && <label htmlFor="api-key-token">Chave, exibida uma única vez
        <input id="api-key-token" readOnly value={token} />
      </label>}
      <ul>
        {(keys ?? []).map((item) => <li key={item.id}>
          <span>{item.label}</span>
          <span>{item.prefix}</span>
          <span>{item.revokedAt ? 'Revogada' : `Válida até ${new Date(item.expiresAt).toLocaleDateString('pt-BR')}`}</span>
          <span>{item.lastUsedAt
            ? `Último uso em ${new Date(item.lastUsedAt).toLocaleString('pt-BR')}`
            : 'Ainda sem uso registrado'}</span>
          {!item.revokedAt && <button type="button" disabled={busy} onClick={() => void run(async () => {
            await api(`/events/${eventId}/integrations/api-keys/${item.id}/revoke`, { method: 'POST', body: '{}' });
            setKeys((current) => (current ?? []).map((row) => row.id === item.id ? { ...row, revokedAt: new Date().toISOString() } : row));
          })}>Revogar</button>}
        </li>)}
      </ul>
    </>}
    {kind === 'presence' && presence && <>
      <p>{presence.note}</p>
      {presence.snippet && <>
        <label htmlFor="presence-snippet">Trecho HTML
          <textarea id="presence-snippet" readOnly value={presence.snippet} rows={3} />
        </label>
        <button type="button" onClick={() => void copySnippet(presence.snippet ?? '')}>Copiar trecho</button>
      </>}
    </>}
  </section>;
}


function EventConnections({ eventId, items, onOpen }: {
  eventId: string;
  items: IntegrationItem[];
  onOpen: (code: string) => void;
}) {
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<Array<{ kind: FoundationKind; label: string; status: string; failed: boolean }>>([]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const base = `/events/${encodeURIComponent(eventId)}/integrations`;
    Promise.allSettled([
      api<{ items: KeyRow[] }>(`${base}/api-keys`).then((result) => {
        if (!Array.isArray(result?.items) || !result.items.every((key) =>
          typeof key?.expiresAt === 'string' && Number.isFinite(Date.parse(key.expiresAt))
          && (key.revokedAt === null || typeof key.revokedAt === 'string'))) {
          throw new Error('Resposta inválida ao consultar chaves.');
        }
        return result;
      }),
      api<{ items: WebhookRow[] }>(`${base}/webhooks`).then((result) => {
        if (!Array.isArray(result?.items) || !result.items.every((hook) => typeof hook?.enabled === 'boolean')) {
          throw new Error('Resposta inválida ao consultar endpoints.');
        }
        return result;
      }),
      api<PresenceView>(`${base}/presence`).then((result) => {
        if (!result || (result.snippet !== null && typeof result.snippet !== 'string')) {
          throw new Error('Resposta inválida ao consultar presença.');
        }
        return result;
      }),
    ]).then(([keysResult, hooksResult, presenceResult]) => {
      if (!active) return;
      const now = Date.now();
      const keyCount = keysResult.status === 'fulfilled'
        ? keysResult.value.items.filter((key) => !key.revokedAt && new Date(key.expiresAt).getTime() > now).length : 0;
      const hookCount = hooksResult.status === 'fulfilled'
        ? hooksResult.value.items.filter((hook) => hook.enabled).length : 0;
      setConnections([
        { kind: 'api', label: 'API do evento', failed: keysResult.status === 'rejected',
          status: keysResult.status === 'rejected' ? 'Não foi possível consultar as chaves.' : `${keyCount} chave(s) de leitura ativa(s)` },
        { kind: 'webhook', label: 'Webhooks', failed: hooksResult.status === 'rejected',
          status: hooksResult.status === 'rejected' ? 'Não foi possível consultar os endpoints.' : `${hookCount} endpoint(s) ativo(s)` },
        { kind: 'presence', label: 'Presença no seu site', failed: presenceResult.status === 'rejected',
          status: presenceResult.status === 'rejected' ? 'Não foi possível consultar o endereço.' : presenceResult.value.snippet ? 'Trecho do evento disponível' : 'Endereço público ainda não configurado' },
      ]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [eventId, revision]);
  return <section className={styles.connections} aria-labelledby="event-connections-title" aria-busy={loading}>
    <div className={styles.connectionsHeading}>
      <div><h2 id="event-connections-title">Conexões deste evento</h2>
        <p>Consulte a configuração atual e abra o recurso que deseja preparar. Disponível = fundação Evolvia configurável. Planejada = ficha explicativa, sem conector. Endpoint ativo ainda precisa ter a entrega validada no destino.</p></div>
      <button type="button" className={styles.clearFilters} disabled={loading} onClick={() => setRevision((value) => value + 1)}>Atualizar conexões</button>
    </div>
    {loading ? <p role="status">Consultando as configurações do evento…</p> :
      <ul className={styles.connectionsGrid}>{connections.map((connection) => {
        const item = items.find((entry) => entry.foundation === connection.kind);
        return <li key={connection.kind}>
          <h3>{connection.label}</h3>
          <p role={connection.failed ? 'alert' : undefined}>{connection.status}</p>
          {item && <button type="button" className={styles.clearFilters} onClick={() => onOpen(item.code)}>Configurar {connection.label}</button>}
        </li>;
      })}</ul>}
  </section>;
}

function joinPt(parts: string[]): string {
  if (parts.length === 0) return 'os filtros atuais';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

const AVAILABILITY_RANK = { READY: 0, PREPARING: 1, PLANNED: 2 } as const;

export default function IntegrationsHub({ eventId }: { eventId: string }) {
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<IntegrationCategoryCode | 'ALL'>('ALL');
  const [objective, setObjective] = useState<string>('ALL');
  const [availability, setAvailability] = useState<'ALL' | 'READY' | 'PREPARING' | 'PLANNED'>('ALL');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState('');
  const diagnosticRequest = useRef(0);

  useEffect(() => {
    let active = true;
    diagnosticRequest.current += 1;
    setDiagnosticBusy(false);
    setDiagnosticError('');
    setLoading(true);
    setPayload(null);
    setError('');
    setSelectedCode(null);
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
      diagnosticRequest.current += 1;
    };
  }, [eventId]);

  async function refreshAsaas() {
    const request = ++diagnosticRequest.current;
    setDiagnosticBusy(true);
    setDiagnosticError('');
    try {
      const result = await api<IntegrationsPayload>(`/events/${encodeURIComponent(eventId)}/integrations`);
      if (request !== diagnosticRequest.current) return;
      const status = result?.asaas;
      if (result?.event?.id !== eventId || !status
        || !['SIMULATED', 'BLOCKED', 'NOT_CONFIGURED', 'CONFIGURED'].includes(status.state)
        || !['local', 'sandbox', 'production'].includes(status.environment)
        || typeof status.message !== 'string' || !status.message.trim()) {
        throw new Error('Diagnóstico inválido.');
      }
      setPayload((current) => current && current.event.id === eventId ? { ...current, asaas: status } : current);
    } catch {
      if (request === diagnosticRequest.current) {
        setDiagnosticError('Não foi possível atualizar o diagnóstico. O resultado anterior foi mantido e pode estar desatualizado.');
      }
    } finally {
      if (request === diagnosticRequest.current) setDiagnosticBusy(false);
    }
  }

  const filtered = useMemo(() => {
    if (!payload) return [];
    const needle = normalize(query.trim());
    return payload.items.filter((item) => {
      if (category !== 'ALL' && item.category !== category) return false;
      if (objective !== 'ALL' && !item.objectives?.some((entry) => entry.code === objective)) return false;
      if (availability !== 'ALL' && item.availability !== availability) return false;
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
    }).sort((left, right) => {
      const byAvailability = AVAILABILITY_RANK[left.availability] - AVAILABILITY_RANK[right.availability];
      if (byAvailability !== 0) return byAvailability;
      return left.name.localeCompare(right.name, 'pt-BR');
    });
  }, [payload, query, category, objective, availability]);

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
    setAvailability('ALL');
  }

  if (loading || (payload && payload.event.id !== eventId)) {
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
  if (availability !== 'ALL') {
    activeFilterParts.push(`a disponibilidade ${
      availability === 'READY' ? 'Disponível' : availability === 'PREPARING' ? 'Em preparação' : 'Planejada'
    }`);
  }

  const readyCount = payload.items.filter((item) => item.availability === 'READY').length;
  const preparingCount = payload.items.filter((item) => item.availability === 'PREPARING').length;
  const plannedCount = payload.items.filter((item) => item.availability === 'PLANNED').length;

  return <div className={styles.hub}>
    <section className={styles.hero} aria-labelledby="integrations-title">
      <div>
        <p className={styles.eyebrow}>CATÁLOGO DO EVENTO</p>
        <h1 id="integrations-title">Integrações</h1>
        <p>Encontre a ferramenta pelo que deseja fazer. Consulte abaixo a configuração do Asaas. API, webhooks e presença em sites deste evento já podem ser configurados.</p>
        <p role="status" className={styles.resultMeta}>
          {readyCount} disponível(is) neste evento · {preparingCount} em preparação · {plannedCount} planejada(s). Itens planejados não disparam conexão externa.
        </p>
      </div>
    </section>

    {payload.asaas && <section className={styles.connections} aria-labelledby="asaas-configuration-title" aria-busy={diagnosticBusy}>
      <h2 id="asaas-configuration-title">Pagamento Asaas</h2>
      <button type="button" className={styles.clearFilters} disabled={diagnosticBusy} onClick={refreshAsaas}>Atualizar diagnóstico</button>
      {diagnosticBusy && <p role="status">Consultando diagnóstico…</p>}
      {diagnosticError && <p role="alert">{diagnosticError}</p>}
      <p>Ambiente: {payload.asaas.environment === 'local' ? 'simulação local' : payload.asaas.environment === 'production' ? 'produção' : 'sandbox de testes'}.</p>
      <p role={payload.asaas.state === 'BLOCKED' ? 'alert' : 'status'}>{payload.asaas.message}</p>
      <p>Diagnóstico somente leitura: não ativa o conector Asaas neste Hub e não comprova criação de cobrança, pagamento ou recebimento de webhook.</p>
    </section>}

    <EventConnections key={eventId} eventId={eventId} items={payload.items} onOpen={(code) => {
      clearFilters();
      setSelectedCode(code);
    }} />

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
        <label htmlFor="integrations-availability">
          Disponibilidade
          <select
            id="integrations-availability"
            value={availability}
            onChange={(event) => setAvailability(event.target.value as 'ALL' | 'READY' | 'PREPARING' | 'PLANNED')}
          >
            <option value="ALL">Todas</option>
            <option value="READY">Disponíveis agora</option>
            <option value="PREPARING">Em preparação</option>
            <option value="PLANNED">Planejadas</option>
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
                <span className={item.availability === 'READY' ? styles.stateReady : item.availability === 'PREPARING' ? styles.statePreparing : styles.statePlanned}>
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
                {item.foundation && <FoundationDesk key={`${eventId}:${item.foundation}`} eventId={eventId} kind={item.foundation} />}
              </div>}
            </li>;
          })}
        </ul>
      )}
    </div>

  </div>;
}



