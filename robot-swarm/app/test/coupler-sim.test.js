// 連結走行の検証シミュレーション:  node app/test/coupler-sim.test.js
//
// 3台をピン(ヒンジ)で連結し、前進→左右旋回→その場旋回→後退 の操作を行う。
// 各機体は指令PWMどおりに走ろうとするが、ピンが物理的に拘束するので、ずれた分は「引きずり (横滑り/空転)」になる。
// その引きずり量 (cm/s) と、連結部にかかるずれ (cm) を比較する。
//   A: 従来の「全台に同じ指令」
//   B: ヒンジ運動学 (折れ角はカメラ計測を想定 = 真値 + ノイズ)
//   C: ヒンジ運動学 (カメラ無し: 折れ角を指令から推定)
// モーターの個体差 (±12%) と計測ノイズを入れても B/C が A より大幅に少ないことを確認する。
const C = require('../coupler-core.js');
const assert = require('assert');
const g = { ...C.DEFAULT_GEOM };
const DT = 0.05;

function scenario(t) {            // ジョイスティック入力 (x: 右+, y: 前+)
  if (t < 3) return [0, 1];
  if (t < 6) return [-0.6, 0.8];  // 左カーブ
  if (t < 9) return [0.7, 0.8];   // 右カーブ
  if (t < 11) return [1, 0];      // その場旋回
  if (t < 15) return [0, -0.6];   // 後退
  if (t < 18) return [-0.4, -0.5];// 後退しながら曲がる
  return [0, 0];
}

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function run(method, seed = 1) {
  const R = rng(seed), gains = [1, 1 + (R() - 0.5) * 0.24, 1 + (R() - 0.5) * 0.24];
  let phiEst = [0, 0];
  let ps = C.posesFromLead({ x: 0, y: 0, th: 0 }, [0, 0], g);
  let drag = 0, maxGap = 0, maxPhi = 0;
  for (let t = 0; t < 19; t += DT) {
    const [sx, sy] = scenario(t), { V, W } = C.stickToVW(sx, sy, g, 0.8);
    let pwm;
    if (method === 'A') {
      // 従来: 1台用のミキサーをそのまま全台へ
      const l = (sy + sx), r = (sy - sx), m = Math.max(1, Math.abs(l), Math.abs(r));
      pwm = [0, 1, 2].map(() => [Math.round(l / m * 255 * 0.8), Math.round(r / m * 255 * 0.8)]);
    } else {
      const truePhi = C.phisFromPoses(ps);
      const phis = method === 'B' ? truePhi.map(f => f + (R() - 0.5) * 0.06) : phiEst;
      pwm = C.trainCommand(V, W, phis, g, 'hinge').pwm;
    }
    // 各機体が自由に走った場合
    const free = ps.map((p, k) => { const q = C.fromPWM(pwm[k], g, gains[k]); return C.integrate(p, q.v, q.w, DT); });
    // ピン拘束: 先頭は自由、後ろはピンに引っ張られる (向きは自由に走った結果を保ち、位置をピンに合わせる)
    const fixed = [free[0]];
    for (let k = 1; k < 3; k++) {
      const h = C.hitchPt(fixed[k - 1], -g.hitchR), f = free[k];
      const fp = C.hitchPt(f, g.hitchF);
      const gap = Math.hypot(fp.x - h.x, fp.y - h.y);
      maxGap = Math.max(maxGap, gap);
      // 実機ではピンが機体を引きずる: 前ピン位置を拘束点に移し、向きは 後ピン→前ピン の方向 (トレーラのように) 決まる
      const back = C.hitchPt(f, -0);   // 車軸中心
      const th = Math.atan2(h.y - back.y, h.x - back.x);
      const np = { x: h.x - g.hitchF * Math.cos(th), y: h.y - g.hitchF * Math.sin(th), th };
      drag += Math.hypot(np.x - f.x, np.y - f.y) + Math.abs(C.angDiff(np.th, f.th)) * g.track / 2;
      fixed.push(np);
    }
    ps = fixed;
    const ph = C.phisFromPoses(ps); maxPhi = Math.max(maxPhi, ...ph.map(Math.abs));
    if (method === 'C') {   // 推定: 指令した ω の差を積分
      const vw = C.trainCommand(V, W, phiEst, g, 'hinge').vws;
      phiEst = phiEst.map((f, k) => f + (vw[k + 1].w - vw[k].w) * DT);
    }
  }
  return { dragPerSec: drag / 19, maxGap, maxPhiDeg: maxPhi * 180 / Math.PI };
}

// --- 単体テスト: 運動学の拘束が厳密に満たされるか ---
{
  // 折れ角 30°, 先頭が任意の (V,W) → 後ろの前ピン速度 = 前の後ろピン速度
  const phis = [0.5, -0.3], V = 20, W = 0.7;
  const vw = C.hingeVW(V, W, phis, g), ps = C.posesFromLead({ x: 3, y: -2, th: 0.4 }, phis, g);
  for (let k = 1; k < 3; k++) {
    const pv = (p, q, d) => { // ピンの速度 (フィールド座標)
      return { x: q.v * Math.cos(p.th) - q.w * d * Math.sin(p.th), y: q.v * Math.sin(p.th) + q.w * d * Math.cos(p.th) };
    };
    const a = pv(ps[k - 1], vw[k - 1], -g.hitchR), b = pv(ps[k], vw[k], g.hitchF);
    assert(Math.hypot(a.x - b.x, a.y - b.y) < 1e-9, 'ピン速度が一致しない');
  }
  // 固定連結: 直線前進では横滑り 0、全員同じ速さ
  const r = C.trainCommand(15, 0, [0, 0], g, 'rigid');
  assert(r.slip < 1e-9 && r.pwm.every(p => p[0] === r.pwm[0][0]));
  // 速度の比を保ったまま 255 に収まる
  const big = C.trainCommand(500, 3, [0.4, 0.4], g, 'hinge');
  assert(big.pwm.flat().every(v => Math.abs(v) <= 255));
  console.log('✓ 運動学の単体テスト OK');
}

const res = {};
for (const m of ['A', 'B', 'C']) {
  const runs = [1, 7, 42, 99, 1234].map(s => run(m, s));
  res[m] = Object.fromEntries(Object.keys(runs[0]).map(k => [k, runs.reduce((a, r) => a + r[k], 0) / runs.length]));
}
const label = { A: 'A 全台同じ指令 (従来)', B: 'B ヒンジ運動学+カメラ', C: 'C ヒンジ運動学 (カメラ無し)' };
console.log('方式                          引きずり[cm/s]  最大ずれ[cm]  最大折れ角[°]');
for (const m of ['A', 'B', 'C']) console.log(label[m].padEnd(28, '　'), res[m].dragPerSec.toFixed(2).padStart(10), res[m].maxGap.toFixed(2).padStart(12), res[m].maxPhiDeg.toFixed(1).padStart(12));
assert(res.B.dragPerSec < res.A.dragPerSec * 0.5, 'B が A より十分良くない');
assert(res.C.dragPerSec < res.A.dragPerSec, 'C が A より良くない');
console.log('✓ 連結走行シミュレーション OK');
