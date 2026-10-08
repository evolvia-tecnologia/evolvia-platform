# Navegação do expositor
Decisão do Product Owner em 08/10/2026: **Expositor e serviços** ocupa bloco próprio, separado de **Operação**, no painel do evento.

A central existente continua em `/eventos/{id}/painel/expositores`. O menu recebe grupo identificado por título próprio e a visão geral recebe cartão próprio. Ambos aparecem quando a capability `exhibitor` estiver habilitada, inclusive em perfis diferentes de Feira. O serviço continua exigindo organização/evento e papel autorizado; a mudança visual não concede permissões ao operador.

Escopo Codex #486: componentes de navegação e visão geral. Sem alteração nos arquivos de acessibilidade ou nas branches Cursor #494/#498, API, schema, migrations ou classificação dos Gates. O critério G10.13 continua parcial até a área externa possuir prova de identidade e aceite.

Validação: teste de navegação verifica agrupamento independente, link ativo e recurso habilitado; CI comprova tipos/build e testes aplicáveis. Homologação/aceite só podem ser declarados após implantação e ensaio real. Rollback: reverter o commit da navegação, preservando empresas, credenciais e pedidos.

Requisitos adicionais do PO na mesma sessão: reorganizar a consulta de empresas e incluir controle de ocultar/expandir o menu lateral. O menu usa estado visual React, com aria-expanded/aria-controls, retirada dos links ocultos do foco e expansão do conteúdo no desktop. No celular preserva o drawer existente, Escape e retorno do foco. Não persiste preferência sensível nem muda autorização.

A central agrupa as onze abas em Empresas e credenciais, Configuração e Acompanhamento, com a mesma ordem visual e de teclado. A consulta usa seletor de campo, texto da busca e tipo alinhados, Limpar filtros, contagem de resultados, aviso de recorte e tabela com estado vazio. Mantém dados existentes, autorização e busca local; não dispara mensagens nem solicitações externas. A navegação foi ampliada no mesmo PR por pedido do PO.
