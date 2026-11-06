# WORK-02 — Acesso às informações do evento

Contrato de 05/11/2026. Responsável: Work, agente interno de implementação.
Coordenação: issue #571. Requisito: issue #627, acesso à Fundação.
Base: `develop@9fd3bed60347a8f6eefb2a0bcda46f4ff18cca21`.
Branch: `work/foundation-discoverability-20261105`.

## Problema e decisão

O editor existente da Fundação já aceita o link `?review=foundation`, mas a
sidebar só oferecia o nome genérico Fundação na trilha e a visão geral não
oferecia um acesso rápido às informações básicas. Isso dificultava corrigir
datas, nome, local e formato.

Decisão: adicionar Informações do evento no grupo Geral do menu e uma ação
Editar informações do evento nos acessos rápidos da visão geral. Ambos abrem
o editor canônico `/eventos/{id}/configuracao?review=foundation`.
Não criar segunda tela, API ou persistência para os mesmos dados.

Alternativa descartada: duplicar os campos na visão geral. Apesar de economizar
uma navegação, criaria outra edição e risco de validações divergentes.

## Escopo, segurança e compatibilidade

- Reutiliza Fundação e revisão direta do #616, sem publicar automaticamente.
- O menu mantém o fechamento no mobile e retira links ocultos da tabulação.
- O fallback operacional retorna antes do menu do organizador; não recebe o
  novo link. A visão geral continua dependente do GET autorizado do Wizard.
- Autorizações, escopo por organização/evento e auditoria de edição continuam
  no backend existente (`EVENT_EDITOR_ROLES` no serviço do Wizard).
- Sem API/schema/migration, dependência, envio externo ou alteração de permissões.
- Não altera blocos de operação, expositor/CAEX, financeiro ou científico.

Este corte resolve descoberta e navegação. Não comprova todo o aceite da #627,
nem modifica regras de datas, lotes/vendas, editor ou fluxo de salvamento.

## Validação e rollback

Comando focal:
`node --test apps/web/tests/event-foundation-access.test.mjs apps/web/tests/event-workspace-navigation.test.mjs`.

Resultado local: 16/16 testes aprovados, sem skips, Node24.22.1,
React/react-test-renderer19.2.8 e TypeScript5.9.3. Quatro testes novos montam
componentes React reais com API simulada: cinco perfis, menu móvel/ordem de
tabulação, GET sem gravação na visão geral e negativas de autorização.
Doze regressões de navegação existentes preservadas.

CI Node22, tipos/build completos, integração/PostgreSQL, ARM64 e ensaio
autenticado/visual em navegador permanecem pendentes até evidência no PR.
Testes React não equivalem a teste de teclado/leitor de tela em navegador.
Sem novo crédito na matriz dos Gates.

Rollback: reverter os acessos e seus testes; nenhum dado é migrado ou alterado.
