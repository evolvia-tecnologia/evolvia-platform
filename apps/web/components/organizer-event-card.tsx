import Link from 'next/link';
import { eventStatusLabel } from '../lib/event-status-labels';
import {
  eventFormatCaption,
  eventListAction,
  foundationProgress,
  type OrganizerWizard,
} from '../lib/organizer-event-card';

export type OrganizerEventCardItem = {
  id: string;
  name: string;
  eventType: string;
  format: string;
  status: string;
  updatedAt: string;
  organization?: { name: string };
  wizard: OrganizerWizard;
  capabilityCodes: string[];
};

const capabilityLabels: Record<string, string> = {
  registration: 'Inscrições',
  payment: 'Pagamentos',
  communication: 'Comunicação',
  credential: 'Credenciamento',
  access_control: 'Acessos',
  scientific_submission: 'Trabalhos',
  certificate: 'Certificados',
  exhibitor: 'Expositores',
  material_delivery: 'Materiais',
};

export default function OrganizerEventCard({ item }: { item: OrganizerEventCardItem }) {
  const action = eventListAction(item.status, item.wizard?.status ?? null, item.id);
  const progress = foundationProgress(item.wizard);
  const progressId = `foundation-progress-${item.id}`;
  const progressText = progress === null ? 'Não informado' : `${progress}%`;
  return <article className="event-card">
    <div className="event-card-head">
      <span className={`event-status status-${item.status.toLowerCase()}`}>{eventStatusLabel(item.status)}</span>
      <span className="event-format">{eventFormatCaption(item.status, item.format, item.wizard)}</span>
    </div>
    <div className="event-card-body">
      <small>{item.organization?.name ?? 'Evento pessoal'}</small>
      <h3>{item.name}</h3>
      <p>{item.eventType}</p>
    </div>
    <div className="event-progress">
      <div>
        <span id={progressId}>Progresso da fundação</span>
        <strong>{progressText}</strong>
      </div>
      <div
        className="progress-track compact"
        role="progressbar"
        aria-labelledby={progressId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress ?? undefined}
        aria-valuetext={progressText}
      >
        <div className="progress-value" style={{ width: `${progress ?? 0}%` }} />
      </div>
    </div>
    {item.capabilityCodes.length > 0 && <div className="event-capabilities">
      {item.capabilityCodes.slice(0, 3).map((code) => <span key={code}>{capabilityLabels[code] ?? code}</span>)}
      {item.capabilityCodes.length > 3 && <span>+{item.capabilityCodes.length - 3}</span>}
    </div>}
    <div className="event-card-footer">
      <span>Atualizado {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</span>
      <Link className={`btn ${action.primary ? 'btn-primary' : 'btn-secondary'} btn-card`} href={action.href}>
        {action.label}<b aria-hidden="true">→</b>
      </Link>
    </div>
  </article>;
}
