# Navegação do expositor
Decisão do Product Owner em 08/10/2026: **Expositor e serviços** ocupa bloco próprio, separado de **Operação**, no painel do evento.

A central existente continua em `/eventos/{id}/painel/expositores`. O menu recebe grupo identificado por título próprio e a visão geral recebe cartão próprio. Ambos aparecem quando a capability `exhibitor` estiver habilitada, inclusive em perfis diferentes de Feira. O serviço continua exigindo organização/evento e papel autorizado; a mudança visual não concede permissões ao operador.

Escopo Codex #486: componentes de navegação e visão geral. Sem alteração nos arquivos de acessibilidade ou nas branches Cursor #494/#498, API, schema, migrations ou classificação dos Gates. O critério G10.13 continua parcial até a área externa possuir prova de identidade e aceite.

Validação: teste de navegação verifica agrupamento independente, link ativo e recurso habilitado; CI comprova tipos/build e testes aplicáveis. Homologação/aceite só podem ser declarados após implantação e ensaio real. Rollback: reverter o commit da navegação, preservando empresas, credenciais e pedidos.
