# Padrão de UX — campos da jornada científica

## Objetivo

Todo campo criado na jornada científica da Evolvia deve ensinar o organizador a decidir **se precisa daquela informação**, **para que ela será usada** e **como preenchê-la**.

Este padrão é obrigatório para A3–A9 e para módulos científicos transversais, incluindo comunicação, presença, certificados e relatórios.

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

## Regra para os próximos Gates

Nenhum novo formulário científico deve ser considerado concluído apenas porque os campos funcionam tecnicamente. O critério de aceite de UX inclui verificar se um organizador sem conhecimento prévio consegue entender:

- o que o campo significa;
- por que ele existe;
- se precisa preenchê-lo;
- um exemplo de preenchimento correto;
- qual será o efeito daquela informação nas etapas seguintes.
