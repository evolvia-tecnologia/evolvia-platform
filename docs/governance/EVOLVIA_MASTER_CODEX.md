# Evolvia Master Codex

Registro canônico do patrimônio intelectual, das decisões estratégicas e do estado
executivo da Evolvia. Código, testes, SHAs e evidências de ambiente são a fonte
primária de verdade; este documento conecta essas provas à direção do produto.

## Identidade e direção

- Produto: plataforma operacional inteligente para eventos, self-service e assistida pela EVA.
- Framework: IICEE — Inteligência, Integração, Confiabilidade, Experiência e Evolução.
- Escopo: organizações e eventos isolados, múltiplos países, portes e perfis de evento.
- Idioma-base: português brasileiro, com arquitetura preparada para internacionalização.
- Branches: `develop` integra; `main` e produção dependem de Go formal.

## Princípios invariáveis

1. Segurança e LGPD por padrão, com autorização backend `deny-by-default`.
2. Isolamento obrigatório por `organizationId + eventId` e DTOs mínimos.
3. EVA orienta e sugere; não publica nem executa ação sensível silenciosamente.
4. WCAG 2.2 AA, teclado, foco, reflow a 320 px e alvos de 44 px.
5. Node 22, Ubuntu/ARM64, migrations aditivas, idempotência, auditoria e rollback.
6. Gates não são encerrados por intenção, número de ciclos ou CI de outro SHA.
7. Interfaces ou textos proprietários de terceiros não são copiados.

## Sequência canônica

1. Gate 1 — Divulgação do evento.
2. Gate 2 — Inscrição.
3. Gate 3 — Área reservada do inscrito.
4. Gate 4 — Configuração científica.
5. Gate 5 — Submissão pelo autor.
6. Gate 6 — Avaliação científica.
7. Gate 7 — Decisão científica.
8. Gate 8 — Arquivo final, pôster e ePoster.
9. Gate 9 — Programação científica.
10. Gate 10 — Operação do evento.
11. Gate 11 — Pós-evento.

## Estado auditado em 16/09/2026

- Integração: `develop@314dace405060ef2dd628b82ed0f9f2b930f7864`.
- Versão de desenvolvimento/homologação: `0.2.0-alpha.3`; produção permanece `0.1.1`.
- Integrados nesta janela: PRs #295, #296, #297, #312, #315, #316 e #317.
- CI #742: qualidade, tipos, segurança, smoke funcional, migrations idempotentes,
  evidência visual automatizada, runtime de acessibilidade e builds API/Web ARM64 verdes.
- Homologação no mesmo SHA: containers implantados; API e PostgreSQL prontos;
  HTTPS 200; HTTP 308; HSTS, X-Content-Type-Options, Referrer-Policy e
  X-Frame-Options conformes; X-Powered-By ausente.
- No-Go residual: o proxy público ainda responde
  `Server: nginx/1.24.0 (Ubuntu)`. A chave SSH restrita aceita somente
  `deploy $SHA`; o wrapper administrativo executado no host não promove a
  configuração Nginx versionada do repositório.
- A intervenção restante exige atualização auditável do wrapper/host por
  administrador autorizado. Secrets e privilégios não serão ampliados por CI.
- Evidência humana com NVDA/VoiceOver permanece obrigatória e ausente.
- Consequência: Gate 1 e homologação formal continuam abertos; Gate 2 permanece
  bloqueado por EVO-006.
- Gemini Developer permanece pausado e não foi acionado.
- `main` e produção permanecem protegidos.

## Registro de decisões deste marco

### MC-2026-09-16-01 — Continuidade sem Gemini

- Data: 16/09/2026.
- Responsável: Product Owner / Codex.
- Contexto: Gemini Developer permanece pausado por causa não comprovada.
- Decisão: Codex assume temporariamente o backlog programável sem acionar Gemini,
  `/plan` ou `/approve`.
- Impacto IICEE: preserva evolução e confiabilidade sem depender de integração instável.
- Módulos: governança, Web, CI/CD e homologação.
- Riscos: concentração temporária de execução e revisão; mitigada por CI e proteção por HEAD.
- Segurança/LGPD: nenhum secret alterado; paths Gemini preservados; nenhuma PII adicionada.
- Compatibilidade: Node 22, ARM64 e arquitetura atual preservados.
- Testes: CIs #722, #728, #732, #736, #741 e #742.
- Rollback: retomar Gemini apenas após prova controlada e decisão explícita.
- PRs: #295, #296, #297, #312, #315, #316 e #317.
- Commits: `5ca73ee8`, `1e78bb56`, `b7d32548`, `76871738`,
  `855c52ba`, `315c89f6` e `314dace4`.
- Ambiente: `develop` e homologação; sem `main` ou produção.

### MC-2026-09-16-02 — Critério de fechamento do Gate 1

- Data: 16/09/2026.
- Responsável: Product Owner / Codex.
- Contexto: código integrado e containers implantados não equivalem a proxy do host atualizado.
- Decisão: o Gate 1 exige HEAD integrado verde, homologação no mesmo SHA,
  cabeçalhos públicos conformes, ocultação da versão do proxy, evidência
  automatizada preservada e validação humana registrada.
- Impacto IICEE: impede promoção baseada em evidência parcial.
- Módulos: Nginx, CI/CD, Web e acessibilidade.
- Riscos: início do Gate 2 adiado até intervenção administrativa e validação humana.
- Segurança/LGPD: HSTS e cabeçalhos defensivos estão ativos; divulgação da versão
  do Nginx permanece como No-Go.
- Compatibilidade: configuração versionada e rollback estão prontos no repositório;
  o wrapper do host precisa promovê-los.
- Testes: CI #742 e prova pública de 16/09/2026.
- Rollback: script versionado restaura site canônico e link legado se `nginx -t`
  ou reload falhar.
- PRs: #315, #316 e #317.
- Commit: `develop@314dace405060ef2dd628b82ed0f9f2b930f7864`.
- Ambiente: homologação pública.
- Estado: No-Go residual; sem autorização para Gate 2, `main` ou produção.

## Como manter este Codex

Atualizar após decisão do Product Owner, mudança de Gate, merge relevante, release,
incidente, alteração arquitetural ou evidência de homologação. Cada entrada cita
data, responsável, impacto IICEE, módulos, riscos, segurança/LGPD, compatibilidade,
testes, rollback, PRs, commits, CI e ambiente.
