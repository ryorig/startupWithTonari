import sys; sys.path.insert(0,'tools4')
from eda import Board
from shapely.geometry import Point, LineString
B=Board(sys.argv[1])
items=[]  # (net, layers, geom, label)
for p in B.pads: items.append((p['net'], {1,2} if p['hole'] is not None else {p.get('layerId',1) or 1}, p['shape'], f"{p['ref']}.{p['num']}", 'pad'))
for v in B.vias: items.append((v['netName'], {1,2}, Point(v['centerX'],v['centerY']).buffer(v['viaDiameter']/2), f"via({v['centerX']},{v['centerY']})", 'via'))
for l in B.lines: items.append((l['netName'], {l['layerId']}, LineString([(l['startX'],l['startY']),(l['endX'],l['endY'])]), f"trk {l['netName']} L{l['layerId']} ({l['startX']},{l['startY']})-({l['endX']},{l['endY']})", 'trk', l))
par=list(range(len(items)))
def f(a):
    while par[a]!=a: par[a]=par[par[a]]; a=par[a]
    return a
for i,a in enumerate(items):
    if a[4]!='trk': continue
    l=a[5]
    for e in [(l['startX'],l['startY']),(l['endX'],l['endY'])]:
        hit=False
        for j,b in enumerate(items):
            if j==i or b[0]!=a[0] or not (a[1]&b[1]): continue
            if b[4]=='trk':
                bl=b[5]
                ok = (abs(bl['startX']-e[0])<1e-6 and abs(bl['startY']-e[1])<1e-6) or (abs(bl['endX']-e[0])<1e-6 and abs(bl['endY']-e[1])<1e-6) or b[2].distance(Point(e))<1e-6
            else:
                ok = b[2].contains(Point(e)) or b[2].distance(Point(e))<1e-6
            if ok: par[f(i)]=f(j); hit=True
        if not hit: print('UNCONNECTED END', a[3], e)
nets={}
for i,a in enumerate(items):
    if a[0]: nets.setdefault(a[0],{}).setdefault(f(i),[]).append(a[3] if a[4]!='trk' else None)
for n,g in nets.items():
    gs=[[x for x in v if x] for v in g.values()]
    gs=[x for x in gs if x]
    if len(gs)>1: print('NET',n,'copper groups (excluding pours):',len(gs), gs if n!='GND' else [x for x in gs if not any(y.startswith('via') for y in x)])
