---
snapshot_at_utc: 2026-09-26T01:50:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha_at_snapshot: 1d7049dc7e206a747c9fe6d3945835970b734f9c
delivery_mode: "Modo Lançamento — EVO-015"
active_phase: "Operação de inscrição e aceitação pública em homologação"
---

# Estado oficial do projeto

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
| Painel do evento | Revisão de texto, hierarquia e acessos rápidos no draft #370 | CI, revisão e integração em `develop` |
| Infraestrutura pública | Aplicação no domínio principal; CI #977 falha em headers e alias | Corrigir Nginx e TLS sem relaxar a validação |

## Critérios de atualização

Atualizar os numeradores somente após evidência do HEAD integrado e
verificação correspondente. Não converter CI de PR em deploy nem automação em
validação humana. O mapa de 11 Gates deve ser reconciliado na #114 antes de
publicar um percentual global. `main`, produção, cobrança real e emissão de NFS-e
não são habilitados por este quadro.
