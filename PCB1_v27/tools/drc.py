"""Independent DRC / connectivity / pour simulation on a written PCB1.epru.  usage: drc.py file.epru [png]"""
import sys, math, itertools
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from eda import Board, shape_from_path
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

CL = 8.0          # copper clearance target (mil)  JLC min 5 mil, pad-to-track rec. 0.2 mm
EDGE = 15.0       # copper to board edge target    (JLC: >= 0.2-0.3 mm routed edge)
HOLE = 19.7       # hole-to-hole 0.5 mm
VIA_PAD = 8.0     # via copper to any pad
COMP = 10.0       # component envelope spacing
POUR_CL = [10.0, 20.0]
MINW = {'GND': 10, '3V3': 12, '1.8V': 10, 'SDA': 8, 'SCL': 8, 'INT': 8}

B = Board(sys.argv[1])
MX = 'U4' if 'U4' in B.courts else 'U1'
viol = []
def V(kind, msg):
    viol.append((kind, msg))

objs = []   # (kind, net, layers(set), geom, label, extra)
for p in B.pads:
    layers = {1, 2} if p['layer'] == 12 else {p['layer']}
    objs.append(('pad', p['net'], layers, p['shape'], f"{p['ref']}.{p['num']}", p))
for i, l in enumerate(B.lines):
    g = LineString([(l['startX'], l['startY']), (l['endX'], l['endY'])]).buffer(l['width'] / 2, cap_style=1)
    objs.append(('trk', l['netName'], {l['layerId']}, g, f"trk{i}:{l['netName']}@L{l['layerId']}", l))
for i, v in enumerate(B.vias):
    g = Point(v['centerX'], v['centerY']).buffer(v['viaDiameter'] / 2)
    objs.append(('via', v['netName'], {1, 2}, g, f"via{i}:{v['netName']}({v['centerX']:.0f},{v['centerY']:.0f})", v))

# --- widths
for l in B.lines:
    if l['width'] + 1e-6 < MINW.get(l['netName'], 8):
        V('width', f"{l['netName']} track {l['width']} < {MINW.get(l['netName'])} at ({l['startX']},{l['startY']})")

# --- clearances
for a, b in itertools.combinations(objs, 2):
    if not (a[2] & b[2]):
        continue
    if a[0] == 'pad' and b[0] == 'pad' and a[5]['ref'] == b[5]['ref']:
        continue
    d = a[3].distance(b[3])
    same = a[1] == b[1] and a[1] != ''
    if 'via' in (a[0], b[0]) and 'pad' in (a[0], b[0]):
        if d < VIA_PAD:
            V('via-pad', f"{a[4]} ~ {b[4]} dist {d:.1f}")
        continue
    if not same and d < CL:
        V('clearance', f"{a[4]} ~ {b[4]} dist {d:.1f}")

# --- holes
holes = [(Point(v['centerX'], v['centerY']).buffer(v['holeDiameter'] / 2), f"via({v['centerX']:.0f},{v['centerY']:.0f})") for v in B.vias]
holes += [(p['hole'], p['ref']) for p in B.pads if p['hole'] is not None]
for (g1, n1), (g2, n2) in itertools.combinations(holes, 2):
    if g1.distance(g2) < HOLE:
        V('hole', f"{n1} ~ {n2} {g1.distance(g2):.1f}")

# --- edge
edge = B.outline.boundary
for o in objs:
    d = o[3].distance(edge)
    if d < EDGE or not B.outline.contains(o[3]):
        V('edge', f"{o[4]} edge dist {d:.1f}")
for ref, c in B.courts.items():
    if not B.outline.buffer(0.5).contains(c):
        V('court-out', f"{ref} body outside board")

# --- component spacing (body + pads envelope)
env = {}
for ref, c in B.courts.items():
    env[ref] = unary_union([c] + [p['shape'] for p in B.pads if p['ref'] == ref])
for r1, r2 in itertools.combinations(env, 2):
    d = env[r1].distance(env[r2])
    if d < COMP:
        V('comp-space', f"{r1} ~ {r2} {d:.1f}")

# --- dangling ends & acute angles
for i, l in enumerate(B.lines):
    for x, y in ((l['startX'], l['startY']), (l['endX'], l['endY'])):
        pt = Point(x, y)
        hit = 0
        for o in objs:
            if o[1] == l['netName'] and l['layerId'] in o[2] and not (o[0] == 'trk' and o[5] is l) and o[3].distance(pt) < 0.5:
                hit = 1
                break
        if not hit:
            V('dangling', f"{l['netName']} end ({x},{y}) L{l['layerId']}")
ends = {}
for i, l in enumerate(B.lines):
    for e, (x, y) in enumerate(((l['startX'], l['startY']), (l['endX'], l['endY']))):
        ends.setdefault((round(x, 1), round(y, 1), l['layerId'], l['netName']), []).append((i, e))
