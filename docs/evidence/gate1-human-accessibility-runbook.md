# Gate 1 — validação humana de acessibilidade

Este roteiro complementa a automação. Ele não pode ser substituído por Lighthouse,
axe, inspeção de código ou execução do agente. O resultado oficial fica em
`docs/evidence/gate1-human-accessibility.json` e é validado no CI.

## Pré-condições

1. usar o SHA completo integrado em `develop` e implantado em homologação;
2. confirmar HTTPS e saúde pública antes de iniciar;
3. escolher uma combinação real: NVDA + Windows ou VoiceOver + macOS;
4. usar navegador e tecnologia assistiva com versões registradas;
5. não registrar nome, e-mail, token, conta, conteúdo pessoal ou captura com PII.

## Matriz obrigatória

- `/`
- `/eventos`
- `/login`
- `/cadastro`
- `/termos-de-uso`
- `/privacidade`

Executar em cada rota:

1. navegar somente com teclado, sem aprisionamento;
2. conferir ordem e visibilidade do foco;
3. acionar “Pular para o conteúdo principal” e confirmar o destino;
4. percorrer landmarks e hierarquia de headings pelo leitor de tela;
5. conferir nomes e estados de links, botões, campos e seletores;
6. provocar validações seguras e confirmar anúncio único de status/erro;
7. ampliar para 200% sem perda de conteúdo ou função;
8. conferir reflow equivalente a 320 px sem rolagem horizontal bidimensional.

Não usar dados reais. Login, cadastro e erros devem ser exercitados com valores
sintéticos próprios de homologação.

## Registro

Enquanto nada foi executado, manter `status` como `PENDING`, `attempts` vazio e
os bloqueios explícitos. Uma tentativa executada deve usar `FAILED` até todas as
falhas observadas serem resolvidas e testadas novamente.

Somente usar `PASSED` quando:

- o SHA tiver 40 caracteres e for o mesmo implantado;
- o domínio for `https://homologacao.evolviatecnologia.com/`;
- a tecnologia for `NVDA` ou `VoiceOver`, com versão;
- todas as rotas estiverem presentes;
- todos os checks obrigatórios forem `true`;
- `blockers` estiver vazio.

O campo `testerRole` aceita apenas `product-owner`, `qa` ou
`accessibility-reviewer`. Use `notes` para observações técnicas curtas, sem nome,
e-mail ou outro dado pessoal.

## Validação local

```bash
npm run validate:gate1-human-evidence
node --test scripts/validate-gate1-human-accessibility-evidence.test.mjs
```

O CI valida estrutura e coerência, mas não afirma que a prova humana ocorreu. O
Go/No-Go permanece decisão explícita do Product Owner após CI, homologação pública
e evidência humana no mesmo SHA.
