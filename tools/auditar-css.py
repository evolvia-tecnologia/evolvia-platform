#!/usr/bin/env python3
"""
Auditor de aderência ao design system da Evolvia.
Autoria: Claude (Opus 5) — frente de Revisão Independente e Homologação Física.

Uso, a partir da raiz do repositório:
    python3 auditar-css.py apps/web
    python3 auditar-css.py apps/web --json > relatorio-css.json

Lê os tokens de apps/web/app/design-tokens.css e verifica, em cada *.css:
  1. desvio de token  — cor/raio/sombra literal onde existe token equivalente
  2. espaçamento fora da escala — px que nao corresponde a --space-*
  3. conflito de cascata — mesmo seletor redeclarado no mesmo arquivo
  4. token inexistente — var(--x) que nao esta definido
  5. !important
  6. alvo de toque — min-height/min-width abaixo de 44px em controles
Sai com codigo 1 se houver achado de severidade ALTA.
"""
import re, sys, json, pathlib, collections

SEV = {'token-inexistente':'ALTA','conflito-cascata':'ALTA','desvio-cor':'MEDIA',
       'vocabulario-paralelo':'MEDIA',
       'fora-da-escala':'BAIXA','important':'MEDIA','alvo-de-toque':'MEDIA',
       'desvio-raio':'BAIXA','desvio-sombra':'BAIXA'}

def strip_comments(css):
    return re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def load_tokens(root):
    """Canonicos vem de design-tokens.css. Tokens definidos em qualquer outro
    arquivo sao 'vocabulario paralelo': existem em runtime, mas competem com o
    sistema canonico. Ambos sao coletados para nao gerar falso positivo."""
    canon_path = pathlib.Path(root) / 'app' / 'design-tokens.css'
    canon, colors = set(), {}
    if canon_path.exists():
        txt = strip_comments(canon_path.read_text(encoding='utf-8'))
        canon = set(re.findall(r'--([a-zA-Z0-9-]+)\s*:', txt))
        for name, val in re.findall(r'--([a-zA-Z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*[;}]', txt):
            colors[val.lower()] = name
    parallel = {}
    for p in pathlib.Path(root).rglob('*.css'):
        if p == canon_path or 'node_modules' in str(p):
            continue
        txt = strip_comments(p.read_text(encoding='utf-8'))
        for name in set(re.findall(r'--([a-zA-Z0-9-]+)\s*:', txt)):
            if name not in canon:
                parallel.setdefault(name, str(p))
    return canon, colors, parallel

def rules(css):
    """Devolve (seletor_normalizado, contexto_media, linha) de cada bloco."""
    out, media, depth = [], [], 0
    for m in re.finditer(r'([^{}]+)\{|\}', css):
        line = css[:m.start()].count('\n') + 1
        if m.group(0) == '}':
            if media and depth == len(media):
                media.pop()
            depth = max(0, depth - 1)
            continue
        sel = ' '.join(m.group(1).split())
        depth += 1
        if sel.startswith('@media') or sel.startswith('@supports'):
            media.append(sel)
            continue
        if sel.startswith('@') or sel.startswith(':root'):
            continue
        for one in sel.split(','):
            out.append((' '.join(one.split()), ' && '.join(media), line))
    return out

def audit_file(path, token_names, token_colors, canon=None, parallel=None):
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

    for m in re.finditer(r'(#[0-9a-fA-F]{3,8})\b|rgba?\([^)]*\)', css):
        val = m.group(0)
        line = css[:m.start()].count('\n') + 1
        tok = token_colors.get(val.lower())
        add('desvio-cor',
            f'{val} literal' + (f' — equivale a var(--{tok})' if tok else ' — sem token equivalente'),
            line)

    scale = {int(n) for n in re.findall(r'--space-(\d+)', ' '.join(token_names))} or \
            {2,4,8,12,16,20,24,28,32,36,40,44,48,56,64,72,80,96}
    for m in re.finditer(r'(?:padding|margin|gap|row-gap|column-gap)[^:;{}]*:\s*([^;{}]+)', css):
        line = css[:m.start()].count('\n') + 1
        for num in re.findall(r'(?<![-\w.])(\d+)px', m.group(1)):
            if int(num) not in scale and int(num) != 0:
                add('fora-da-escala', f'{num}px fora da escala --space-*', line)

    for m in re.finditer(r'min-(?:height|width)\s*:\s*(\d+)px', css):
        if int(m.group(1)) < 44:
            add('alvo-de-toque', f'min-{"height" if "height" in m.group(0) else "width"}: {m.group(1)}px (< 44px)',
                css[:m.start()].count('\n') + 1)

    for m in re.finditer(r'!important', css):
        add('important', 'uso de !important', css[:m.start()].count('\n') + 1)

    seen = collections.defaultdict(list)
    for sel, media, line in rules(css):
        seen[(sel, media)].append(line)
    for (sel, media), lines in seen.items():
        if len(lines) > 1:
            ctx = f' dentro de {media}' if media else ''
            add('conflito-cascata',
                f'"{sel}"{ctx} redeclarado {len(lines)}x (linhas {", ".join(map(str, lines))})',
                lines[0])
    return found

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    root = args[0] if args else 'apps/web'
    as_json = '--json' in sys.argv
    canon, token_colors, parallel = load_tokens(root)
    token_names = canon | set(parallel)
    if not token_names:
        print(f'AVISO: design-tokens.css nao encontrado em {root}/app/', file=sys.stderr)
    files = sorted(p for p in pathlib.Path(root).rglob('*.css')
                   if 'design-tokens.css' not in p.name and 'node_modules' not in str(p))
    report, totals = {}, collections.Counter()
    for p in files:
        f = audit_file(p, token_names, token_colors, canon, parallel)
        if f:
            report[str(p)] = f
            for item in f:
                totals[item['tipo']] += 1
    if as_json:
        print(json.dumps({'resumo': dict(totals), 'arquivos': report}, ensure_ascii=False, indent=2))
    else:
        print(f'Arquivos analisados: {len(files)} | com achados: {len(report)}')
        print('Resumo:', dict(totals.most_common()))
        ordem = {'ALTA':0,'MEDIA':1,'BAIXA':2}
        for path, items in sorted(report.items(),
                                  key=lambda kv: -sum(1 for i in kv[1] if i['severidade']=='ALTA')):
            alta = sum(1 for i in items if i['severidade'] == 'ALTA')
            print(f'\n{path}  ({len(items)} achados, {alta} ALTA)')
            for i in sorted(items, key=lambda i: (ordem[i['severidade']], i['linha']))[:12]:
                print(f'  [{i["severidade"]:<5}] linha {i["linha"]:<4} {i["tipo"]:<18} {i["detalhe"]}')
            if len(items) > 12:
                print(f'  … mais {len(items)-12} achados')
    return 1 if any(i['severidade'] == 'ALTA' for f in report.values() for i in f) else 0

if __name__ == '__main__':
    sys.exit(main())
