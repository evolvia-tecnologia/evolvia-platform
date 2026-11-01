'use client';

import { useEffect, useId, useState } from 'react';
import { joinPhone, phoneError, splitPhone, type PhoneParts } from '../lib/registration-input';
import styles from './international-phone-input.module.css';

export default function InternationalPhoneInput({ label, value, onChange, required = false, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; disabled?: boolean;
}) {
  const id = useId();
  const [parts, setParts] = useState(() => splitPhone(value));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (value !== joinPhone(parts)) setParts(splitPhone(value));
  }, [value]); // Do not re-split a partial DDI/DDD while the person types.
  const error = touched && value ? phoneError(value) : null;
  function update(next: PhoneParts) { setParts(next); onChange(joinPhone(next)); }
  return <fieldset className={styles.phone} disabled={disabled} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}>
    <legend>{label}{required ? ' *' : ''}</legend>
    <div className={styles.parts}>
      <label>DDI<input type="tel" inputMode="tel" autoComplete="tel-country-code" required={required || Boolean(value)} maxLength={4} pattern="\+?[1-9][0-9]{0,2}" value={`+${parts.ddi}`} onChange={(e) => update({ ...parts, ddi: e.target.value.replace(/\D/gu, '').slice(0, 3) })} onBlur={() => setTouched(true)} /></label>
      {parts.ddi === '55' && <label>DDD<input type="tel" inputMode="numeric" autoComplete="tel-area-code" required={required || Boolean(value)} maxLength={2} pattern="[1-9][1-9]" placeholder="11" value={parts.area} onChange={(e) => update({ ...parts, area: e.target.value.replace(/\D/gu, '').slice(0, 2) })} onBlur={() => setTouched(true)} /></label>}
      <label>{parts.ddi === '55' ? 'Número' : 'Número com código de área'}<input type="tel" inputMode="tel" autoComplete="tel-national" required={required || Boolean(value)} maxLength={24} pattern={parts.ddi === '55' ? '(?:[2-5][0-9]{7}|9[0-9]{8})' : '[0-9]{4,14}'} placeholder={parts.ddi === '55' ? '999999999' : 'Número nacional'} value={parts.number} aria-invalid={Boolean(error)} onChange={(e) => {
        const raw = e.target.value;
        if (raw.trim().startsWith('+')) update(splitPhone(raw));
        else {
          const digits = raw.replace(/\D/gu, '');
          if (parts.ddi === '55' && digits.length >= 10) update(splitPhone(digits));
          else update({ ...parts, number: digits.slice(0, parts.ddi === '55' ? 9 : 15 - parts.ddi.length) });
        }
      }} onBlur={() => setTouched(true)} /></label>
    </div>
    <small id={`${id}-help`}>Brasil: +55, DDD e número. Outros países: DDI e número nacional. Você também pode colar o telefone completo com +DDI.</small>
    {error && <small id={`${id}-error`} role="alert">{error}</small>}
  </fieldset>;
}
