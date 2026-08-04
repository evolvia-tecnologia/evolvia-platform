# Critérios de Aceite e Testes

## Organização

- usuário recém-cadastrado recebe uma organização inicial;
- usuário pode pertencer a mais de uma organização;
- troca de organização não mistura dados;
- último `OWNER` não pode ser removido;
- papel inválido é rejeitado pelo backend.

## Eventos

- novo evento pertence à organização ativa;
- usuário sem membership não acessa o evento;
- evento de uma organização nunca aparece em outra;
- rotas antigas permanecem funcionais durante a transição.

## Capabilities

- capability duplicada no mesmo evento é rejeitada;
- configuração inválida é rejeitada;
- desativação preserva histórico e configuração;
- catálogo desconhecido não pode ser ativado.

## Wizard

- cada etapa é salva no servidor;
- recarregar a página mantém o progresso;
- outro dispositivo retoma a mesma sessão;
- autosaves repetidos não criam duplicatas;
- respostas inválidas não avançam etapa;
- a versão do fluxo fica registrada;
- percentual é calculado no backend.

## Migration

- backup criado antes do deploy;
- contagens de usuários e eventos preservadas;
- migration pode ser executada mais de uma vez sem duplicar dados;
- nenhum evento existente fica órfão;
- rollback da aplicação continua possível após a fase de expansão.

## Tipos de teste

1. Unitários: autorização, papéis, catálogo e cálculo do Wizard.
2. Integração: banco real de teste e escopo por organização.
3. Migration: banco com dados equivalentes à v0.1.1.
4. E2E: cadastro → organização → evento → Wizard → retomada.
5. Segurança: tentativa de acesso cruzado entre duas organizações.
6. Smoke test: health, login, criação e listagem.
