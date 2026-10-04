import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExhibitorPolicyError,
  isValidCnpj,
  normalizeExhibitorAccess,
  normalizeExhibitorCompany,
  normalizeExhibitorCredential,
  normalizeExhibitorRepresentative,
  quotaFor,
} from '../src/exhibitor-policy.ts';

const company = {
  kind: 'EXHIBITOR',
  nationality: 'BRAZILIAN',
  document: '11.222.333/0001-81',
  loginEmail: 'Ana@Exemplo.com',
  legalName: 'Empresa Exemplo',
  tradeName: 'Exemplo',
  booth: 'A12',
  areaLabel: '18 m2',
  quotaExhibitor: 4,
  quotaAssembler: 2,
  quotaService: 1,
  contactName: 'Ana Lima',
  contactRole: 'Coordenação',
  contactEmail: 'ana@exemplo.com',
  phone: '11999999999',
};

test('a ficha do expositor guarda CNPJ e e-mail sem senha', () => {
  assert.equal(isValidCnpj('11222333000181'), true);
  const saved = normalizeExhibitorCompany(company);
  assert.equal(saved.document, '11222333000181');
  assert.equal(saved.loginEmail, 'ana@exemplo.com');
  assert.equal(saved.quotaExhibitor, 4);
  assert.throws(() => normalizeExhibitorCompany({ ...company, password: 'segredo' }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorCompany({ ...company, legalName: '<script>' }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorCompany({ ...company, document: '00000000000000' }), ExhibitorPolicyError);
});

test('prestador tem segmento e não recebe cota de expositor', () => {
  const provider = normalizeExhibitorCompany({
    ...company,
    kind: 'PROVIDER',
    segment: 'Montadora de stands',
    quotaExhibitor: 0,
    booth: '',
    areaLabel: '',
  });
  assert.equal(provider.segment, 'Montadora de stands');
  assert.throws(() => normalizeExhibitorCompany({ ...company, kind: 'PROVIDER', segment: 'Limpeza', quotaExhibitor: 2 }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorCompany({ ...company, segment: 'Limpeza' }), ExhibitorPolicyError);
});

test('a credencial respeita a cota e o documento da pessoa', () => {
  assert.equal(quotaFor('ASSEMBLER', { quotaExhibitor: 4, quotaAssembler: 2, quotaService: 0 }), 2);
  const badge = normalizeExhibitorCredential({
    companyId: 'c1234567890',
    kind: 'EXHIBITOR',
    nationality: 'BRAZILIAN',
    document: '529.982.247-25',
    fullName: 'Ana Lima',
    badgeName: 'Ana Lima',
    role: 'Comercial',
    mobile: '11988887777',
  });
  assert.equal(badge.document, '52998224725');
  assert.throws(() => normalizeExhibitorCredential({ ...badge, companyId: badge.companyId, document: '111.111.111-11', password: 'x' }), ExhibitorPolicyError);
});

test('representante entra pelo e-mail e o acesso não explica qual dado falhou', () => {
  const representative = normalizeExhibitorRepresentative({ name: 'Lia Costa', role: 'Financeiro', email: 'Lia@Exemplo.com' });
  assert.equal(representative.email, 'lia@exemplo.com');
  assert.throws(() => normalizeExhibitorRepresentative({ name: 'Lia Costa', role: 'Financeiro', email: 'lia@exemplo.com', password: '123' }), ExhibitorPolicyError);
  assert.equal(normalizeExhibitorAccess({ email: 'Ana@Exemplo.com', document: '11222333000181' }).document, '11222333000181');
  assert.throws(() => normalizeExhibitorAccess({ email: 'ana@exemplo.com', document: '1', password: 'x' }), /Não foi possível abrir a área do expositor/u);
});

test('pedido, produto e download recusam senha, quantidade zero e link local', async () => {
  const { normalizeExhibitorDownload, normalizeExhibitorForm, normalizeExhibitorOrder, normalizeExhibitorProduct } = await import('../src/exhibitor-policy.ts');
  assert.equal(normalizeExhibitorOrder({ productId: 'p1234567890', quantity: 2 }).quantity, 2);
  assert.throws(() => normalizeExhibitorOrder({ productId: 'p1234567890', quantity: 0 }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorProduct({ formId: 'f1234567890', title: 'Ponto', unit: 'un', priceCents: 1500, password: 'x' }), ExhibitorPolicyError);
  const form = normalizeExhibitorForm({
    sortOrder: 1,
    title: 'Credencial de expositor',
    active: true,
    required: true,
    deadline: '2026-08-10',
    audience: 'EXHIBITOR',
    kind: 'CREDENTIAL',
    credentialKind: 'EXHIBITOR',
    pdfUrl: 'https://arquivos.exemplo.com/ficha.pdf',
    wordUrl: '',
  });
  assert.equal(form.required, true);
  assert.equal(form.deadline, '2026-08-10');
  assert.throws(() => normalizeExhibitorForm({ ...form, id: null, audience: 'PROVIDER', kind: 'DOCUMENT', credentialKind: 'SERVICE', pdfUrl: '', wordUrl: '' }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorForm({ ...form, id: null, pdfUrl: 'https://localhost/ficha.pdf' }), ExhibitorPolicyError);
  assert.equal(normalizeExhibitorDownload({ title: 'Manual', url: 'https://arquivos.exemplo.com/manual.pdf' }).url.startsWith('https://'), true);
  assert.throws(() => normalizeExhibitorDownload({ title: 'Manual', url: 'https://localhost/manual.pdf' }), ExhibitorPolicyError);
  assert.throws(() => normalizeExhibitorDownload({ title: 'Manual', url: 'http://arquivos.exemplo.com/manual.pdf' }), ExhibitorPolicyError);
});


test('arquivos recusam IPs e o prazo termina no fim do dia de Brasília', async () => {
  const { normalizeExhibitorDownload, exhibitorDeadlineClosed } = await import('../src/exhibitor-policy.ts');
  for (const host of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '172.16.0.1', '169.254.169.254', '[::1]', '[2001:db8::1]', '0x7f000001']) {
    assert.throws(() => normalizeExhibitorDownload({ title: 'Arquivo', url: `https://${host}/arquivo.pdf` }), ExhibitorPolicyError);
  }
  const deadline = new Date('2026-10-04T00:00:00Z');
  assert.equal(exhibitorDeadlineClosed(deadline, new Date('2026-10-05T02:59:59Z')), false);
  assert.equal(exhibitorDeadlineClosed(deadline, new Date('2026-10-05T03:00:00Z')), true);
});
