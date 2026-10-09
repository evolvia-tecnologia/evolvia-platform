---
snapshot_at_utc: 2026-10-08T22:21:35Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_snapshot: 3c97223ee389eaff0a6a9934f1cc55ea9b2f8dc2
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Operação de inscrição e aceitação pública em homologação"
---

# Estado oficial do projeto

## Reconciliação vigente — 08/10/2026

Implementação **77,2%**; conclusão comprovada **58,2%**; **72/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte técnica/implantada `3c97223ee389eaff0a6a9934f1cc55ea9b2f8dc2`. [CI do SHA auditado](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37837951585): qualidade/tipos/segurança/build, PostgreSQL/migrations, fluxo funcional, hidratação isolada, acessibilidade pública e ARM64 API/Web aprovados após nova execução dos jobs afetados. Job 113550694949: aplicação publicada com rollback disponível; o gate público permaneceu vermelho exclusivamente pela versão Nginx exposta e pelo hostname mismatch do alias dev. Aceite público histórico **1/4**; nenhum novo F atribuído.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 62,5% | 46,9% | 15/32 |
| 6 | Avaliação científica | 75,0% | 56,3% | 18/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 87,5% | 65,6% | 21/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 16,7% | 12,5% | 3/24 |

Central administrativa do expositor integrada (#490) e refinada por #520/#527; acesso externo da empresa/prestador permanece bloqueado no #408. G10.13 fica parcial. Fila G2.9 integrada (#468); aviso por e-mail não incluído, reentrada limitada pela reserva histórica. G5.6 segue parcial: compensação da API #467 integrada, interface PDF no draft #497. #494/#498 (acessibilidade), #491 (reembolso), #471 (compra múltipla), #470 (clone), #480 (kits) e #368 (ACL) não pontuam enquanto não integrados. Asaas sandbox, entrega real de e-mail, WCAG humana e hardware continuam pendentes. Certificados e relatórios mantêm lacunas registradas. `main` e produção sem promoção.

## Entregas posteriores ao snapshot de 07/10

| PR | Entrega integrada | Efeito na matriz |
| --- | --- | --- |
| #458 | Trabalhos e programação em fluxos próprios | Refinamento da navegação; sem unidade nova |
| #459 | CPF/passaporte no autoatendimento, com códigos preservados | Evidência adicional G10.5 |
| #461 | Tipos canônicos na EVA | Evidência adicional G1.8 |
| #467 | Compensação do PDF inicial após falha | G5.6 parcial; falta UI integrada |
| #468 | Fila por lote, oferta, aceite, expiração e concorrência | G2.9 I/T/D; F pendente |
| #478 | Defaults de corrida no Wizard | Evidência adicional G1.1 |
| #475 | Validação por etapa e persistência antes de navegar | Evidência adicional G1.1 |
| #481/#495 | Correções de hidratação do catálogo | G1.7 mantém F histórico |
| #490 | Central administrativa segura do expositor | G10.13 parcial; falta acesso externo |
| #520 | Bloco próprio, consulta organizada e menu lateral recolhível | Refinamento de G10.13; sem unidade nova |
| #527 | Navegação progressiva, teclado e estado vazio da central | Refinamento de G10.13; sem unidade nova |


## Snapshot histórico — 07/10/2026 UTC

Implementação **76,5%**; conclusão comprovada **57,7%**; **71/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte técnica/implantada `73b10c612fb9036257807c463659141de231d22a`. Integração #457 (origens #445/#446/#447/#448/#449/#450/#452/#453/#456), após #455. [CI de integração](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37550956015): API 581/581, Web 396/396, ARM64 e migration/integração aprovados. [CI da fonte implantada](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37551815326): aplicação pronta, No-Go externo por Nginx/TLS. Aceite público 1/4 histórico; nenhum novo F funcional atribuído.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 57,1% | 42,9% | 24/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 62,5% | 46,9% | 15/32 |
| 6 | Avaliação científica | 75,0% | 56,3% | 18/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 87,5% | 65,6% | 21/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 16,7% | 12,5% | 3/24 |

Certificado cobre participação com presença; atividade/trabalho/papéis, lote/verso e PDF gerado ainda parciais. Cartas de aceite/recusa na área do autor não provam entrega de e-mail. Asaas sandbox, WCAG humana, impressão/câmera/catraca e carga continuam pendentes. #408 bloqueado por identidade; #368 por reconciliação de ACL. 65 PRs históricos permanecem separados; não são código entregue por constarem na fila. `main` e produção sem promoção.

Os blocos seguintes são snapshots históricos; o controle atual está em [GATES_STATUS.md](GATES_STATUS.md) e [GATES_STATUS.json](GATES_STATUS.json).

## Snapshot histórico — reconciliação de 04/10/2026



Fonte técnica e de deploy: `b36829b29d5e543b3c0c7c936e9ab4a8ab52bd9a`. Conclusão comprovada **39,0%**; implementação **51,6%**; 0/11 Gates formalmente encerrados. O novo denominador v1 reúne 93 unidades funcionais e quatro marcos I/T/D/F por unidade. A fórmula e todas as evidências estão em [GATES_STATUS.md](GATES_STATUS.md), com dados em [GATES_STATUS.json](GATES_STATUS.json).

| Gate | Escopo | Implementação | Conclusão comprovada | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | **78,1%** | 25/32 |
| 2 | Inscrição | 57,1% | **42,9%** | 24/56 |
| 3 | Área reservada do inscrito | 75,0% | **56,3%** | 18/32 |
| 4 | Configuração científica | 87,5% | **65,6%** | 21/32 |
| 5 | Submissão pelo autor | 50,0% | **37,5%** | 12/32 |
| 6 | Avaliação científica | 50,0% | **37,5%** | 12/32 |
| 7 | Decisão científica | 0,0% | **0,0%** | 0/24 |
| 8 | Arquivo final, pôster e ePoster | 16,7% | **12,5%** | 3/24 |
| 9 | Programação científica | 62,5% | **46,9%** | 15/32 |
| 10 | Operação do evento | 69,2% | **51,9%** | 27/52 |
| 11 | Pós-evento | 0,0% | **0,0%** | 0/24 |

Run integrado 37224064537: API 435/435, Web 260/260, migrations/smokes e ARM64 aprovados. Deploy funcional de `b36829b` concluído às 18:29 UTC; bloqueio externo por versão Nginx e alias/TLS permanece. Critério público mantém 1/4 = 25%; ensaios privados/hardware/WCAG humana pendentes. #405/#406/#407 integrados; #408 e #409 não pontuados. Percentuais anteriores não aferidos/estimados são preservados abaixo como snapshots históricos, substituídos por esta baseline para o controle atual.

## Snapshot anterior — 04/10/2026 18:06 UTC

## Atualização verificável — 04/10/2026

Base desta consolidação: `86ed34a66bc9408672a80a5236d6b473c4f285c0`.
O Product Owner autorizou revisão, merge em `develop` e publicação de homologação
dos avanços do Cursor/Gemini. `main` e produção continuam sem promoção.

### Integração da leva original

Os PRs #392 e #395–#404 estão integrados: **11 de 11 (100%)**.
Este percentual mede somente integração dessa leva, não os Gates globais.

| PR | Resultado integrado | CI aprovado antes do merge |
| --- | --- | --- |
| #392 | Painel único, etapa atual, isolamento ao mudar evento e moldura do operador | 1112 |
| #395 | Posto, totem, etiquetas e baixa operacional | 1134 |
| #396 | Termo PDF e comprovante de categoria, revisão por checksum e proteção de concorrência | 1190 |
| #397 | API, webhooks com DNS validado e fixado, presença em sites | 1172 |
| #398 | Correções do organizador, busca sensível por POST e benefícios | 1185 |
| #399 | Painel global de acessibilidade e contenção de foco | 1120 |
| #400 | Acessos de equipe e catracas, relatório e chaves com validade | 1179 |
| #401 | Filtros de presença e ações nas inscrições | 1148 |
| #402 | Ações públicas por perfil, trajeto e telefone | 1125 |
| #403 | Vitrine pública, catálogo, áreas e ajuda | 1142 |
| #404 | Proteção de acesso, rate limit e validação de sessão/JWT | 1139 |

Novos PRs: #405 consolida a direção operacional; #406 foi integrado em `86ed34a` após CI 1202 completo, reunindo configuração
científica e correções de identidade/nota/prazo; #407 foi integrado em
`9d9e213` após CI 1198 completo, com transmissão e complemento do credenciamento.
#408 permanece em rascunho por autenticação sem prova de posse do e-mail;
as correções de agregação, CSV, estado entre eventos e pedido concorrente já estão
na branch. Comentário do Gemini não equivale a aprovação.

### PRs antigos e concorrentes

- #394: comportamento de timing do login já integrado no #404; testes de serviço
  podem ser reaproveitados, sem substituir o AuthService atual pelo HEAD antigo.
- #85: snapshot documental de agosto; a consolidação do #405 preserva esse
  histórico e registra os avanços de outubro. Não integrar o snapshot antigo
  por cima do estado corrente.
- #368: evolução de permissões/atribuição do operador continua separada;
  posto/totem integrados não provam que toda a ACL granular foi concluída.
- Demais PRs antigos exigem comparação com o HEAD vivo, revisão e CI atual;
  CI antigo verde isoladamente não os torna elegíveis.

### Homologação e Gates

No deploy de `1fae7fa` (run 37219428971), migrations e containers foram iniciados,
API/PostgreSQL passaram no readiness público, e o domínio principal respondeu por
HTTPS. A publicação terminou vermelha por exposição de
`Server: nginx/1.24.0 (Ubuntu)` e por certificado/redirecionamento incorretos no
alias `dev`. Novos merges disparam novos deploys; um merge não comprova a
conclusão da publicação.

O ensaio no navegador confirmou a vitrine, abertura/fechamento do painel de
acessibilidade, catálogo e URL curta do evento de teste da feira. Ainda faltam
ensaio autenticado, leitor de tela, impressão física/leitor e aceite humano.
O ensaio público parcial não encerra WCAG nem comprova fluxos operacionais privados.

- Recorte central de inscrição já integrado: 5/5 (100% de implementação daquele recorte).
- Aceitação pública de homologação: 1/4 (25%) no denominador previamente definido;
  Nginx, alias e evidência humana continuam pendentes.
- Gates funcionais 1–11: percentual global **não apurado**. Reconciliar critérios
  e evidências da issue #114 antes de informar um total.

A chave SSH do CI executa somente `deploy <SHA>`; o wrapper não aplica a
configuração Nginx versionada. Ajuste administrativo necessário no host de
homologação, preservando o certificado existente e validando/recarregando Nginx:

```bash
sudo env CERTBOT_SKIP_DRY_RUN=1 bash /opt/evolvia/staging/current/infra/certbot/bootstrap-staging-tls.sh
```

Procedimento e rollback: [operação SSL de homologação](../operacao-ssl-homologacao.md).
Não contornar a chave restrita, desabilitar checks ou declarar produção liberada.

## Snapshot histórico — 26/09/2026

## Resumo executivo

O Modo Lançamento entrega fatias verticais utilizáveis com tela, API, banco,
testes e homologação. As cinco fatias centrais de inscrição estão integradas em
`develop`: categorias/lotes, benefícios, reserva pública, checkout Asaas e área
reservada do participante. Isso mede o escopo **de implementação desse recorte**,
não a conclusão de todo o Evolvia nem a autorização de produção.

A homologação do SHA `1d7049d` recebeu Web, API e PostgreSQL; readiness
público, HTTPS e redirecionamento do domínio principal passaram no CI #977.
O Gate público ficou vermelho porque `Server: nginx/1.24.0 (Ubuntu)` expõe a
versão do proxy. O alias `dev.evolviatecnologia.com` também apresenta certificado
sem esse hostname e não redireciona corretamente. A evidência humana de teclado,
foco e NVDA/VoiceOver ainda não foi registrada. `main` e produção permanecem
sem promoção.

## Percentuais verificáveis do Modo Lançamento

| Medida | Resultado | Critério e evidência |
| --- | ---: | --- |
| Fatias centrais de inscrição integradas | **5/5 = 100%** | Categorias/lotes #323/#325; benefícios #327; reserva #329; checkout Asaas #331; área do participante #335, todos com PR integrado em `develop`. |
| Aceitação pública da homologação | **1/4 = 25%** | Passou: domínio principal com HTTPS e readiness no CI #977. Pendem: ocultar versão do Nginx; corrigir certificado/redirecionamento do alias `dev`; registrar ensaio humano WCAG. |
| Evolvia completo e Gates 1–11 | **não aferido** | O mapa canônico e critérios dos 11 Gates seguem em reconciliação na issue #114; atribuir porcentagem geral agora confundiria escopos diferentes. |

Os percentuais contam critérios concluídos com peso igual **apenas dentro das
linhas acima**. Não somar as duas linhas nem usar 100% das cinco fatias como
Go/No-Go de lançamento. O Gate técnico do CI #977 permanece vermelho.

## Entregas e pendências atuais

| Frente | Estado verificável | Próxima condição |
| --- | --- | --- |
| Inscrição comercial e reserva | Integradas em `develop` (#323/#325/#327/#329) | Teste de jornada em homologação |
| Checkout Asaas e webhooks | Integrados (#331), confirmação por `CHECKOUT_PAID` | Validação operacional em ambiente configurado; cobrança real bloqueada por padrão |
| Área reservada do participante | Integrada (#335) | Ensaio funcional em homologação |
| Credenciamento e check-in | Rota e operação por QR existentes; evolução do operador no draft #368 | CI, revisão e teste de câmera/leitor reais antes de declarar o fluxo completo |
| Integrações | Catálogo informativo integrado pelo PR #149 neste SHA | Conectores efetivos, inclusive NFS-e municipal/nacional, exigem contratos, credenciais e homologação próprios; nenhuma emissão fiscal é prometida |
| Painel do evento | Revisão de texto, hierarquia e acessos rápidos integrada pelo PR #370 | Verificar publicação do SHA em homologação |
| Infraestrutura pública | Aplicação no domínio principal; CI #977 falha em headers e alias | Corrigir Nginx e TLS sem relaxar a validação |

## Critérios de atualização

Atualizar os numeradores somente após evidência do HEAD integrado e
verificação correspondente. Não converter CI de PR em deploy nem automação em
validação humana. O mapa de 11 Gates deve ser reconciliado na #114 antes de
publicar um percentual global. `main`, produção, cobrança real e emissão de NFS-e
não são habilitados por este quadro.
