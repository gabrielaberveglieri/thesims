"""Levantamento somente-leitura de um pacote DBPF (.save do The Sims 4).
Uso: python3 -I dbpf_survey.py <arquivo>
Não descomprime nem executa nada: só lê cabeçalho e índice e imprime estatísticas.
"""
import struct, sys, collections

path = sys.argv[1]
data = open(path, 'rb').read()
print('tamanho:', len(data), 'bytes')
print('magic:', data[:4])
if data[:4] != b'DBPF':
    sys.exit('não é DBPF')

major, minor = struct.unpack_from('<II', data, 4)
count = struct.unpack_from('<I', data, 0x24)[0]
index_size = struct.unpack_from('<I', data, 0x2C)[0]
index_off = struct.unpack_from('<I', data, 0x40)[0] or struct.unpack_from('<I', data, 0x28)[0]
print('versão DBPF: %d.%d | entradas: %d | índice @%d (%d bytes)' % (major, minor, count, index_off, index_size))

pos = index_off
flags = struct.unpack_from('<I', data, pos)[0]; pos += 4
const = {}
for bit, name in ((0, 'type'), (1, 'group'), (2, 'inst_hi')):
    if flags & (1 << bit):
        const[name] = struct.unpack_from('<I', data, pos)[0]; pos += 4
print('flags índice: 0x%x constantes: %s' % (flags, {k: hex(v) for k, v in const.items()}))

entries = []
for _ in range(count):
    t = const.get('type'); g = const.get('group'); ih = const.get('inst_hi')
    if t is None: t = struct.unpack_from('<I', data, pos)[0]; pos += 4
    if g is None: g = struct.unpack_from('<I', data, pos)[0]; pos += 4
    if ih is None: ih = struct.unpack_from('<I', data, pos)[0]; pos += 4
    il, off, fsz, msz, comp, _u = struct.unpack_from('<IIIIHH', data, pos); pos += 20
    entries.append((t, g, (ih << 32) | il, off, fsz & 0x7FFFFFFF, msz, comp))

by_type = collections.defaultdict(lambda: [0, 0, 0, collections.Counter()])
for t, g, i, off, fsz, msz, comp in entries:
    b = by_type[t]; b[0] += 1; b[1] += fsz; b[2] += msz; b[3][comp] += 1

print('\ntipo(hex)   qtd   bytes_no_arquivo   bytes_descomprimidos   compressão')
for t, (n, f, m, c) in sorted(by_type.items(), key=lambda kv: -kv[1][1]):
    print('0x%08X  %4d  %16d  %20d   %s' % (t, n, f, m, {hex(k): v for k, v in c.items()}))
