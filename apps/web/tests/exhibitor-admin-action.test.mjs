import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshAfterExhibitorAction } from '../lib/exhibitor-admin-action.ts';

test('pedido confirmado continua confirmado quando a consulta posterior falha; retry consulta sem criar outro pedido', async () => {
  const orders = [];
  let queries = 0;
  let available = false;
  let listed = [];
  const create = async () => { orders.push({ id: 'pedido-1', status: 'REQUESTED' }); };
  const refresh = async () => {
    queries++;
    if (!available) throw new Error('Consulta indisponível');
    listed = [...orders];
  };
  assert.equal(await refreshAfterExhibitorAction(create, refresh), false);
  assert.equal(orders.length, 1);
  available = true;
  await refresh();
  assert.equal(orders.length, 1);
  assert.deepEqual(listed, orders);
  assert.equal(queries, 2);
});

test('gravação recusada preserva o erro e não consulta nem confirma dados', async () => {
  const denied = new Error('Cota excedida');
  let queried = false;
  await assert.rejects(refreshAfterExhibitorAction(
    async () => { throw denied; },
    async () => { queried = true; },
  ), error => error === denied);
  assert.equal(queried, false);
});

test('consulta usa os dados após a gravação confirmada', async () => {
  let credentialCompany = 'origem';
  let listedCompany = '';
  assert.equal(await refreshAfterExhibitorAction(
    async () => { credentialCompany = 'destino'; },
    async () => { listedCompany = credentialCompany; },
  ), true);
  assert.equal(listedCompany, 'destino');
});
