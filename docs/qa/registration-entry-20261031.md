# Recuperação da inscrição — 31/10/2026

Pedido do Product Owner e acompanhamento: issue #571. Base `develop@be84c3d0c54837a2f88f38ca63fe27290c0d491d`.

## Decisões de experiência

- A inscrição nova sugere o primeiro nome em `preferred_name` enquanto esse campo ainda não foi editado. Uma edição manual, inclusive apagar, encerra a sugestão. Não inferir gênero ou alterar maiúsculas. Cadastros históricos e nomes já escolhidos não são reescritos.
- Telefone usa DDI separado; Brasil também separa DDD e número. O componente compartilhado atende inscrição individual, secretaria e correção pelo participante. A API normaliza novas gravações em formato internacional, preservando a leitura de cadastros históricos. Não significa que o número exista ou tenha WhatsApp.
- O consentimento nunca vem marcado. Documento ausente mantém a reserva bloqueada e explica o motivo junto ao botão. Não substituir documento ausente por aceite fictício.
- O envio da inscrição individual ganha trava síncrona contra clique duplicado, além da chave idempotente já existente. Não há retry automático.

## PDF passivo

A codificação ASCII85 usada pelo PDF de teste era recusada como se fosse recurso ativo. O conteúdo agora é decodificado, com limite agregado de 5 MB e profundidade limitada, antes da inspeção. Flate e ASCII85 são aplicados na ordem declarada. Filtros não suportados, criptografia, scripts, anexos, objetos comprimidos, filtros/comprimentos indiretos e conteúdo fora do comprimento declarado continuam recusados.

Não é um parser estrutural universal de PDF. Documentos com outros filtros continuam exigindo exportação em formato suportado. Bytes originais são preservados; não há execução, ferramenta externa ou mudança de cabeçalhos, ACL, armazenamento e auditoria. A política também serve os uploads científicos que já a reutilizam.

## Provas locais e limites

34 testes passaram em Node 24.22.1: entradas, política de reserva, edição, consentimento e PDF; duas interações React usam React 19.2.8 e react-test-renderer, com transporte simulado e dependências de apresentação substituídas. As verificações finais de PDF usam a dependência Nest real instalada. TypeScript 5.9.3 passou nos quatro módulos API alterados e no helper/componente compartilhado de telefone. Não é build completo ou homologação em navegador.

O compilador API habilita `rewriteRelativeImportExtensions` para emitir os imports `.ts` do normalizador como `.js`, permitindo os testes nativos de TypeScript e o build CommonJS sem resolver caminhos fictícios.

CI completo, PostgreSQL, ARM64, revisão independente, deploy e ensaios reais desktop/320/390px, teclado e leitor de tela continuam obrigatórios. A autenticação do navegador expirou; a recuperação segura desta rodada não concluiu. Nenhuma nova inscrição, presença, emissão ou impressão real foi comprovada nesta etapa.

## Coordenação

Branch isolada `codex/registration-entry-recovery-20261031`. Reconciliar antes da integração: PR #471 também altera `public-registration-form.tsx`; PR #614 também altera `event-desk.tsx`. Não alterar branches dessas frentes nem substituir suas funcionalidades. Compra múltipla, portal do expositor e demais formulários não convertidos devem adotar o mesmo componente em seus cortes próprios, após conferir seus contratos. Não afirmar correção integral da plataforma antes dessa verificação.

Pilotos: corporativo `cmvvkneks0003n201mz4uth3s`; feira `cmvvkrhrf0063n201wvtf3lo2`. Próxima prova: anexar o aviso fictício passivo pela interface, abrir documento, reservar e confirmar inscrição; localizar na secretaria, credenciar, gerar etiqueta, emitir certificado conforme elegibilidade e conferir os totais/exportações. A Área do Participante exige conta legitimamente verificada. Impressão física exige hardware e evidência própria.

Rollback: reverter o commit de aplicação; manter arquivos, inscrições, versões de termos e auditoria. Sem migration. Nenhuma alteração de `main`, produção, autenticação, SMTP ou secrets.
