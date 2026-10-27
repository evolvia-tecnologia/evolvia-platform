'use client';

import { FormEvent, useState } from 'react';
import PublicationRichTextField from './publication-rich-text-field';
import ScientificEvaHelp from './scientific-eva-help';
import styles from './scientific-submissions.module.css';

const TAGS = ['NOME', 'EVENTO', 'TITULO', 'MODALIDADE', 'VERSAO', 'SITUACAO', 'CODIGO', 'DATA'] as const;
const MAX = 4000;

const DEFAULT_ACCEPTANCE = `**Carta de aceite**

{EVENTO} registra o trabalho **{TITULO}**, de {NOME}.

- Situação: {SITUACAO}
- Modalidade: {MODALIDADE}
- Versão: {VERSAO}
- Código: {CODIGO}

Esta carta confirma a decisão registrada neste evento. Não é certificado e não substitui a credencial.
Pareceres, notas e nomes de avaliadores não entram nesta carta.

Documento gerado em {DATA}.`;

const DEFAULT_REJECTION = `**Carta de recusa**

{EVENTO} registra o trabalho **{TITULO}**, de {NOME}.

- Situação: {SITUACAO}
- Modalidade: {MODALIDADE}
- Versão: {VERSAO}
- Código: {CODIGO}

Esta carta confirma a decisão registrada neste evento. Não é certificado e não substitui a credencial.
Pareceres, notas e nomes de avaliadores não entram nesta carta.

Documento gerado em {DATA}.`;

function storedText(value: string, fallback: string) {
  const text = value.replace(/\r\n/g, '\n');
  if (!text.trim() || text === fallback) return '';
  return text;
}

export default function ScientificDecisionLetters({
  acceptance,
  rejection,
  disabled,
  onSave,
}: {
  acceptance: string | null;
  rejection: string | null;
  disabled: boolean;
  onSave: (patch: { acceptanceLetterBody: string; rejectionLetterBody: string }) => Promise<void>;
}) {
  const [acceptanceBody, setAcceptanceBody] = useState(acceptance?.trim() ? acceptance : DEFAULT_ACCEPTANCE);
  const [rejectionBody, setRejectionBody] = useState(rejection?.trim() ? rejection : DEFAULT_REJECTION);
  const [focus, setFocus] = useState<'acceptance' | 'rejection'>('acceptance');

  function insertTag(tag: (typeof TAGS)[number]) {
    const token = `{${tag}}`;
    const write = (current: string) => {
      const next = current.trim() ? `${current}${current.endsWith(' ') ? '' : ' '}${token}` : token;
      return next.length <= MAX ? next : current;
    };
    if (focus === 'acceptance') setAcceptanceBody(write);
    else setRejectionBody(write);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await onSave({
      acceptanceLetterBody: storedText(acceptanceBody, DEFAULT_ACCEPTANCE),
      rejectionLetterBody: storedText(rejectionBody, DEFAULT_REJECTION),
    });
  }

  return <>
    <h3>Cartas de aceite e recusa</h3>
    <p>O mesmo editor da divulgação formata estes textos. As tags entram no campo em uso e viram os dados do trabalho quando o autor abre a carta. Não há tag de parecer, nota, e-mail ou CPF.</p>
    <form className={styles.letterForm} onSubmit={(event) => void save(event)}>
      <div className={styles.tags} role="group" aria-label="Tags das cartas">
        {TAGS.map((tag) => <button key={tag} type="button" disabled={disabled} onClick={() => insertTag(tag)}>{`{${tag}}`}</button>)}
      </div>
      <PublicationRichTextField
        id="acceptance-letter-body"
        label="Texto da carta de aceite"
        help="Aceito e aceito com alterações usam este texto. {SITUACAO} diferencia os dois. Vazio volta ao padrão."
        value={acceptanceBody}
        onChange={setAcceptanceBody}
        onFocus={() => setFocus('acceptance')}
        maxLength={MAX}
        rows={8}
        disabled={disabled}
      />
      <PublicationRichTextField
        id="rejection-letter-body"
        label="Texto da carta de recusa"
        help="Recusado usa este texto. Vazio volta ao padrão."
        value={rejectionBody}
        onChange={setRejectionBody}
        onFocus={() => setFocus('rejection')}
        maxLength={MAX}
        rows={8}
        disabled={disabled}
      />
      <button className={styles.primary} type="submit" disabled={disabled}>{disabled ? 'Salvando…' : 'Salvar cartas'}</button>
    </form>
    <ScientificEvaHelp
      context="Cartas de aceite e recusa"
      intro="A EVA explica a formatação e as tags. Ela não lê parecer, não cobra e não envia dado para fora da Evolvia."
      questions={[
        { question: 'Quais tags existem?', answer: 'Somente {NOME}, {EVENTO}, {TITULO}, {MODALIDADE}, {VERSAO}, {SITUACAO}, {CODIGO} e {DATA}. Não há tag de CPF, e-mail, nota ou parecer.' },
        { question: 'A carta é um certificado?', answer: 'Não. Ela confirma aceite ou recusa. Certificado e credencial são documentos diferentes.' },
        { question: 'A carta sai da plataforma?', answer: 'Não. O autor lê ou baixa a carta nesta inscrição. A EVA não envia e-mail nem parecer.' },
      ]}
    />
  </>;
}
