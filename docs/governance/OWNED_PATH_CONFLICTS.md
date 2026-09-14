# Detecção de conflitos entre owned paths

Antes de iniciar duas frentes paralelas, registre os caminhos reservados em um arquivo JSON local:

```json
{
  "fronts": [
    { "id": "codex:302", "paths": ["scripts/detect-owned-path-conflicts.mjs"] },
    { "id": "cursor:294", "paths": ["docs/quality/"] }
  ]
}
```

Diretórios terminam com `/`; os demais valores representam arquivos. Execute:

```bash
node scripts/detect-owned-path-conflicts.mjs /caminho/para/frentes.json
```

## Códigos de saída

- `0`: contrato válido e nenhuma sobreposição;
- `1`: entrada inválida;
- `2`: conflito entre frentes.

O resultado JSON é mínimo, ordenado e independente da ordem de entrada. A ferramenta normaliza `./` e separadores, mas rejeita caminhos absolutos, travessia com `..`, segmentos ambíguos, caracteres de controle, duplicidades internas e identificadores livres que possam carregar dados pessoais.

O comando lê somente o arquivo explicitamente informado. Não usa rede, shell, GitHub, secrets, conteúdo dos arquivos reservados ou dados pessoais. Ele previne escrita concorrente, mas não substitui a leitura do `AGENTS.md`, a conferência do `develop` vivo nem a revisão humana do contrato de cada tarefa.

## Rollback

Remover o script, seu teste e este documento. Não há dependência, migration, persistência ou efeito externo.
