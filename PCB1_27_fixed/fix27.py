import json, secrets, sys
src, dst = sys.argv[1], sys.argv[2]
L = open(src, encoding='utf8').read().split('\n')
recs = []
for ln in L:
    h, sep, b = ln.partition('||')
    try: hd = json.loads(h) if sep else None
    except Exception: hd = None
    bb = b.rstrip('|')
    bd = json.loads(bb) if (hd and bb) else None
    recs.append([ln, hd, bd])
def r(v): return round(v, 1)
def seg(b): return (r(b['startX']), r(b['startY']), r(b['endX']), r(b['endY']))
DEL_LINES = {('3V3', s) for s in [(122,-90,137.7,-74.3),(137.7,-74.3,139.3,-74.3),(139.3,-74.3,143.5,-70),(143.5,-70,156.4,-70)]}
DEL_LINES |= {('GND', (196.5,-466.4,196.5,-495)), ('SDA', (156.4,-95.6,156.4,-128))}
DEL_LINES |= {('SCL', s) for s in [(371.4,-518.6,371.4,-376.4),(371.4,-376.4,350.5,-355.5),(350.5,-355.5,350,-355.5),(336.8,-553.2,371.4,-518.6)]}
WIDTH = {('3V3',(22,-200,42,-180)):12, ('3V3',(42,-180,43.9,-180)):12, ('3V3',(43.9,-180,45.4,-178.5)):12, ('3V3',(102,-178.5,45.4,-178.5)):12, ('3V3',(22,-274.6,22,-200)):14}
MOVE_END = {('3V3',(296,-594,296,-483)):(296,-481)}
MOVE_START = {('3V3',(296,-483,296,-449.0)):(296,-481), ('SCL',(350,-355.5,350,-402.5)):(350,-355), ('SCL',(350,-355.5,350,-210)):(350,-355)}
HIDE = {'C2','C3','U3'}
tmpl_line = tmpl_via = None; maxt = 0; found = set(); out = []
for ln, hd, bd in recs:
    if hd and 'ticket' in hd: maxt = max(maxt, hd['ticket'])
    if hd and hd.get('type') == 'POURED': continue
    if hd and bd and hd.get('type') == 'LINE':
        tmpl_line = (hd, bd); k = (bd['netName'], seg(bd))
        if k in DEL_LINES: found.add(k); continue
        if k in WIDTH: bd['width'] = WIDTH[k]; found.add(k)
        if k in MOVE_END: bd['endX'], bd['endY'] = MOVE_END[k]; found.add(k)
        if k in MOVE_START: bd['startX'], bd['startY'] = MOVE_START[k]; found.add(k)
        ln = json.dumps(hd, separators=(',',':')) + '||' + json.dumps(bd, separators=(',',':')) + '|'
    if hd and bd and hd.get('type') == 'VIA':
        tmpl_via = (hd, bd)
        if bd['netName'] == '3V3' and bd['centerX'] == 296 and bd['centerY'] == -483: bd['centerY'] = -481; found.add('v3'); ln = json.dumps(hd, separators=(',',':')) + '||' + json.dumps(bd, separators=(',',':')) + '|'
        if bd['netName'] == 'GND' and abs(bd['centerX']-196.525) < .1 and bd['centerY'] == -495: found.add('via'); continue
    if hd and bd and hd.get('type') == 'ATTR' and bd.get('key') == 'Designator' and bd.get('value') in HIDE and bd.get('x') is not None:
        bd['valueVisible'] = False; found.add(bd['value'])
        ln = json.dumps(hd, separators=(',',':')) + '||' + json.dumps(bd, separators=(',',':')) + '|'
    out.append(ln)
need = DEL_LINES | set(WIDTH) | set(MOVE_START) | set(MOVE_END) | {'via','v3'} | HIDE
assert need <= found, need - found
new = []
PTS = []
for ln, hd, bd in recs:
    if hd and bd and hd.get('type') == 'LINE': PTS += [(bd['netName'], bd['startX'], bd['startY']), (bd['netName'], bd['endX'], bd['endY'])]
    if hd and bd and hd.get('type') == 'VIA': PTS.append((bd['netName'], bd['centerX'], bd['centerY']))
def snap(net, p):
    c = [(abs(x-p[0])+abs(y-p[1]), x, y) for n, x, y in PTS if n == net and abs(x-p[0]) < 0.3 and abs(y-p[1]) < 0.3]
    return (min(c)[1], min(c)[2]) if c else p
def addl(net, w, a, b):
    global maxt; maxt += 1
    hd = dict(tmpl_line[0], ticket=maxt, id=secrets.token_hex(8), firstTicket=maxt)
    a, b = snap(net, a), snap(net, b)
    bd = dict(tmpl_line[1], netName=net, layerId=1, width=w, startX=a[0], startY=a[1], endX=b[0], endY=b[1])
    new.append(json.dumps(hd, separators=(',',':')) + '||' + json.dumps(bd, separators=(',',':')) + '|')
def addv(net, x, y):
    global maxt; maxt += 1
    hd = dict(tmpl_via[0], ticket=maxt, id=secrets.token_hex(8), firstTicket=maxt)
    bd = dict(tmpl_via[1], netName=net, centerX=x, centerY=y, viaDiameter=24, holeDiameter=12, topSolderExpansion=None, bottomSolderExpansion=None)
    new.append(json.dumps(hd, separators=(',',':')) + '||' + json.dumps(bd, separators=(',',':')) + '|')
addl('3V3', 12, (122,-90), (142,-70)); addl('3V3', 12, (142,-70), (156.36,-70))
addl('SDA', 8, (156.36,-95.59), (148.36,-103.59)); addl('SDA', 8, (148.36,-103.59), (148.36,-120)); addl('SDA', 8, (148.36,-120), (156.4,-128))
addl('GND', 12, (86.61,-690), (28,-690)); addl('GND', 12, (307.09,-680), (362,-680))
addl('3V3', 12, (22,-461.5), (35.5,-475))
addl('GND', 12, (196.5,-466.4), (224.1,-466.4)); addl('GND', 12, (224.1,-466.4), (240,-482.3)); addv('GND', 240, -482.3)
addl('SCL', 8, (336.8,-553.2), (374.5,-515.5)); addl('SCL', 8, (374.5,-515.5), (374.5,-379.5)); addl('SCL', 8, (374.5,-379.5), (350,-355))
# insert new records right after the last LINE/VIA record of the PCB doc
idx = max(i for i, l in enumerate(out) if l.startswith('{"type":"VIA"') or l.startswith('{"type":"LINE"'))
out[idx+1:idx+1] = new
open(dst, 'w', encoding='utf8').write('\n'.join(out))
print('ok', len(new))
