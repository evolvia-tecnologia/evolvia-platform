# Dashboard de homologação por Gate (CL-07)

**Autoria:** Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
**Fonte:** `docs/governance/GATES_STATUS.json`, `schemaVersion 1`.
**Snapshot:** `auditedAtUtc 2026-10-27T13:11:00Z`, contra `sourceSha d0493a74`.
**Nada aqui altera percentual.**

---

## O número que importa não é 85/93

O snapshot carrega **cinco** medidas diferentes do mesmo projeto. Elas divergem
muito, e tratar uma pela outra é o erro mais fácil de cometer aqui:

| Medida | Valor | O que significa |
|---|---|---|
| `integratedCriteria / criteriaCount` | **85/93 = 91,4%** | código **integrado** |
| `globalImplementationPercent` | **92,92%** | implementação ponderada |
| `globalPercent` | **69,97%** | conclusão ponderada, com CI/deploy/aceite |
| critérios com `accepted: true` | **1/93 = 1,1%** | **aceite funcional humano** |
| `gateStatus` | **0/11 encerrados** | nenhum gate fechado |

O único critério com aceite é **`G1.7` — Vitrine e catálogo de publicados**.
E `publicAcceptance` registra **1 de 4 (25%)**.

> **85/93 é quanto código entrou. 1/93 é quanto alguém confirmou que funciona.**
> A distância entre os dois é a homologação — que é justamente o trabalho que
> ainda não foi feito. Ler "85/93" como conclusão do projeto confunde
> integração com aceite.

---

## Por Gate

`I` integrado · `CI` verde · `D` implantado · `A` **aceito por pessoa**

| Gate | Nome | Crit. | I | CI | D | A | Situação |
|---|---|---|---|---|---|---|---|
| 1 | Divulgação do evento | 8 | 8 | 8 | 8 | **1** | aberto |
| 2 | Inscrição | 14 | 10 | 10 | 10 | **0** | aberto |
| 3 | Área reservada do inscrito | 8 | 8 | 8 | 8 | **0** | aberto |
| 4 | Configuração científica | 8 | 8 | 8 | 8 | **0** | aberto |
| 5 | Submissão pelo autor | 8 | 7 | 7 | 7 | **0** | aberto |
| 6 | Avaliação científica | 8 | 7 | 7 | 7 | **0** | aberto |
| 7 | Decisão científica | 6 | 5 | 5 | 5 | **0** | aberto |
| 8 | Arquivo final, pôster e ePoster | 6 | 6 | 6 | 6 | **0** | aberto |
| 9 | Programação científica | 8 | 8 | 8 | 8 | **0** | aberto |
| 10 | Operação do evento | 13 | 12 | 12 | 12 | **0** | aberto |
| 11 | Pós-evento | 6 | 6 | 6 | 6 | **0** | aberto |
| | **TOTAL** | **93** | **85** | **85** | **85** | **1** | **0/11** |

I, CI e D são idênticos em todos os gates: o que entrou, passou no CI e foi
implantado. **A coluna que não se move é a do aceite.**

---

## Os oito critérios não integrados

| Critério | Descrição | Estado | Próximo passo declarado |
|---|---|---|---|
| `G2.10` | Compra com várias entradas e ficha por comprador | Pendente | Implementar sem duplicar identidade |
| `G2.11` | Regra de reembolso visível e fluxo correspondente | Pendente | Implementar política e compensação explícita |
| `G2.13` | E-mail transacional com confirmação/credencial | Pendente | Provar entrega, repetição/falha e privacidade |
| `G2.14` | Emissão fiscal NFS-e | Pendente | Adaptador e homologação fiscal próprios |
| `G5.8` | Aviso ao autor após submissão/correção | Pendente | Provar entrega e idempotência |
| `G6.8` | Avisos, distribuição assistida e operação em lote | Pendente | Comunicação real com canal autorizado |
| `G7.4` | Carta de aceite e comunicação ao autor | **Parcial** | Documento e entrega real |
| `G10.10` | Atribuição granular do operador por evento/função | **Bloqueado** | Reconciliar com posto integrado; não recriar |

**`G2.10` é o que o PR #471 implementa** — e é onde estão meus dois achados em
aberto. Está no caminho crítico.

Quatro dos oito (`G2.13`, `G5.8`, `G6.8`, `G7.4`) dependem de **entrega real de
e-mail**, que nenhum teste meu cobre e nenhum deve fingir cobrir.

---

## Meus achados confirmados, por Gate

| Gate | Achado | Severidade | Dono | Onde está |
|---|---|---|---|---|
| G1, G2 | `--color-border` em **1,12:1** (mínimo 3:1, WCAG 1.4.11) | alta | CSS / Gemini | #630, `docs/qa/contraste-tokens.md` |
| G1, G2 | `--color-text-muted` em **4,42:1** sobre violet-soft | média | CSS / Gemini | #630 |
| G2 | `fileName` dos termos aceita **75** caracteres, não 120 | média | decisão de produto | #630, `consentimento-pdf.spec.ts` |
| G2 (`G2.10`) | `billingSnapshot` gravado duas vezes (pedido + reserva) | média | Codex, #471 | revisão do #471 |
| G2 (`G2.10`) | `expireStaleReservations` nunca expira o **pedido** | alta | Codex, #471 | revisão do #471 |
| G5 | título aceita **1000** caracteres; requisito diz 180 | média | decisão de produto | #630, `cientifico-limites.spec.ts` |
| G5 | submissão **sem nenhuma** palavra-chave é aceita | média | decisão de produto | #630 |
| G5 | teto rígido de **19** coautores; requisito diz 10 | baixa | decisão de produto | #630 |
| G7 | `ACCEPTED_WITH_CHANGES` é **terminal**: correção inalcançável | alta | Codex | #630 |
| G10 | Transmissão sem guarda por formato, em **quatro** camadas | alta | Codex, #627 | #630, `perfis-navegacao.spec.ts` |
| G10 | #614 descarta configuração legada de outras categorias (B4) | média | Codex, #614 | revisão do #614 |

