import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const notice = await readFile(new URL('../components/registration-refund-notice.tsx', import.meta.url), 'utf8');
const request = await readFile(new URL('../components/registration-refund-request.tsx', import.meta.url), 'utf8');
const organizer = await readFile(new URL('../components/registration-refund-organizer.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../components/registration-refund.module.css', import.meta.url), 'utf8');
const form = await readFile(new URL('../components/public-registration-form.tsx', import.meta.url), 'utf8');
const area = await readFile(new URL('../components/participant-area.tsx', import.meta.url), 'utf8');
const finance = await readFile(new URL('../app/eventos/[id]/painel/financeiro/page.tsx', import.meta.url), 'utf8');

test('a regra aparece antes do pagamento e na área da inscrição', () => {
  assert.match(form, /RegistrationRefundNotice/u);
  assert.match(form, /registrationMode === 'PAID'/u);
  assert.match(area, /RegistrationRefundRequest/u);
  assert.match(notice, /Regra de reembolso/u);
  assert.match(notice, /if \(!paid\) return null/u);
  assert.match(finance, /\/painel\/reembolsos/u);
});

test('estados de carregamento, vazio e erro ficam anunciados', () => {
  for (const source of [notice, request, organizer]) {
    assert.match(source, /role="status"/u);
    assert.match(source, /role="alert"/u);
    assert.match(source, /Carregando/u);
  }
  assert.match(organizer, /Nenhum pedido de reembolso/u);
  assert.match(request, /O pedido vale para uma inscrição paga/u);
  assert.match(request, /A elegibilidade ainda não pode ser calculada/u);
});

test('o organizador aprova ou recusa sem tratar a aprovação como dinheiro devolvido', () => {
  assert.match(organizer, /Aprovar/u);
  assert.match(organizer, /Recusar/u);
  assert.match(organizer, /Publicar regra/u);
  assert.match(organizer, /não devolve o dinheiro/u);
  assert.match(request, /não devolve o dinheiro nem cancela a credencial/u);
  assert.match(organizer, /Em nenhum momento/u);
  assert.match(organizer, /Até 30 dias antes do início/u);
  assert.match(organizer, /Até 7 dias antes do início/u);
  assert.match(organizer, /Até 1 dia antes do início/u);
  assert.match(organizer, /A qualquer momento/u);
});

test('teclado e reflow usam controles nativos e o breakpoint de 700px', () => {
  assert.match(organizer, /<select/u);
  assert.match(organizer, /<textarea/u);
  assert.match(organizer, /type="submit"/u);
  assert.match(organizer, /type="button"/u);
  assert.match(css, /max-width: 700px/u);
  assert.match(css, /:focus-visible/u);
  assert.match(css, /overflow-x: auto/u);
  assert.doesNotMatch(`${notice}\n${request}\n${organizer}`, /localStorage|sessionStorage|document\.cookie/u);
});
