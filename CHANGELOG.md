# Changelog

Este arquivo registra marcos de produto. Commits e PRs preservam o histórico
técnico detalhado.

## Não publicado

- Governança operacional contínua e Evolvia Master Codex (PR #314).
- Detector offline, determinístico e fail-closed de colisões entre owned paths (PR #308).
- Planejadores locais acessíveis integrados em ordem segura (PRs #295, #296 e #297).
- Cabeçalhos defensivos HSTS, X-Content-Type-Options, Referrer-Policy e
  X-Frame-Options na Web e no Nginx versionado (PR #315).
- Ocultação de X-Powered-By e contrato público que reprova exposição da versão
  do Nginx (PR #315).
- Promoção transacional da configuração Nginx, com backup, `nginx -t`, reload
  e rollback do site canônico/link legado (PRs #316 e #317).
- Homologação `0.2.0-alpha.3` no `develop@314dace4`: API/banco, HTTPS,
  redirecionamento e cabeçalhos defensivos comprovados; versão do Nginx ainda
  exposta pelo wrapper administrativo do host.
- Gate 1 permanece em No-Go; nenhuma release, `main` ou produção foi promovida.

## 0.2.0-alpha.3

- Linha de desenvolvimento da fundação multi-organização e das fases do produto.

## 0.1.1

- Fundação estável em produção, com dependências travadas, migrations controladas
  e healthchecks.
