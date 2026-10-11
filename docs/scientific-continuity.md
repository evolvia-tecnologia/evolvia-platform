# Continuidade científica — Gates 5 a 8

Direção autorizada pelo Product Owner em 04/10/2026: continuidade do Cursor no PR #411.
Base funcional: develop@8cf2e456. Handoff recebido em 5b89cbd.

## Decisões do corte

- Operação de portaria continua orientada por recursos habilitados. Disponibilidade da estação é informação derivada pela API, compatível com a rota pública científica publicada; não autoriza edição científica para OPERATOR.
- O máximo de autores é o total, incluindo quem submete. Dez coautores exigem máximo total de onze; a interface segue a configuração até o limite seguro existente de vinte pessoas.
- fileKey preserva o PDF original da submissão. eposterFileKey identifica exclusivamente o arquivo final enviado após aceite para a forma EPOSTER. Nenhuma migração converte anexos originais em pôsteres públicos.
- A substituição do ePoster usa comparação da referência anterior no banco; concorrência recusa a segunda atualização antes de auditoria/commit. Arquivo anterior só é removido depois do commit; rollback limpa apenas o upload novo. Falha de limpeza pode deixar arquivo órfão, preservando evidências; a limpeza administrativa futura deve respeitar referências e backups.
- A estação lê somente eposterFileKey, exige EPOSTER, aceite e liberação explícita. Mudanças de visibilidade geram auditoria do organizador na mesma transação.
- Conflito de interesse do avaliador gera auditoria transacional; motivo permanece no registro autorizado e não é copiado ao log.
- Critérios ativos pertencem à organização/evento; UNKNOWN_CRITERION já bloqueia o envio antes da escrita. Sessão confere evento/organização de acesso e pessoa.
- O link do avaliador é mostrado uma vez na emissão, vale quatorze dias e pode ser revogado por nova emissão. O token é reutilizado na sessão; não é um link consumido em um único acesso.
- A UI bloqueia envios repetidos desde a leitura do arquivo e recupera controles em erro/abort. PDFs passam pela política passiva existente.

## Validação e limites

Regressões executam serviços e políticas reais com colaboradores de banco/armazenamento substituídos, e handlers reais da interface. Cobrem rollback, concorrência, isolamento, PDF ativo, arquivo original privado, publicação auditada, limite de coautores e recuperação de upload.

CI do HEAD deve comprovar Node22, tipos/builds, migrations descartáveis, integração e ARM64. Ensaios locais em Node24 não substituem esses checks.
Não declarar homologação ou encerrar Gates somente por esses testes. Permanecem ensaio autenticado da jornada científica, paginação da estação (busca limitada a cinquenta resultados), acessibilidade humana e validação operacional em homologação.

Migration aditiva 20261004230000_scientific_eposter_file. Rollback por reversão da aplicação, preservando a coluna, dados e arquivos; nunca remover originais ou copiar automaticamente um anexo legado para publicação.

## Revisão assistida pelo Gemini

Apoio autorizado pelo Product Owner em 04/10/2026. Achados corrigidos e testados: remoção de coautor sem perder formulário; nota sintética entre 0 e 10; coleta/obrigatoriedade de instituição coerentes em PATCH parcial; erro HTTP antes de JSON; busca CODE vazia sem filtro; critério opcional vazio omitido em vez de zero; modalidade retirada desativada apenas entre códigos anteriores, com organizationId/eventId. Modalidades próprias externas à configuração anterior não são desativadas.

A base reconciliada preserva integralmente EVO-018, matriz dos 93 critérios e edição/reagendamento #413. Docker Web compila o proxy interno via EVOLVIA_API_INTERNAL_URL (padrão Docker http://api:4000); o volume científico dedicado foi integrado no #417. Revisão assistida não substitui CI, ensaio autenticado nem encerramento formal dos Gates.

O envio do parecer reivindica a atribuição por atualização condicionada ao estado e ao escopo na mesma transação que nota/auditoria. Concorrência com envio/cancelamento/conflito retorna conflito antes de escrever parecer. Coautor e conflito declarado não são liberados por novo POST. Na UI, declarar conflito exige motivo e desativa notas/recomendação; trocar evento limpa estado da área anterior.

## Entrega integrada — 11/10/2026

PDF inicial #497 integrado/publicado em041f83b4: download privado por versão e proteção de contexto/anexo, CI38001809029; publicação job114064573887 em09/10 23:10UTC, readiness comprovada. G5.6 I/T/D; ensaio autenticado F permanece pendente. #515/#516/#517/#521 não integrados, sem crédito por emissão de contrato.

Rollback: reversão da aplicação preservando dados e certificados; nenhuma migration nesta consolidação. Gate público e negativos autenticados permanecem pendentes.
