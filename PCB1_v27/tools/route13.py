# v27: 10.0 mm wide.  Units mil, y negative = down.  Executed inside design.py.
W = 393.7
CX = W / 2
YM = -240
CY = -652
place.update({
    'U2': (CX, -50, 180),        # TMP117 on the peninsula (Adafruit/SparkFun style isolation)
    'C1': (122, -45, 90),        # its 100 nF on the peninsula
    'U1': (CX, YM, 270),         # MAX30101 across the board
    'C6': (146, -330, 0),      # 100 nF VLED (pin 9)
    'C4': (215, -330, 0),      # 100 nF VDD (pins 11/12)
    'C5': (91, -361, 270),       # 10 uF VLED
    'C3': (215, -370, 0),      # 1 uF VDD
    'U3': (155, -466, 0),        # XC6206: VIN left, VOUT up to the VDD caps
    'C2': (75, -520, 270),       # 1 uF LDO in
    'R1': (296, -449, 270),      # SDA pull-up  (~10 mm from TMP117, TI SNOA986)
    'R2': (349.75, -449, 270),   # SCL pull-up
    'R3': (50, -585, 90),        # INT pull-up
    'CN2': (CX, CY, 0),
})
REMOVE = ['P1']
DROP_DOCS = ['f88a373d48c5acc0', 'b170bdfe7d7ab44b', '731216a5c3099daf', '5c1d124acc860d21', '008e95429aa95d8b']   # unused P1 header and MAX30102 library data
EXTRA_DOCS = [__file__.rsplit('/', 1)[0] + '/../max30101_device.txt', __file__.rsplit('/', 1)[0] + '/../max30101_symbol.txt']
DEVICE_SWAP = {'U1': '2d4844a5952d0a32'}
SIG, PWR = 8, 12
EDGE_Y = CY - 111.7 - 16
place_H = -EDGE_Y
ARM_L, ARM_R, ARM_B = 65, 292, -110

# ---------------- TMP117 peninsula ----------------
add0, vp, sda2, g2, scl2 = (P('U2', n) for n in (4, 5, 6, 2, 1))
c1p, c1g = P('C1', 1), P('C1', 2)
T('GND', 1, 10, add0, c1g, (87, c1g[1]), (87, -126))
VIA('GND', 87, -126)
T('3V3', 1, PWR, vp, (142, vp[1]), (122, -70))
T('GND', 1, 10, g2, (271, g2[1]), (271, -120), (287, -136), (291, -140), (308, -140))
VIA('GND', 308, -140)

# ---------------- 3V3: peninsula -> left edge -> VLED caps / LDO in ----------------
c6v, c6g, c5v, c5g = P('C6', 1), P('C6', 2), P('C5', 1), P('C5', 2)
vout, ugnd, vin = P('U3', 2), P('U3', 1), P('U3', 3)
T('3V3', 1, PWR, (122, -70), (c1p[0], -160), (40, -160), (40, vin[1]), vin)
T('3V3', 1, PWR, (40, c5v[1] + 15), (55, c5v[1]), c5v)

# ---------------- MAX30101 ----------------
p = {n: P('U1', n) for n in range(1, 15)}
VIA('GND', CX, YM)                                            # GND via under the package centre (SparkFun)
T('GND', 1, 12, p[4], (CX, YM))
T('GND', 1, 12, p[12], (p[12][0], YM - 32.5), (CX, YM))
T('3V3', 1, PWR, p[9], (p[9][0], YM - 16), (p[10][0], YM - 16), p[10])   # VLED9-VLED10 under the body
T('3V3', 1, PWR, p[9], c6v)
T('3V3', 1, PWR, c6v, (c6v[0] - 10, c6v[1] - 10), (c5v[0] + 10, c6v[1] - 10))
T('SDA', 1, SIG, sda2, (sda2[0] - 8, sda2[1] - 8), (sda2[0] - 8, -100), (p[3][0], -100 - (p[3][0] - sda2[0] + 8)), p[3])
T('SDA', 1, SIG, p[3], (p[3][0], YM + 14), (325, YM + 14), (325, -527), (P('CN2', 3)[0] + 13, -527), (P('CN2', 3)[0], -540), P('CN2', 3))
T('SDA', 1, SIG, (325, -409), (303, -431))
T('SCL', 1, SIG, scl2, (scl2[0] + 8, scl2[1] - 8), (scl2[0] + 8, -128), (p[2][0], -128 - (p[2][0] - scl2[0] - 8)), p[2])
T('SCL', 1, SIG, (p[2][0], -168), (p[2][0] + 3, -165), (359.5, -165), (374.5, -180), (374.5, -529), (359.5, -544), (P('CN2', 4)[0] + 15, -544), (P('CN2', 4)[0], -559), P('CN2', 4))
T('SCL', 1, SIG, (374.5, -409), (357, -426.5))

