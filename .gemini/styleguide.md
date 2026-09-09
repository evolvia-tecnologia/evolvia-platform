# Guia de revisão de código — Evolvia

## Objetivo

Revise alterações com foco em segurança, isolamento entre clientes e eventos, LGPD, confiabilidade, acessibilidade, escalabilidade e prevenção de regressões.

## Forma dos comentários

- Escreva todos os comentários em português do Brasil.
- Analise somente problemas introduzidos ou agravados pelo Pull Request.
- Não solicite refatorações sem relação direta com a alteração.
- Faça comentários objetivos, acionáveis e associados à linha relevante.
- Explique o risco, o cenário que o demonstra e a correção esperada.
- Consolide ocorrências com a mesma causa raiz em um único comentário.
- Não repita alertas já cobertos claramente por compilador, linter ou testes.
- Não trate preferência de estilo como defeito.
- Não afirme que existe vulnerabilidade sem indicar um caminho plausível de exploração.
- Quando faltar contexto, formule uma pergunta e não apresente suposição como certeza.
- Evite elogios, poemas, mensagens genéricas e comentários sem ação concreta.

## Severidade

- CRITICAL: segredo exposto, acesso administrativo indevido, quebra comprovada de isolamento entre clientes, perda irreversível de dados ou movimentação financeira indevida.
- HIGH: falha de autorização, IDOR, injeção, XSS explorável, CSRF, SSRF, vazamento de dados pessoais, webhook sem validação, corrida financeira ou indisponibilidade relevante.
- MEDIUM: erro funcional reproduzível, regressão, condição de borda importante, acessibilidade comprometida, migração insegura ou ausência de teste para comportamento crítico.
- LOW: preferência, melhoria opcional, nomenclatura ou formatação sem impacto funcional. Não publique como comentário quando não houver risco concreto.

## Segurança e isolamento

- Toda leitura e escrita de dados deve respeitar organização, tenant, evento e demais escopos aplicáveis.
- Nunca confie apenas em identificadores, papéis ou permissões enviados pelo cliente.
- Autorizações devem ser verificadas no servidor e negar acesso por padrão.
- Diferencie autenticação de autorização.
- Verifique acesso ao registro específico, evitando IDOR e acesso cruzado entre eventos.
- Valide entradas no limite do sistema e encode saídas conforme o contexto.
- Avalie injeção SQL, XSS, CSRF, SSRF, upload inseguro, traversal e mass assignment.
- Segredos, tokens, senhas, documentos pessoais e dados financeiros não podem aparecer em código, URL, resposta indevida ou log.
- Cookies e sessões devem adotar atributos e expiração compatíveis com o risco.
- Operações sensíveis devem possuir auditoria sem registrar conteúdo secreto.

## LGPD e privacidade

- Colete e exponha apenas os dados necessários para a finalidade.
- Verifique controle de acesso, retenção, exclusão e rastreabilidade de dados pessoais.
- Não permita que relatórios, exportações ou logs contornem o isolamento entre clientes.
- Dados pessoais usados em testes devem ser fictícios.

## Pagamentos e webhooks

- Valores monetários devem usar representação inteira ou decimal segura, nunca ponto flutuante impreciso.
- Confirme assinatura e origem dos webhooks.
- Processamentos devem ser idempotentes e resistentes a reenvios e concorrência.
- Não aceite como verdadeiro um status de pagamento informado apenas pelo navegador.
- Mudanças financeiras críticas devem ser transacionais e auditáveis.

## Banco de dados e migrações

- Migrações devem preservar compatibilidade, integridade e possibilidade de rollback.
- Aponte exclusões, renomeações ou alterações destrutivas sem estratégia segura.
- Considere índices, restrições, unicidade, transações e concorrência.
- Consultas não podem perder filtros de tenant, organização ou evento.

## Regras essenciais da Evolvia

- A unicidade de inscrição deve respeitar a configuração e o escopo do evento.
- Submissões científicas não podem permitir duplicidade indevida.
- QR Codes, credenciais e autorizações de acesso não devem ser previsíveis ou reutilizáveis indevidamente.
- Publicação e alterações críticas de eventos devem respeitar validações e permissões.
- A EVA deve orientar, mas nunca contornar autorização, validação ou auditoria.
- Recursos desabilitados para um evento não devem permanecer acessíveis por URL ou API.

## Compatibilidade e operação

- Preserve compatibilidade com Linux Ubuntu e arquitetura ARM64.
- Aponte dependências, imagens ou binários restritos a x86 quando não houver alternativa ARM64.
- Não aprove mudanças que exponham portas, removam proteções ou enfraqueçam TLS.
- Healthchecks devem verificar o serviço correto sem produzir falso positivo.
- Logs devem ajudar no diagnóstico sem revelar segredos ou dados pessoais.

## Qualidade e testes

- Exija testes proporcionais ao risco da alteração.
- Para segurança multi-tenant, considere testes negativos entre organizações e eventos diferentes.
- Para pagamentos e webhooks, considere repetição, concorrência, falha parcial e idempotência.
- Para datas, considere fuso horário e limites de período.
- Para interfaces, considere teclado, foco visível, leitores de tela, contraste e responsividade.
- Não peça testes redundantes quando a cobertura existente já prova o comportamento.

## Critério final

Comente apenas quando houver evidência suficiente de um problema real e acionável. Priorize poucos achados relevantes em vez de muitos comentários especulativos.
