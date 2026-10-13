import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [admin, participant, css, page] = await Promise.all([
  '../components/activity-waitlist-admin.tsx',
  '../components/participant-activity-waitlist.tsx',
  '../components/activity-waitlist.module.css',
  '../app/eventos/[id]/painel/fila-atividades/page.tsx',
].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));

test('a fila do organizador não busca sem evento e não expõe dados da ficha', () => {
  assert.match(admin, /if \(!eventId\) return;/u);
  assert.match(admin, /Dar a vaga/u);
  assert.match(admin, /Nenhuma atividade tem gente na fila/u);
  assert.match(admin, /A fila não reserva a vaga/u);
  assert.match(admin, /primeiras 100 pessoas de cada atividade/u);
  assert.doesNotMatch(admin, /primeiras 500 pessoas/u);
  assert.match(admin, /encodeURIComponent\(eventId\)/u);
  assert.match(admin, /role="alert"/u);
  assert.match(admin, /styles\.error/u);
  assert.match(admin, /role="status"/u);
  assert.doesNotMatch(admin, /localStorage|sessionStorage|organizationId|email|registrationData|protocol|identityDocument/u);
  assert.match(page, /EventWorkspace/u);
  assert.match(page, /fila-atividades|ActivityWaitlistAdmin/u);
});

test('a fila do participante tem acesso próprio e não grava o documento', () => {
  assert.match(participant, /if \(!slug \|\| !token\) return;/u);
  assert.match(participant, /if \(!slug \|\| busy\) return;/u);
  assert.match(participant, /participant\/sessions/u);
  assert.match(participant, /identityDocument: document/u);
  assert.match(participant, /Entrar na fila/u);
  assert.match(participant, /Sair da fila/u);
  assert.match(participant, /não gera pagamento/u);
  assert.match(participant, /setDocument\(''\)/u);
  assert.match(participant, /item\.position !== null/u);
  assert.equal((participant.match(/<input type="text"/gu) ?? []).length, 2);
  assert.match(css, /cursor: not-allowed/u);
  assert.doesNotMatch(participant, /localStorage|sessionStorage|organizationId|email|registrationData/u);
});

test('os controles da fila seguem a fonte e a altura do painel', () => {
  assert.match(css, /font-family: var\(--font-family-sans\)/u);
  assert.match(css, /min-height: var\(--space-44\)/u);
  assert.match(css, /font-size: var\(--font-size-md\)/u);
  assert.match(css, /:focus-visible/u);
});
