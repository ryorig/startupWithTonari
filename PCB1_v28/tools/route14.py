# v28: 10.0 mm wide, shorter.  Units mil, y negative = down.  Executed inside design.py.
W = 393.7
CX = W / 2
YM = -240
CY = -629.5
SX = 22                          # 3V3 spine along the left edge
place.update({
    'U2': (CX, -50, 180),        # TMP117 on the peninsula
    'C1': (122, -45, 90),        # its 100 nF on the peninsula
    'U1': (CX, YM, 270),         # MAX30101 across the board
    'C5': (57, -250, 90),       # 10 uF VLED, beside the package (VLED fed from the left end of the package)
    'C6': (148.9, -330, 180),    # 100 nF VLED (pin 10)
    'C4': (213, -330, 0),        # 100 nF VDD (pins 11/12)
    'U3': (147.9, -409, 0),      # XC6206 straight below the cap row (VOUT under VDD)
    'C3': (241, -409, 270),      # 1 uF across VOUT / GND of the LDO
    'C2': (52, -455, 0),         # 1 uF LDO in, on the 3V3 spine
    'R1': (296, -432, 270),      # SDA pull-up (>= 10 mm from TMP117)
    'R2': (349.75, -432, 270),   # SCL pull-up
    'R3': (49, -560, 90),        # INT pull-up
    'CN2': (CX, CY, 0),
})
REMOVE = ['P1']
DROP_DOCS = ['f88a373d48c5acc0', 'b170bdfe7d7ab44b', '731216a5c3099daf', '5c1d124acc860d21', '008e95429aa95d8b']
EXTRA_DOCS = [__file__.rsplit('/', 1)[0] + '/../max30101_device.txt', __file__.rsplit('/', 1)[0] + '/../max30101_symbol.txt']
DEVICE_SWAP = {'U1': '2d4844a5952d0a32'}
SIG, PWR = 8, 12
EDGE_Y = CY - 111.7 - 16
place_H = -EDGE_Y
ARM_L, ARM_R, ARM_B = 65, 292, -110

# ---------------- TMP117 peninsula (unchanged from v27) ----------------
add0, vp, sda2, g2, scl2 = (P('U2', n) for n in (4, 5, 6, 2, 1))
c1p, c1g = P('C1', 1), P('C1', 2)
T('GND', 1, 10, add0, c1g, (87, c1g[1]), (87, -126))
VIA('GND', 87, -126)
T('3V3', 1, PWR, vp, (142, vp[1]), (122, -70))
T('GND', 1, 10, g2, (271, g2[1]), (271, -120), (287, -136), (291, -140), (308, -140))
VIA('GND', 308, -140)

# ---------------- 3V3 spine (left edge) ----------------
c6v, c6g, c5v, c5g = P('C6', 1), P('C6', 2), P('C5', 1), P('C5', 2)
vout, ugnd, vin = P('U3', 2), P('U3', 1), P('U3', 3)
r3i, r3v = P('R3', 1), P('R3', 2)
T('3V3', 1, PWR, (122, -70), (c1p[0], -160), (SX, -160), (SX, -530), r3v)
T('3V3', 1, PWR, (SX, c5v[1] + 15), (SX + 15, c5v[1]), c5v)               # spine -> C5
T('3V3', 1, PWR, (SX, vin[1] + 25), (SX + 25, vin[1]), vin)                 # spine -> LDO in
c2v, c2g = P('C2', 1), P('C2', 2)
T('3V3', 1, PWR, (SX, c2v[1] + 13.5), c2v)                                  # spine -> C2

