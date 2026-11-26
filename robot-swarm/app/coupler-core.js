// =====================================================================
//  連結走行の運動学 (ブラウザ / Node 共通・DOM 非依存)
//
//  座標の約束 (このファイル内):
//    ロボット座標 x=前, y=左, ω>0 = 左旋回 (反時計回り)
//    左右輪の速さ  l = v - ω·T/2,  r = v + ω·T/2   (T = トレッド幅)
//
//  ■ ヒンジ連結 (ピンで首振りできる連結 = フック+フォーク+ピン)
//    前の機体 k-1 の「後ろのピン」の速度に、後ろの機体 k の「前のピン」の速度を一致させる。
//    φ = 後ろの機体の向き − 前の機体の向き (左回り正) とすると
//      ピン速度 (前の機体の座標)  vh = ( v_{k-1},  −b·ω_{k-1} )
//      v_k = vh·u = v cosφ − bω sinφ
//      ω_k = vh·n / a = (−v sinφ − bω cosφ) / a        (a = 後ろの機体の 軸→前ピン 距離)
//    これはトラクタ・トレーラの拘束式そのもので、連結部に力がかからない (= 引きずり・外れが起きない)。
//    φ̇ = ω_k − ω_{k-1}
//
//  ■ 固定連結 (ゲートで首振りもロック)
//    塊を1つの剛体とみなし、各車輪の接地点の速度 (V + Ω×r) を車輪の向きに投影。
//    横向き成分は横滑りになるので、その大きさ (slip) も返す。
// =====================================================================
(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const DEFAULT_GEOM = {
    track: 10,      // トレッド幅 (左右の車輪の間隔) cm
    hitchF: 7,      // 車軸中心 → 前ピン cm
    hitchR: 7,      // 車軸中心 → 後ろピン cm
    vmax: 30,       // PWM 255 のときの速さ cm/s (実測して合わせる)
    phiMax: 70,     // これ以上折れたら (ジャックナイフ) 減速 °
  };

  // ---- ヒンジ連結: 列 (前→後) の各機体の (v, ω) ----
  function hingeVW(V, W, phis, g) {
    const out = [{ v: V, w: W }];
    for (let k = 1; k < phis.length + 1; k++) {
      const { v, w } = out[k - 1], f = phis[k - 1] || 0;
      const a = Math.max(g.hitchF, 1), b = g.hitchR;
      out.push({ v: v * Math.cos(f) - b * w * Math.sin(f), w: (-v * Math.sin(f) - b * w * Math.cos(f)) / a });
    }
    return out;
  }

  // ---- 固定連結: rel[k] = 塊の基準点から見た各機体の {x, y, th} ----
  function rigidVW(V, W, rel) {
    return rel.map(({ x, y, th }) => {
      const vx = V - W * y, vy = W * x;                 // 機体中心の速度 (塊の座標)
      const c = Math.cos(th), s = Math.sin(th);
      return { v: vx * c + vy * s, w: W, slip: -vx * s + vy * c };
    });
  }

  // 列を固定連結したときの各機体の相対位置 (前から順に後ろへ。基準 = 列の中央)
  function chainRel(n, g, phis = []) {
    const pts = [{ x: 0, y: 0, th: 0 }];
    for (let k = 1; k < n; k++) {
      const p = pts[k - 1], th = p.th + (phis[k - 1] || 0);
      const hx = p.x - g.hitchR * Math.cos(p.th), hy = p.y - g.hitchR * Math.sin(p.th);   // 前の機体の後ろピン
      pts.push({ x: hx - g.hitchF * Math.cos(th), y: hy - g.hitchF * Math.sin(th), th });
    }
    const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
    return pts.map(p => ({ x: p.x - mx, y: p.y - my, th: p.th }));
  }

  // 折れ角が大きすぎるときの速度倍率 (0〜1)
  function jackknifeScale(phis, g) {
    const lim = g.phiMax * Math.PI / 180;
    let s = 1;
    for (const f of phis) { const e = Math.abs(f) / lim; if (e > 0.8) s = Math.min(s, clamp((1 - e) / 0.2, 0, 1)); }
    return s;
  }

  // (v, ω) の列 → PWM [l, r]。塊全体で同じ倍率で縮める (速度の比を保つ = 連結部に無理がかからない)
  function toPWM(vws, g, gains = []) {
    const raw = vws.map(({ v, w }, k) => {
      const gk = gains[k] || 1;
      return [(v - w * g.track / 2) / g.vmax * 255 / gk, (v + w * g.track / 2) / g.vmax * 255 / gk];
    });
    const m = Math.max(255, ...raw.flat().map(Math.abs));
    const s = 255 / m;
    return { pwm: raw.map(([l, r]) => [Math.round(l * s), Math.round(r * s)]), scale: s };
  }

  // PWM → 実際の (v, ω) (シミュレーション用)
  function fromPWM([l, r], g, gain = 1) {
    const vl = l / 255 * g.vmax * gain, vr = r / 255 * g.vmax * gain;
    return { v: (vl + vr) / 2, w: (vr - vl) / g.track };
  }

  // ジョイスティック等の入力 (−1〜1) → 塊の (V, Ω)
  function stickToVW(x, y, g, speed = 1, turnRate = 1.6) {
    return { V: y * g.vmax * speed, W: -x * turnRate * speed };
  }

  // 1ステップ進める: 状態 {x, y, th} (フィールド座標, th 左回り) を (v, ω) で積分
  function integrate(p, v, w, dt) {
    const th = p.th + w * dt / 2;
    return { x: p.x + v * Math.cos(th) * dt, y: p.y + v * Math.sin(th) * dt, th: p.th + w * dt };
  }
  const hitchPt = (p, d) => ({ x: p.x + d * Math.cos(p.th), y: p.y + d * Math.sin(p.th) });
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

  // 列の状態 (各機体の姿勢) から折れ角 φ を求める
  function phisFromPoses(ps) { const o = []; for (let k = 1; k < ps.length; k++) o.push(angDiff(ps[k].th, ps[k - 1].th)); return o; }

  // 「連結」(固定) — 列の先頭の姿勢と折れ角から全機体の姿勢を作る (ピン拘束を厳密に満たす)
  function posesFromLead(lead, phis, g) {
    const out = [lead];
    for (let k = 1; k <= phis.length; k++) {
      const p = out[k - 1], h = hitchPt(p, -g.hitchR), th = p.th + phis[k - 1];
      out.push({ x: h.x - g.hitchF * Math.cos(th), y: h.y - g.hitchF * Math.sin(th), th });
    }
    return out;
  }

  // 1つの塊 (列) の指令を計算する。mode: 'hinge' | 'rigid'
  //   phis: 現在の折れ角 (カメラで測れていればその値、無ければ推定値)
  function trainCommand(V, W, phis, g, mode, gains) {
    let vws, slip = 0;
    const s = mode === 'hinge' ? jackknifeScale(phis, g) : 1;
    if (mode === 'rigid') {
      const rel = chainRel(phis.length + 1, g, phis);
      vws = rigidVW(V, W, rel);
      slip = Math.max(...vws.map(q => Math.abs(q.slip)));
    } else {
      vws = hingeVW(V * s, W * s, phis, g);
    }
    const { pwm, scale } = toPWM(vws, g, gains);
    return { pwm, vws, slip, scale: scale * s, jack: s < 1 };
  }

  const api = { DEFAULT_GEOM, hingeVW, rigidVW, chainRel, jackknifeScale, toPWM, fromPWM, stickToVW,
    integrate, hitchPt, angDiff, phisFromPoses, posesFromLead, trainCommand };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CouplerCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
