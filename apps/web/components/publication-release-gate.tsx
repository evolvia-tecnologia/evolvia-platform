'use client';

import Link from 'next/link';
import { FormEvent, useRef, useState } from 'react';
import { api } from '../lib/api';
import styles from './publication-release-gate.module.css';

type EventStatus =
  | 'DRAFT'
  | 'SETUP'
  | 'HOMOLOGATION'
  | 'READY_TO_PUBLISH'
  | 'PUBLISHED'
  | 'SUSPENDED'
  | 'FINISHED'
  | 'CANCELLED';

type TargetStatus = 'SETUP' | 'HOMOLOGATION' | 'READY_TO_PUBLISH' | 'PUBLISHED';

type Checklist = {
  items: Array<{ code: string; label: string; ready: boolean; required: boolean }>;
  blockingCount: number;
  recommendedPendingCount: number;
};

type LifecyclePermissions = {
  canSubmitForHomologation: boolean;
  canReturnToSetup: boolean;
  canApproveHomologation: boolean;
  canPublish: boolean;
};

const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: 'Rascunho',
  SETUP: 'Em configuração',
  HOMOLOGATION: 'Em homologação',
  READY_TO_PUBLISH: 'Pronto para publicar',
  PUBLISHED: 'Publicado',
  SUSPENDED: 'Suspenso',
  FINISHED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

const SUCCESS_MESSAGES: Record<TargetStatus, string> = {
  SETUP: 'A Divulgação voltou para ajustes. O conteúdo pode ser editado novamente.',
  HOMOLOGATION: 'A Divulgação entrou em homologação e ficou congelada para revisão.',
  READY_TO_PUBLISH: 'A homologação foi aprovada. A página aguarda a confirmação final de publicação.',
  PUBLISHED: 'A página foi publicada explicitamente e já pode ser consultada pelo endereço público.',
};

