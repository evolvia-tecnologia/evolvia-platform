export type EvaluationQuestion = { id: string; label: string; kind: 'RATING' | 'TEXT'; required: boolean };
export type EvaluationResponses = { title: string | null; questions: EvaluationQuestion[]; rows: { id: string; answers: Record<string, unknown>; submittedAt: string }[] };
export type EvaluationRating = { id: string; label: string; answered: number; missing: number; invalid: number; average: number | null; distribution: { value: number; count: number }[] };
export type EvaluationComments = { id: string; label: string; answered: number; missing: number; invalid: number; comments: { id: string; text: string }[] };
export function evaluationResults(data: EvaluationResponses) {
  const total = data.rows.length;
  const ratings: EvaluationRating[] = [];
  const texts: EvaluationComments[] = [];
  for (const question of data.questions) {
    let missing = 0, invalid = 0;
    const distribution = Array.from({ length: 5 }, (_, i) => ({ value: i + 1, count: 0 }));
    const comments: EvaluationComments['comments'] = [];
    for (const row of data.rows) {
      const answer = row.answers?.[question.id];
      if (answer === undefined || answer === null || (typeof answer === 'string' && !answer.trim())) { missing++; continue; }
      if (question.kind === 'RATING') {
        if (typeof answer === 'number' && Number.isInteger(answer) && answer >= 1 && answer <= 5) distribution[answer - 1].count++;
        else invalid++;
      } else if (typeof answer === 'string') comments.push({ id: row.id, text: answer });
      else invalid++;
    }
    if (question.kind === 'RATING') {
      const answered = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
      const weighted = distribution.reduce((sum, bucket) => sum + bucket.value * bucket.count, 0);
      ratings.push({ id: question.id, label: question.label, answered, missing, invalid, average: answered ? weighted / answered : null, distribution });
    } else texts.push({ id: question.id, label: question.label, answered: comments.length, missing, invalid, comments });
  }
  return { total, ratings, texts };
}
export function evaluationSummaryCsv(data: EvaluationResponses): string {
  const summary = evaluationResults(data);
  const rows: unknown[][] = [['Avaliação', data.title], ['Respostas na consulta', summary.total], ['Pergunta', 'Notas válidas', 'Sem resposta', 'Valores inválidos', 'Média de 1 a 5', 'Nota 1', 'Nota 2', 'Nota 3', 'Nota 4', 'Nota 5']];
  for (const item of summary.ratings) rows.push([item.label, item.answered, item.missing, item.invalid, item.average === null ? '' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(item.average), ...item.distribution.map(bucket => bucket.count)]);
  rows.push(['Pergunta de texto', 'Comentários', 'Sem resposta', 'Valores inválidos']);
  for (const item of summary.texts) rows.push([item.label, item.answered, item.missing, item.invalid]);
  rows.push(['Critério', 'Cada média considera somente as notas válidas daquela pergunta. Não representa NPS nem taxa de resposta dos inscritos. Comentários não são incluídos neste resumo.']);
  return evaluationCsv(rows);
}
function evaluationCsv(rows: unknown[][]): string {
  const cell = (value: unknown) => {
    let text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '');
    if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
function matchingComments(comments: EvaluationComments['comments'], query: string) {
  const needle = normalize(query.trim());
  return needle ? comments.filter(comment => normalize(comment.text).includes(needle)) : comments;
}
export function evaluationCommentsCsv(data: EvaluationResponses, questionId: string, query: string): string {
  const question = data.questions.find(item => item.id === questionId && item.kind === 'TEXT');
  if (!question) throw new Error('Selecione uma pergunta de texto disponível.');
  const selected: EvaluationComments['comments'] = [];
  for (const row of data.rows) {
    const answer = row.answers?.[questionId];
    if (typeof answer === 'string' && answer.trim()) selected.push({ id: row.id, text: answer });
  }
  const comments = matchingComments(selected, query);
  return evaluationCsv([
    ['Avaliação', data.title], ['Pergunta', question.label], ['Busca aplicada', query.trim()],
    ['Comentários encontrados', comments.length],
    ['Escopo', 'Todos os comentários desta pergunta que correspondem à busca, em todas as páginas desta consulta.'],
    ['Comentário'], ...comments.map(comment => [comment.text]),
  ]);
}
export function evaluationCommentPage(comments: EvaluationComments['comments'], query: string, page: number, size = 10) {
  const filtered = matchingComments(comments, query);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(pages - 1, Math.max(0, page));
  return { rows: filtered.slice(current * size, (current + 1) * size), total: filtered.length, pages, current };
}
