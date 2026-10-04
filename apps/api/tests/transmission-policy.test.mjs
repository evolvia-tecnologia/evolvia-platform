import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTransmission,
  readTransmission,
  TransmissionPolicyError,
} from '../src/transmission-policy.ts';

test('a transmissão aceita um link https público e recusa o resto', () => {
  const link = normalizeTransmission({
    kind: 'VIDEOCONFERENCE',
    title: 'Sala principal',
    url: 'https://meet.example.com/sala',
  });
  assert.deepEqual(link, {
    kind: 'VIDEOCONFERENCE',
    title: 'Sala principal',
    url: 'https://meet.example.com/sala',
  });
  assert.equal(normalizeTransmission({ enabled: false }), null);
  assert.deepEqual(readTransmission(link), link);
  assert.equal(readTransmission({ kind: 'LIVE', title: '<b>', url: 'https://video.example/a' }), null);
  for (const input of [
    { kind: 'LIVE', title: 'Ao vivo', url: 'http://video.example/a' },
    { kind: 'LIVE', title: 'Ao vivo', url: 'https://user:secret@video.example/a' },
    { kind: 'LIVE', title: 'Ao vivo', url: 'javascript:alert(1)' },
    { kind: 'LIVE', title: 'Ao vivo', url: 'https://localhost/sala' },
    { kind: 'RECORDED', title: 'A', url: 'https://video.example/a' },
    { kind: 'FILE', title: 'Aula', url: 'https://video.example/a' },
  ]) {
    assert.throws(() => normalizeTransmission(input), TransmissionPolicyError);
  }
});
