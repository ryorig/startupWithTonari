# executed inside design.py  (place, P, T, VIA, W available)   --- v25 ---
U = -395
CX1 = 228
CC = 190            # connector centre x
CY = -823           # connector centre y
place.update({
    'U2': (167, -95, 270),
    'C1': (150.46, -180, 180),
    'U1': (CX1, U, 180),
    'C5': (100, U + 110, 180),
    'C6': (118, U + 63, 180),
    'C4': (140, U - 16.54, 270),
    'C3': (102, U - 16.54, 270),
    'U3': (80, U - 131, 90),
    'C2': (41, U - 200, 270),
    'P1': (205, -583, 90),
    'R3': (114, -624, 180),
    'R1': (195, -686, 180),
    'R2': (350, -717, 270),
    'CN2': (CC, CY, 0),
})
place_H = 960
SIG, PWR, PWRB = 8, 12, 15

# ---------------- TMP117 arm ----------------
g2 = P('U2', 2); g4 = P('U2', 4); vp = P('U2', 5); sda2 = P('U2', 6); scl2 = P('U2', 1)
c1p = P('C1', 1); c1g = P('C1', 2)
GX = 111            # GND return around the left of TMP117 (>= 25 mil from arm edge)
T('GND', 1, 10, g2, (g2[0], -27), (GX, -27), (GX, c1g[1]), c1g)
T('GND', 1, 10, g4, (g4[0], -150), (c1g[0], -150 - (g4[0] - c1g[0])), c1g)
vga = VIA('GND', 110, -240)
T('GND', 1, 10, c1g, (c1g[0], -205), (110, -229), vga)
T('3V3', 1, PWR, vp, c1p)

# ---------------- 3V3 / VLED (top-left of MAX30102) ----------------
vt = VIA('3V3', 151, -247)
T('3V3', 1, PWR, c1p, (167, -231), vt)
p9 = P('U1', 9); p10 = P('U1', 10)
T('3V3', 1, 15, p9, P('C6', 1))
T('3V3', 1, PWR, vt, (151, p9[1] + 15), (166, p9[1]))
T('3V3', 1, PWR, p10, (160, p10[1]), (160, p9[1] - 10), (168, p9[1] - 2))
T('3V3', 1, PWR, P('C5', 1), (139, P('C5', 1)[1]), (151, P('C5', 1)[1] - 12))
c5g = P('C5', 2); c6g = P('C6', 2)
T('GND', 1, 10, c5g, VIA('GND', 33, c5g[1]))
T('GND', 1, 10, c6g, VIA('GND', 70, c6g[1]))

# ---------------- VDD 1.8 V / LDO ----------------
p11 = P('U1', 11); p12 = P('U1', 12)
c4v = P('C4', 1); c4g = P('C4', 2); c3v = P('C3', 1); c3g = P('C3', 2)
vout = P('U3', 2); ugnd = P('U3', 1); vin = P('U3', 3)
T('1.8V', 1, 12, p11, c4v, c3v, (vout[0], c3v[1]), vout)
T('GND', 1, 12, p12, (c4g[0], p12[1]))
T('GND', 1, 10, c4g, c3g, VIA('GND', 70, c3g[1]))
T('GND', 1, 10, ugnd, (ugnd[0], c3g[1] - 12), (c3g[0] + 5, c3g[1] - 5))
c2v = P('C2', 1); c2g = P('C2', 2)
T('3V3', 1, 15, vin, (vin[0], c2v[1]), c2v)
T('GND', 1, 10, c2g, VIA('GND', c2g[0], c2g[1] - 34))

# ---------------- INT ----------------
p13 = P('U1', 13); p1 = P('P1', 1); r3i = P('R3', 1); r3v = P('R3', 2)
T('INT', 1, SIG, p13, (152, p13[1]), (152, r3i[1]), r3i)
T('INT', 1, SIG, (152, p1[1] + 25), (177, p1[1]), p1)

# ---------------- right side: PGND / SDA / SCL ----------------
p4 = P('U1', 4); p3 = P('U1', 3); p2 = P('U1', 2)
T('GND', 1, 12, p4, VIA('GND', 312, p4[1]))
VIA('GND', 312, -330)          # stitching next to MAX30102 (PGND side)
T('SDA', 1, SIG, sda2, (sda2[0], -268), (337, -268), (337, -660), (P('R1', 1)[0] + 26, -660), P('R1', 1))
T('SDA', 1, SIG, p3, (322, p3[1]), (337, p3[1] - 15))
v1 = VIA('SCL', 312, p2[1]); v2 = VIA('SCL', 363, p2[1])
T('SCL', 1, SIG, p2, v1)
T('SCL', 2, SIG, v1, v2)
cs = P('CN2', 4)
T('SCL', 1, SIG, scl2, (scl2[0], -27), (227, -27), (227, -243), (363, -243), (363, -677), (cs[0], -677), cs)

# ---------------- connector / pull-ups ----------------
cg = P('CN2', 1); cv = P('CN2', 2); cd = P('CN2', 3)
T('SDA', 1, SIG, cd, (cd[0], P('R1', 1)[1]))
r1v = P('R1', 2)
T('3V3', 1, PWR, cv, r1v)
T('3V3', 1, PWR, (160, cv[1] + 22), (160, -712), (138, -690))
vs = VIA('3V3', 138, -690)
T('3V3', 1, PWR, vs, (75, -690), (75, vin[1] - 15))
T('3V3', 1, PWR, r3v, (vin[0] + 8, vin[1] - 16))
T('GND', 1, 12, cg, (cg[0] - 12, cg[1]), VIA('GND', 98, cg[1]))
r2s = P('R2', 1); r2v = P('R2', 2)
T('SCL', 1, SIG, (350, -670), r2s)
vr = VIA('3V3', 300, r2v[1] - 1)
T('3V3', 1, PWR, r2v, vr)
# bottom-layer 3V3: connector node -> top node (Vt);  -> R2 pull-up (does not fence the pour)
T('3V3', 2, PWRB, vs, (120, -672), (120, -278), vt)
T('3V3', 2, PWRB, vs, (138, -735), (173, -770), (265, -770), vr)
# extra GND stitching (top pour <-> bottom pour)
VIA('GND', 40, -780)
VIA('GND', 360, -810)
VIA('GND', 312, -530)

labels = {}
