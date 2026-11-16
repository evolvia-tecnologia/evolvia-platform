#!/usr/bin/env python3
r"""
Auditor de aderência ao design system da Evolvia.
Autoria: Claude (Opus 5) — frente de Revisão Independente e Homologação Física.

Uso, a partir da raiz do repositório:
    python3 auditar-css.py apps/web
    python3 auditar-css.py apps/web --json > relatorio-css.json

Lê os tokens de apps/web/app/design-tokens.css e verifica, em cada *.css:
  1. desvio de token  — cor literal onde existe token equivalente
  2. espaçamento fora da escala — px que nao corresponde a --space-*
  3. conflito de cascata — mesma propriedade redeclarada no mesmo seletor
  4. token inexistente — var(--x) que nao esta definido
  5. !important
  6. alvo de toque — min-height/min-width abaixo de 44px em controles
Sai com codigo 1 se houver achado de severidade ALTA.

Correcoes de 03/11/2026, apontadas pela revisao independente na issue #571
-------------------------------------------------------------------------
A critica dizia: "corrigir regex de tokens de espacamento, cobertura rgba,
valores negativos". Fui medir, e as tres estao certas:

1. A ESCALA NUNCA ERA LIDA DOS TOKENS. A linha era

       scale = {int(n) for n in re.findall(r'--space-(\d+)', ' '.join(token_names))} or FALLBACK

   mas `token_names` guarda nomes SEM o prefixo `--` (load_tokens extrai com
   `--([a-zA-Z0-9-]+)`). Entao o padrao `--space-(\d+)` nunca casava, o
   conjunto saia vazio e a escala caia SEMPRE no palpite embutido.

   Impacto hoje: ZERO, porque o palpite coincide com a escala real do projeto.
   O defeito e LATENTE -- e e justamente por isso que merece correcao: no dia
   em que alguem mudar um --space-*, o auditor continuaria checando a escala
   velha, em silencio. Medido: trocando --space-12 de 12px para 10px, o codigo
   antigo seguiria aceitando 12px e recusando 10px, exatamente invertido.

   Agora a escala vem dos VALORES dos tokens, cai para os sufixos dos nomes se
   os valores nao forem px puros, e -- se nao achar nada -- REPROVA com
   `escala-indeterminada` em vez de adivinhar. Palpite silencioso e verde falso.

2. VALORES NEGATIVOS E FRACIONARIOS ERAM IGNORADOS. O padrao era

       (?<![-\w.])(\d+)px

   O lookbehind bloqueia o sinal, entao `-8px` nunca era visto; e o `.`
   bloqueia `12.5px`. Medido em `margin: -8px auto; padding: 12.5px; gap: 13px;
   margin-top: -13px`, o padrao antigo capturava apenas `13`.

   Agora captura sinal e fracao, e compara pelo VALOR ABSOLUTO: `-8px` e aceito
   porque 8 esta na escala, enquanto `-13px` e `12.5px` passam a aparecer.

3. COBERTURA DE COR. O padrao so via `#hex` e `rgb()/rgba()`. Cor autorada em
   `hsl()`, `oklch()`, `lab()`, `lch()`, `hwb()`, `color()` ou `color-mix()`
   passava como se nao fosse cor literal. O globals.css do projeto usa
   color-mix. Agora todas entram.

4. CONFLITO DE CASCATA ERA VERMELHO FALSO -- defeito meu, nao da critica, e na
   severidade que bloqueia. Ver o comentario em audit_file.
"""
import re, sys, json, pathlib, collections

SEV = {'token-inexistente':'ALTA','conflito-cascata':'ALTA','escala-indeterminada':'ALTA',
       'desvio-cor':'MEDIA','vocabulario-paralelo':'MEDIA',
       'fora-da-escala':'BAIXA','important':'MEDIA','alvo-de-toque':'MEDIA',
       'desvio-raio':'BAIXA','desvio-sombra':'BAIXA'}

