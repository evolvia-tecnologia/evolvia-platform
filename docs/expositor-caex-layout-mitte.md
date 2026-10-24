# Layout de atendimento e portal — referência Mitte

Direção do Product Owner em24/10/2026, #592/#593: reproduzir a estrutura
do CAEX e portal Expositor/Fornecedor/Montador observados na Mitte, organizando
as funcionalidades Evolvia nesses espaços e mantendo suas cores.

## Implementação do candidato

- Portal: barra superior por evento, conta e papel; navegação Dados cadastrais,
  Representantes, Formulários, Pagamentos e Downloads; menu compacto em celular;
  cabeçalho da seção/empresa/estande; rodapé contextual.
- Formulários: resumo de acesso, filtros e cartões horizontais com ícone,
  título, estado, prazo e obrigatoriedade. Expansão nativa por details/summary
  abre os campos existentes. Colapsar não desmonta os campos nem dispara
  visita/envio. Prazo vencido preserva bloqueio existente, sem impedir consulta.
- CAEX: barra superior com Início/Expositores/Credenciais/Prestadores,
  menu responsivo e retorno ao painel; resumo com contagens/progresso;
  ficha mantém cotas e abas Credenciais/Formulários/Pedidos do corte anterior.
- As rotas do portal e CAEX usam esse cabeçalho específico, sem duplicar
  navegação pública ou sidebar do organizador. Não modifica event-workspace.
  O CAEX lê dados exclusivamente pela API autenticada já protegida por
  papel administrativo, capability e organização/evento; retirar o wrapper
  visual não concede permissões. Falta sessão oferece acesso ao login.
- Fornecedor/prestador usa o portal existente de empresa PROVIDER; montador
  permanece modalidade de credencial ASSEMBLER. Não foi inventado novo papel
  nem alterada a ACL para simular uma área ainda inexistente.

## Preservação e validação

42 testes Web executados em Node24: recuperação de mutações, sessão/contexto,
impressão escapada, busca/ordens e menus. Três novos casos comprovam expansão
e reabertura do menu, acesso à outra seção e resumo nativo opcional sem
registro de visita automático. Harness JSX/hooks não equivale a navegador.
CI completo Node22/API/Web/ARM64, revisão do novo SHA e comparação visual
autenticada em320/390/desktop ainda necessários.

Mantém endpoints, persistência, identidade verificada, auditoria, cotas,
valores registrados e ações existentes. Sem senha compartilhada, campos de
credencial legada, cobrança ou integração externa nova. Idioma adicional,
impressão em lote e novas contratações continuam com dependências próprias.
Não chamar a reprodução de pixel-exata antes da comparação visual.

Rollback: reverter aplicação, sem migration nem remoção de dados.
Matriz/Master recebem marcos somente após evidência aplicável de integração,
CI, publicação e aceite, separadamente.