tj = []
for k, lst in ends.items():
    def vec(i, e):
        a = B.lines[i]
        pa = (a['endX'], a['endY']) if e == 0 else (a['startX'], a['startY'])
        return (pa[0] - k[0], pa[1] - k[1])
    angs = []
    for (i, e), (j, f) in itertools.combinations(lst, 2):
        v1, v2 = vec(i, e), vec(j, f)
        n1, n2 = math.hypot(*v1), math.hypot(*v2)
        if n1 and n2:
            angs.append(math.degrees(math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n1 / n2)))))
    in_pad = any(p['shape'].buffer(0.5).contains(Point(k[0], k[1])) for p in B.pads)
    if len(lst) == 2 and angs and angs[0] < 134.5 and not in_pad:
        V('bend', f"{k[3]} L{k[2]} corner at ({k[0]},{k[1]}) turns {180 - angs[0]:.0f} deg (>45)")
    if len(lst) >= 3 and angs:
        tj.append((k, round(min(angs))))
    if angs and min(angs) < 89.9 and not any(p['shape'].buffer(0.5).contains(Point(k[0], k[1])) for p in B.pads):
        V('acute', f"{k[3]} at ({k[0]},{k[1]}) {min(angs):.0f} deg")
# T-junctions where a track ends on the middle of another track
for i, l in enumerate(B.lines):
    for x, y in ((l['startX'], l['startY']), (l['endX'], l['endY'])):
        for j, m in enumerate(B.lines):
            if j == i or m['netName'] != l['netName'] or m['layerId'] != l['layerId']:
                continue
            seg = LineString([(m['startX'], m['startY']), (m['endX'], m['endY'])])
            if seg.distance(Point(x, y)) < 0.5 and Point(x, y).distance(Point(m['startX'], m['startY'])) > 1 and Point(x, y).distance(Point(m['endX'], m['endY'])) > 1:
                tj.append(((round(x, 1), round(y, 1), l['layerId'], l['netName']), 'on-segment'))
print('T-junctions (branch points, info):', tj)

# --- keepouts: area between the pad rows (= under the package body)
def inner_area(ref):
    ps = [p for p in B.pads if p['ref'] == ref and p['net'] != '' or (p['ref'] == ref and p['w'] * p['h'] < 1500)]
    ps = [p for p in B.pads if p['ref'] == ref and p['w'] * p['h'] < 1500]
    xs = [p['x'] for p in ps]; ys = [p['y'] for p in ps]
    c = B.courts[ref].bounds
    if len(set(round(x) for x in xs)) <= 2:   # two columns left/right
        mid = (max(xs) + min(xs)) / 2
        l = max(p['shape'].bounds[2] for p in ps if p['x'] < mid); r = min(p['shape'].bounds[0] for p in ps if p['x'] > mid)
        return box(l + 2, c[1], r - 2, c[3])
    mid = (max(ys) + min(ys)) / 2
    b_ = max(p['shape'].bounds[3] for p in ps if p['y'] < mid); t_ = min(p['shape'].bounds[1] for p in ps if p['y'] > mid)
    return box(c[0], b_ + 2, c[2], t_ - 2)
u2in = inner_area('U2')
for o in objs:
    if o[0] == 'pad' and o[5]['ref'] == 'U2':
        continue
    own = unary_union([p['shape'] for p in B.pads if p['ref'] == 'U2']).buffer(0.5)
    if o[3].difference(own).intersects(u2in.buffer(10)):           # both layers, 10 mil margin
        V('u2-keepout', f"{o[4]} under TMP117")
if any(p['ref'] == 'U2' and p['num'] == '7' for p in B.pads):
    V('u2-keepout', 'TMP117 thermal pad land still present')
u1in = inner_area(MX)
U1UNDER = []
for o in objs:
    own = unary_union([p['shape'] for p in B.pads if p['ref'] == MX]).buffer(0.5)
    if o[0] in ('trk', 'via') and (1 in o[2]) and o[3].difference(own).intersects(u1in):
        U1UNDER.append(o[4])

