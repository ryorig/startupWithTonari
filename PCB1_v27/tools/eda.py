"""Read EasyEDA Pro .epru (PCB1) into geometry. Units: mil. y grows upward (board y is negative)."""
import json, math
from shapely.geometry import Polygon, box, Point, LineString
from shapely.ops import unary_union


def parse_epru(path):
    docs = []
    cur = None
    for ln in open(path, encoding='utf8'):
        ln = ln.rstrip('\n')
        if not ln.strip():
            continue
        h, _, b = ln.partition('||')
        hd = json.loads(h)
        b = b.rstrip('|')
        bd = json.loads(b) if b else None
        if bd is None and hd.get('type') != 'DOCHEAD':
            continue   # EasyEDA tombstone (deleted object)
        if hd.get('type') == 'DOCHEAD':
            cur = {'head': bd, 'items': []}
            docs.append(cur)
        else:
            cur['items'].append((hd, bd))
    return docs


def path_to_coords(path):
    """[x,y,'L',x,y,...] (optionally ARC) -> list of points; CIRCLE/R handled separately."""
    pts = [(path[0], path[1])]
    i = 2
    while i < len(path):
        t = path[i]
        if t == 'L':
            i += 1
            continue
        if t == 'ARC':
            ang = path[i + 1]
            x2, y2 = path[i + 2], path[i + 3]
            x0, y0 = pts[-1]
            th = math.radians(ang)
            d = math.hypot(x2 - x0, y2 - y0)
            if abs(th) > 1e-6 and d > 0:
                r = d / 2 / math.sin(abs(th) / 2)
                mx, my = (x0 + x2) / 2, (y0 + y2) / 2
                h = math.sqrt(max(r * r - (d / 2) ** 2, 0))
                nx, ny = -(y2 - y0) / d, (x2 - x0) / d
                s = 1 if th > 0 else -1
                cx, cy = mx + s * nx * h, my + s * ny * h
                a0 = math.atan2(y0 - cy, x0 - cx)
                for k in range(1, 12):
                    a = a0 + th * k / 12
                    pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
            pts.append((x2, y2))
            i += 4
            continue
        pts.append((path[i], path[i + 1]))
        i += 2
    return pts


def shape_from_path(path):
    if path and path[0] == 'R':
        x, y, w, h = path[1:5]
        return box(x, y - h, x + w, y)
    if path and path[0] == 'CIRCLE':
        return Point(path[1], path[2]).buffer(path[3])
    pts = path_to_coords(path)
    if len(pts) >= 3:
        return Polygon(pts).buffer(0)
    return LineString(pts)


def rot(x, y, ang):
    a = math.radians(ang)
    return x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)


class Board:
    def __init__(self, path):
        self.docs = parse_epru(path)
        self.fp = {}
        for d in self.docs:
            if d['head'].get('docType') == 'FOOTPRINT':
                pads = {}
                court = []
                for h, b in d['items']:
                    if h['type'] == 'PAD':
                        pads[b['num']] = b
                    if h['type'] in ('POLY', 'FILL') and b.get('layerId') == 48:
                        p = b['path']
                        if p and isinstance(p[0], list):
                            for q in p:
                                court.append(shape_from_path(q))
                        else:
                            court.append(shape_from_path(p))
                self.fp[d['head']['uuid']] = {'pads': pads, 'court': unary_union(court) if court else None}
        pcb = [d for d in self.docs if d['head'].get('docType') == 'PCB'][0]
        self.items = pcb['items']
        it = self.items
        self.comps = {h['id']: b for h, b in it if h['type'] == 'COMPONENT'}
        self.attr = {}
        self.attr_obj = {}
        for h, b in it:
            if h['type'] == 'ATTR' and b.get('parentId') in self.comps:
                self.attr.setdefault(b['parentId'], {})[b['key']] = b['value']
                self.attr_obj.setdefault(b['parentId'], {})[b['key']] = b
        self.padnet = {}
        for h, b in it:
            if h['type'] == 'PAD_NET':
                i = json.loads(h['id'])
                self.padnet[(i[1], i[2])] = b['padNet']
        self.lines = [b for h, b in it if h['type'] == 'LINE']
        self.vias = [b for h, b in it if h['type'] == 'VIA']
        self.pours = [b for h, b in it if h['type'] == 'POUR']
        ol = [b for h, b in it if h['type'] == 'POLY' and b.get('polyType') == 'BOARD_OUTLINE']
        self.outline = shape_from_path(ol[0]['path'])
        self.ref = {cid: self.attr[cid]['Designator'] for cid in self.comps}
        self.build_pads()

    def build_pads(self):
        self.pads = []
        self.courts = {}
        for cid, c in self.comps.items():
            f = self.fp[self.attr[cid]['Footprint']]
            ang = c.get('angle') or 0
            for n, pd in f['pads'].items():
                px, py = rot(pd['centerX'], pd['centerY'], ang)
                x, y = c['x'] + px, c['y'] + py
                w, h = pd['defaultPad']['width'], pd['defaultPad']['height']
                tot = (ang + (pd.get('padAngle') or 0)) % 180
                if abs(tot - 90) < 1:
                    w, h = h, w
                layer = pd['layerId']
                shp = box(x - w / 2, y - h / 2, x + w / 2, y + h / 2)
                hole = None
                if pd.get('hole') and pd['hole'].get('width'):
                    hole = Point(x, y).buffer(pd['hole']['width'] / 2)
                self.pads.append(dict(cid=cid, ref=self.ref[cid], num=n, x=x, y=y, w=w, h=h,
                                      layer=layer, net=self.padnet.get((cid, n), ''), shape=shp, hole=hole))
            if f['court'] is not None:
                from shapely import affinity
                s = affinity.rotate(f['court'], ang, origin=(0, 0))
                s = affinity.translate(s, c['x'], c['y'])
                self.courts[self.ref[cid]] = s
