import sys,json
sys.path.insert(0, __file__.rsplit('/',1)[0])
from eda import Board, rot
tpl=Board(sys.argv[1]); place=json.loads(sys.argv[2])
for cid in tpl.comps:
    ref=tpl.ref[cid]
    if ref not in place: continue
    x,y,a=place[ref]; f=tpl.fp[tpl.attr[cid]['Footprint']]
    out=[]
    for n,pd in sorted(f['pads'].items(),key=lambda t:int(t[0])):
        px,py=rot(pd['centerX'],pd['centerY'],a); w,h=pd['defaultPad']['width'],pd['defaultPad']['height']
        if abs(((a+(pd.get('padAngle') or 0))%180)-90)<1: w,h=h,w
        out.append(f"{n}:{tpl.padnet.get((cid,n),'')}@({x+px:.1f},{y+py:.1f}) {w:.0f}x{h:.0f}")
    from shapely import affinity
    c=affinity.translate(affinity.rotate(tpl.fp[tpl.attr[cid]['Footprint']]['court'],a,origin=(0,0)),x,y)
    print(ref,'body',[round(v,1) for v in c.bounds],' | '.join(out))
