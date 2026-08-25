# Fase 1 — EVA contextual do organizador

## Problema e corte funcional

O editor de Divulgação apresentava uma promessa estática de revisão futura. Este corte substitui a promessa por orientação verificável para o organizador, sem antecipar uma plataforma conversacional ou o Gate 2.

A EVA responde a três dúvidas da jornada: o que falta para publicar, por que edição/publicação não está disponível e qual é a próxima ação permitida. As respostas são derivadas no backend exclusivamente de `EventStatus`, checklist canônico e permissões efetivas já calculadas no escopo autenticado do evento.

## Benchmark aplicado

O padrão útil observado no benchmark canônico é suporte integrado à tarefa, com pendências e próximo passo próximos do ponto de decisão. O Evolvia aplica uma solução própria: checklist explicável, sequência explícita de homologação e assistência contextual pela EVA, sem copiar interface, texto, identidade ou fluxo proprietário.

## Segurança e limites

- contexto obtido após membership canônica e limitado ao evento atual;
- resposta da EVA não contém `organizationId`, papel nominal, e-mail, contato, token, hash ou conteúdo editorial;
- perguntas fechadas, sem prompt livre, RAG, memória entre tenants ou ferramentas;
- nenhuma ação mutável; a EVA aponta para controles já existentes e nunca publica;
- confirmação humana explícita `PUBLICAR` e policies do backend permanecem autoridade;
- ausência de permissão produz orientação útil sem revelar papéis ou dados internos.

## Experiência e acessibilidade

A orientação possui perguntas reais, resposta anunciada por leitor de tela, foco programático, botões de pelo menos 44 px, navegação por teclado, reflow mobile e suporte a cores forçadas. Mudanças locais não salvas prevalecem como próximo passo para impedir orientação baseada em versão obsoleta.

## Evidência automatizada

Os testes da API cobrem checklist incompleto, sequência de homologação, permissão insuficiente e ausência de dados sensíveis na orientação. Typecheck/build da Web validam o contrato do componente e o CI integral preserva integração, migrations e ARM64.
