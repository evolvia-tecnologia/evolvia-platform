# Padrão de UX — jornada científica

## Objetivo

Toda tela, etapa e campo criado na jornada científica da Evolvia deve ensinar o organizador a decidir **se precisa daquela informação**, **para que ela será usada**, **como preenchê-la** e **qual é o próximo passo**.

Este padrão é obrigatório para A3–A9 e para módulos científicos transversais, incluindo comunicação, presença, certificados e relatórios.

A experiência deve ser pensada para um organizador que não conhece a arquitetura da Evolvia e não precisa conhecer termos técnicos para colocar o evento no ar.

## Princípio principal: fluxo antes de formulário

Nenhum módulo deve nascer como uma coleção de campos. Antes de criar a tela, deve ser desenhada a sequência mental do organizador:

1. **O que estou configurando?**
2. **Por que isso existe?**
3. **Preciso disso no meu evento?**
4. **Qual é a menor informação necessária agora?**
5. **O que a Evolvia já pode sugerir ou preencher por mim?**
6. **O que posso deixar para depois?**
7. **O que acontece quando eu concluir esta etapa?**

A interface deve apresentar as decisões nessa mesma ordem, evitando exigir informações que ainda não façam sentido naquele momento.

## Baixo esforço e baixa carga cognitiva

A jornada científica deve ser rápida e pouco cansativa. Para isso:

- dividir configurações extensas em etapas curtas e progressivas;
- mostrar primeiro apenas os campos essenciais;
- revelar campos avançados ou opcionais somente quando necessários;
- usar recomendações e valores padrão seguros sempre que possível;
- reutilizar dados já cadastrados em vez de pedir novamente;
- permitir **Decidir depois** quando a decisão não bloquear o próximo passo;
- salvar automaticamente sempre que tecnicamente seguro;
- manter o progresso visível;
- mostrar uma próxima ação clara em vez de deixar o organizador decidir sozinho por onde continuar;
- evitar telas com muitos campos simultâneos;
- não pedir configuração futura antes de existir contexto para ela;
- nunca obrigar o organizador a entender termos técnicos internos da plataforma.

## Regra obrigatória por campo

Sempre que aplicável, cada campo deve apresentar:

1. **Rótulo em português e linguagem operacional**, evitando nomes técnicos internos.
2. **Explicação curta de uso**, deixando claro quando o organizador deve preencher ou quando pode deixar em branco.
3. **Exemplo realista**, coerente com eventos científicos.
4. **Placeholder útil** quando o controle permitir.
5. **Indicação explícita de opcionalidade** quando o dado não for obrigatório.
6. **Explicação do impacto** quando a informação alimentar programação, comunicação, avaliação, presença, certificados ou outro Gate.

Exemplo de padrão visual:

- Campo: `Instituição (opcional)`
- Ajuda: `Informe a universidade, empresa, hospital ou entidade à qual o membro está vinculado.`
- Exemplo: `Universidade Federal de Minas Gerais`.

## Recomendações antes de perguntas abertas

Quando houver uma configuração comum para aquele perfil de evento, a Evolvia deve priorizar:

- **Usar recomendação** — aplica uma configuração segura e comum;
- **Personalizar** — abre somente os campos necessários para alterar a recomendação;
- **Decidir depois** — mantém a pendência visível sem interromper a montagem do evento quando isso for seguro.

O organizador não deve começar por uma tela vazia quando a plataforma já conhece uma configuração provável.

## EVA como suporte permanente e contextual

A EVA deve ser parte da experiência, não um recurso separado escondido em outro menu.

Em cada etapa, a interface deve permitir que a EVA ajude o organizador a entender:

- o objetivo da etapa atual;
- por que determinado campo existe;
- se aquele campo é necessário para o evento configurado;
- exemplos de preenchimento;
- consequências de escolher uma opção;
- quais dados serão usados em Gates futuros;
- o que ainda está pendente;
- qual é o próximo passo recomendado.

A EVA deve aparecer de forma discreta, mas facilmente acessível. A ajuda pode ser apresentada por orientação contextual na própria tela e por uma ação clara como **Perguntar à EVA** ou equivalente.

A EVA não deve tomar decisões irreversíveis pelo organizador. Ela recomenda, explica, aponta riscos e prepara ações; publicação, envio definitivo e decisões críticas permanecem sob ação humana ou regra previamente configurada.

## Comportamento esperado da EVA

Quando o organizador demonstrar dúvida ou abrir ajuda de um campo, a EVA deve responder primeiro no contexto daquele campo, sem obrigá-lo a explicar novamente onde está.

Exemplo:

- Campo atual: `Tipo de participação`.
- Pergunta esperada: `Não sei qual escolher.`
- Resposta contextual da EVA: explicar Palestrante, Moderador, Debatedor e Coordenador de sessão, sugerindo o tipo mais provável conforme a atividade já cadastrada.

A EVA também deve poder sugerir correções quando identificar inconsistências, mas sem alterar silenciosamente dados importantes.

## Continuidade entre etapas

Cada Gate deve terminar mostrando:

