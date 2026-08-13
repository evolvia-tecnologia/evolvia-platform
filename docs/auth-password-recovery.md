# Recuperação segura de senha

## Objetivo

Definir o contrato mínimo para implementar “Esqueci minha senha” sem criar fluxo decorativo, sem revelar se um e-mail existe no sistema e sem introduzir dependência desnecessária na interface.

## Princípios

- A resposta pública ao pedido de recuperação deve ser genérica, independentemente de o e-mail existir ou não.
- Tokens de recuperação devem ser aleatórios, de uso único, armazenados apenas como hash e possuir expiração curta.
- Ao redefinir a senha com sucesso, o token deve ser invalidado de forma atômica.
- A nova senha deve respeitar a política canônica já definida no backend: mínimo de 8 caracteres, ao menos uma letra maiúscula, um número e um símbolo, além do limite operacional do algoritmo de hash adotado.
- A interface nunca substitui a validação do backend; apenas antecipa orientação e erros de forma acessível.
- O fluxo não deve autenticar o usuário automaticamente antes da confirmação de sucesso da redefinição.
- Toda operação sensível deve ser auditável sem registrar token, senha ou segredo em logs.

## Contrato proposto

### POST /auth/password-recovery/request

Entrada:

```json
{
  "email": "pessoa@exemplo.com"
}
```

Resposta pública esperada:

```json
{
  "accepted": true,
  "message": "Se existir uma conta para este e-mail, enviaremos as instruções de recuperação."
}
```

Regras:

- normalizar o e-mail como já ocorre no cadastro/login;
- aplicar rate limit por IP e por identificador normalizado;
- não informar se o usuário existe, está bloqueado ou não possui senha local;
- se houver conta elegível, gerar token criptograficamente seguro e persistir somente o hash;
- invalidar solicitações anteriores ainda ativas para o mesmo usuário ou limitar a uma janela curta;
- envio de e-mail deve ocorrer por camada de comunicação desacoplada da resposta HTTP quando a infraestrutura estiver disponível.

### POST /auth/password-recovery/reset

Entrada:

```json
{
  "token": "token-recebido-pelo-usuario",
  "password": "nova-senha"
}
```

Resposta de sucesso:

```json
{
  "reset": true
}
```

Regras:

- comparar hash do token em tempo seguro;
- rejeitar token inexistente, expirado, já utilizado ou revogado com mensagem pública equivalente;
- validar a nova senha exclusivamente pelo mesmo serviço/política usado no cadastro;
- atualizar a senha e invalidar o token na mesma transação;
- registrar auditoria de sucesso/falha sem armazenar token ou senha;
- considerar invalidação de sessões anteriores como requisito do lote de segurança de sessão, antes de produção.

## Modelo mínimo de dados

Entidade sugerida `PasswordRecoveryToken`:

- `id`
- `userId`
- `tokenHash`
- `expiresAt`
- `usedAt` nulo enquanto ativo
- `createdAt`
- `requestIpHash` opcional, se necessário para auditoria/rate limit sem retenção excessiva de dado pessoal

Índices mínimos:

- único em `tokenHash`;
- índice por `userId` + `expiresAt`;
- limpeza periódica de tokens expirados/usados conforme política de retenção.

## UX e acessibilidade

Tela “Esqueci minha senha”:

- um único campo de e-mail;
- validação de formato no cliente, mas sem tentativa de confirmar existência da conta;
- após envio, sempre apresentar a mesma confirmação pública;
- mensagem em `role="status"`/`aria-live="polite"` quando apropriado;
- erros de formato associados ao campo por `aria-describedby` e `aria-invalid`;
- foco levado ao primeiro erro de validação;
- botão desabilitado apenas durante a requisição, sem bloquear teclado.

Tela “Redefinir senha”:

- nova senha + confirmação;
- opção de visualizar/ocultar senha acessível por teclado, com `aria-label` e `aria-pressed`;
- critérios de senha iguais aos do cadastro;
- mensagem genérica para token inválido/expirado, oferecendo novo pedido de recuperação;
- nunca exibir o token na interface, logs ou mensagens de erro.

## Segurança

Critérios obrigatórios antes de integrar:

1. anti-enumeração de usuários comprovada por teste;
2. token de uso único e expiração testada;
3. política de senha aplicada no backend;
4. rate limit definido;
5. nenhuma senha/token em logs;
6. testes concorrentes garantindo que o mesmo token não possa ser consumido duas vezes;
7. migration idempotente e rollback definido;
8. compatibilidade ARM64 preservada;
9. fluxo de e-mail desacoplado para não depender de SMTP em teste unitário;
10. revisão LGPD de retenção dos registros de recuperação.

## Critérios de aceite do primeiro lote

- pedido de recuperação retorna resposta indistinguível para e-mail existente e inexistente;
- token válido redefine a senha uma única vez;
- token expirado, inválido ou usado falha sem revelar detalhes internos;
- senha fora da política é rejeitada pelo backend;
- nova senha permite login; senha anterior deixa de funcionar;
- UI possui fluxo completo de teclado e mensagens acessíveis;
- nenhuma rota de interface é publicada antes de os endpoints correspondentes existirem.

## Fora deste lote

- autenticação multifator;
- recuperação por SMS/WhatsApp;
- login mágico;
- SSO corporativo;
- política definitiva de revogação global de sessões, que deve ser fechada junto do modelo de sessão/autorização.
