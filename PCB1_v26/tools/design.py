"""New layout for PCB1 (all coordinates in mil, y negative = down)."""
import sys, math, json
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from eda import Board, rot
from shapely.geometry import Point

TPL = sys.argv[1]
OUT = sys.argv[2]
tpl = Board(TPL)
FPOF = {}
for cid in tpl.comps:
    FPOF[tpl.ref[cid]] = tpl.fp[tpl.attr[cid]['Footprint']]['pads']

W = 400
U = -390          # MAX30102 centre y
CX1 = 228         # MAX30102 centre x
place = {
    'U2': (167, -95, 270),       # TMP117 on the isolated arm
    'C1': (151, -180, 180),
    'U1': (CX1, U, 180),         # MAX30102
    'C5': (110, U + 110, 180),   # 10uF VLED
    'C6': (118, U + 63, 180),    # 100nF VLED
    'C4': (145, U - 16.54, 270), # 100nF VDD (bridges VDD/GND pins)
    'U3': (80, U - 135, 90),     # LDO 1.8 V
    'C3': (66, U - 40, 0),       # 1uF LDO out
    'C2': (0, 0, 0),             # 1uF LDO in   (set below)
    'P1': (200, U - 180, 90),    # INT header
    'R3': (0, 0, 0),
    'R1': (0, 0, 0),
    'R2': (0, 0, 0),
    'CN2': (200, 0, 0),
}
for k, v in json.loads(sys.argv[3]).items() if len(sys.argv) > 3 else []:
    place[k] = tuple(v)


def P(ref, num):
    x, y, a = place[ref]
    pd = FPOF[ref][str(num)]
    px, py = rot(pd['centerX'], pd['centerY'], a)
    return (round(x + px, 3), round(y + py, 3))


tracks = []
vias = []
def T(net, layer, w, *pts):
    tracks.append((net, layer, w, [tuple(p) for p in pts]))
def VIA(net, x, y):
    vias.append((net, x, y))
    return (x, y)

exec(open(__file__.rsplit('/', 1)[0] + '/route.py').read())

H = place_H

# ---- 45-degree chamfer of every corner (no 90-degree bends) ----
CH = 20.0
junction_pts = [p for (_, _, _, pts) in tracks for p in (pts[0], pts[-1])] + [(x, y) for (_, x, y) in vias]
def _is_junction(pt, own):
    n = sum(1 for q in junction_pts if abs(q[0] - pt[0]) < 0.6 and abs(q[1] - pt[1]) < 0.6)
    return n > 0
skipped = []
new_tracks = []
for net, layer, w, pts in tracks:
    pts = [tuple(map(float, p)) for p in pts]
    for _ in range(3):
        out = [pts[0]]
        changed = False
        for i in range(1, len(pts) - 1):
            a, b, c = out[-1], pts[i], pts[i + 1]
            v1 = (b[0] - a[0], b[1] - a[1]); v2 = (c[0] - b[0], c[1] - b[1])
            l1, l2 = math.hypot(*v1), math.hypot(*v2)
            if l1 < 1e-6 or l2 < 1e-6:
                continue
            cosang = (v1[0] * v2[0] + v1[1] * v2[1]) / l1 / l2
            turn = math.degrees(math.acos(max(-1, min(1, cosang))))
            if turn > 45.5:
                if _is_junction(b, None):
                    skipped.append((net, b, round(turn)))
                    out.append(b); continue
                d = min(CH, 0.45 * l1, 0.45 * l2)
                out.append((b[0] - v1[0] / l1 * d, b[1] - v1[1] / l1 * d))
                out.append((b[0] + v2[0] / l2 * d, b[1] + v2[1] / l2 * d))
                changed = True
            else:
                out.append(b)
        out.append(pts[-1])
        pts = out
        if not changed:
            break
    new_tracks.append((net, layer, w, [(round(x, 3), round(y, 3)) for x, y in pts]))
tracks = new_tracks
if skipped:
    print('corner at junction NOT chamfered:', skipped)
outline = [(85, 0), (255, 0), (255, -215), (W, -215), (W, -H), (0, -H), (0, -215), (85, -215)]
pour = [(20, -215), (W - 20, -215), (W - 20, -H + 20), (20, -H + 20)]
design = dict(place={k: v for k, v in place.items()}, tracks=tracks, vias=vias, outline=outline,
              pour={1: pour, 2: pour}, via_hole=12.0, via_dia=24.0, remove_tmp117_ep=True, remove_u1_inner_silk=tuple('e%d' % i for i in range(21, 29)),
              pad_net_override={('CN2', '5'): 'GND', ('CN2', '6'): 'GND'},
              labels={}, label_size=32, label_stroke=6)
sys.path.insert(0, __file__.rsplit('/', 1)[0])
import writer
writer.write(TPL, OUT, design)
# ---- auto-place reference designators (silkscreen) ----
from shapely.geometry import box as _box
from shapely.ops import unary_union as _uu
B = Board(OUT)
FS = design['label_size']
padg = _uu([p['shape'].buffer(2) for p in B.pads])   # pad + solder-mask expansion
from eda import shape_from_path as _sfp
from shapely import affinity as _aff
silk_of = {}
for _cid, _c in B.comps.items():
    _fd = [dd for dd in B.docs if dd['head'].get('uuid') == B.attr[_cid]['Footprint']][0]
    _g = [_sfp(bb['path']) for hh, bb in _fd['items'] if hh['type'] == 'POLY' and bb.get('layerId') == 3]
    if _g:
        silk_of[B.ref[_cid]] = _aff.translate(_aff.rotate(_uu([g.buffer(4) for g in _g]), _c.get('angle') or 0, origin=(0, 0)), _c['x'], _c['y'])
inner = B.outline.buffer(-10)
taken = []
labels = {}
order = ['U1', 'U2', 'U3', 'CN2', 'P1', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'R1', 'R2', 'R3']
for ref in order:
    c = B.courts[ref]; minx, miny, maxx, maxy = c.bounds
    own = _uu([c] + [p['shape'] for p in B.pads if p['ref'] == ref]).bounds
    w = len(ref) * FS * 0.75
    cands = []
    for dx in range(0, 60, 4):
        cands += [(own[0] - w - 4 - dx, (own[1] + own[3]) / 2 - FS / 2), (own[2] + 4 + dx, (own[1] + own[3]) / 2 - FS / 2),
                  ((own[0] + own[2]) / 2 - w / 2, own[3] + 4 + dx), ((own[0] + own[2]) / 2 - w / 2, own[1] - FS - 4 - dx)]
    others = _uu([cc for r, cc in B.courts.items() if r != ref] + [silk_of[r] for r in silk_of if r != ref])
    for x, y in cands:
        bx = _box(x, y, x + w, y + FS)
        if not inner.contains(bx): continue
        if bx.distance(padg) < 6: continue
        if bx.intersects(others) or bx.intersects(c): continue
        if any(bx.distance(t) < 6 for t in taken): continue
        if B.vias and min(bx.distance(Point(v['centerX'], v['centerY']).buffer(12)) for v in B.vias) < 4: continue
        labels[ref] = (round(x, 1), round(y, 1), 0); taken.append(bx); break
design['labels'] = labels
writer.write(TPL, OUT, design)
print('labels placed:', sorted(labels), 'not placed:', sorted(set(order) - set(labels)))
print('written', OUT, 'H=', H, 'mil =', round(H / 39.37, 2), 'mm; W=', round(W / 39.37, 2), 'mm')