# Sintaxes de cor literal. rgb/rgba primeiro por retrocompatibilidade do relato.
FUNCOES_DE_COR = ('rgba', 'rgb', 'hsla', 'hsl', 'oklch', 'oklab', 'lch', 'lab', 'hwb',
                  'color-mix', 'color')
PADRAO_COR = re.compile(
    r'(#[0-9a-fA-F]{3,8})\b|\b(?:' + '|'.join(FUNCOES_DE_COR) + r')\([^)]*\)', re.I)

# Captura sinal e fracao. A comparacao com a escala usa o valor absoluto.
PADRAO_PX = re.compile(r'(-?\d+(?:\.\d+)?)px')

def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def load_tokens(root):
    """Canonicos vem de design-tokens.css. Tokens definidos em qualquer outro
    arquivo sao 'vocabulario paralelo': existem em runtime, mas competem com o
    sistema canonico. Ambos sao coletados para nao gerar falso positivo.

    Devolve tambem o TEXTO do arquivo canonico, porque a escala de espacamento
    precisa dos valores dos tokens, nao so dos nomes -- ver escala_de_espacamento.
    """
    canon_path = pathlib.Path(root) / 'app' / 'design-tokens.css'
    canon, colors, texto_canon = set(), {}, ''
    if canon_path.exists():
        texto_canon = strip_comments(canon_path.read_text(encoding='utf-8'))
        canon = set(re.findall(r'--([a-zA-Z0-9-]+)\s*:', texto_canon))
        for name, val in re.findall(r'--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]', texto_canon):
            colors[val.lower()] = name
    parallel = {}
    for p in pathlib.Path(root).rglob('*.css'):
        if p == canon_path or 'node_modules' in str(p):
            continue
        txt = strip_comments(p.read_text(encoding='utf-8'))
        for name in set(re.findall(r'--([a-zA-Z0-9-]+)\s*:', txt)):
            if name not in canon:
                parallel.setdefault(name, str(p))
    return canon, colors, parallel, texto_canon

def escala_de_espacamento(texto_canon, nomes):
    """Escala real de espacamento, com a origem declarada.

    Devolve (conjunto_de_valores, origem). Conjunto vazio significa
    INDETERMINADA -- e quem chama precisa reprovar, nao adivinhar.
    """
    valores = set()
    for _, valor in re.findall(r'--(space-[a-zA-Z0-9-]+)\s*:\s*([^;}]+)', texto_canon):
        m = re.match(r'\s*(-?\d+(?:\.\d+)?)px\s*$', valor)
        if m:
            valores.add(abs(float(m.group(1))))
    if valores:
        return valores, 'valores dos tokens --space-*'
    sufixos = {float(n) for nome in nomes for n in re.findall(r'^space-(\d+(?:\.\d+)?)$', nome)}
    if sufixos:
        return sufixos, 'sufixos dos nomes --space-N (os valores nao eram px puros)'
    return set(), 'INDETERMINADA'

def propriedades_de(bloco):
    """Nomes das propriedades declaradas num bloco, sem valores.

    Usado para distinguir CONFLITO de redeclaracao inofensiva: `html` com
    scroll-behavior numa regra e com margin noutra nao conflita -- os conjuntos
    sao disjuntos. Ver o comentario em audit_file.
    """
    nomes = set()
    for parte in bloco.split(';'):
        if ':' not in parte:
            continue
        nome = parte.split(':', 1)[0].strip().lower()
        if nome and re.fullmatch(r'-?-?[a-z][a-z0-9-]*', nome):
            nomes.add(nome)
    return nomes

