# Evidência humana de acessibilidade do Gate 1

Este contrato registra, sem simular automação, a sessão humana obrigatória com
NVDA ou VoiceOver. Ele valida completude, cobertura, minimização de dados e
vínculo com o SHA testado. Não autentica a pessoa testadora, não substitui a
execução real e nunca autoriza Go/No-Go.

## Uso

1. Copie o exemplo para um arquivo temporário fora do Git.
2. Execute manualmente todos os checks e rotas, no ambiente e SHA informados.
3. Use apenas um identificador pseudônimo; não registre nome, e-mail, CPF,
   conteúdo digitado, tokens, cookies, cabeçalhos ou HTML.
4. Marque cada check como `PASS`, `FAIL` ou `BLOCKED` e escreva uma observação
   curta, objetiva e sanitizada.
5. Valide e gere um arquivo novo:

```bash
node scripts/validate-gate1-human-accessibility-evidence.mjs \
  --input /tmp/gate1-humano-input.json \
  --output /tmp/gate1-humano-validado.json
```

O validador usa criação exclusiva: nunca sobrescreve evidência anterior. Saída
`HUMAN_EVIDENCE_COMPLETE` significa apenas que a matriz humana está completa e
sem achados registrados. O manifesto mantém `goNoGo: NOT_AUTHORIZED`.

## Cobertura obrigatória

- navegação integral por teclado;
- foco visível e previsível;
- landmarks, headings e ordem de leitura no leitor de tela;
- rótulos, instruções e erros dos formulários públicos;
- zoom/reflow e leitura em 320 px;
- mensagens de validação anunciadas de forma acessível.

## Falha, bloqueio e rollback

Qualquer `FAIL` produz `HUMAN_EVIDENCE_FAILED`; na ausência de falha, qualquer
`BLOCKED` produz `HUMAN_EVIDENCE_BLOCKED`. Ambos retornam código CLI 1. Entrada
inválida retorna código 2. O rollback é o revert dos quatro arquivos deste lote;
não há migration, persistência, rede ou efeito em ambiente.
