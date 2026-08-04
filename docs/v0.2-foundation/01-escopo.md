# Evolvia Core v0.2 — Escopo da Fundação

## Objetivo

Transformar a base v0.1.1 em uma plataforma multi-organização, preparada para
equipes, permissões, capacidades configuráveis e criação de eventos com
salvamento persistente no servidor.

## Entregas desta versão

1. Organizações.
2. Membros e papéis.
3. Vinculação obrigatória dos novos eventos a uma organização.
4. Capabilities por evento.
5. Wizard persistente no servidor.
6. Autosave e retomada em outro dispositivo.
7. Autorização por organização em todas as rotas novas.
8. Auditoria mínima das alterações estruturais.
9. Testes de unidade, integração, migração e fluxo crítico.
10. Deploy em staging antes de qualquer promoção.

## Fora do escopo

Não entram nesta versão:

- pagamentos e split;
- inscrições públicas completas;
- credenciais e QR Code;
- controle de acesso;
- submissões científicas;
- certificados;
- ePoster;
- expositor e feira;
- campanhas de comunicação;
- IA generativa autônoma.

Esses módulos dependerão da fundação entregue aqui.

## Princípios obrigatórios

- Evento é sempre pertencente a uma organização.
- Toda leitura e escrita deve aplicar escopo de organização no servidor.
- O cliente nunca define sozinho sua permissão efetiva.
- O Wizard salva progresso no servidor.
- O evento é o registro canônico; não haverá cópia manual de um “rascunho”
  para outro evento ao publicar.
- Mudanças no banco seguem expandir → migrar → validar → restringir.
- Nenhuma migration destrutiva será aplicada junto com a primeira publicação.
