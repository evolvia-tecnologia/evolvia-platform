'use client';

import { useEffect, useState } from 'react';
import { EVENT_PROFILE_GROUPS, findEventProfileGroup } from '../lib/event-profile-catalog';
import styles from './public-profile-picker.module.css';

export function profilePickerStatus(eventType: string): string {
  if (!eventType) return 'Escolha a família mais próxima. Você poderá alterar depois.';
  return `Perfil inicial escolhido: ${eventType}. A EVA leva essa escolha para a criação do evento.`;
}

function focusElement(id: string) {
  if (typeof document === 'undefined') return;
  requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export default function PublicProfilePicker({
  selectedEventType,
  onChoose,
}: {
  selectedEventType: string;
  onChoose: (eventType: string) => void;
}) {
  const [familyId, setFamilyId] = useState('');
  useEffect(() => {
    setFamilyId(findEventProfileGroup(selectedEventType)?.id ?? '');
  }, [selectedEventType]);
  const family = EVENT_PROFILE_GROUPS.find((group) => group.id === familyId);

  return <div className={styles.picker}>
    {family ? <div className={styles.family}>
      <button type="button" className={styles.back} onClick={() => { setFamilyId(''); focusElement('home-profile-families'); }}>Voltar às famílias</button>
      <h3 id={`home-profile-${family.id}`} tabIndex={-1}>{family.label}</h3>
      <p className={styles.description}>{family.description}</p>
      <div className="options-grid" role="group" aria-labelledby={`home-profile-${family.id}`}>
        {family.options.map((profile) => {
          const selected = selectedEventType === profile.value;
          return <button
            key={profile.value}
            type="button"
            className={`option${selected ? ' selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onChoose(profile.value)}
          >
            <strong>{profile.title}</strong>
            <span>{profile.description}</span>
          </button>;
        })}
      </div>
    </div> : <div id="home-profile-families" className={styles.families} role="group" aria-labelledby="event-type-question" tabIndex={-1}>
      {EVENT_PROFILE_GROUPS.map((group) => <button
        key={group.id}
        type="button"
        className="option"
        onClick={() => { setFamilyId(group.id); focusElement(`home-profile-${group.id}`); }}
      >
        <strong>{group.label}</strong>
        <span>{group.description}</span>
      </button>)}
    </div>}
    <p className={styles.status} aria-live="polite">{profilePickerStatus(selectedEventType)}</p>
  </div>;
}
