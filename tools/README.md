# tools/auditar-css.py

Auditor de aderência ao design system. Sem dependências além do Python 3.

```bash
python3 tools/auditar-css.py apps/web          # relatório legível
python3 tools/auditar-css.py apps/web --json   # saída para CI
```

Verifica, em cada `.css`:

| Achado | Severidade |
|---|---|
| `var(--x)` não definido em lugar nenhum | ALTA |
| Seletor redeclarado no mesmo arquivo e contexto | ALTA |
| Token fora de `design-tokens.css` (vocabulário paralelo) | MÉDIA |
| Cor literal onde existe token equivalente | MÉDIA |
| `!important` | MÉDIA |
| `min-height`/`min-width` abaixo de 44 px | MÉDIA |
| Espaçamento fora da escala `--space-*` | BAIXA |

Sai com código 1 em achado de severidade ALTA, servindo como gate de CI.

Autoria: Claude (Opus 5) — frente de Revisão Independente e Homologação Física.