def rules(css):
    r"""Devolve (seletor, contexto_media, linha, propriedades) de cada bloco.

    A varredura estrutural e a original, de dois tokens -- `([^{}]+)\{` ou `\}`
    -- porque ela e o que mantem a contagem de profundidade e o contexto de
    @media corretos. Uma tentativa de capturar o bloco no mesmo padrao, com
    `([^{}]+)\{([^{}]*)\}?`, passou a consumir a chave de fechamento e quebrou
    as duas coisas: o @media sumia e a segunda regra de um mesmo seletor era
    engolida. Pego em teste antes de ir ao repositorio.

    As declaracoes sao fatiadas a parte: do fim do `{` ate a proxima chave.
    """
    out, media, depth = [], [], 0
    for m in re.finditer(r'([^{}]+)\{|\}', css):
        # A linha vem do primeiro caractere NAO branco do seletor. Usar
        # m.start() direto, como antes, apontava para antes do \n que precede o
        # seletor e devolvia a linha anterior -- off-by-one que ja existia e que
        # aparece em qualquer CSS com uma regra por linha.
        bruto = m.group(1) or ''
        inicio = m.start() + (len(bruto) - len(bruto.lstrip()))
        line = css[:inicio].count('\n') + 1
        if m.group(0) == '}':
            if media and depth == len(media):
                media.pop()
            depth = max(0, depth - 1)
            continue
        sel = ' '.join(m.group(1).split())
        resto = css[m.end():]
        proxima_chave = re.search(r'[{}]', resto)
        bloco = resto[:proxima_chave.start()] if proxima_chave else resto
        depth += 1
        if sel.startswith('@media') or sel.startswith('@supports'):
            media.append(sel)
            continue
        if sel.startswith('@') or sel.startswith(':root'):
            continue
        props = propriedades_de(bloco)
        for one in sel.split(','):
            out.append((' '.join(one.split()), ' && '.join(media), line, props))
    return out