# ---------------- MAX30101 ----------------
p = {n: P('U1', n) for n in range(1, 15)}
VIA('GND', CX, YM)                                            # GND via under the package centre (SparkFun)
T('GND', 1, 12, p[4], (CX, YM))
T('GND', 1, 12, p[12], (p[12][0], YM - 32.5), (CX, YM))
# VLED9/VLED10 joined under the body and brought out at the left end of the package to C5
T('3V3', 1, PWR, (p[10][0], YM - 36), (p[10][0], YM - 26), (p[10][0] - 10, YM - 16), (c5v[0] + (c5v[1] - YM + 16) * -1, YM - 16), c5v)
T('3V3', 1, PWR, (p[9][0], YM - 36), (p[9][0] + 20, YM - 16))
T('3V3', 1, PWR, p[10], c6v)
T('SDA', 1, SIG, sda2, (sda2[0] - 8, sda2[1] - 8), (sda2[0] - 8, -100), (p[3][0], -100 - (p[3][0] - sda2[0] + 8)), p[3])
T('SDA', 1, SIG, p[3], (p[3][0], YM + 14), (325, YM + 14), (325, -496), (313, -508), (P('CN2', 3)[0] + 21, -508), (P('CN2', 3)[0], -529), P('CN2', 3))
T('SDA', 1, SIG, (325, -392), (303, -414))
T('SCL', 1, SIG, scl2, (scl2[0] + 8, scl2[1] - 8), (scl2[0] + 8, -128), (p[2][0], -128 - (p[2][0] - scl2[0] - 8)), p[2])
T('SCL', 1, SIG, (p[2][0], -168), (p[2][0] + 3, -165), (359.5, -165), (374.5, -180), (374.5, -510), (359.5, -525), (P('CN2', 4)[0] + 15, -525), (P('CN2', 4)[0], -540), P('CN2', 4))
T('SCL', 1, SIG, (374.5, -392), (357, -409.5))

# ---------------- decoupling ----------------
T('GND', 1, 10, c5g, VIA('GND', c5g[0], -186.5))
T('GND', 1, 10, c6g, VIA('GND', 100, -330))
c4v, c4g, c3v, c3g = P('C4', 1), P('C4', 2), P('C3', 1), P('C3', 2)
T('1.8V', 1, 12, p[11], c4v, vout)
T('1.8V', 1, 12, (vout[0] + 14, vout[1]), (vout[0] + 24, vout[1] - 10), (c3v[0], vout[1] - 10), c3v)
T('GND', 1, 12, p[12], c4g)
T('GND', 1, 10, (ugnd[0] + 14, ugnd[1]), (ugnd[0] + 24, ugnd[1] + 10), (c3g[0], ugnd[1] + 10), c3g)
T('GND', 1, 12, ugnd, (ugnd[0], -480))
VIA('GND', ugnd[0], -480)
T('GND', 1, 10, c2g, VIA('GND', c2g[0], -492))

# ---------------- connector ----------------
cg, cv = P('CN2', 1), P('CN2', 2)
T('3V3', 1, PWR, (105, vin[1] - 8), (105, -500), (160, -500), (177.2, -517.2), cv)   # LDO-in node -> connector 3V3
T('GND', 1, 12, cg, VIA('GND', cg[0], -607))
vs = VIA('3V3', cv[0], -607)
T('3V3', 1, PWR, cv, vs)

# ---------------- pull-ups: 3V3 from under the connector on the bottom layer ----------------
vr1 = VIA('3V3', 296, -483); vr2 = VIA('3V3', 349.75, -483.25)
T('3V3', 1, PWR, P('R1', 2), vr1)
T('3V3', 1, PWR, P('R2', 2), vr2)
T('3V3', 2, PWR, vs, (270, -607), (310, -567), (310, -497), vr1)
T('3V3', 2, PWR, (310, -523), (349.75, -483.25))

# ---------------- INT: via at the package edge (SparkFun) -> bottom -> pull-up + solderable test point ----------------
vi = VIA('INT', p[13][0], -326)
T('INT', 1, SIG, p[13], vi)
vt = VIA('INT', 40, -620, dia=40, hole=20, mask=(2, None))   # top-side mask opening only
T('INT', 2, SIG, vi, (p[13][0], -346), (249.8, -356), (105, -356), (95, -366), (95, -565), vt)
T('INT', 1, SIG, r3i, vt)

# ---------------- GND stitching ----------------
for xy in [(362, -580), (362, -680), (28, -690), (349.75, -300)]:
    VIA('GND', *xy)

OUTLINE = [(ARM_L, 8), (ARM_R, 8), (ARM_R, ARM_B), (W, ARM_B), (W, EDGE_Y), (0, EDGE_Y), (0, ARM_B), (ARM_L, ARM_B)]
POUR = [(15, ARM_B - 15), (110, ARM_B - 15), (110, -150), (280, -150), (280, ARM_B - 15), (W - 15, ARM_B - 15), (W - 15, EDGE_Y + 15), (15, EDGE_Y + 15)]
labels = {}
