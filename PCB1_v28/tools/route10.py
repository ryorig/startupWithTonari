# 10.0 mm wide version (v27).  Units mil, y negative = down.  Executed inside design.py.
W = 393.7
CX = W / 2                      # 196.85
DX = CX - 170                   # shift of the v26 TMP117 arm
YM = -331                       # MAX30101 centre (long axis across the board)
CY = -706                       # connector centre
place.update({
    'U2': (167 + DX, -95, 270),          # TMP117 on the isolated peninsula (Adafruit/SparkFun style)
    'C1': (150.46 + DX, -180, 180),      # its 100 nF on the peninsula
    'U1': (CX, YM, 270),                 # MAX30101: SDA/SCL/PGND row up, VLED/VDD/GND/INT row down
    'C4': (213.4, YM - 85, 0),           # 100 nF VDD, bridges pin 11 / pin 12
    'C3': (213.4, YM - 125, 0),          # 1 uF VDD (datasheet: >= 1 uF close to VDD)
    'C6': (149.6, YM - 85, 180),         # 100 nF VLED (pin 10)
    'C5': (100, YM - 110, 90),           # 10 uF VLED
    'U3': (150, YM - 195, 0),            # XC6206 1.8 V
    'C2': (57, YM - 195, 270),           # 1 uF LDO input
    'R1': (330, CY + 30, 90),            # SDA pull-up, beside the connector
    'R2': (362, CY + 30, 90),            # SCL pull-up
    'R3': (34, CY + 30, 90),             # INT pull-up
    'CN2': (CX, CY, 0),
})
REMOVE = ['P1']                          # INT -> solderable test-point via instead of the 2.54 mm header
EXTRA_DOCS = [__file__.rsplit('/', 1)[0] + '/../max30101_device.txt', __file__.rsplit('/', 1)[0] + '/../max30101_symbol.txt']
DEVICE_SWAP = {'U1': '2d4844a5952d0a32'}  # MAX30101EFD+T, LCSC C2859066
SIG, PWR = 8, 12
EDGE_Y = CY - 111.7 - 14                  # bottom edge 14 mil past the connector's mounting pads
place_H = -EDGE_Y

# ---------------- TMP117 peninsula (same as the verified v26 arm, shifted) ----------------
g2 = P('U2', 2); g4 = P('U2', 4); vp = P('U2', 5); sda2 = P('U2', 6); scl2 = P('U2', 1)
c1p = P('C1', 1); c1g = P('C1', 2)
GX = 111 + DX
T('GND', 1, 10, g2, (g2[0], -27), (GX, -27), (GX, c1g[1]), c1g)
T('GND', 1, 10, g4, (g4[0], -150), (c1g[0], -150 - (g4[0] - c1g[0])), c1g)
vga = VIA('GND', c1g[0] - 22, -232)
T('GND', 1, 10, c1g, (c1g[0], -210), vga)
T('3V3', 1, PWR, vp, c1p)

# ---------------- MAX30101 ----------------
p = {n: P('U1', n) for n in range(1, 15)}
vg = VIA('GND', CX, YM)                                   # GND via under the package centre (SparkFun)
T('GND', 1, 12, p[4], (CX, YM))                           # PGND -> centre via
T('GND', 1, 12, p[12], (p[12][0], YM - 12), (CX + 12, YM - 12), (CX, YM))   # GND -> centre via
T('3V3', 1, PWR, p[9], (p[9][0], YM - 16), (p[10][0], YM - 16), p[10])     # VLED9-VLED10 under the body
# SDA: TMP117 -> pin 3 (from above); pin 3 -> connector under the package to the right edge (SparkFun routes under the body)
T('SDA', 1, SIG, sda2, (sda2[0], -240), (p[3][0], -240 - (p[3][0] - sda2[0])), p[3])
T('SDA', 1, SIG, p[3], (p[3][0], YM + 14), (322, YM + 14), (322, CY + 95), (P('CN2', 3)[0] + 30, CY + 95), P('CN2', 3))
# SCL: TMP117 -> pin 2 (from above) -> continues right over NC1 and down the right edge
T('SCL', 1, SIG, scl2, (scl2[0], -27), (scl2[0] + 34.4, -27), (scl2[0] + 34.4, -245), (350, -245), (350, CY + 70), P('CN2', 4))
T('SCL', 1, SIG, (p[2][0] - 6, -245), p[2])

# ---------------- 3V3 distribution (left edge) ----------------
T('3V3', 1, PWR, c1p, (c1p[0], -255), (45, -255), (45, YM - 75), (P('C5', 1)[0], YM - 75))
T('3V3', 1, PWR, P('C5', 1), (P('C6', 1)[0] - 20, P('C5', 1)[1]), P('C6', 1))
T('3V3', 1, PWR, P('C6', 1), p[10])
c5g = P('C5', 2); c6g = P('C6', 2)
T('GND', 1, 10, c6g, VIA('GND', c6g[0], c6g[1] - 36))
T('GND', 1, 10, c5g, VIA('GND', c5g[0], c5g[1] - 34))

# ---------------- VDD 1.8 V ----------------
c4v, c4g, c3v, c3g = P('C4', 1), P('C4', 2), P('C3', 1), P('C3', 2)
vout, ugnd, vin = P('U3', 2), P('U3', 1), P('U3', 3)
T('1.8V', 1, 12, p[11], c4v, c3v, (c3v[0], vout[1]), vout)
T('GND', 1, 10, p[12], c4g)
T('GND', 1, 10, c4g, c3g, VIA('GND', c3g[0] + 34, c3g[1]))
T('GND', 1, 10, ugnd, VIA('GND', ugnd[0] + 34, ugnd[1]))
c2v, c2g = P('C2', 1), P('C2', 2)
T('3V3', 1, PWR, (45, YM - 75), (45, c2v[1] + 12), c2v, vin)
T('GND', 1, 10, c2g, VIA('GND', c2g[0], c2g[1] - 34))

# ---------------- INT: pull-up R3 + solderable test-point via ----------------
T('INT', 1, SIG, p[13], (p[13][0], YM - 70), (275, YM - 85), (275, CY + 150), (40, CY + 150), P('R3', 1))
VIA('INT', 275, CY + 150, dia=55, hole=31, mask=2)        # 1.4 mm pad / 0.8 mm hole, mask opened: solder the INT wire here
r3v = P('R3', 2)

# ---------------- connector & pull-ups ----------------
cg, cv = P('CN2', 1), P('CN2', 2)
T('3V3', 1, PWR, vin, (vin[0], cv[1] + 60), (cv[0], cv[1] + 40), cv)
T('3V3', 1, PWR, r3v, (r3v[0], CY + 100), (cv[0] - 25, CY + 100))
T('GND', 1, 12, cg, VIA('GND', cg[0], cg[1] + 55))
r1s, r1v, r2s, r2v = P('R1', 1), P('R1', 2), P('R2', 1), P('R2', 2)

OUTLINE = [(85 + DX, 0), (255 + DX, 0), (255 + DX, -215), (W, -215), (W, EDGE_Y), (0, EDGE_Y), (0, -215), (85 + DX, -215)]
POUR = [(15, -215), (W - 15, -215), (W - 15, EDGE_Y + 15), (15, EDGE_Y + 15)]
labels = {}
