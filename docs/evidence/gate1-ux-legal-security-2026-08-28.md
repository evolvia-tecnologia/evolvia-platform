# Evidência do Gate 1 — UX, jurídico e segurança

Data: 2026-08-28  
Branch de integração: `develop`

## Escopo integrado

- PR #94: fundação navegável dos Termos de Uso e da Política de Privacidade, mantidos como minutas não vigentes;
- PR #97: correção da duplicação da marca nos títulos das páginas jurídicas;
- PR #96: ampliação dos tipos de evento e organização por universos;
- PR #98: hardening HTTP/HTTPS e verificação pós-deploy.

## UX de criação

O catálogo canônico compartilhado por Home e Wizard passou a incluir:

- seminário acadêmico;
- curso ou palestra;
- networking ou meetup;
- evento religioso ou beneficente;
- evento esportivo ou torneio.

A estimativa de público permanece informação operacional separada da capacidade do evento.

## Idiomas

Português Brasileiro (`pt-BR`) permanece idioma padrão e fallback. A internacionalização integral e a habilitação segura dos catálogos adicionais são rastreadas na issue #95; nenhum idioma incompleto deve aparecer como disponível.

## Jurídico

As rotas `/termos-de-uso` e `/privacidade` são estruturas técnicas de homologação, com `noindex, nofollow`, aviso de não vigência e sem registro de aceite. Publicação jurídica e consentimento versionado dependem de conteúdo empresarial real e aprovação jurídica.

## Segurança de transporte

O lote integrado exige:

- HSTS por um ano no host HTTPS;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Frame-Options: SAMEORIGIN`;
- ocultação da versão do Nginx;
- remoção de `X-Powered-By: Next.js`;
- falha do deploy se o contrato público não for comprovado.

CSP permanece deliberadamente fora deste lote até existir inventário completo de origens e integrações.

## Critério de conclusão

Este documento registra código integrado, não substitui CI nem validação pública. O lote só pode ser considerado implantado quando o workflow de `push` aprovar qualidade, integração, ARM64, deploy, HTTPS e os cabeçalhos públicos no SHA resultante. O Gate 1 continua dependente da matriz humana e do Go explícito do Product Owner.