- o que foi concluído;
- o que ficou pendente;
- o que pode ser feito depois;
- qual é o próximo Gate recomendado;
- por que esse próximo Gate depende do que acabou de ser configurado.

O usuário nunca deve chegar ao fim de uma tela e ficar sem saber o que fazer em seguida.

## Nomenclatura oficial da experiência científica

A interface voltada ao organizador passa a usar os seguintes termos:

- **Grade científica** no lugar de “Estrutura científica”.
- **Tipo de participação** no lugar de “Papéis”.
- **Nome do Membro da Programação Científica** como rótulo para identificação das pessoas que compõem a jornada científica.

Os nomes internos de código, tabelas, rotas e APIs podem permanecer estáveis quando a alteração não trouxer benefício técnico, evitando migrations ou refactors sem necessidade. A nomenclatura acima é obrigatória na experiência visível ao usuário.

## Aplicação no Gate A3

O A3 deve explicar, com exemplos, no mínimo:

- Nome do Membro da Programação Científica;
- e-mail;
- instituição;
- ORCID;
- nome e descrição do Tipo de participação;
- vínculo entre membro e Tipo de participação;
- nome e descrição de comissão;
- integrante, Tipo de participação na comissão e responsável principal;
- nível da classificação científica;
- área superior ou subárea superior;
- nome e descrição de Área, Subárea e Tema.

O fluxo deve favorecer a sequência: **membro → tipo de participação → comissões → classificação científica**, sem obrigar o organizador a completar tudo de uma vez.

## Aplicação no Gate A4

O A4 deve explicar, com exemplos, no mínimo:

- reutilização de membro da Grade científica versus criação de novo membro;
- Nome do Membro da Programação Científica;
- e-mail;
- instituição;
- Tipo de participação;
- Tipo de participação personalizado;
- cargo ou título profissional;
- mini bio;
- acessibilidade;
- apoio técnico;
- assunto do convite;
- mensagem do convite e tags disponíveis;
- validade do link de confirmação.

O fluxo deve favorecer a sequência: **escolher/reutilizar membro → definir participação → completar apenas dados públicos necessários → preparar convite → revisar → gerar link → registrar envio → acompanhar resposta**.

## Aplicação no Gate A5

O A5 deve favorecer a sequência **Quando acontece? → Onde acontece? → O que acontece? → Quem participa? → Informações adicionais (opcional) → Revisar conflitos**.

A criação inicial deve pedir apenas o necessário para formar uma atividade. Descrição, taxonomia e observações operacionais ficam recolhidas como opcionais.

Campos e exemplos mínimos:

- **Nome do espaço:** identifica sala, auditório, palco ou ambiente virtual. Exemplo: `Auditório Principal`.
- **Capacidade:** opcional e usada apenas quando houver número confiável. Exemplo: `300`.
- **Localização:** opcional. Exemplo: `2º andar, ala norte`.
- **Título da atividade:** nome público da atividade. Exemplo: `Novas diretrizes em insuficiência cardíaca`.
- **Tipo da atividade:** formato compreensível pelo participante. Exemplo: `Mesa-redonda`.
- **Início e término:** alimentam conflitos e a futura carga horária; atividades consecutivas não devem gerar conflito artificial.
- **Espaço:** pode ficar sem definição durante o rascunho quando o organizador ainda estiver estruturando a grade.
- **Nome do Membro da Programação Científica:** sempre reutilizado de A3/A4, sem cadastro paralelo.
- **Tipo de participação:** específico por atividade; a mesma pessoa pode exercer funções diferentes em atividades distintas.
- **Outra função:** exige rótulo claro. Exemplo: `Facilitadora`.
- **Área → Subárea → Tema:** opcional quando a configuração do evento permitir. Exemplo: `Saúde → Cardiologia → Insuficiência cardíaca`.
- **Observações operacionais:** opcionais. Exemplo: `Microfone de lapela e retorno de palco`.

Conflitos devem ser explicados em português, mostrando o problema e a próxima ação. A EVA pode recomendar correção, mas nunca trocar horário, espaço, pessoa ou status silenciosamente.

O planejamento da programação não deve ser apresentado como evidência de presença. A interface deve deixar claro que presença/check-in posterior complementará a informação para certificados e relatórios.

## Critério de aceite de UX

Nenhum novo formulário científico deve ser considerado concluído apenas porque os campos funcionam tecnicamente. O critério de aceite de UX inclui verificar se um organizador sem conhecimento prévio consegue:

- entender o que está configurando em poucos segundos;
- identificar o próximo passo sem consultar manual;
- completar a etapa sem preencher campos desnecessários;
- entender cada campo e ver um exemplo de preenchimento correto;
- saber quando pode pular ou decidir depois;
- perceber o progresso da configuração;
- acessar a EVA no contexto exato da dúvida;
- concluir a tarefa com o mínimo razoável de cliques e digitação;
- entender o efeito das escolhas nas etapas seguintes.

Se a tela for tecnicamente correta, mas cansativa, confusa ou depender de suporte humano para ser compreendida, ela ainda não atende ao padrão de qualidade da Evolvia.