def audit_file(path, token_names, token_colors, canon, parallel, escala):
    raw = path.read_text(encoding='utf-8')
    css = strip_comments(raw)
    found = []
    def add(kind, detail, line):
        found.append({'tipo': kind, 'severidade': SEV[kind], 'detalhe': detail, 'linha': line})

    for m in re.finditer(r'var\(\s*--([a-zA-Z0-9-]+)', css):
        name, line = m.group(1), css[:m.start()].count('\n') + 1
        if name not in token_names:
            add('token-inexistente', f'var(--{name}) nao esta definido em lugar nenhum', line)
        elif parallel and name in parallel and canon and name not in canon:
            add('vocabulario-paralelo',
                f'var(--{name}) vem de {parallel[name]}, fora do sistema canonico', line)

    for m in PADRAO_COR.finditer(css):
        val = m.group(0)
        line = css[:m.start()].count('\n') + 1
        tok = token_colors.get(val.lower())
        add('desvio-cor',
            f'{val} literal' + (f' — equivale a var(--{tok})' if tok else ' — sem token equivalente'),
            line)

    # Escala indeterminada reprova uma vez, nao por declaracao.
    if not escala:
        add('escala-indeterminada',
            'nao foi possivel determinar a escala --space-* em design-tokens.css; '
            'o auditor NAO adivinha escala -- corrija os tokens ou aponte o --root certo', 1)
    else:
        for m in re.finditer(r'(?:padding|margin|gap|row-gap|column-gap)[^:;{}]*:\s*([^;{}]+)', css):
            line = css[:m.start()].count('\n') + 1
            for bruto in PADRAO_PX.findall(m.group(1)):
                valor = float(bruto)
                if valor == 0:
                    continue
                if abs(valor) not in escala:
                    sinal = ' (negativo; comparado pelo valor absoluto)' if valor < 0 else ''
                    add('fora-da-escala', f'{bruto}px fora da escala --space-*{sinal}', line)

    for m in re.finditer(r'min-(?:height|width)\s*:\s*(\d+(?:\.\d+)?)px', css):
        if float(m.group(1)) < 44:
            add('alvo-de-toque',
                f'min-{"height" if "height" in m.group(0) else "width"}: {m.group(1)}px (< 44px)',
                css[:m.start()].count('\n') + 1)

    for m in re.finditer(r'!important', css):
        add('important', 'uso de !important', css[:m.start()].count('\n') + 1)

    #
    # Conflito de cascata exige a MESMA PROPRIEDADE, nao so o mesmo seletor.
    #
    # A versao anterior reportava qualquer seletor repetido, com severidade
    # ALTA -- e ALTA reprova a execucao. Rodando contra o globals.css real do
    # projeto, isso produziu 8 achados ALTA em CSS perfeitamente idiomatico:
    #
    #     html{scroll-behavior:smooth}
    #     html,body{margin:0;min-height:100%;...}
    #
    # `html` aparece duas vezes, mas as propriedades sao DISJUNTAS: agrupar o
    # comum e depois especializar e a forma normal de escrever CSS. Chamar isso
    # de conflito e reprovar a build era vermelho falso -- no meu proprio
    # auditor, na severidade que bloqueia.
    #
    # Agora so e conflito quando os conjuntos de propriedades se intersectam, e
    # a mensagem nomeia quais. Redeclaracao com propriedades disjuntas nao gera
    # achado nenhum. No globals.css real: de 8 ALTA para 1, e a que ficou e
    # genuina -- `.empty-illustration i` redeclara `background`.
    #
    seen = collections.defaultdict(list)
    for sel, media, line, props in rules(css):
        seen[(sel, media)].append((line, props))
    for (sel, media), ocorrencias in seen.items():
        if len(ocorrencias) < 2:
            continue
        repetidas = collections.Counter()
        for _, props in ocorrencias:
            for nome in props:
                repetidas[nome] += 1
        conflitantes = sorted(nome for nome, n in repetidas.items() if n > 1)
        if not conflitantes:
            continue
        linhas = [str(line) for line, _ in ocorrencias]
        ctx = f' dentro de {media}' if media else ''
        mostrar = ', '.join(conflitantes[:6]) + (f' e mais {len(conflitantes) - 6}' if len(conflitantes) > 6 else '')
        add('conflito-cascata',
            f'"{sel}"{ctx} redeclara {mostrar} em {len(ocorrencias)} regras '
            f'(linhas {", ".join(linhas)})',
            ocorrencias[0][0])
    return found

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    root = args[0] if args else 'apps/web'
    as_json = '--json' in sys.argv
    canon, token_colors, parallel, texto_canon = load_tokens(root)
    token_names = canon | set(parallel)
    if not token_names:
        print(f'AVISO: design-tokens.css nao encontrado em {root}/app/', file=sys.stderr)
    escala, origem_escala = escala_de_espacamento(texto_canon, token_names)
    files = sorted(p for p in pathlib.Path(root).rglob('*.css')
                   if 'design-tokens.css' not in p.name and 'node_modules' not in str(p))
    report, totals = {}, collections.Counter()
    for p in files:
        f = audit_file(p, token_names, token_colors, canon, parallel, escala)
        if f:
            report[str(p)] = f
            for item in f:
                totals[item['tipo']] += 1
    if as_json:
        print(json.dumps({'escala': {'valores': sorted(escala), 'origem': origem_escala},
                          'resumo': dict(totals), 'arquivos': report},
                         ensure_ascii=False, indent=2))
    else:
        print(f'Arquivos analisados: {len(files)} | com achados: {len(report)}')
        print(f'Escala de espacamento: {sorted(int(v) if v == int(v) else v for v in escala) or "INDETERMINADA"}')
        print(f'  origem: {origem_escala}')
        print('Resumo:', dict(totals.most_common()))
        ordem = {'ALTA':0,'MEDIA':1,'BAIXA':2}
        for path, items in sorted(report.items(),
                                  key=lambda kv: -sum(1 for i in kv[1] if i['severidade']=='ALTA')):
            alta = sum(1 for i in items if i['severidade'] == 'ALTA')
            print(f'\n{path}  ({len(items)} achados, {alta} ALTA)')
            for i in sorted(items, key=lambda i: (ordem[i['severidade']], i['linha']))[:12]:
                print(f'  [{i["severidade"]:<5}] linha {i["linha"]:<4} {i["tipo"]:<20} {i["detalhe"]}')
            if len(items) > 12:
                print(f'  … mais {len(items)-12} achados')
    return 1 if any(i['severidade'] == 'ALTA' for f in report.values() for i in f) else 0

if __name__ == '__main__':
    sys.exit(main())
