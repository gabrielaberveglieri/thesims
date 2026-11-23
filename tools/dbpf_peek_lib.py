"""Descomprime (RefPack) recursos escolhidos de um DBPF e resume o conteúdo.
Uso: python3 -I dbpf_peek.py <arquivo> <tipo_hex> [max_entradas]
Somente leitura. Não executa conteúdo do arquivo.
"""
import struct, sys, re, collections

def refpack(src):
    if src[1] != 0xFB:
        raise ValueError('cabeçalho RefPack inesperado: %r' % src[:2])
    big = src[0] & 0x80
    pos = 2
    if src[0] & 0x01:  # tamanho comprimido presente
        pos += 4 if big else 3
    n = 4 if big else 3
    usize = int.from_bytes(src[pos:pos + n], 'big'); pos += n
    out = bytearray()
    while pos < len(src):
        b0 = src[pos]; pos += 1
        if b0 < 0x80:
            b1 = src[pos]; pos += 1
            plain = b0 & 3; copy = ((b0 & 0x1C) >> 2) + 3; off = ((b0 & 0x60) << 3) + b1 + 1
        elif b0 < 0xC0:
            b1, b2 = src[pos], src[pos + 1]; pos += 2
            plain = (b1 & 0xC0) >> 6; copy = (b0 & 0x3F) + 4; off = ((b1 & 0x3F) << 8) + b2 + 1
        elif b0 < 0xE0:
            b1, b2, b3 = src[pos], src[pos + 1], src[pos + 2]; pos += 3
            plain = b0 & 3; copy = ((b0 & 0x0C) << 6) + b3 + 5; off = ((b0 & 0x10) << 12) + (b1 << 8) + b2 + 1
        elif b0 < 0xFC:
            plain = ((b0 & 0x1F) << 2) + 4; copy = 0; off = 0
        else:
            plain = b0 & 3; copy = 0; off = 0
        out += src[pos:pos + plain]; pos += plain
        for _ in range(copy):
            out.append(out[-off])
    if len(out) != usize:
        print('  aviso: tamanho esperado %d, obtido %d' % (usize, len(out)))
    return bytes(out)

def varint(b, i):
    r = 0; s = 0
    while True:
        c = b[i]; i += 1
        r |= (c & 0x7F) << s; s += 7
        if not c & 0x80: return r, i

def pb_top(b):
    """Resume campos de nível superior de um protobuf SEM esquema (número do campo, tipo de fio)."""
    i = 0; stats = collections.defaultdict(lambda: [0, 0, 0])
    try:
        while i < len(b):
            key, i = varint(b, i); fn, wt = key >> 3, key & 7
            if wt == 0: _, i = varint(b, i); ln = 0
            elif wt == 1: i += 8; ln = 8
            elif wt == 5: i += 4; ln = 4
            elif wt == 2:
                ln, i = varint(b, i); i += ln
            else: raise ValueError('wire type %d' % wt)
            s = stats[(fn, wt)]; s[0] += 1; s[1] += ln; s[2] = max(s[2], ln)
        return stats, i == len(b)
    except Exception as e:
        return stats, False


def load_main_blob(path, want=0xD):
    data = open(path, 'rb').read()
    count = struct.unpack_from('<I', data, 0x24)[0]
    pos = struct.unpack_from('<I', data, 0x40)[0] + 8
    best = None
    for _ in range(count):
        t, ih = struct.unpack_from('<II', data, pos)
        il, off, fsz, msz, comp, _u = struct.unpack_from('<IIIIHH', data, pos + 8); pos += 28
        if t != want: continue
        fsz &= 0x7FFFFFFF
        raw = data[off:off + fsz]
        blob = refpack(raw) if comp == 0xFFFF else raw
        if best is None or len(blob) > len(best): best = blob
    return best
