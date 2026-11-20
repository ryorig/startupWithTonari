"""Write a new PCB1.epru from the template, replacing placement/tracks/vias/outline/pours."""
import json, random, zipfile, os


def poly_path(pts):
    out = [pts[0][0], pts[0][1], 'L']
    for x, y in pts[1:] + [pts[0]]:
        out += [round(x, 4), round(y, 4)]
    return out


def write(template_epru, out_epru, design):
    lines = open(template_epru, encoding='utf8').read().split('\n')
    tick = [0]
    for l in lines:
        if '"ticket":' in l:
            try:
                tick[0] = max(tick[0], json.loads(l.split('||')[0]).get('ticket', 0))
            except Exception:
                pass
    rnd = random.Random(1234)

    def nid():
        return '%016x' % rnd.getrandbits(64)

    def nt():
        tick[0] += 1
        return tick[0]

    pcb_start = [i for i, l in enumerate(lines) if '"docType":"PCB"' in l][0]
    extra = []
    for f in design.get('extra_docs', []):
        extra += [x for x in open(f, encoding='utf8').read().split('\n') if x.strip()]
    lines = lines[:pcb_start] + extra + lines[pcb_start:]
    drop = set(design.get('drop_docs', ()))
    if drop:
        kept, skip = [], False
        for l in lines:
            if l.startswith('{"type":"DOCHEAD"}'):
                skip = json.loads(l.split('||')[1].rstrip('|')).get('uuid') in drop
            if not skip:
                kept.append(l)
        lines = kept
    pcb_start += len(extra)
    ref_by_id = {}
    for l in lines[pcb_start:]:
        if '"type":"ATTR"' in l and '"key":"Designator"' in l:
            b = json.loads(l.split('||')[1].rstrip('|'))
            ref_by_id[b['parentId']] = b['value']
    out = []
    in_pcb = False
    wson_doc = False
    cur_doc = None
    for i, l in enumerate(lines):
        if not l.strip():
            out.append(l)
            continue
        h, _, b = l.partition('||')
        hd = json.loads(h)
        if hd.get('type') == 'DOCHEAD':
            bd = json.loads(b.rstrip('|'))
            in_pcb = bd.get('docType') == 'PCB'
            wson_doc = bd.get('uuid') == '81b44bad1897123f'
            cur_doc = bd.get('uuid')
            out.append(l)
            continue
        if cur_doc in design.get('remove_silk_footprints', ()) and hd['type'] == 'POLY' and json.loads(b.rstrip('|')).get('layerId') == 3:
            continue   # no outline silkscreen on tiny passives (dense 10 mm board)
        if cur_doc == '2ea6cb579acf7d13' and hd['type'] == 'POLY' and hd.get('id') in design.get('remove_u1_inner_silk', ()):
            continue   # silkscreen rectangles printed under the MAX30102 LGA body
        if wson_doc and hd['type'] == 'FILL' and design.get('remove_tmp117_ep'):
            bd = json.loads(b.rstrip('|'))
            if bd.get('layerId') == 50 and bd['path'] and bd['path'][0][:2] == [-15.748, 31.496]:
                continue
        if wson_doc and hd['type'] == 'PAD':
            bd = json.loads(b.rstrip('|'))
            if bd['num'] == '7' and design.get('remove_tmp117_ep'):
                continue   # TI DRV0006B land pattern: no centre land, thermal pad not soldered
            if bd['num'] == '7' and design.get('tmp117_ep_no_paste'):
                bd['topPasteExpansion'] = design['tmp117_ep_no_paste']
                l = h + '||' + json.dumps(bd, ensure_ascii=False, separators=(',', ':')) + '|'
            out.append(l)
            continue
        if not in_pcb:
            out.append(l)
            continue
        t = hd['type']
        if t in ('LINE', 'VIA', 'POURED'):
            continue
        rm_ids = {cid for cid, r in ref_by_id.items() if r in design.get('remove_components', ())}
        if t == 'COMPONENT' and hd['id'] in rm_ids:
            continue
        if t in ('ATTR', 'ELE_PLACEHOLDER') and b.strip('|') and json.loads(b.rstrip('|')).get('parentId') in rm_ids:
            continue
        if t == 'PAD_NET' and json.loads(hd['id'])[1] in rm_ids:
            continue
        if t == 'PAD_NET':
            pid = json.loads(hd['id'])
            if design.get('remove_tmp117_ep') and ref_by_id.get(pid[1]) == 'U2' and pid[2] == '7':
                continue
            ov = design.get('pad_net_override', {}).get((ref_by_id.get(pid[1]), pid[2]))
            if ov is not None:
                bd0 = json.loads(b.rstrip('|')); bd0['padNet'] = ov
                out.append(h + '||' + json.dumps(bd0, ensure_ascii=False, separators=(',', ':')) + '|')
                continue
        bd = json.loads(b.rstrip('|'))
        if t == 'COMPONENT':
            ref = ref_by_id[hd['id']]
            x, y, a = design['place'][ref]
            bd['x'], bd['y'], bd['angle'] = x, y, a
        elif t == 'ATTR' and bd.get('key') == 'Device' and ref_by_id.get(bd.get('parentId')) in design.get('device_swap', {}):
            bd['value'] = design['device_swap'][ref_by_id[bd['parentId']]]
        elif t == 'ATTR' and bd.get('key') == 'Designator':
            ref = bd['value']
            d = design.get('labels', {}).get(ref)
            if d is None:
                bd['valueVisible'] = False
            else:
                bd['x'], bd['y'] = d[0], d[1]
                bd['angle'] = d[2] if len(d) > 2 else 0
                bd['fontSize'] = design.get('label_size', 30)
                bd['strokeWidth'] = design.get('label_stroke', 5)
                bd['valueVisible'] = True
        elif t == 'POLY' and bd.get('polyType') == 'BOARD_OUTLINE':
            bd['path'] = poly_path(design['outline'])
        elif t == 'POUR':
            layer = bd['layerId']
            bd['path'] = [poly_path(design['pour'][layer])]
        if t == 'ATTR' and isinstance(bd.get('angle'), (int, float)):
            bd['angle'] = bd['angle'] % 360
        out.append(h + '||' + json.dumps(bd, ensure_ascii=False, separators=(',', ':')) + '|')
    # append new tracks and vias at end of PCB doc (PCB doc is last)
    for net, layer, w, pts in design['tracks']:
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            t = nt()
            hd = {"type": "LINE", "ticket": t, "id": nid(), "firstTicket": t}
            bd = {"partitionId": "", "groupId": 0, "netName": net, "layerId": layer, "startX": round(x1, 4),
                  "startY": round(y1, 4), "endX": round(x2, 4), "endY": round(y2, 4), "width": w, "locked": False,
                  "zIndex": -1}
            out.insert(len(out) - (1 if out and not out[-1].strip() else 0),
                       json.dumps(hd, separators=(',', ':')) + '||' + json.dumps(bd, separators=(',', ':')) + '|')
    for net, x, y, vdia, vhole, vmask in design['vias']:
        vtop, vbot = (vmask if isinstance(vmask, tuple) else (vmask, vmask))
        t = nt()
        hd = {"type": "VIA", "ticket": t, "id": nid(), "firstTicket": t}
        bd = {"partitionId": "", "groupId": 0, "netName": net, "ruleName": "", "centerX": round(x, 4),
              "centerY": round(y, 4), "holeDiameter": vhole, "viaDiameter": vdia,
              "viaType": "NORMAL", "topSolderExpansion": vtop, "bottomSolderExpansion": vbot, "locked": False,
              "unusedInnerLayers": []}
        out.insert(len(out) - (1 if out and not out[-1].strip() else 0),
                   json.dumps(hd, separators=(',', ':')) + '||' + json.dumps(bd, separators=(',', ':')) + '|')
    open(out_epru, 'w', encoding='utf8').write('\n'.join(out))


def pack(epru, image_dir, project_json, out_zip):
    with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(project_json, 'project2.json')
        for f in os.listdir(image_dir):
            z.write(os.path.join(image_dir, f), 'IMAGE/' + f)
        z.write(epru, 'PCB1.epru')
