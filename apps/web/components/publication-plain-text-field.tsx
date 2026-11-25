import styles from './publication-editor.module.css';

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  help?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
};

export default function PublicationPlainTextField({
  id, label, value, onChange, maxLength, disabled, placeholder, rows, help, error, required, optional,
}: Props) {
  const describedBy = [help && id + '-help', id + '-count', error && id + '-error'].filter(Boolean).join(' ');
  const control = { id, value, maxLength, disabled, required, placeholder,
    'aria-describedby': describedBy, 'aria-invalid': Boolean(error) };
  return <div className={styles.field}>
    <label htmlFor={id}>{label}
      {required && <strong aria-hidden="true"> *</strong>}
      {optional && <em> opcional</em>}
    </label>
    {help && <small id={id + '-help'}>{help}</small>}
    {rows
      ? <textarea {...control} rows={rows} onChange={event => onChange(event.target.value)} />
      : <input {...control} type="text" onChange={event => onChange(event.target.value)} />}
    <span id={id + '-count'} className={styles.fieldCounter}>{value.length}{maxLength !== undefined && ` de ${maxLength}`} caracteres</span>
    {error && <small id={id + '-error'} className={styles.fieldError}>{error}</small>}
  </div>;
}
