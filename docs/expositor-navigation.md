# Navegação do expositor
Decisão do Product Owner em 08/10/2026: **Expositor e serviços** ocupa bloco próprio, separado de **Operação**, no painel do evento.

A central existente continua em `/eventos/{id}/painel/expositores`. O menu recebe grupo identificado por título próprio e a visão geral recebe cartão próprio. Ambos aparecem quando a capability `exhibitor` estiver habilitada, inclusive em perfis diferentes de Feira. O serviço continua exigindo organização/evento e papel autorizado; a mudança visual não concede permissões ao operador.

Escopo Codex #486: componentes de navegação e visão geral. Sem alteração nos arquivos de acessibilidade ou nas branches Cursor #494/#498, API, schema, migrations ou classificação dos Gates. O critério G10.13 continua parcial até a área externa possuir prova de identidade e aceite.

Validação: teste de navegação verifica agrupamento independente, link ativo e recurso habilitado; CI comprova tipos/build e testes aplicáveis. Homologação/aceite só podem ser declarados após implantação e ensaio real. Rollback: reverter o commit da navegação, preservando empresas, credenciais e pedidos.

Requisitos adicionais do PO na mesma sessão: reorganizar a consulta de empresas e incluir controle de ocultar/expandir o menu lateral. O menu usa estado visual React, com aria-expanded/aria-controls, retirada dos links ocultos do foco e expansão do conteúdo no desktop. No celular preserva o drawer existente, Escape e retorno do foco. Não persiste preferência sensível nem muda autorização.

A central agrupa as onze abas em Empresas e credenciais, Configuração e Acompanhamento. A navegação passou a ter dois níveis: primeiro o usuário escolhe uma das três áreas e, abaixo, vê somente as três ou quatro ações daquele contexto. Isso reduz a carga visual sem esconder funcionalidade. Setas esquerda/direita percorrem as áreas ou as abas visíveis; Home/End levam à primeira/última opção do nível em foco. Cada nível possui um único ponto de Tab e foco visível. O painel mantém foco e relação ARIA com a aba ativa.

Quando ainda não há empresa cadastrada, o Início mostra uma orientação curta e uma única ação principal para incluir a primeira empresa. A consulta usa seletor de campo, texto da busca e tipo alinhados, Limpar filtros, contagem de resultados, aviso de recorte e tabela com estado vazio. Em 320 px as áreas e ações viram uma coluna, sem rolagem horizontal da navegação. Mantém dados existentes, autorização e busca local; não dispara mensagens nem solicitações externas.


Proveniência verificada: #520 foi integrado em `2f53f8b1`; #527 em `3c97223e`. O CI [37837951585](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37837951585) aprovou qualidade, tipos, segurança, PostgreSQL/migrations, fluxo funcional, hidratação isolada, acessibilidade pública e ARM64. A aplicação desse SHA foi publicada em homologação; o job público permaneceu vermelho por Nginx/alias, não por falha da central. Não houve ensaio autenticado, leitor de tela humano nem aceite funcional neste registro.