# ---------------- decoupling ----------------
T('GND', 1, 16, c6g, VIA('GND', c6g[0], -362))
T('GND', 1, 10, c5g, VIA('GND', c5g[0], -428))
c4v, c4g, c3v, c3g = P('C4', 1), P('C4', 2), P('C3', 1), P('C3', 2)
T('1.8V', 1, 12, p[11], c4v, c3v, vout)
T('GND', 1, 12, p[12], c4g, c3g, (241, c3g[1] - 9.5), (241, ugnd[1] + 14), (ugnd[0] + 14, ugnd[1]))
c2v, c2g = P('C2', 1), P('C2', 2)
T('3V3', 1, PWR, (100, -470), (80, -490), (c2v[0], c2v[1] + 2))
T('GND', 1, 16, c2g, (c2g[0], -547), (85, -547), VIA('GND', 100, -562))

# ---------------- connector ----------------
cg, cv = P('CN2', 1), P('CN2', 2)
T('3V3', 1, PWR, cv, (cv[0], -530), (110, -530), (100, -520), (100, vin[1] - 6))
T('3V3', 1, PWR, c2v, (45, c2v[1]), (45, -563))
T('GND', 1, 12, cg, VIA('GND', cg[0], -632))
vs = VIA('3V3', cv[0], -632)
T('3V3', 1, PWR, cv, vs)

# ---------------- pull-ups: 3V3 from under the connector on the bottom layer ----------------
vr1 = VIA('3V3', 296, -500); vr2 = VIA('3V3', 349.75, -500.25)
T('3V3', 1, PWR, P('R1', 2), vr1)
T('3V3', 1, PWR, P('R2', 2), vr2)
T('3V3', 2, PWR, vs, (270, -632), (310, -592), (310, -514), vr1)
T('3V3', 2, PWR, (310, -540), (349.75, -500.25))

# ---------------- INT: via at the package edge (SparkFun) -> bottom -> pull-up + solderable test point ----------------
vi = VIA('INT', 268, -340)
T('INT', 1, SIG, p[13], (p[13][0], -332), vi)
vt = VIA('INT', 40, -650, dia=40, hole=20, mask=(2, None))   # top-side mask opening only
T('INT', 2, SIG, vi, (263, -345), (263, -390), (258, -395), (35, -395), (25, -405), (25, -635), vt)
T('INT', 1, SIG, P('R3', 1), vt)

# ---------------- GND stitching ----------------
for xy in [(360, -600), (362, -700), (28, -720), (349.75, -300)]:
    VIA('GND', *xy)

OUTLINE = [(ARM_L, 8), (ARM_R, 8), (ARM_R, ARM_B), (W, ARM_B), (W, EDGE_Y), (0, EDGE_Y), (0, ARM_B), (ARM_L, ARM_B)]
POUR = [(15, ARM_B), (110, ARM_B), (110, -150), (280, -150), (280, ARM_B), (W - 15, ARM_B), (W - 15, EDGE_Y + 15), (15, EDGE_Y + 15)]   # pour held back from the TMP117 tab
labels = {}
