import { localDateTimeInputValue } from './event-time-zone';

export type EditableProgramActivity = {
  id: string;
  title: string;
  activityType: string;
  startAt: string;
  endAt: string;
  spaceId: string | null;
};

export function programActivityEditForm(activity: EditableProgramActivity) {
  return {
    title: activity.title,
    activityType: activity.activityType,
    startAt: localDateTimeInputValue(activity.startAt),
    endAt: localDateTimeInputValue(activity.endAt),
    spaceId: activity.spaceId ?? '',
  };
}

export type ProgramActivityEditForm = ReturnType<typeof programActivityEditForm>;

/** Send only changes; preserve original instants (including fractions) on no-op. */
export function programActivityEditPatch(activity: EditableProgramActivity, form: ProgramActivityEditForm) {
  const original = programActivityEditForm(activity);
  const instant = (value: string, previous: string, displayed: string) => {
    if (value === displayed) return previous;
    const parsed = new Date(value);
    if (!value || !Number.isFinite(parsed.getTime()) || localDateTimeInputValue(parsed.toISOString()) !== value) {
      throw new Error('Informe datas e horários válidos para o início e o término da atividade.');
    }
    return parsed.toISOString();
  };
  const startAt = instant(form.startAt, activity.startAt, original.startAt);
  const endAt = instant(form.endAt, activity.endAt, original.endAt);
  if (new Date(endAt) <= new Date(startAt)) throw new Error('O término da atividade deve ser posterior ao início.');
  if (!form.title.trim() || !form.activityType.trim()) throw new Error('Informe o título e o tipo da atividade.');
  if (activity.spaceId && !form.spaceId) throw new Error('Escolha um espaço para substituir o espaço atual.');

  return {
    ...(form.title.trim() !== activity.title ? { title: form.title.trim() } : {}),
    ...(form.activityType.trim() !== activity.activityType ? { activityType: form.activityType.trim() } : {}),
    ...(startAt !== activity.startAt ? { startAt } : {}),
    ...(endAt !== activity.endAt ? { endAt } : {}),
    ...(form.spaceId !== original.spaceId ? { spaceId: form.spaceId } : {}),
  };
}
