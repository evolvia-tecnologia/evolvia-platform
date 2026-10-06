import type { RegistrationField } from './registration-forms.service';

export type ReportRegistration = {
  status: string; expiresAt: Date | null; categoryId: string;
  category: { name: string }; finalPriceCents: number;
  registrationData: unknown; registrationFormVersion: number | null;
  checkIn: { checkedInAt: Date } | null;
  checkout: { status: string; amountCents: number } | null;
};
type Bucket = { label: string; registered: number; present: number };
type PaymentCategory = { label: string; confirmed: number; paid: number; exempt: number; review: number; unverified: number; receivedCents: number; confirmedPriceCents: number };
const STATISTICAL_TEXT = new Set(['institution', 'job_title', 'practice_area', 'profession', 'professional_city', 'professional_state', 'professional_country', 'city', 'state', 'country', 'interest_area', 'interest_topic', 'specialty', 'education_level', 'educational_institution']);
const STRUCTURED = new Set(['SELECT', 'RADIO', 'CHECKBOX', 'CONSENT']);
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function reportFields(value: unknown): RegistrationField[] {
  return Array.isArray(value) ? value.filter((field) => field && !Array.isArray(field) && typeof field === 'object' && typeof field.id === 'string' && field.id.trim().length > 0 && typeof field.code === 'string' && typeof field.label === 'string') : [];
}
export function reportingTimeZone(value: string | null): string {
  try { new Intl.DateTimeFormat('pt-BR', { timeZone: value || 'UTC' }); return value || 'UTC'; }
  catch { return 'UTC'; }
}
export function eventReportDay(date: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function ageBandAtEvent(value: unknown, referenceDay: string | null): string {
  if (!referenceDay) return 'Data do evento não definida';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return 'Não informado';
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value > referenceDay) return 'Data inválida';
  const [year, month, day] = value.split('-').map(Number);
  const [refYear, refMonth, refDay] = referenceDay.split('-').map(Number);
  const age = refYear - year - (refMonth < month || (refMonth === month && refDay < day) ? 1 : 0);
  if (age < 0 || age > 120) return 'Data inválida';
  if (age < 18) return 'Até 17 anos';
  if (age < 25) return '18 a 24 anos';
  if (age < 35) return '25 a 34 anos';
  if (age < 45) return '35 a 44 anos';
  if (age < 55) return '45 a 54 anos';
  if (age < 65) return '55 a 64 anos';
  return '65 anos ou mais';
}
function applies(field: RegistrationField, row: ReportRegistration, answers: Record<string, unknown>, schema: RegistrationField[], seen = new Set<string>()) {
  if (field.enabled === false || seen.has(field.id)) return false;
  seen.add(field.id);
  if (field.appliesToCategoryIds?.length && !field.appliesToCategoryIds.includes(row.categoryId)) return false;
  if (!field.condition) return true;
  const parent = schema.find((f) => f.id === field.condition?.fieldId || f.code === field.condition?.fieldId);
  if (!parent || !applies(parent, row, answers, schema, seen)) return false;
  const value = answers[parent.code];
  const matches = Array.isArray(value) ? value.includes(field.condition.value) : String(value ?? '') === field.condition.value;
  return field.condition.operator === 'NOT_EQUALS' ? !matches : matches;
}
function labels(field: RegistrationField, value: unknown, referenceDay: string | null): string[] {
  if (field.code === 'birth_date') return [ageBandAtEvent(value, referenceDay)];
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) return ['Não informado'];
  if (field.type === 'CONSENT') return [value === true ? 'Sim' : value === false ? 'Não' : 'Resposta inválida'];
  if (STRUCTURED.has(field.type)) {
    const values = Array.isArray(value) ? [...new Set(value)] : [value];
    return [...new Set(values.map((item) => field.options?.find((option) => option.id === item)?.label ?? 'Opção não reconhecida'))];
  }
  return [typeof value === 'string' ? value.trim().slice(0, 160) || 'Não informado' : 'Resposta inválida'];
}
export class PostEventReportAccumulator {
  readonly registered = { confirmed: 0, present: 0, absent: 0, pending: 0, expired: 0, cancelled: 0 };
  readonly payment = { paid: 0, exempt: 0, review: 0, unverified: 0, receivedCents: 0, confirmedPriceCents: 0 };
  private readonly categories = new Map<string, Bucket>();
  private readonly paymentCategories = new Map<string, PaymentCategory>();
  private readonly days = new Map<string, number>();
  private readonly hours = new Map<string, number>();
  private readonly dimensions: Array<{ field: RegistrationField; eligible: number; presentEligible: number; notCollected: number; notApplicable: number; buckets: Map<string, Bucket> }>;
  constructor(private readonly fields: RegistrationField[], private readonly versions: Map<number, RegistrationField[]>, private readonly referenceDay: string | null, private readonly zone: string, private readonly now: Date) {
    this.dimensions = fields.filter((f) => f.enabled !== false && (f.code === 'birth_date' || STRUCTURED.has(f.type) || (STATISTICAL_TEXT.has(f.code) && !f.sensitive))).map((field) => ({ field, eligible: 0, presentEligible: 0, notCollected: 0, notApplicable: 0, buckets: new Map() }));
  }
  add(row: ReportRegistration) {
    const status = row.status === 'PENDING_PAYMENT' && row.expiresAt && row.expiresAt <= this.now ? 'EXPIRED' : row.status;
    if (status !== 'CONFIRMED') {
      if (status === 'PENDING_PAYMENT') this.registered.pending++;
      else if (status === 'EXPIRED') this.registered.expired++;
      else if (status === 'CANCELLED') this.registered.cancelled++;
      return;
    }
    this.registered.confirmed++;
    const present = Boolean(row.checkIn);
    this.registered[present ? 'present' : 'absent']++;
    this.payment.confirmedPriceCents += row.finalPriceCents;
    const paymentKey = this.paymentCategories.has(row.categoryId) || this.paymentCategories.size < 200 ? row.categoryId : '__other__';
    const paymentCategory = this.paymentCategories.get(paymentKey) ?? { label: paymentKey === '__other__' ? 'Outras categorias' : (row.category?.name ?? 'Sem categoria'), confirmed: 0, paid: 0, exempt: 0, review: 0, unverified: 0, receivedCents: 0, confirmedPriceCents: 0 };
    paymentCategory.confirmed++;
    paymentCategory.confirmedPriceCents += row.finalPriceCents;
    if (row.finalPriceCents === 0) paymentCategory.exempt++;
    else if (row.checkout?.status === 'PAID') { paymentCategory.paid++; paymentCategory.receivedCents += row.checkout.amountCents; }
    else if (row.checkout?.status === 'PAID_REVIEW') paymentCategory.review++;
    else paymentCategory.unverified++;
    this.paymentCategories.set(paymentKey, paymentCategory);
    if (row.finalPriceCents === 0) this.payment.exempt++;
    else if (row.checkout?.status === 'PAID') { this.payment.paid++; this.payment.receivedCents += row.checkout.amountCents; }
    else if (row.checkout?.status === 'PAID_REVIEW') this.payment.review++;
    else this.payment.unverified++;
    this.increment(this.categories, row.categoryId, (row.category?.name ?? 'Sem categoria'), present);
    if (row.checkIn) {
      const date = row.checkIn.checkedInAt;
      const day = eventReportDay(date, this.zone);
      const hour = new Intl.DateTimeFormat('en-GB', { timeZone: this.zone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).find((part) => part.type === 'hour')?.value ?? '00';
      this.days.set(day, (this.days.get(day) ?? 0) + 1);
      this.hours.set(`${day} ${hour}:00`, (this.hours.get(`${day} ${hour}:00`) ?? 0) + 1);
    }
    const answers = object(row.registrationData);
    const schema = row.registrationFormVersion === null ? this.fields : this.versions.get(row.registrationFormVersion);
    for (const dimension of this.dimensions) {
      const field = schema?.find((f) => f.code === dimension.field.code && f.enabled !== false);
      if (!field) { dimension.notCollected++; continue; }
      if (!applies(field, row, answers, schema ?? [])) { dimension.notApplicable++; continue; }
      dimension.eligible++;
      if (present) dimension.presentEligible++;
      for (const label of labels(field, answers[field.code], this.referenceDay)) this.increment(dimension.buckets, label.toLocaleLowerCase('pt-BR'), label, present);
    }
  }
  private increment(map: Map<string, Bucket>, key: string, label: string, present: boolean) {
    // Bound free-text cardinality; configured choices are kept alongside a tail.
    const safeKey = map.has(key) || map.size < 200 ? key : '__other__';
    const row = map.get(safeKey) ?? { label: safeKey === '__other__' ? 'Outros valores' : label, registered: 0, present: 0 };
    row.registered++; if (present) row.present++; map.set(safeKey, row);
  }
  finish() {
    const sort = (map: Map<string, Bucket>) => [...map.values()].sort((a, b) => b.registered - a.registered || a.label.localeCompare(b.label, 'pt-BR'));
    return {
      registration: { ...this.registered, attendancePercent: this.registered.confirmed ? 100 * this.registered.present / this.registered.confirmed : null },
      payment: { ...this.payment, categories: [...this.paymentCategories.values()].sort((a, b) => b.confirmed - a.confirmed || a.label.localeCompare(b.label, 'pt-BR')) },
      categories: sort(this.categories),
      firstCheckInByDay: [...this.days].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
      firstCheckInByHour: [...this.hours].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count })),
      fields: this.dimensions.map((d) => ({ code: d.field.code, label: d.field.code === 'birth_date' ? 'Faixa etária' : d.field.label, multiple: d.field.type === 'CHECKBOX', eligible: d.eligible, presentEligible: d.presentEligible, notCollected: d.notCollected, notApplicable: d.notApplicable, buckets: sort(d.buckets) })),
    };
  }
}
