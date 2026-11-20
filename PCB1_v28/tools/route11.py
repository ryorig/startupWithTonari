# v27b: 10.0 mm wide.  Units mil, y negative = down.  Executed inside design.py.
W = 393.7
CX = W / 2
YM = -240                       # MAX30101 centre (long axis across the board)
CY = -652                       # connector centre
place.update({
    'U2': (CX, -50, 180),        # TMP117 on the peninsula; C1 right beside it (Adafruit: cap on the peninsula)
    'C1': (122.85, -45, 90),
    'U1': (CX, YM, 270),         # MAX30101: SCL/SDA/PGND row faces TMP117, VLED/VDD/GND/INT row faces the caps
    'C6': (117.4, -325, 180),    # 100 nF VLED at pin 9
    'C4': (213.4, -325, 0),      # 100 nF VDD bridging pin 11 / pin 12
    'C5': (133.9, -393, 270),    # 10 uF VLED
    'C3': (213.4, -365, 0),      # 1 uF VDD
    'U3': (234.3, -456, 90),     # XC6206: VOUT straight below the VDD caps
    'C2': (184, -515, 180),      # 1 uF LDO in
    'R3': (40, -600, 90),       # INT pull-up (left of the connector)
    'R1': (350, -575, 270),      # SDA pull-up (right of the connector)
    'R2': (350, -640, 270),      # SCL pull-up
    'CN2': (CX, CY, 0),
})
REMOVE = ['P1']
EXTRA_DOCS = [__file__.rsplit('/', 1)[0] + '/../max30101_device.txt', __file__.rsplit('/', 1)[0] + '/../max30101_symbol.txt']
DEVICE_SWAP = {'U1': '2d4844a5952d0a32'}   # MAX30101EFD+T (LCSC C2859066)
SIG, PWR = 8, 12
EDGE_Y = CY - 111.7 - 14
place_H = -EDGE_Y
ARM_L, ARM_R, ARM_B = 75, 292, -110

# ---------------- TMP117 peninsula ----------------
add0, vp, sda2, nc3, g2, scl2 = (P('U2', n) for n in (4, 5, 6, 3, 2, 1))
c1p, c1g = P('C1', 1), P('C1', 2)
T('GND', 1, 10, add0, c1g, (95, c1g[1]), (95, -122))
VIA('GND', 95, -130)
T('3V3', 1, PWR, vp, c1p)
T('3V3', 1, PWR, c1p, (c1p[0], -158), (40, -158), (40, -535), (160, -535), (177.2, -552.2))
T('GND', 1, 10, g2, (272, g2[1]), (272, -112))
VIA('GND', 272, -122)

# ---------------- MAX30101 ----------------
p = {n: P('U1', n) for n in range(1, 15)}
VIA('GND', CX, YM)                                            # GND via under the package centre (SparkFun)
T('GND', 1, 12, p[4], (CX, YM))                               # PGND
T('GND', 1, 12, p[12], (p[12][0], YM - 32.5), (CX, YM - 1.05))  # GND -> same via (PGND/GND tied < 2 mm)
T('3V3', 1, PWR, p[9], (p[9][0], YM - 16), (p[10][0], YM - 16), p[10])   # VLED9-VLED10 under the body
T('SDA', 1, SIG, sda2, (sda2[0], -100), (p[3][0], -100 - (p[3][0] - sda2[0])), p[3])
T('SDA', 1, SIG, p[3], (p[3][0], YM + 14), (325, YM + 14), (325, -530), (P('CN2', 3)[0] + 15, -530), (P('CN2', 3)[0], -545), P('CN2', 3))
T('SCL', 1, SIG, scl2, (scl2[0], -140), (p[2][0], -140 - (p[2][0] - scl2[0])), p[2])
T('SCL', 1, SIG, p[2], (p[2][0], -168), (p[2][0] + 3, -165), (357, -165), (372, -180), (372, -600), P('R2', 1))
T('SCL', 1, SIG, (372, -506), (350, -528), (275, -528), (P('CN2', 4)[0], -547.1), P('CN2', 4))
T('SDA', 1, SIG, (325, -560), P('R1', 1))

# ---------------- VLED / VDD ----------------
c6v, c6g, c5v, c5g = P('C6', 1), P('C6', 2), P('C5', 1), P('C5', 2)
T('3V3', 1, PWR, p[9], c6v, c5v)
T('3V3', 1, PWR, (40, c5v[1]), c5v)
T('GND', 1, 10, c6g, VIA('GND', 70, c6g[1]))
vg5 = VIA('GND', c5g[0], -461)
T('GND', 1, 10, c5g, vg5)
c4v, c4g, c3v, c3g = P('C4', 1), P('C4', 2), P('C3', 1), P('C3', 2)
vout, ugnd, vin = P('U3', 2), P('U3', 1), P('U3', 3)
T('1.8V', 1, 12, p[11], c4v, c3v, vout)
T('GND', 1, 12, p[12], c4g, c3g, (c3g[0] + 21, c3g[1] - 21), ugnd)
c2v, c2g = P('C2', 1), P('C2', 2)
T('3V3', 1, PWR, (180, -550), (180, -535), c2v, vin)
T('GND', 1, 10, c2g, (c5g[0], -481.4), vg5)

# ---------------- INT: pad -> via at the package edge (SparkFun) -> bottom -> R3 + test point ----------------
vi = VIA('INT', p[13][0], -325)
T('INT', 1, SIG, p[13], vi)
vt = VIA('INT', 40, -650, dia=44, hole=24, mask=2)            # 1.1 mm pad / 0.6 mm hole, solder-mask open: INT wire
T('INT', 2, SIG, vi, (p[13][0], -350), (100, -509), (100, -610), (60, -650), vt)
r3a, r3b = P('R3', 1), P('R3', 2)
T('INT', 1, SIG, r3a, vt)
T('3V3', 1, PWR, (40, -535), r3b)

# ---------------- pull-ups 3V3 (bottom link from the left 3V3 strip) ----------------
vl = VIA('3V3', 75, -560)
T('3V3', 1, PWR, (60, -535), vl)
vr = VIA('3V3', 318, -608)
T('3V3', 2, PWR, vl, (90, -590), (300, -590), vr)
T('3V3', 1, PWR, vr, P('R1', 2))
T('3V3', 1, PWR, vr, (318, -657), P('R2', 2))

OUTLINE = [(ARM_L, 0), (ARM_R, 0), (ARM_R, ARM_B), (W, ARM_B), (W, EDGE_Y), (0, EDGE_Y), (0, ARM_B), (ARM_L, ARM_B)]
POUR = [(15, ARM_B), (W - 15, ARM_B), (W - 15, EDGE_Y + 15), (15, EDGE_Y + 15)]
labels = {}
