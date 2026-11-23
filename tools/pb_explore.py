"""Explora o protobuf principal (tipo 0xD) de um .save sem esquema.
Uso: python3 -I pb_explore.py <arquivo> <comando> [args]
  fields                     -> campos de nível superior (nº, ocorrências)
  find <texto>               -> em quais campos aparece o texto
  peek <campo> <indice>      -> subcampos de uma ocorrência (recursivo, 2 níveis)
Somente leitura.
"""
import struct, sys, collections
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from dbpf_peek_lib import load_main_blob, varint


def parse(b, depth=0, maxdepth=2):
    """Devolve lista de (campo, fio, valor) — valor bytes (len-delim) ou int."""
    i = 0; out = []
    while i < len(b):
        key, i = varint(b, i); fn, wt = key >> 3, key & 7
        if wt == 0: v, i = varint(b, i)
        elif wt == 1: v = b[i:i + 8]; i += 8
        elif wt == 5: v = b[i:i + 4]; i += 4
        elif wt == 2:
            ln, i = varint(b, i); v = b[i:i + ln]; i += ln
        else: raise ValueError('wt %d' % wt)
        out.append((fn, wt, v))
    return out


def looks_pb(b):
    try:
        if not b: return False
        parse(b); return True
    except Exception:
        return False


def show(b, indent=0, depth=0, maxdepth=2):
    for fn, wt, v in parse(b):
        pad = ' ' * indent
        if wt == 0: print('%scampo %d = %d' % (pad, fn, v))
        elif wt in (1, 5): print('%scampo %d (fixo%d) = %s' % (pad, fn, 8 if wt == 1 else 4, v.hex()))
        else:
            txt = None
            try:
                t = v.decode('utf-8')
                if t.isprintable() and len(t) >= 2: txt = t
            except Exception: pass
            if txt is not None: print('%scampo %d texto %r' % (pad, fn, txt[:60]))
            elif depth < maxdepth and looks_pb(v):
                print('%scampo %d {%d B}' % (pad, fn, len(v))); show(v, indent + 2, depth + 1, maxdepth)
            else: print('%scampo %d bytes[%d] %s' % (pad, fn, len(v), v[:12].hex()))


path, cmd = sys.argv[1], sys.argv[2]
blob = load_main_blob(path)
top = parse(blob)
if cmd == 'fields':
    c = collections.Counter(fn for fn, _, _ in top)
    for fn, n in sorted(c.items()): print('campo', fn, 'ocorrências', n)
elif cmd == 'find':
    needle = sys.argv[3].encode()
    for fn, wt, v in top:
        if wt == 2 and needle in v:
            print('campo', fn, 'tem', v.count(needle), 'ocorrência(s) em um bloco de', len(v), 'B')
elif cmd == 'peek':
    fn_want, idx = int(sys.argv[3]), int(sys.argv[4])
    items = [v for fn, wt, v in top if fn == fn_want and wt == 2]
    print('campo %d: %d ocorrências; mostrando índice %d (%d B)' % (fn_want, len(items), idx, len(items[idx])))
    show(items[idx], 2, 0, 2)
