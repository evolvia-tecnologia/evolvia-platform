# Correção transitive de proxy-addr — 05/10/2026

Issue #425. Base develop@277b8e8. A auditoria do PR visual #424 falhou
no run 37402216359 antes dos tipos/builds: proxy-addr 2.0.7 crítico.

Fonte primária: https://github.com/advisories/GHSA-jqcg-44mw-7w3h
CVE-2026-90711. A base GitHub publicou/revisou o advisory em 05/10/2026;
a versão corrigida é 2.0.8. Subnets IPv6 com prefixo curto podem confiar
indevidamente em IPv4 arbitrário e fazer aceitar X-Forwarded-For forjado.
Isso não comprova exploração nem configuração vulnerável no Evolvia.

Decisão: override exato proxy-addr 2.0.8 e lockfile regenerado, preservando
Express/Nest e a configuração runtime de trust proxy. Alternativas: atualizar
todo o Nest/Express (maior regressão) ou relaxar audit (recusado).
Não altera autenticação, isolamento, proxy, infra, schema ou migrations.

Regressões exercitam a biblioteca instalada, não apenas o manifesto:
subnet mapeada curta, prefixo IPv6 amplo, subnet IPv4 correta, mapped /104,
X-Forwarded-For forjado e requisição sem cabeçalho. CI atual deve comprovar
Node22, API/Web, integração e Ubuntu/ARM64 antes de develop.

Alertas moderados de multer/qs observados no audit inicial ficam separados;
este corte não afirma segurança integral nem altera o threshold de auditoria.
Rollback por revert conjunto do manifesto/lock/teste; a versão anterior
reabre risco conhecido, portanto só usar compensação operacional necessária.