Três são **decisão de produto**, não defeito: o requisito escrito e o código
divergem e alguém precisa dizer qual vale. Não alterei nenhum dos dois lados.

---

## Cobertura E2E: o que roda hoje e o que não

**Roda agora, sem ambiente, sem navegador de homologação e sem registro npm:**

```bash
bash tools/preparar-runner-offline.sh
cd tests/e2e
EVOLVIA_E2E_MODO=inventario npx playwright test \
  --grep "@contrato|@contraste|@cientifico|@consentimento"
```

| Conjunto | Gates | PASS | FAIL |
|---|---|---|---|
| `@contrato` — navegação por perfil | G10 | 7 | 1 |
| `@contraste` — tokens WCAG | G1, G2 | 3 | 2 |
| `@cientifico` — fronteiras de submissão | G5, G7 | 7 | 4 |
| `@consentimento` — PDF de termos | G2 | 7 | 1 |
| **total** | | **24** | **8** |

As oito falhas são **evidência de defeito ou de divergência de requisito**, não
defeito de teste. Cada mensagem diz isso e pede para não consertar afrouxando
a asserção.

**Exige ambiente autorizado, e portanto não foi executado:**

| Jornada | Gates | PR |
|---|---|---|
| Criar evento, Fundação, datas, PDF de termos, categoria/lote, cupom | G1, G2 | #629 |
| Compra múltipla, concorrência, idempotência | G2 (`G2.10`) | #625 |
| Editor de etiquetas, persistência, prévia | G10 | #625 |
| Varredura axe (~90 regras) | todos | #625 |
| Reflow 320/390 e alvo de toque em tela real | todos | #625 |
| Congresso científico ponta a ponta | G4–G9 | não escrito |
| Autorização, tenant e persistência do aceite | G2, G3 | não escrito |

**Nunca será coberto por teste automatizado:** impressão térmica real na Zebra
TLP 2844 e legibilidade do QR impresso. Roteiro pronto, **nunca executado**.
Nenhum resultado físico foi declarado.

---

## Duas coisas que o snapshot revela

### 1. Houve ambiente alcançável — e o gate público falhou no Nginx

```json
"lastConfirmedDeployment": {
  "sourceSha": "d0493a74...", "httpsStatus": 200,
  "commitAtUtc": "2026-10-27T09:34:54Z",
  "publicGatePassed": false,
  "note": "Implantação/prontidão comprovadas antes da falha Nginx/alias TLS. Sem Go de produção."
}
```

E `technicalValidation.publicGate`: *"failure after successful deployment/readiness: Nginx version and dev alias TLS/redirect"*.

**Isto reclassifica o meu bloqueio B2.** Eu o registrei como "não há ambiente
de homologação". O correto é: **existiu ambiente alcançável, com HTTP 200 e
prontidão comprovada; eu não recebi URL nem credenciais.** São problemas
diferentes, e o segundo se resolve com um *secret*.

Separado disso, o gate público está reprovado por **infraestrutura**, não por
produto — versão do Nginx e TLS/redirect do alias de desenvolvimento. Nenhum
gate encerra enquanto isso não for resolvido, por mais código que entre.

### 2. O snapshot está defasado

Auditado em **27/10** contra `d0493a74`. Hoje é **02/11**: seis dias e
**98 pull requests abertos** (`openPullRequests`), 49 reconciliados. O número
de referência da governança descreve uma árvore que não é mais o `develop`.

Qualquer conversa sobre percentual deveria começar por reauditar o snapshot.

---

## Base de testes existente

`technicalValidation` registra **919** testes de API, **656** de web e **89**
de Postgres, com `arm64Passed`, `migrationPassed` e `apiTypecheck` verdes, e
uma revisão do Gemini (`geminiReview 5664728098`).

Não conferi nenhum desses números: **403 em check-runs, commit status e
Actions**. Estão reproduzidos como o snapshot os declara, não como verificados
por mim.

---

## O que encerra gate

Na ordem em que destrava:

1. **Infraestrutura** — Nginx e TLS/redirect do alias. Sem isso, zero gates
   encerram, independentemente de código.
2. **URL e credenciais de homologação** para mim, como *secrets*, mais o SHA
   implantado. Destrava a execução de #625 e #629, e as CL-03/05/07 restantes.
3. **Aceite funcional humano**, critério por critério. É a coluna travada em
   **1/93**, e é a única que fecha gate. Nenhuma automação substitui isso.
4. **Revisão independente** de #625, #629 e #630. Não posso aprovar nenhum: o
   conector autentica como Mittetec, autora dos PRs.
5. **Decisão de produto** nas três divergências de requisito (título 180×1000,
   palavras-chave 3–5×0–20, `fileName` 120×75).

**Reauditar o snapshot antes de citar percentual.** O atual descreve `d0493a74`,
de 27/10.
