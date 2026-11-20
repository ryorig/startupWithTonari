# v27c: 10.0 mm wide.  Units mil, y negative = down.  Executed inside design.py.
W = 393.7
CX = W / 2
YM = -240
CY = -652
place.update({
    'U2': (CX, -50, 180),        # TMP117 on the peninsula
    'C1': (120, -45, 90),        # its 100 nF on the peninsula (Adafruit)
    'U1': (CX, YM, 270),         # MAX30101 across the board
    'C6': (150.4, -326, 0),      # 100 nF VLED (pin 9)
    'C4': (213.4, -326, 0),      # 100 nF VDD (pins 11/12)
    'C5': (95, -361, 270),       # 10 uF VLED
    'C3': (213.4, -366, 0),      # 1 uF VDD
    'U3': (150, -460, 0),        # XC6206
    'C2': (100, -510, 270),      # 1 uF LDO in
    'R1': (200, -522, 180),      # SDA pull-up (pins 2/3 of the connector)
    'R2': (352, -600, 270),      # SCL pull-up
    'R3': (50, -610, 90),        # INT pull-up
    'CN2': (CX, CY, 0),
})
REMOVE = ['P1']
EXTRA_DOCS = [__file__.rsplit('/', 1)[0] + '/../max30101_device.txt', __file__.rsplit('/', 1)[0] + '/../max30101_symbol.txt']
DEVICE_SWAP = {'U1': '2d4844a5952d0a32'}
SIG, PWR = 8, 12
EDGE_Y = CY - 111.7 - 14
place_H = -EDGE_Y
ARM_L, ARM_R, ARM_B = 75, 292, -110

# ---------------- TMP117 peninsula ----------------
add0, vp, sda2, g2, scl2 = (P('U2', n) for n in (4, 5, 6, 2, 1))
c1p, c1g = P('C1', 1), P('C1', 2)
T('GND', 1, 10, add0, c1g, (95, c1g[1]), (95, -128))
VIA('GND', 95, -136)
T('3V3', 1, PWR, vp, c1p)
T('3V3', 1, PWR, c1p, (c1p[0], -158), (40, -158), (40, -560), (165, -560), (177.2, -572.2))
T('GND', 1, 10, g2, (272, g2[1]), (272, -125))
VIA('GND', 272, -135)

# ---------------- MAX30101 ----------------
p = {n: P('U1', n) for n in range(1, 15)}
VIA('GND', CX, YM)
T('GND', 1, 12, p[4], (CX, YM))
T('GND', 1, 12, p[12], (p[12][0], YM - 32.5), (CX, YM - 1.05))
T('3V3', 1, PWR, p[9], (p[9][0], YM - 16), (p[10][0], YM - 16), p[10])
T('SDA', 1, SIG, sda2, (sda2[0] - 8, sda2[1] - 8), (sda2[0] - 8, -100), (p[3][0], -100 - (p[3][0] - sda2[0] + 8)), p[3])
T('SDA', 1, SIG, p[3], (p[3][0], YM + 14), (325, YM + 14), (325, -480), (260, -480), P('R1', 1), P('CN2', 3))
T('SCL', 1, SIG, scl2, (scl2[0] + 8, scl2[1] - 8), (scl2[0] + 8, -128), (p[2][0], -128 - (p[2][0] - scl2[0] - 8)), p[2])
T('SCL', 1, SIG, p[2], (p[2][0], -168), (p[2][0] + 3, -165), (357, -165), (372, -180), (372, -563), P('R2', 1))
T('SCL', 1, SIG, (372, -500), (342, -530), (270, -530), (P('CN2', 4)[0], -544.1), P('CN2', 4))

# ---------------- VLED / VDD ----------------
c6v, c6g, c5v, c5g = P('C6', 1), P('C6', 2), P('C5', 1), P('C5', 2)
T('3V3', 1, PWR, p[9], c6v, (c5v[0], c6v[1]), c5v)
T('3V3', 1, PWR, (40, c5v[1]), c5v)
T('GND', 1, 10, c6g, VIA('GND', c6g[0], -362))
T('GND', 1, 10, c5g, VIA('GND', c5g[0], -428))
c4v, c4g, c3v, c3g = P('C4', 1), P('C4', 2), P('C3', 1), P('C3', 2)
vout, ugnd, vin = P('U3', 2), P('U3', 1), P('U3', 3)
T('1.8V', 1, 12, p[11], c4v, c3v, vout)
T('GND', 1, 12, p[12], c4g, c3g, (c3g[0], ugnd[1] + 20), ugnd)
c2v, c2g = P('C2', 1), P('C2', 2)
T('3V3', 1, PWR, (40, vin[1]), vin, (vin[0], c2v[1]), c2v)
T('GND', 1, 10, c2g, VIA('GND', 66, c2g[1]))

# ---------------- INT: via at the package edge -> bottom -> pull-up + solderable test point ----------------
vi = VIA('INT', p[13][0], -326)
T('INT', 1, SIG, p[13], vi)
r3i, r3v = P('R3', 1), P('R3', 2)
vt = VIA('INT', 50, -666, dia=40, hole=20, mask=2)
T('INT', 2, SIG, vi, (p[13][0], -560), (234.5, -585.5), (95, -585.5), (50, -630.5), vt)
T('INT', 1, SIG, r3i, vt)
T('3V3', 1, PWR, (40, -560), (r3v[0], -570), r3v)

# ---------------- connector & pull-ups ----------------
cg, cv = P('CN2', 1), P('CN2', 2)
T('3V3', 1, PWR, P('R1', 2), (P('R1', 2)[0], -545), (177.2, -551.2))
T('GND', 1, 12, cg, (cg[0] - 12, cg[1]), VIA('GND', 105, cg[1] - 8))
vs = VIA('3V3', 177.2, -632)
T('3V3', 1, PWR, cv, vs)
r2s, r2v = P('R2', 1), P('R2', 2)
vr = VIA('3V3', 352, -655)
T('3V3', 1, PWR, r2v, vr)
T('3V3', 2, PWR, vs, (310, -632), (333, -655), vr)
VIA('GND', 330, -700)
VIA('GND', 60, -730)
VIA('GND', 330, -400)

OUTLINE = [(ARM_L, 0), (ARM_R, 0), (ARM_R, ARM_B), (W, ARM_B), (W, EDGE_Y), (0, EDGE_Y), (0, ARM_B), (ARM_L, ARM_B)]
POUR = [(15, ARM_B), (W - 15, ARM_B), (W - 15, EDGE_Y + 15), (15, EDGE_Y + 15)]
labels = {}
