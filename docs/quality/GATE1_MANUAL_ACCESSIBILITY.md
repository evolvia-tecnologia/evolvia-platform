# Gate 1 — homologação manual de acessibilidade

Este documento ensina como **uma pessoa** registra evidência de teclado, foco,
leitor de tela, zoom, contraste forçado e entendimento das mensagens nas rotas
públicas. A automação **não substitui** essa homologação.

A ferramenta local apenas valida o JSON que a pessoa forneceu. Ela:

- nunca fabrica resultado;
- nunca marca item como aprovado por ausência;
- nunca executa deploy;
- nunca declara Go/No-Go.

O arquivo
`docs/quality/examples/gate1-manual-accessibility.example.json` é **fictício**.
Serve só para mostrar o formato. Não é homologação e a validação o recusa.

## O que a automação já cobre — e o que não cobre

As provas mecânicas de runtime e de árvore acessível checam HTTP, landmarks,
nomes, alvos e foco visível no Chromium. Elas **não** comprovam:

- ordem e entendimento reais com teclado;
- anúncio e compreensão com NVDA ou VoiceOver;
- zoom 200% e reflow percebidos por uma pessoa;
- alto contraste / cores forçadas no sistema do revisor;
- se as mensagens de erro, vazio e sucesso são compreensíveis.

Enquanto a matriz humana não estiver completa, sem `FAIL` e sem `BLOCKED`, o
Gate 1 permanece sem autorização de Go.

## Rotas e cenários obrigatórios

Registre **exatamente** estas rotas, inclusive o molde `/evento/[slug]`. Não
escreva slug real, nome de evento, pessoa, e-mail, token ou cookie.

| Rota | Superfície |
| --- | --- |
| `/` | Home pública |
| `/login` | Entrar |
| `/cadastro` | Criar conta |
| `/eventos` | Catálogo |
| `/evento/[slug]` | Perfil público (use o molde, não o slug real) |
| `/termos-de-uso` | Termos |
| `/privacidade` | Privacidade |

| Cenário | O que provar |
| --- | --- |
| `teclado-foco` | Tab/Shift+Tab, skip link, foco visível, sem armadilha, Enter/Espaço nos controles |
| `leitor-de-tela` | NVDA ou VoiceOver: headings, landmarks, nomes, estados e mensagens anunciadas |
| `zoom-reflow` | Zoom 200% (e viewport estreito se couber): sem corte útil, sem scroll horizontal de página |
| `contraste-forcado` | Alto contraste do SO ou `forced-colors`: texto, foco, bordas e controles distinguíveis |
| `mensagens` | Erro, vazio, sucesso e aviso são compreensíveis e associados ao campo ou à região |

São 7 rotas × 5 cenários = **35 itens**. Falta de item é erro, não `PASS`.

## Contrato versionado

`schemaVersion` atual: `1` (`gate1-manual-accessibility/v1`).

Campos de topo:

| Campo | Regra |
| --- | --- |
| `kind` | `gate1-manual-accessibility-evidence` na evidência real; o exemplo usa outro `kind` |
| `sourceSha` | SHA completo de 40 hexadecimais do código inspecionado |
| `recordedAt` | Data e hora UTC, ISO-8601 (`2026-09-03T12:00:00Z`) |
| `executorRole` | Papel (`revisor-humano` ou `homologador-acessibilidade`). Nunca nome, e-mail ou pessoa |
| `platform.os` | Sistema usado na prova |
| `platform.browser.name` / `version` | Navegador e versão |
| `platform.assistiveTechnology.name` / `version` | NVDA, VoiceOver ou a tecnologia de fato usada, com versão |
| `entries[]` | Um objeto por par rota + cenário |

Cada entrada:

| Campo | Regra |
| --- | --- |
| `route` | Uma das rotas da tabela |
| `scenario` | Um dos cenários da tabela |
| `result` | `PASS`, `FAIL` ou `BLOCKED` |
| `observation` | Texto curto e sanitizado (até 280 caracteres) |
| `blockedCause` | Obrigatório se `BLOCKED` |
| `nextAction` | Obrigatório se `BLOCKED` |

`PASS` sem papel executor ou sem data/hora é recusado. Qualquer `FAIL` ou
`BLOCKED` impede declarar Go. A ferramenta não emite a declaração no lugar de
uma pessoa.

Não acrescente chaves extras (`email`, `nome`, `token`, slug real, capturas com
dado pessoal). Conteúdo com e-mail, token, cookie ou segredo é recusado.

## Como executar a prova (sem afirmar aprovação)

Use o SHA que está sendo homologado. Anote plataforma, navegador e tecnologia
assistiva **antes** de navegar. Não grave a sessão com dado real de evento.

### Teclado e foco