# --- footprint silkscreen vs foreign pads / bodies
from shapely import affinity
for cid, c in B.comps.items():
    ref = B.ref[cid]
    fdoc = [d for d in B.docs if d['head'].get('uuid') == B.attr[cid]['Footprint']][0]
    silk = []
    for h, b in fdoc['items']:
        if h['type'] in ('POLY',) and b.get('layerId') == 3:
            g = shape_from_path(b['path'])
            g = g.buffer(b.get('width', 6) / 2) if g.geom_type == 'LineString' else g.boundary.buffer(b.get('width', 6) / 2)
            silk.append(g)
    if not silk: continue
    sg = affinity.translate(affinity.rotate(unary_union(silk), c.get('angle') or 0, origin=(0, 0)), c['x'], c['y'])
    for p in B.pads:
        if p['ref'] != ref and sg.intersects(p['shape'].buffer(2)):
            V('silk-fp', f"{ref} outline silk over pad {p['ref']}.{p['num']} ({sg.intersection(p['shape']).area:.0f} mil2)")
    for r2, body in B.courts.items():
        if r2 != ref and sg.intersection(body).area > 1:
            V('silk-fp', f"{ref} outline silk under body of {r2} ({sg.intersection(body).area:.0f} mil2)")
    if ref == MX:
        inner = B.courts[MX].buffer(-8)
        if sg.intersection(inner).area > 1:
            V('silk-fp', f"U1 own silk under LGA body ({sg.intersection(inner).area:.0f} mil2)")

# --- thermal balance of 2-pin passives (tombstoning)
for ref in sorted({p['ref'] for p in B.pads if p['ref'][0] in 'CR' and p['ref'][1:].isdigit()}):
    ws = []
    for p in [q for q in B.pads if q['ref'] == ref]:
        w = sum(l['width'] for l in B.lines if l['layerId'] == 1 and l['netName'] == p['net'] and
                ((p['shape'].distance(Point(l['startX'], l['startY'])) < 0.5) != (p['shape'].distance(Point(l['endX'], l['endY'])) < 0.5)))
        if p['net'] == 'GND': w += 20    # two 10-mil thermal spokes from the pour
        ws.append(w)
    if min(ws) == 0 or max(ws) / min(ws) > 2.5:
        V('tombstone', f"{ref} copper per pad {ws} (ratio > 2.5)")

# --- pour simulation + connectivity
def pour_pieces(layer, c):
    pp = [p for p in B.pours if p['layerId'] == layer]
    if not pp:
        return []
    region = unary_union([shape_from_path(q) for p in pp for q in p['path']]).intersection(B.outline.buffer(-EDGE))
    foreign = [o[3].buffer(c) for o in objs if layer in o[2] and o[1] != 'GND']
    foreign += [p['hole'].buffer(c) for p in B.pads if p['hole'] is not None and p['net'] != 'GND']
    fill = region.difference(unary_union(foreign)) if foreign else region
    fill = fill.buffer(-2).buffer(2)   # pours drop slivers narrower than ~4 mil
    geoms = list(getattr(fill, 'geoms', [fill]))
    return [g for g in geoms if g.area > 50]