export default function PublicationReleaseGate({
  eventId,
  eventSlug,
  status,
  publicationRevision,
  checklist,
  permissions,
  hasUnsavedChanges,
  onChanged,
}: {
  eventId: string;
  eventSlug: string;
  status: string;
  publicationRevision: number;
  checklist: Checklist;
  permissions: LifecyclePermissions;
  hasUnsavedChanges: boolean;
  onChanged: () => Promise<void>;
}) {
  const confirmationDialogRef = useRef<HTMLDialogElement>(null);
  const [busyTarget, setBusyTarget] = useState<TargetStatus | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const normalizedStatus = status in STATUS_LABELS ? status as EventStatus : 'DRAFT';
  const blocked = hasUnsavedChanges || busyTarget !== null;

  const transition = async (targetStatus: TargetStatus, explicitConfirmation?: string) => {
    if (blocked) return;
    setBusyTarget(targetStatus);
    setError('');
    setSuccess('');
    try {
      await api(`/events/${eventId}/publication/status`, {
        method: 'POST',
        body: JSON.stringify({
          targetStatus,
          publicationRevision,
          ...(explicitConfirmation ? { confirmation: explicitConfirmation } : {}),
        }),
      });
      setSuccess(SUCCESS_MESSAGES[targetStatus]);
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o estado da Divulgação.');
    } finally {
      setBusyTarget(null);
    }
  };

  const openPublicationConfirmation = () => {
    setConfirmation('');
    setError('');
    confirmationDialogRef.current?.showModal();
  };

  const confirmPublication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (confirmation.trim().toUpperCase() !== 'PUBLICAR') return;
    confirmationDialogRef.current?.close();
    await transition('PUBLISHED', confirmation);
  };

  return <section className={styles.gate} aria-labelledby="publication-release-title">
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>FASE 1 · GO/NO-GO</p>
        <h2 id="publication-release-title">Homologação e publicação</h2>
        <p>A EVA mostra o que falta, mas somente uma pessoa autorizada pode avançar cada etapa.</p>
      </div>
      <span className={styles.status}>Estado: {STATUS_LABELS[normalizedStatus]}</span>
    </div>

    <ol className={styles.timeline} aria-label="Etapas da publicação">
      <li data-active={normalizedStatus === 'SETUP'} aria-current={normalizedStatus === 'SETUP' ? 'step' : undefined}>1. Configuração</li>
      <li data-active={normalizedStatus === 'HOMOLOGATION'} aria-current={normalizedStatus === 'HOMOLOGATION' ? 'step' : undefined}>2. Homologação</li>
      <li data-active={normalizedStatus === 'READY_TO_PUBLISH'} aria-current={normalizedStatus === 'READY_TO_PUBLISH' ? 'step' : undefined}>3. Aprovação</li>
      <li data-active={normalizedStatus === 'PUBLISHED'} aria-current={normalizedStatus === 'PUBLISHED' ? 'step' : undefined}>4. Publicação</li>
    </ol>

    <div className={styles.checklist}>
      <div>
        <h3>Checklist verificável</h3>
        <p><strong>{checklist.blockingCount}</strong> bloqueio(s) obrigatório(s) e <strong>{checklist.recommendedPendingCount}</strong> recomendação(ões) pendente(s).</p>
      </div>
      <ul>
        {checklist.items.map((item) => <li key={item.code}>
          <span className={item.ready ? styles.ready : styles.pending}>
            {item.ready ? 'Concluído' : item.required ? 'Bloqueio' : 'Recomendado'}
          </span>
          <span>{item.label}{item.required ? ' — obrigatório' : ' — recomendado'}</span>
        </li>)}
      </ul>
    </div>

    {hasUnsavedChanges && <p className={styles.warning} role="status">
      Salve ou descarte as alterações editoriais antes de mudar o estado. O Gate usa somente a versão já salva.
    </p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {success && <p className={styles.success} role="status" aria-live="polite">{success}</p>}

    <div className={styles.actions}>
      {permissions.canReturnToSetup && <button
        type="button"
        className={styles.secondaryButton}
        disabled={blocked}
        onClick={() => void transition('SETUP')}
      >{busyTarget === 'SETUP' ? 'Voltando...' : 'Voltar para ajustes'}</button>}

      {permissions.canSubmitForHomologation && <button
        type="button"
        className={styles.primaryButton}
        disabled={blocked}
        onClick={() => void transition('HOMOLOGATION')}
      >{busyTarget === 'HOMOLOGATION' ? 'Enviando...' : 'Enviar para homologação'}</button>}

      {permissions.canApproveHomologation && <button
        type="button"
        className={styles.primaryButton}
        disabled={blocked}
        onClick={() => void transition('READY_TO_PUBLISH')}
      >{busyTarget === 'READY_TO_PUBLISH' ? 'Aprovando...' : 'Aprovar homologação'}</button>}

      {permissions.canPublish && <button
        type="button"
        className={styles.publishButton}
        disabled={blocked}
        onClick={openPublicationConfirmation}
      >Publicar página</button>}
    </div>

    {!permissions.canSubmitForHomologation
      && !permissions.canReturnToSetup
      && !permissions.canApproveHomologation
      && !permissions.canPublish
      && normalizedStatus !== 'PUBLISHED'
      && <p className={styles.explanation}>Nenhuma transição está disponível para seu papel ou para o estado atual.</p>}

    {normalizedStatus === 'PUBLISHED' && <div className={styles.published} role="status">
      <strong>Página publicada</strong>
      <p>Alterações editoriais exigem um fluxo futuro de revisão; nada será modificado silenciosamente.</p>
      <Link href={`/evento/${encodeURIComponent(eventSlug)}`} target="_blank" rel="noreferrer">
        Abrir página pública
      </Link>
      <small>Indexação pública: controlada pela política segura do ambiente. A homologação permanece fora dos mecanismos de busca.</small>
    </div>}

    <dialog
      ref={confirmationDialogRef}
      className={styles.dialog}
      aria-labelledby="publication-confirm-title"
      aria-describedby="publication-confirm-description"
      onCancel={() => setConfirmation('')}
    >
      <form onSubmit={(event) => void confirmPublication(event)}>
        <p className={styles.eyebrow}>CONFIRMAÇÃO EXPLÍCITA</p>
        <h2 id="publication-confirm-title">Publicar esta página agora?</h2>
        <p id="publication-confirm-description">
          A página ficará disponível no endereço público. Esta ação não ativa Inscrição, pagamentos ou qualquer jornada ainda inexistente.
        </p>
        <label htmlFor="publication-confirmation">
          Digite <strong>PUBLICAR</strong> para confirmar
          <input
            id="publication-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={() => confirmationDialogRef.current?.close()}>Cancelar</button>
          <button type="submit" className={styles.publishButton} disabled={confirmation.trim().toUpperCase() !== 'PUBLICAR'}>Confirmar publicação</button>
        </div>
      </form>
    </dialog>
  </section>;
}
