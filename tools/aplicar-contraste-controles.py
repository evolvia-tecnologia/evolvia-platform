#!/usr/bin/env python3
"""Migra a borda dos controles de interface para --color-border-interactive.

Por que isto e um script e nao um commit pronto: apps/web/app/globals.css tem
31 KB de CSS denso, e eu alterei quatro declaracoes. Transmitir o arquivo
inteiro por reescrita arrisca perder um byte em algum lugar — ja aconteceu
duas vezes nesta frente, com arquivos bem menores, por perda de codificacao no
transporte. Um script que faz quatro substituicoes exatas e confere o SHA do
resultado nao tem esse risco: ou produz exatamente o arquivo esperado, ou
recusa e nao escreve nada.

O que ele faz:
  .input, .select      borda do campo de formulario
  .btn-secondary       borda do botao secundario
  .pending-toggle      borda do alternador de pendencias
  .capability-toggle   borda do alternador de capability

O que ele NAO faz, de proposito:
  - nao escurece --color-border: divisor decorativo nao precisa de 3:1
  - nao mexe em .option, .profile-option, .choice-card, .subject-area nem
    .capability-card. Sao cartoes de escolha grandes, com texto dentro: o
    componente e identificavel pelo proprio texto, e ali a borda e decorativa.
    Se a decisao de produto for tratar o cartao como controle, basta acrescentar
    o seletor aqui E em SELETORES_DE_CONTROLE no spec de contraste.
  - nao mexe em .selection-mark, que usa --color-border como PREENCHIMENTO de
    um ponto de 20 px, nao como borda. Em 1,31:1 o ponto nao-selecionado e
    praticamente invisivel, o que tambem e 1.4.11 (estado do componente), mas
    escurecer um disco solido muda peso visual de um jeito que eu nao consigo
    avaliar sem ver a tela. Fica registrado para quem puder olhar.

Uso:
    python3 tools/aplicar-contraste-controles.py            # aplica
    python3 tools/aplicar-contraste-controles.py --conferir # so verifica

Depois:
    cd tests/e2e && EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contraste
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ALVO = RAIZ / "apps" / "web" / "app" / "globals.css"

# SHA de blob git do arquivo ANTES e DEPOIS. Verificados em 02/11/2026 contra
# claude/qa-contrato-perfis-contraste.
SHA_ANTES = "83927d989b5ad8d6ed65945167ee5324fdaa4847"
SHA_DEPOIS = "ac5b1386cdce76bf61d08d04e85ba7492fc924cd"

TROCAS: list[tuple[str, str]] = [
    (
        ".input,.select{width:100%;border:1px solid var(--border);",
        ".input,.select{width:100%;border:1px solid var(--color-border-interactive);",
    ),
    (
        ".btn-secondary{background:var(--color-surface);color:var(--ink);border:1px solid var(--border)}",
        ".btn-secondary{background:var(--color-surface);color:var(--ink);"
        "border:1px solid var(--color-border-interactive)}",
    ),
    (
        ".pending-toggle{border:1px solid var(--border);",
        ".pending-toggle{border:1px solid var(--color-border-interactive);",
    ),
    (
        ".capability-toggle{margin-top:auto;align-self:flex-start;border:1px solid var(--color-border-strong);",
        ".capability-toggle{margin-top:auto;align-self:flex-start;"
        "border:1px solid var(--color-border-interactive);",
    ),
]


def blob(dados: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(dados) + dados).hexdigest()


def main() -> int:
    somente_conferir = "--conferir" in sys.argv

    if not ALVO.exists():
        print(f"ERRO: nao achei {ALVO}", file=sys.stderr)
        return 1

    original = ALVO.read_bytes()
    atual = blob(original)

    if atual == SHA_DEPOIS:
        print("Migracao ja aplicada: globals.css esta no estado esperado.")
        return 0

    if atual != SHA_ANTES:
        print(
            f"ERRO: globals.css nao esta no estado que este script conhece.\n"
            f"  encontrado: {atual}\n"
            f"  esperado:   {SHA_ANTES}\n\n"
            "O arquivo mudou desde 02/11. NAO vou escrever em cima: reveja as quatro\n"
            "substituicoes a mao e atualize os SHAs deste script.",
            file=sys.stderr,
        )
        return 1

    texto = original.decode("utf-8")
    for velho, novo in TROCAS:
        ocorrencias = texto.count(velho)
        if ocorrencias != 1:
            print(
                f"ERRO: esperava 1 ocorrencia, achei {ocorrencias}:\n  {velho[:70]}...",
                file=sys.stderr,
            )
            return 1
        texto = texto.replace(velho, novo)

    resultado = texto.encode("utf-8")
    final = blob(resultado)
    if final != SHA_DEPOIS:
        print(
            f"ERRO: o resultado nao confere.\n  obtido:   {final}\n  esperado: {SHA_DEPOIS}\n\n"
            "Nada foi escrito.",
            file=sys.stderr,
        )
        return 1

    if somente_conferir:
        print(f"Conferido: as quatro substituicoes produzem {final}. Nada foi escrito.")
        return 0

    ALVO.write_bytes(resultado)
    print(f"Aplicado. globals.css agora e {final} ({len(resultado)} bytes).")
    print("Quatro bordas de controle migradas para --color-border-interactive.")
    print("\nConfira com:")
    print("  cd tests/e2e && EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contraste")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
