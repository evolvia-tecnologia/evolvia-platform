import assert from 'node:assert/strict';
import test from 'node:test';
import { LegalProfileError, normalizeLegalProfile } from '../src/organization-legal-policy.ts';

const profile = {
  kind: 'COMPANY', legalName: ' Empresa Exemplo Ltda ', tradeName: 'Exemplo',
  taxId: '11.222.333/0001-81', contactEmail: 'FISCAL@EXEMPLO.COM',
  postalCode: '01001-000', street: 'Praça da Sé', number: '1',
  district: 'Sé', city: 'São Paulo', state: 'sp',
};

test('normaliza CNPJ numérico e alfanumérico e não altera o documento por remoção ampla', () => {
  const result = normalizeLegalProfile(profile);
  assert.equal(result.taxId, '11222333000181');
  assert.equal(result.contactEmail, 'fiscal@exemplo.com');
  assert.equal(result.state, 'SP');
  assert.equal(normalizeLegalProfile({ ...profile, taxId: '00.000.000/E08G-12' }).taxId, '00000000E08G12');
  for (const taxId of ['11.222.333/0001-82', '11.222.333/0001-81<script>', '00000000E08G1Z']) {
    assert.throws(() => normalizeLegalProfile({ ...profile, taxId }), LegalProfileError);
  }
});

test('CPF tem dígitos verificadores e perfis PF/PJ não se misturam', () => {
  const person = { ...profile, kind: 'PERSON', taxId: '529.982.247-25', tradeName: undefined };
  assert.equal(normalizeLegalProfile(person).taxId, '52998224725');
  assert.throws(() => normalizeLegalProfile({ ...person, taxId: '529.982.247-26' }), LegalProfileError);
  assert.throws(() => normalizeLegalProfile({ ...person, taxId: profile.taxId }), LegalProfileError);
});

test('campos de endereço e contato rejeitam valores malformados', () => {
  for (const patch of [{ postalCode: '00000' }, { state: 'SP1' }, { street: '<script>' }, { number: '1;DROP' }]) {
    assert.throws(() => normalizeLegalProfile({ ...profile, ...patch }), LegalProfileError);
  }
});