1. Comece no endereço da rota, sem mouse.
2. Tab até o skip link; ative-o e confirme que o foco vai ao conteúdo principal.
3. Percorra a ordem: marca, navegação, ações, conteúdo, rodapé.
4. Confirme contorno de foco visível em cada controle alcançado.
5. Enter/Espaço ativam botões e links; Escape fecha o que a própria página
   abriu, se houver.
6. Não deve haver armadilha de foco nem controle só acionável com o ponteiro.

`PASS` só se a pessoa percorreu a rota e considerou o cenário atendido.

### NVDA (Windows)

1. Instale e abra o NVDA. Confira a versão em Ajuda → Sobre.
2. Navegador Firefox ou Chrome em janela maximizada.
3. `Insert+N` abre o menu do NVDA; use modo navegação e modo foco conforme o
   controle.
4. `H` / `Shift+H` percorrem headings; a página deve ter um `h1` e ordem
   compreensível.
5. `D` percorre landmarks; deve haver região principal e navegação nomeada.
6. `K` percorre links; `B` botões; `F` campos. Cada controle precisa de nome
   falado.
7. Dispare um estado de erro (login/cadastro com campo vazio ou inválido, sem
   usar dado real) e confirme que o NVDA anuncia a mensagem.
8. Se o NVDA não estiver disponível, o cenário `leitor-de-tela` é `BLOCKED`,
   com causa e próxima ação — não `PASS`.

Este roteiro **não** significa que a rota passou.

### VoiceOver (macOS)

1. `Cmd+F5` liga o VoiceOver. Confira a versão nas configurações de Acessibilidade.
2. Use Safari ou o navegador da prova.
3. `Ctrl+Option+U` abre o rotor; confira Headings, Landmarks e Form Controls.
4. `Ctrl+Option+A` lê a partir do ponto; `Ctrl+Option+→` avança.
5. Confirme skip link, `h1`, navegação nomeada e nomes dos controles.
6. Nos formulários, entre no controle (`Ctrl+Option+Shift+↓`) e verifique o
   rótulo e a mensagem de erro.
7. Se o VoiceOver não puder ser usado, registre `BLOCKED` com causa e próxima
   ação.

Este roteiro **não** significa que a rota passou.

### Zoom 200% e reflow

1. No navegador, zoom 200% (e, se possível, largura próxima de 320 CSS px).
2. Confirme que o conteúdo reflowe: sem corte de texto útil, sem sobreposição
   que impeça leitura, sem barra horizontal da página.
3. Ações continuam acionáveis por teclado.

### Contraste forçado / alto contraste

1. Ative o alto contraste do sistema ou o modo de cores forçadas do navegador.
2. Texto, foco, bordas de campo e botões precisam permanecer distinguíveis.
3. Não use captura com dado pessoal para “provar” o contraste.

### Mensagens

1. Percorra estados vazios, de erro e de sucesso aplicáveis à rota.
2. A mensagem precisa ser compreensível em português, sem jargão interno, e
   associada ao campo ou à região.
3. No leitor de tela, a mesma mensagem precisa ser anunciada.
4. Não copie texto real de evento, e-mail de usuário nem token de sessão.

## Como registrar e validar

1. Copie só a **forma** do exemplo. Troque `kind` para
   `gate1-manual-accessibility-evidence`.
2. Preencha `sourceSha`, `recordedAt`, papel, plataforma e as 35 entradas com
   o que a pessoa de fato observou.
3. Não reaproveite os `PASS` fictícios do exemplo.
4. Valide localmente:

```bash
node scripts/validate-public-accessibility-manual-evidence.mjs caminho/para/evidencia.json
```

Códigos de saída:

| Código | Significado |
| ---: | --- |
| 0 | Matriz completa, só `PASS`, evidência real. **Não** é declaração de Go. |
| 1 | Evidência inválida, incompleta, sensível ou arquivo de exemplo. |
| 2 | Evidência bem formada, porém há `FAIL` ou `BLOCKED` — Go bloqueado. |

Testes do contrato:

```bash
node --test scripts/validate-public-accessibility-manual-evidence.test.mjs
```

## Limites e risco residual

- A ferramenta não abre o navegador e não confirma que a pessoa executou o
  roteiro; ela só recusa JSON incompleto, duplicado, inventado por ausência ou
  com dado sensível.
- Um `PASS` mentiroso ainda passa na validação estrutural. A declaração de Go
  continua humana e fora deste contrato.
- NVDA e VoiceOver não são intercambiáveis: uma evidência com um único leitor
  não prova o outro sistema.
- Este lote não altera CSS, componentes, workflow, API, schema, CI nem
  `PROJECT_STATE.md`.

## Rollback

Remover os quatro arquivos deste lote (`scripts/validate-public-accessibility-manual-evidence.mjs`,
`scripts/validate-public-accessibility-manual-evidence.test.mjs`,
`docs/quality/GATE1_MANUAL_ACCESSIBILITY.md` e
`docs/quality/examples/gate1-manual-accessibility.example.json`) ou reverter o
commit da branch. Não há migration, deploy nem mudança de runtime.
