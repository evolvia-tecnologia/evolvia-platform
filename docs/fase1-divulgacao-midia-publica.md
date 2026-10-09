# Fase 1 — mídia pública segura

## Escopo

Este lote conclui a base funcional da issue #57 no item 1 / Gate 1: logo, capa e imagem de compartilhamento passam a integrar o mesmo agregado de Divulgação, sem URL arbitrária e sem exposição antecipada de rascunhos.

## Jornada

- organizadores com papel editorial podem enviar, substituir e remover mídia durante `DRAFT` ou `SETUP`;
- a revisão otimista da Divulgação impede sobrescrita entre sessões concorrentes;
- o editor apresenta preview privado, texto alternativo e estado acessível de sucesso ou erro;
- a pré-visualização autenticada usa os mesmos metadados minimizados do renderer público;
- somente a mídia atualmente vinculada a um evento `PUBLISHED` possui rota pública;
- a imagem `SOCIAL_SHARE`, quando existente, alimenta Open Graph e dados estruturados; capa é o fallback visual dos dados estruturados;
- remoção e substituição são lógicas. Arquivos antigos não são apagados durante a requisição.
- o organizador escolhe somente cor principal e cor de destaque em `#RRGGBB`; preview e página pública aplicam os mesmos tokens;
- o backend normaliza as cores e deriva automaticamente texto claro ou escuro com contraste AA;
- preset de alto contraste, foco, erros, estados críticos e `forced-colors` continuam protegidos pelo sistema.

## Segurança e privacidade

- formatos permitidos: PNG, JPEG e WebP detectados pela assinatura e estrutura real do arquivo;
- SVG, conteúdo arbitrário, payload acima de 5 MB, dimensão acima de 8.192 px e imagem acima de 24 megapixels são recusados;
- o transporte JSON comporta os 5 MB binários após a expansão Base64 e o proxy limita a requisição a 7 MB;
- logo e compartilhamento exigem texto alternativo; somente capa pode ser explicitamente decorativa;
- a chave de armazenamento é gerada pelo servidor e validada antes de qualquer acesso ao filesystem;
- toda consulta e mutação usa `organizationId + eventId`, membership canônica e ACL deny-by-default;
- o contrato público não inclui IDs, tenant, chave de armazenamento, hash, revisão ou timestamps internos;
- cores não viram CSS livre, seletor, URL ou valor arbitrário; configurações legadas inválidas recebem fallback seguro;
- auditoria registra apenas uso, MIME, tamanho, dimensões, caráter decorativo e revisão. Não registra arquivo, hash, caminho, e-mail ou conteúdo do texto alternativo.

## Persistência e operação

- migration somente expansiva: novos enums, tabela, índices e FKs compostas sobre os campos de mídia já nulos;
- storage é uma porta substituível; o provider local persiste em `/app/data/media` através do volume nomeado `evolvia_media_data`;
- uma futura adoção de S3/compatível pode substituir o provider sem alterar o contrato de negócio;
- rollback de aplicação é feito por reversão do commit. A tabela e o volume permanecem inertes e preservam dados.

## Benchmark aplicado

O padrão útil observado no benchmark canônico é usar identidade e imagem de compartilhamento como apoio à descoberta, confiança e conversão da página pública. A implementação é própria do Evolvia, integrada à publicação explícita, à acessibilidade e ao isolamento multi-tenant; nenhuma interface, texto, ativo ou fluxo proprietário foi copiado.

## Verificações proporcionais

- Prisma `format`, `validate` e `generate`;
- API typecheck e build;
- testes unitários de MIME real, SVG, dimensões, megapixels, texto alternativo, revisão, substituição lógica, auditoria sanitizada e IDOR;
- smoke descartável de upload privado → preview → bloqueio público pré-publicação → homologação → publicação explícita → DTO e bytes públicos minimizados;
- teste direto de membership ativa, suspensa, removida e papel fora da allowlist com resposta indistinguível;
- Web typecheck e build de produção;
- CI natural obrigatório para API, Web, segurança, integração, migration idempotente e ARM64.


## Catálogo público: SSR e falhas de mídia — 09/10/2026

O #541 mantém a imagem autorizada no HTML inicial para permitir carregamento no SSR. Falhas anteriores à hidratação são reconciliadas no efeito após montagem; erro de elemento antigo após troca de COVER/LOGO não altera a mídia atual. Uma falha confirmada mantém o fallback sem inventar retry automático. O diagnóstico de browser não ignora contextos antigos nem erros React: registra somente código, enum text/HTML e rota pública sanitizada.

Integrado em `7a8d4d39657e12b7624ab6e62b5221e49e20b1be`, validado pelo CI `37966032162` / job `113941575567` no HEAD `da609eb1`. Hidratação, acessibilidade runtime e ARM64 Web passaram em ambiente descartável. Publicação do merge comprovada no run `37967190612` / job `113947839793`: Commit `7a8d4d39` e readiness API/PostgreSQL confirmados em 09/10 às 17:45 UTC. Gate público permanece vermelho pela versão Nginx; o alias registra hostname mismatch. No browser, home e catálogo abriram, mas a busca científica retornou 502 mesmo após uma única recarga com readiness confirmado. Jornada filtrada e ensaio humano continuam pendentes; nenhum aceite WCAG integral foi atribuído. Rollback por reversão da aplicação, sem alteração de schema ou arquivos de mídia.