report_pour = {}
for c in POUR_CL:
    nodes = list(range(len(objs)))
    par = list(range(len(objs)))
    def f(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    def u(a, b):
        par[f(a)] = f(b)
    for i, j in itertools.combinations(range(len(objs)), 2):
        a, b = objs[i], objs[j]
        if a[1] == b[1] and a[1] and (a[2] & b[2]) and a[3].distance(b[3]) < 0.01:
            u(i, j)
    pieces = []
    for layer in (1, 2):
        for g in pour_pieces(layer, c):
            idx = len(par); par.append(idx)
            pieces.append((idx, layer, g))
            for i, o in enumerate(objs):
                if o[1] != 'GND' or layer not in o[2]:
                    continue
                if o[0] in ('via', 'trk') and g.distance(o[3]) < 0.01:
                    u(i, idx)
                elif o[0] == 'pad' and g.distance(o[3]) <= c + 0.5:
                    u(i, idx)   # thermal spokes
    dead = [p for p in pieces if not any(f(i) == f(p[0]) for i, o in enumerate(objs) if o[1] == 'GND')]
    nets = {}
    for i, o in enumerate(objs):
        if o[0] == 'pad' and o[1]:
            nets.setdefault(o[1], {}).setdefault(f(i), []).append(o[4])
    report_pour[c] = (nets, len(pieces), len(dead), sum(p[2].area for p in pieces if p[1] == 2))
for c, (nets, npc, nd, area2) in report_pour.items():
    for n, groups in nets.items():
        if len(groups) > 1:
            V('open', f"pour_cl={c}: net {n} split into {len(groups)}: {list(groups.values())}")
    print(f"pour clearance {c}: pieces={npc} isolated={nd} bottom pour area={area2/1550.0031:.1f} mm2")

# --- labels (silk) : rough text box, must not touch pads and must be inside board
for cid, ao in B.attr_obj.items():
    a = ao.get('Designator')
    if not a or not a.get('valueVisible') or a.get('x') is None:
        continue
    fs = a.get('fontSize', 30)
    w = len(a['value']) * fs * 0.75
    ang = (a.get('angle') or 0) % 180
    bx = box(a['x'], a['y'], a['x'] + w, a['y'] + fs) if ang < 45 else box(a['x'] - fs, a['y'], a['x'], a['y'] + w)
    for p in B.pads:
        if bx.distance(p['shape']) < 6:
            V('silk', f"label {a['value']} touches pad {p['ref']}.{p['num']}")
    if not B.outline.buffer(-5).contains(bx):
        V('silk', f"label {a['value']} outside board")

bot = unary_union(pour_pieces(2, POUR_CL[0])); topp = unary_union(pour_pieces(1, POUR_CL[0]))
for net in ('SDA', 'SCL', 'INT'):
    tot = 0; bad = 0
    for l in B.lines:
        if l['netName'] != net: continue
        g = LineString([(l['startX'], l['startY']), (l['endX'], l['endY'])])
        ref_plane = bot if l['layerId'] == 1 else topp
        trans = unary_union([Point(v['centerX'], v['centerY']).buffer(35) for v in B.vias if v['netName'] == net] +
                            [p['shape'].buffer(35) for p in B.pads if p['net'] == net and p['layer'] == 12] + [Point(0, 0).buffer(0.01)])
        tot += g.length; bb = g.difference(ref_plane.buffer(2)).difference(trans).length; bad += bb
        if bb > 5: print('   no-plane segment', net, 'L', l['layerId'], (l['startX'], l['startY']), (l['endX'], l['endY']), round(bb))
    intended = unary_union([shape_from_path(q) for pp in B.pours for q in pp['path']]).buffer(20)   # area where a plane is intended
    arm = sum(LineString([(l['startX'], l['startY']), (l['endX'], l['endY'])]).difference(intended).length for l in B.lines if l['netName'] == net)
    print(f"return path {net}: {tot:.0f} mil routed, {bad:.0f} mil without GND plane on the other layer (of which {arm:.0f} mil in the intentionally pour-free TMP117 zone)")
    if bad - arm > 40:
        V('return-path', f"{net}: {bad - arm:.0f} mil of trace (outside the arm) has no GND plane beneath")
print('INFO tracks/vias under the MAX3010x body (SparkFun-style, clearance checked above):', len(U1UNDER))
print('board bbox (mm):', [round(v / 39.37, 2) for v in B.outline.bounds])
kinds = {}
for k, m in viol:
    kinds.setdefault(k, []).append(m)
for k, ms in kinds.items():
    print(f"== {k}: {len(ms)}")
    for m in ms[:40]:
        print('   ', m)
print('TOTAL VIOLATIONS', len(viol))

if len(sys.argv) > 2:
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Polygon as MP
    def draw(ax, g, **kw):
        for gg in getattr(g, 'geoms', [g]):
            if gg.is_empty: continue
            ax.add_patch(MP(list(gg.exterior.coords), closed=True, **kw))
            for hole in gg.interiors:
                ax.add_patch(MP(list(hole.coords), closed=True, fc='white', ec='none'))
    fig, axs = plt.subplots(1, 2, figsize=(12, 14))
    for ax, layer in zip(axs, (1, 2)):
        draw(ax, B.outline, fc='#f4f4f4', ec='m', lw=1)
        for g in pour_pieces(layer, POUR_CL[0]):
            draw(ax, g, fc=(0.25, 0.65, 0.3, 0.35), ec='none')
        for ref, c in B.courts.items():
            if layer == 1:
                draw(ax, c, fc='none', ec='0.5', lw=0.6, ls='--')
                cx, cy = c.centroid.x, c.centroid.y
        for o in objs:
            if layer not in o[2]: continue
            col = {'GND': '#2e7d32', '3V3': '#c62828', '1.8V': '#ef6c00', 'SDA': '#1565c0', 'SCL': '#6a1b9a', 'INT': '#00838f'}.get(o[1], '#777')
            if o[0] == 'pad':
                draw(ax, o[3], fc='orange', ec='k', lw=0.3)
                ax.text(o[5]['x'], o[5]['y'], f"{o[5]['ref']}.{o[5]['num']}\n{o[1]}", fontsize=3.6, ha='center', va='center')
            elif o[0] == 'trk':
                draw(ax, o[3], fc=col, ec='none', alpha=0.9)
            else:
                draw(ax, o[3], fc='0.55', ec='k', lw=0.3)
                ax.text(o[5]['centerX'], o[5]['centerY'], o[1], fontsize=3.4, ha='center', va='center', color='w')
        minx, miny, maxx, maxy = B.outline.bounds
        ax.set_xlim(minx - 10, maxx + 10); ax.set_ylim(miny - 10, maxy + 10); ax.set_aspect('equal')
        ax.set_title('TOP' if layer == 1 else 'BOTTOM')
    fig.savefig(sys.argv[2], dpi=130, bbox_inches='tight')
