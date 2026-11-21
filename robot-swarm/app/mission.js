// =====================================================================
//  🚨 救助ミッション (災害対応 群ロボット)
//
//  役割分担 (段階的確認パイプライン)
//    3号機 = 探索 (距離センサー)   : 走査ルートを先行し、障害物を地図化
//    2号機 = 熱探知 (MLX90640)     : 探索機の安全ルートを追従し、人らしき熱源を発見
//    1号機 = 確認 (カメラ + AI)    : 熱源の位置へ派遣され、AI (COCO-SSD) で人かどうか最終判定
//  人と確定 → 救助隊形 (要救助者を囲んで位置をマーク) → 探索再開
//
//  🧪 シミュレーション: 仮想の被災現場 (瓦礫・要救助者・おとり熱源) と仮想センサーで
//     パイプライン全体をブラウザだけで検証できる。一括実験で方式の比較も可能。
//  🤖 実機: 位置は俯瞰カメラの AprilTag (群制御タブ) から、センサーは BLE から取得。
// =====================================================================
(() => {
  const $ = id => document.getElementById(id);
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const norm = a => ((a + 180) % 360 + 360) % 360 - 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const R_CONF = 0, R_THERM = 1, R_SCOUT = 2;                 // robots[] の添字
  const ROLE = ['確認 (カメラAI)', '熱探知 (サーマル)', '探索 (距離センサー)'];
  const ROLE_ICON = ['📷', '🌡', '📡'];
  const T_FOV = 110, T_VFOV = 75, T_RANGE = 150;              // MLX90640-D110
  const CAM_FOV = 62, CAM_RANGE = 80;                         // XIAO OV2640 の目安
  const ROBOT_R = 7;
  const SRC = {                                               // 仮想の熱源
    human: { name: '要救助者', temp: 34, size: 20, icon: '🧑' },
    doll:  { name: 'カイロ付き人形 (おとり)', temp: 35, size: 14, icon: '🧸' },
    stove: { name: 'ストーブ (おとり)', temp: 70, size: 18, icon: '🔥' },
  };

  // ---------------------------------------------------------------
  //  乱数 (再現できるようにシード付き)
  // ---------------------------------------------------------------
  function rngFrom(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // ---------------------------------------------------------------
  //  シナリオ (仮想の被災現場)
  // ---------------------------------------------------------------
  function makeScenario(kind, W, H, seed) {
    const rnd = rngFrom(seed);
    const obstacles = [], sources = [];
    const free = (x, y, m = 14) => x > m && y > m && x < W - m && y < H - m && !(x < 50 && y > H - 45) &&
      !obstacles.some(o => x > o.x - m && x < o.x + o.w + m && y > o.y - m && y < o.y + o.h + m) &&
      !sources.some(s => Math.hypot(s.x - x, s.y - y) < 30);
    const addObs = n => { for (let k = 0, t = 0; k < n && t < 200; t++) {
      const w = 10 + rnd() * 22, h = 8 + rnd() * 18, x = 10 + rnd() * (W - 30), y = 10 + rnd() * (H - 30);
      if (free(x + w / 2, y + h / 2, 22)) { obstacles.push({ x, y, w, h }); k++; } } };
    const addSrc = (type, n) => { for (let k = 0, t = 0; k < n && t < 300; t++) {
      const x = 20 + rnd() * (W - 40), y = 15 + rnd() * (H - 60);
      if (free(x, y)) { sources.push({ x, y, type }); k++; } } };
    if (kind === 'basic')  { addObs(3); addSrc('human', 1); addSrc('doll', 1); addSrc('stove', 1); }
    if (kind === 'rubble') { addObs(8); addSrc('human', 2); addSrc('doll', 1); }
    if (kind === 'decoy')  { addObs(3); addSrc('human', 1); addSrc('doll', 2); addSrc('stove', 2); }
    if (kind === 'random') { addObs(2 + Math.floor(rnd() * 6)); addSrc('human', 1 + Math.floor(rnd() * 2)); addSrc('doll', Math.floor(rnd() * 3)); addSrc('stove', Math.floor(rnd() * 2)); }
    return { W, H, obstacles, sources };
  }
  const startPoses = H => [{ x: 15, y: H - 15, h: 0 }, { x: 30, y: H - 15, h: 0 }, { x: 45, y: H - 15, h: 0 }];

  // ---------------------------------------------------------------
  //  幾何 / 仮想センサー
  // ---------------------------------------------------------------
  const inRect = (x, y, o, m = 0) => x > o.x - m && x < o.x + o.w + m && y > o.y - m && y < o.y + o.h + m;
  function los(world, x1, y1, x2, y2) {                       // 見通し (瓦礫に遮られていないか)
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 3);
    for (let k = 1; k < n; k++) { const x = x1 + (x2 - x1) * k / n, y = y1 + (y2 - y1) * k / n; if (world.obstacles.some(o => inRect(x, y, o))) return false; }
    return true;
  }
  function raycast(world, p, maxD = 200) {                    // 距離センサー (VL53L1X)
    const dx = Math.sin(rad(p.h)), dy = -Math.cos(rad(p.h));
    for (let d = ROBOT_R; d < maxD; d += 1) {
      const x = p.x + dx * d, y = p.y + dy * d;
      if (x < 0 || y < 0 || x > world.W || y > world.H) return d;
      if (world.obstacles.some(o => inRect(x, y, o))) return d;
      if (world.sources.some(s => Math.hypot(s.x - x, s.y - y) < SRC[s.type].size / 2)) return d;
    }
    return maxD;
  }
  function thermalFrame(world, p, rnd) {                      // サーマル画像 32x24 を合成
    const f = new Float32Array(768);
    for (let i = 0; i < 768; i++) f[i] = 22 + (rnd() - 0.5) * 0.8 + (i >= 384 ? 0.6 : 0);
    const px = T_FOV / 32, py = T_VFOV / 24;
    for (const s of world.sources) {
      const S = SRC[s.type], dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy);
      if (d < 4 || d > T_RANGE) continue;
      const b = norm(deg(Math.atan2(dx, -dy)) - p.h);
      if (Math.abs(b) > T_FOV / 2 + 8 || !los(world, p.x, p.y, s.x, s.y)) continue;
      const cw = 2 * deg(Math.atan(S.size / 2 / d)) / px, ch = 2 * deg(Math.atan(S.size * 0.55 / 2 / d)) / py;
      const cx = 15.5 + b / px, cy = 13.5 + 1.5, T = S.temp - d * 0.015;
      for (let y = Math.floor(cy - ch / 2); y <= Math.ceil(cy + ch / 2); y++) for (let x = Math.floor(cx - cw / 2); x <= Math.ceil(cx + cw / 2); x++) {
        if (x < 0 || x > 31 || y < 0 || y > 23) continue;
        const cov = clamp(Math.min(x + 1, cx + cw / 2) - Math.max(x, cx - cw / 2), 0, 1) * clamp(Math.min(y + 1, cy + ch / 2) - Math.max(y, cy - ch / 2), 0, 1);
        const i = y * 32 + x; f[i] = Math.max(f[i], f[i] + (T - f[i]) * cov + (rnd() - 0.5) * 0.6);
      }
    }
    return f;
  }
  // ESP32 (2号機) の判定ロジックと同じもの
  function analyzeThermal(f, prm) {
    let sum = 0; for (let i = 0; i < 768; i++) sum += f[i];
    const amb = sum / 768, mask = new Uint8Array(768), seen = new Uint8Array(768);
    for (let i = 0; i < 768; i++) mask[i] = f[i] >= prm.hMin && f[i] <= prm.hMax && f[i] >= amb + 3 ? 1 : 0;
    let best = null;
    for (let s0 = 0; s0 < 768; s0++) {
      if (!mask[s0] || seen[s0]) continue;
      const st = [s0]; seen[s0] = 1; let n = 0, sx = 0, mx = 0, minX = 99, maxX = -1;
      while (st.length) {
        const i = st.pop(), x = i % 32, y = (i / 32) | 0;
        n++; sx += x; mx = Math.max(mx, f[i]); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        for (const j of [x > 0 ? i - 1 : -1, x < 31 ? i + 1 : -1, y > 0 ? i - 32 : -1, y < 23 ? i + 32 : -1])
          if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; st.push(j); }
      }
      if (!best || n > best.n) best = { n, cx: sx / n, tmax: mx, width: maxX - minX + 1 };
    }
    if (!best || best.n < 4) return null;
    const conf = clamp(Math.round(Math.min(best.n, 40) * 1.5 + 40 - Math.abs(best.tmax - 33) * 6), 5, 99);
    return { bearing: Math.round((best.cx - 15.5) / 32 * T_FOV), tmax: best.tmax, n: best.n, conf, width: best.width };
  }
  function thumbOf(f) {
    const t = new Uint8Array(192);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
      const i = y * 64 + x * 2;
      t[y * 16 + x] = clamp(Math.round(((f[i] + f[i + 1] + f[i + 32] + f[i + 33]) / 4 - 15) * 4), 0, 255);
    }
    return t;
  }
  function simAI(world, p, prm, rnd) {                        // カメラAIの仮想版 (誤認・見逃し付き)
    let best = null;
    for (const s of world.sources) {
      const dx = s.x - p.x, dy = s.y - p.y, d = Math.hypot(dx, dy), b = norm(deg(Math.atan2(dx, -dy)) - p.h);
      if (d > CAM_RANGE || Math.abs(b) > CAM_FOV / 2 || !los(world, p.x, p.y, s.x, s.y)) continue;
      let score = 0;
      if (s.type === 'human' && rnd() > prm.aiMiss) score = 0.62 + rnd() * 0.33;
      if (s.type !== 'human' && rnd() < prm.aiFalse) score = 0.6 + rnd() * 0.15;
      if (score && (!best || score > best.score)) best = { person: true, score, bearing: b, bx: b / (CAM_FOV / 2), bw: clamp(SRC[s.type].size / d, 0.1, 0.8) };
    }
    return best || { person: false, score: 0 };
  }

  // ---------------------------------------------------------------
  //  移動制御 (目標点へ / 障害物・仲間からの斥力)
  // ---------------------------------------------------------------
  function wheels(v, w, minPct) {
    let l = v + w, r = v - w; const m = Math.max(1, Math.abs(l), Math.abs(r)); l /= m; r /= m;
    const lift = x => Math.abs(x) < 0.02 ? 0 : Math.sign(x) * Math.max(Math.abs(x), minPct);
    return [Math.round(lift(l) * 255), Math.round(lift(r) * 255)];
  }
  function steer(p, g, ctx, i, prm) {
    if (!p || !g) return { cmd: [0, 0], done: false };
    const dx = g.x - p.x, dy = g.y - p.y, d = Math.hypot(dx, dy), tol = g.tol || 5;
    if (d < tol) {
      if (g.h == null) return { cmd: [0, 0], done: true };
      const e = norm(g.h - p.h);
      return Math.abs(e) < 8 ? { cmd: [0, 0], done: true } : { cmd: wheels(0, clamp(e / 90, -0.45, 0.45), prm.minPct), done: false };
    }
    const gx = dx / d * Math.min(d, 40), gy = dy / d * Math.min(d, 40);
    let rx = 0, ry = 0, close = false;
    const push = (vx, vy, dd, R, k0) => { if (dd > 0.1 && dd < R) { const k = k0 * (R - dd) / R; rx += vx / dd * k; ry += vy / dd * k; if (dd < 11) close = true; } };
    ctx.poses.forEach((q, j) => { if (j !== i && q) push(p.x - q.x, p.y - q.y, Math.hypot(p.x - q.x, p.y - q.y), 24, 55); });
    for (const o of ctx.obst) if (Math.hypot(g.x - o.x, g.y - o.y) > 12) push(p.x - o.x, p.y - o.y, Math.hypot(p.x - o.x, p.y - o.y), 20, 45);
    // 斥力が引力と釣り合って止まる (局所解) のを防ぐ: ぶつかりそうな時以外は斥力を引力の7割までに抑える
    const gm = Math.hypot(gx, gy), rm = Math.hypot(rx, ry);
    if (!close && rm > 0.7 * gm) { rx *= 0.7 * gm / rm; ry *= 0.7 * gm / rm; }
    let ax = gx + rx, ay = gy + ry;
    const W = ctx.W, H = ctx.H, m = 12;
    if (p.x < m) ax += (m - p.x) * 4; if (p.x > W - m) ax -= (p.x - W + m) * 4;
    if (p.y < m) ay += (m - p.y) * 4; if (p.y > H - m) ay -= (p.y - H + m) * 4;
    const e = norm(deg(Math.atan2(ax, -ay)) - p.h);
    let v = clamp(d / 30, 0.25, 1) * prm.vmax; if (Math.abs(e) > 60) v = 0; else v *= Math.cos(rad(e));
    return { cmd: wheels(v, clamp(e / 90, -0.6, 0.6), prm.minPct), done: false, e, ax, ay, ph: p.h };
  }

  // ---------------------------------------------------------------
  //  ミッション本体 (シミュレーション・実機 共通、時間は dt で進める)
  // ---------------------------------------------------------------
  function createMission(W, H, prm, emit) {
    const M = {
      phase: 'explore', t: 0, W, H, prm,
      cands: [], obst: [], crumbs: [], lanes: [], lane: 0, laneT: 0,
      cov: new Uint8Array(Math.ceil(W / 10) * Math.ceil(H / 10)), covT: 0,
      cur: null, phaseT: 0, votes: [], man: [null, null, null], stuck: [null, null, null],
      stats: { found: 0, falseAlarm: 0, decoyRejected: 0, firstFound: null },
    };
    // 探索機の走査ルート (芝刈り型)
    for (let y = H - 22, k = 0; y > 10; y -= prm.lane, k++) {
      const xs = k % 2 ? [W - 15, 15] : [15, W - 15];
      xs.forEach(x => M.lanes.push({ x, y }));
    }
    const setPhase = (ph, text, icon, data) => { M.phase = ph; M.phaseT = 0; if (text) emit({ t: M.t, type: ph, text, icon, data }); };
    M.setPhase = setPhase;

    function addObst(x, y) {
      if (x < 0 || y < 0 || x > W || y > H) return;
      if (M.obst.some(o => Math.hypot(o.x - x, o.y - y) < 5)) return;
      M.obst.push({ x, y }); if (M.obst.length > 500) M.obst.shift();
    }
    // A* 経路計画: 探索機が地図化した障害物 + 行き詰まり地点を避ける (未知の場所は通れると仮定)
    const GS = 5, GW = Math.ceil(W / GS), GH = Math.ceil(H / GS);
    function blockedGrid(self) {
      const g = new Uint8Array(GW * GH), inf = 11;
      const pts = M.obst.map(o => ({ x: o.x, y: o.y, r: inf }));
      inpPoses.forEach((q, j) => { if (q && j !== self) pts.push({ x: q.x, y: q.y, r: 17 }); });   // 仲間のロボットも避ける
      for (const o of pts) { const inf = o.r;
        const x0 = Math.max(0, Math.floor((o.x - inf) / GS)), x1 = Math.min(GW - 1, Math.floor((o.x + inf) / GS));
        const y0 = Math.max(0, Math.floor((o.y - inf) / GS)), y1 = Math.min(GH - 1, Math.floor((o.y + inf) / GS));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (Math.hypot(x * GS + 2.5 - o.x, y * GS + 2.5 - o.y) < inf) g[y * GW + x] = 1;
      }
      for (let x = 0; x < GW; x++) { g[x] = 1; g[(GH - 1) * GW + x] = 1; }
      for (let y = 0; y < GH; y++) { g[y * GW] = 1; g[y * GW + GW - 1] = 1; }
      return g;
    }
    function planPath(a, b, self) {
      const g = blockedGrid(self), idx = (x, y) => y * GW + x;
      const sx = clamp(Math.floor(a.x / GS), 1, GW - 2), sy = clamp(Math.floor(a.y / GS), 1, GH - 2);
      let tx = clamp(Math.floor(b.x / GS), 1, GW - 2), ty = clamp(Math.floor(b.y / GS), 1, GH - 2);
      for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) g[idx(x, y)] = 0;   // 自分の周り
      if (g[idx(tx, ty)]) {                                  // 目標が障害物内なら近くの空きセルへ
        let best = null;
        for (let r = 1; r < 8 && !best; r++) for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++)
          if (x > 0 && y > 0 && x < GW - 1 && y < GH - 1 && !g[idx(x, y)] && (!best || Math.hypot(x - tx, y - ty) < Math.hypot(best[0] - tx, best[1] - ty))) best = [x, y];
        if (!best) return null; [tx, ty] = best;
      }
      const N = GW * GH, gs = new Float32Array(N).fill(1e9), came = new Int32Array(N).fill(-1), open = [idx(sx, sy)], closed = new Uint8Array(N);
      gs[idx(sx, sy)] = 0;
      const hf = i => Math.hypot(i % GW - tx, Math.floor(i / GW) - ty);
      while (open.length) {
        let bi = 0; for (let k = 1; k < open.length; k++) if (gs[open[k]] + hf(open[k]) < gs[open[bi]] + hf(open[bi])) bi = k;
        const cur = open.splice(bi, 1)[0];
        if (cur === idx(tx, ty)) {
          const path = []; for (let c = cur; c >= 0; c = came[c]) path.push({ x: (c % GW) * GS + 2.5, y: Math.floor(c / GW) * GS + 2.5 });
          return path.reverse().filter((_, k, arr) => k % 3 === 0 || k === arr.length - 1);
        }
        closed[cur] = 1;
        const cx = cur % GW, cy = Math.floor(cur / GW);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
          const ni = idx(nx, ny); if (g[ni] || closed[ni]) continue;
          if (dx && dy && (g[idx(cx + dx, cy)] || g[idx(cx, cy + dy)])) continue;   // 角をすり抜けない
          const ng = gs[cur] + (dx && dy ? 1.414 : 1);
          if (ng < gs[ni]) { gs[ni] = ng; came[ni] = cur; if (!open.includes(ni)) open.push(ni); }
        }
      }
      return null;
    }
    // 経路に沿って進む (0.7秒ごと・障害物が増えたら再計画)
    M.paths = [null, null, null];
    function goPlanned(i, g, go) {
      const p = inpPoses[i]; if (!p) return false;
      const pl = M.paths[i];
      if (!pl || M.t - pl.t > 2.5 || pl.n !== M.obst.length || dist(pl.goal, g) > 5) {   // 再計画は控えめに (経路がブレないように)
        M.paths[i] = { pts: planPath(p, g, i) || [g], t: M.t, n: M.obst.length, goal: { x: g.x, y: g.y } };
      }
      const pts = M.paths[i].pts;
      while (pts.length > 1 && dist(p, pts[0]) < 9) pts.shift();
      if (pts.length > 1 || dist(p, g) > 10) { M.dbg = { wp: pts[0], n: pts.length }; go(i, { x: pts[0].x, y: pts[0].y, tol: 6 }); return false; }
      return go(i, g);
    }
    let inpPoses = [];

    function behindOnTrail(gap) {                             // 探索機の軌跡を gap cm さかのぼった点
      let acc = 0;
      for (let k = M.crumbs.length - 1; k > 0; k--) {
        acc += dist(M.crumbs[k], M.crumbs[k - 1]);
        if (acc >= gap) return M.crumbs[k - 1];
      }
      return null;
    }

    // inputs: { poses[3], tof: cm|null, hot: {bearing,conf,width,tmax}|null (新着のみ), ai: {person,score}|null (新着のみ) }
    M.step = (dt, inp) => {
      M.t += dt; M.phaseT += dt;
      const P = inp.poses, cmds = [[0, 0], [0, 0], [0, 0]]; inpPoses = P;
      const ctx = { poses: P, obst: M.obst, W, H };
      const go = (i, g) => { const r = steer(P[i], g, ctx, i, prm); cmds[i] = r.cmd; return r.done; };

      // --- 探索機の軌跡 (他の機体が安全に通れるルート) ---
      const S = P[R_SCOUT];
      if (S && (!M.crumbs.length || dist(S, M.crumbs[M.crumbs.length - 1]) > 4)) { M.crumbs.push({ x: S.x, y: S.y }); if (M.crumbs.length > 800) M.crumbs.shift(); }

      // --- 距離センサー → 障害物地図 ---
      if (S && inp.tof != null && inp.tof < 60) addObst(S.x + Math.sin(rad(S.h)) * (inp.tof + 3), S.y - Math.cos(rad(S.h)) * (inp.tof + 3));

      // --- サーマルの見えている範囲 = 捜索済み (カバー率) ---
      M.covT += dt;
      const T = P[R_THERM];
      if (T && M.covT > 0.5 && M.phase !== 'idle') {
        M.covT = 0;
        const cw = Math.ceil(W / 10);
        for (let gy = 0; gy < Math.ceil(H / 10); gy++) for (let gx = 0; gx < cw; gx++) {
          const x = gx * 10 + 5, y = gy * 10 + 5, d = Math.hypot(x - T.x, y - T.y);
          if (d > 120) continue;
          if (d < 12 || Math.abs(norm(deg(Math.atan2(x - T.x, -(y - T.y))) - T.h)) < T_FOV / 2) M.cov[gy * cw + gx] = 1;
        }
      }

      // --- 熱源の検知 → 候補を地図に登録 ---
      if (inp.hot && T && inp.hot.conf >= prm.minConf) {
        const h = inp.hot, angW = rad(Math.max(h.width, 1) * T_FOV / 32);
        const dEst = clamp(prm.size / (2 * Math.tan(angW / 2)), 12, T_RANGE);
        const a = rad(T.h + h.bearing), pos = { x: clamp(T.x + Math.sin(a) * dEst, 0, W), y: clamp(T.y - Math.cos(a) * dEst, 0, H) };
        let c = M.cands.find(c => c.status !== 'pending' && dist(c, pos) < 42) || M.cands.find(c => dist(c, pos) < 30);
        if (c && c.status === 'pending') { c.x = (c.x * c.n + pos.x) / (c.n + 1); c.y = (c.y * c.n + pos.y) / (c.n + 1); c.n++; c.conf = Math.max(c.conf, h.conf); c.tmax = h.tmax; }
        else if (!c) {
          c = { id: M.cands.length + 1, ...pos, n: 1, conf: h.conf, tmax: h.tmax, status: 'pending', t: M.t, seenFrom: { x: T.x, y: T.y } };
          M.cands.push(c);
          emit({ t: M.t, type: 'hot', icon: '🌡', text: `熱源を検知 #${c.id} (${h.tmax.toFixed(1)}℃ / 確度${h.conf}%)`, data: c, say: '熱源を検知しました' });
          if (M.phase === 'explore') {
            M.cur = c;
            if (prm.pipeline === 'thermalOnly') { confirm(c, null); }
            else setPhase('hotspot', '探索を一時停止し、熱源の位置を推定中', '🎯');
          }
        }
      }

      // --- 新しい AI 判定結果 ---
      if (inp.ai && M.phase === 'verify') { M.votes.push(inp.ai); if (M.votes.length > 40) M.votes.shift(); }

      // --- 行き詰まり検知 (前進指令なのに動かない → 障害物とみなして後退) ---
      const unstick = i => {
        const p = P[i]; if (!p) return;
        if (M.man[i] && M.t < M.man[i].until) { cmds[i] = M.man[i].cmd; return; }
        const st = M.stuck[i];
        const fwd = cmds[i][0] + cmds[i][1] > 100;
        if (!fwd) { M.stuck[i] = null; return; }
        if (!st || dist(st, p) > 3) { M.stuck[i] = { x: p.x, y: p.y, t: M.t }; return; }
        if (M.t - st.t > 1.6) {
          addObst(p.x + Math.sin(rad(p.h)) * 11, p.y - Math.cos(rad(p.h)) * 11);
          M.man[i] = { until: M.t + 0.5, cmd: [-160, -110] };
          M.stuck[i] = null;
        }
      };

      // ===================== 各フェーズ =====================
      const ph = M.phase;
      const pending = prm.pipeline === 'staged' && M.cands.find(c => c.status === 'pending' && !c.tried);
      if (ph === 'explore' && pending) {
        M.cur = pending;
        setPhase('dispatch', `未確認の熱源 #${pending.id} へ確認機を派遣`, '🚀');
      }
      else if (ph === 'explore') {
        // 探索機: 走査ルートを進む。距離センサーで近い障害物を避ける
        const wp = M.lanes[M.lane];
        if (!wp) { setPhase('complete', '捜索エリアの走査が完了しました', '🏁', null); emit({ t: M.t, type: 'say', say: '捜索が完了しました' }); }
        else {
          M.laneT += dt;
          if (inp.tof != null && inp.tof < 16 && S) M.man[R_SCOUT] = { until: M.t + 0.45, cmd: [-150, -60] };
          if (go(R_SCOUT, { x: wp.x, y: wp.y, tol: 8 }) || M.laneT > 14) { M.lane++; M.laneT = 0; }
          // 熱探知機: 探索機の安全ルートを 35cm 後ろから追従 + 首振りスキャン
          const b1 = behindOnTrail(35);
          if (b1 && T) {
            const near = dist(T, b1) < 10;
            go(R_THERM, near ? { x: b1.x, y: b1.y, tol: 10, h: (S ? deg(Math.atan2(S.x - T.x, -(S.y - T.y))) : T.h) + Math.sin(M.t * 0.9) * 50 } : { x: b1.x, y: b1.y, tol: 10 });
          }
          // 確認機: さらに後ろで待機 (派遣までの距離を短く)
          const b2 = behindOnTrail(75);
          if (b2) go(R_CONF, { x: b2.x, y: b2.y, tol: 12 });
        }
      }
      else if (ph === 'hotspot') {
        // 熱探知機が熱源の方へ向き直り、推定位置を固める
        const c = M.cur;
        if (T && c) { const b = norm(deg(Math.atan2(c.x - T.x, -(c.y - T.y))) - T.h); cmds[R_THERM] = Math.abs(b) > 6 ? wheels(0, clamp(b / 90, -0.4, 0.4), prm.minPct) : [0, 0]; }
        if (M.phaseT > 1.8) {
          setPhase('dispatch', `確認機 (1号機) を熱源 #${c.id} へ派遣`, '🚀');
          emit({ t: M.t, type: 'say', say: '確認機を派遣します' });
        }
      }
      else if (ph === 'dispatch') {
        const c = M.cur, C = P[R_CONF];
        if (C && c) {
          // 熱探知機側 (見通しが確保できている方向) から 32cm 手前に止まり、熱源を向く
          if (!c.seenFrom) c.seenFrom = T ? { x: T.x, y: T.y } : { x: C.x, y: C.y };
          const from = c.seenFrom, a = Math.atan2(from.x - c.x, -(from.y - c.y)) + rad([0, 70, -70][c.attempt || 0]);   // 再確認は別の角度から
          const g = { x: clamp(c.x + Math.sin(a) * 30, 10, W - 10), y: clamp(c.y - Math.cos(a) * 30, 10, H - 10), tol: 7 };
          g.h = deg(Math.atan2(c.x - g.x, -(c.y - g.y)));
          M.goal = g;
          const near = dist(C, g) < 10;
          // 熱探知機は見通し線から少しよけて道をあける
          if (T && (dist(T, g) < 26 || dist(T, C) < 28)) {
            const ux = T.x - (C.x + g.x) / 2, uy = T.y - (C.y + g.y) / 2, ud = Math.hypot(ux, uy) || 1;
            go(R_THERM, { x: clamp(T.x + ux / ud * 20, 12, W - 12), y: clamp(T.y + uy / ud * 20, 12, H - 12), tol: 6 });
          }
          const reached = goPlanned(R_CONF, g, go) && dist(C, g) < 10;
          if (reached || M.phaseT > 28) {
            c.tried = true; c.vpose = { ...C, timeout: M.phaseT > 28 }; M.votes = []; setPhase('verify', `AI でカメラ映像を判定中… (熱源 #${c.id})` + (M.phaseT > 28 ? ' ※接近できず手前から判定' : ''), '🧠');
          }
        }
      }
      else if (ph === 'verify') {
        const c = M.cur, C = P[R_CONF];
        const yes = M.votes.filter(v => v.person && v.score >= prm.aiTh).length;
        if (C && c) {
          // 人が見えないときはカメラを左右に振って探す (熱源の位置推定のズレを吸収)
          const sweep = yes === 0 && M.phaseT > 1.5 ? 38 * Math.sin((M.phaseT - 1.5) * 1.1) : 0;
          const b = norm(deg(Math.atan2(c.x - C.x, -(c.y - C.y))) + sweep - C.h);
          cmds[R_CONF] = Math.abs(b) > 6 ? wheels(0, clamp(b / 90, -0.35, 0.35), prm.minPct) : [0, 0];
        }
        // 連続性で判定: 直近6フレーム中3回以上「人」 (誤認はバラバラに出るので弾ける)
        const recent = M.votes.slice(-6).filter(v => v.person && v.score >= prm.aiTh).length;
        if (recent >= 3) confirm(c, M.votes.filter(v => v.person).sort((a, b) => b.score - a.score)[0], P[R_CONF]);
        else if (M.phaseT > prm.verifyTime && (c.attempt || 0) < 2 && prm.pipeline === 'staged') {
          c.attempt = (c.attempt || 0) + 1;
          setPhase('dispatch', `熱源 #${c.id} で人を確認できず → 別の角度から再確認 (${c.attempt + 1}/3)`, '↪');
        }
        else if (M.phaseT > prm.verifyTime) {
          c.status = 'false'; M.stats.decoyRejected++;
          emit({ t: M.t, type: 'false', icon: '✖', text: `熱源 #${c.id} は人ではありません (おとり熱源と判定) → 探索再開`, data: c, say: '人ではありませんでした。探索を再開します' });
          setPhase('explore');
        }
      }
      else if (ph === 'rescue') {
        // 要救助者を 3台で囲み、位置をマーク (救助隊の目印)
        const c = M.cur, C = P[R_CONF];
        if (c) {
          const a0 = C ? Math.atan2(C.x - c.x, -(C.y - c.y)) : 0;
          let done = 0;
          [R_THERM, R_SCOUT].forEach((i, k) => {
            const a = a0 + rad(120 * (k + 1)), g = { x: clamp(c.x + Math.sin(a) * 30, 10, W - 10), y: clamp(c.y - Math.cos(a) * 30, 10, H - 10), tol: 7 };
            g.h = deg(Math.atan2(c.x - g.x, -(c.y - g.y)));
            if (goPlanned(i, g, go)) done++;
          });
          if ((done === 2 && M.phaseT > 3) || M.phaseT > 15) {
            emit({ t: M.t, type: 'info', icon: '📍', text: `要救助者 #${c.id} の位置をマークしました → 次の要救助者を探索` });
            setPhase('explore');
          }
        }
      }
      [0, 1, 2].forEach(unstick);
      return cmds;
    };

    function confirm(c, best, C) {
      c.status = 'victim'; c.score = best ? best.score : null;
      if (best && C && best.bearing != null) {     // カメラで見た方向に位置を補正
        const d = clamp(dist(C, c), 20, 60), a = rad(C.h + best.bearing);
        c.x = clamp(C.x + Math.sin(a) * d, 0, W); c.y = clamp(C.y - Math.cos(a) * d, 0, H);
      }
      M.stats.found++; if (M.stats.firstFound == null) M.stats.firstFound = M.t;
      emit({ t: M.t, type: 'victim', icon: '🆘', text: `要救助者を発見！ #${c.id}` + (best ? ` (AI確度 ${(best.score * 100).toFixed(0)}%)` : ' (サーマルのみで判定)'), data: c, say: '要救助者を発見しました。救助隊形に移行します', siren: true });
      M.setPhase('rescue', '救助隊形: 要救助者を囲んで位置をマーク', '🛡');
    }
    M.forceVerdict = person => {
      if (M.phase !== 'verify' || !M.cur) return;
      if (person) confirm(M.cur, { score: 1 });
      else { M.cur.status = 'false'; M.stats.decoyRejected++; emit({ t: M.t, type: 'false', icon: '✖', text: `熱源 #${M.cur.id} はオペレーターが「人ではない」と判定`, data: M.cur }); M.setPhase('explore'); }
    };
    M.dispatchTo = c => { if (!c) return; M.cur = c; c.tried = false; M.setPhase('dispatch', `確認機を熱源 #${c.id} へ派遣 (手動指示)`, '🚀'); };
    return M;
  }

  // ---------------------------------------------------------------
  //  シミュレーションの 1 ステップ (ロボットを動かし、センサーを生成)
  // ---------------------------------------------------------------
  function createSim(world, seed, prm) {
    const rnd = rngFrom(seed * 7 + 3);
    const sim = { world, poses: startPoses(world.H), tofT: 0, thT: 0, aiT: 0, frame: null, hot: null, ai: null, tof: null };
    sim.step = (dt, cmds, wantAI) => {
      sim.poses.forEach((p, i) => {
        const [l, r] = cmds[i], v = (l + r) / 2 / 255 * prm.simV, w = (l - r) / 2 / 255 * prm.simW;
        const h = p.h + w * dt, nx = p.x + Math.sin(rad(h)) * v * dt, ny = p.y - Math.cos(rad(h)) * v * dt;
        p.h = norm(h);
        const blocked = nx < ROBOT_R || ny < ROBOT_R || nx > world.W - ROBOT_R || ny > world.H - ROBOT_R ||
          world.obstacles.some(o => inRect(nx, ny, o, ROBOT_R)) || world.sources.some(s => Math.hypot(s.x - nx, s.y - ny) < SRC[s.type].size / 2 + ROBOT_R - 2);
        if (!blocked) { p.x = nx; p.y = ny; }
      });
      const out = { tof: null, hot: null, ai: null, frame: null };
      sim.tofT += dt; sim.thT += dt; sim.aiT += dt;
      if (sim.tofT >= 0.1) { sim.tofT = 0; out.tof = raycast(world, sim.poses[R_SCOUT]) + (rnd() - 0.5) * 1.5; sim.tof = out.tof; }
      if (sim.thT >= 0.5) {                                   // MLX90640 ≒ 2フレーム/秒
        sim.thT = 0; const f = thermalFrame(world, sim.poses[R_THERM], rnd);
        out.frame = f; out.hot = analyzeThermal(f, prm); sim.frame = f; sim.hot = out.hot;
      }
      if (wantAI && sim.aiT >= 0.4) { sim.aiT = 0; out.ai = simAI(world, sim.poses[R_CONF], prm, rnd); sim.ai = out.ai; }
      return out;
    };
    return sim;
  }

  // =====================================================================
  //  UI
  // =====================================================================
  const map = $('mMap'), mctx = map.getContext('2d');
  const thc = $('mThermal'), tctx = thc.getContext('2d');
  const camc = $('mCamCanvas'), cctx = camc.getContext('2d');
  const mImg = $('mCamImg');
  const params = () => ({
    minConf: +$('mMinConf').value || 40, size: +$('mSize').value || 20, aiTh: (+$('mAiTh').value || 60) / 100,
    verifyTime: +$('mVerifyT').value || 10, lane: +$('mLane').value || 40, vmax: 0.75, minPct: Math.max(0.3, (P.minPct || 35) / 100),
    hMin: 28, hMax: 40, aiMiss: 0.15, aiFalse: 0.05, simV: 30, simW: 200, pipeline: 'staged',
  });

  let mode = 'sim', mission = null, sim = null, world = null, running = false, speed = 1, seed = 1;
  let lastHot = null, hotNew = null, aiNew = null, thermalThumb = null, thermalHotInfo = null, lastAI = null;
  let log = [], snapshots = [], tool = null, showTruth = true;
  const tofReal = () => robots[R_SCOUT]?.dist >= 0 ? robots[R_SCOUT].dist / 10 : null;

  // ---------- 音声・サイレン ----------
  let actx = null;
  function siren() {
    if (!$('mVoice').checked) return;
    try {
      actx = actx || new AudioContext();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'sawtooth'; o.connect(g); g.connect(actx.destination); g.gain.value = 0.06;
      for (let k = 0; k < 4; k++) { o.frequency.setValueAtTime(700, t + k * 0.4); o.frequency.linearRampToValueAtTime(1100, t + k * 0.4 + 0.2); o.frequency.linearRampToValueAtTime(700, t + k * 0.4 + 0.4); }
      o.start(t); o.stop(t + 1.6);
    } catch {}
  }
  function say(text) {
    if (!$('mVoice').checked || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 1.1; speechSynthesis.speak(u);
  }

  // ---------- イベント ----------
  function onEvent(ev) {
    if (ev.say) say(ev.say);
    if (ev.siren) siren();
    if (ev.type === 'say') return;
    log.unshift(ev);
    if (ev.type === 'victim') {
      flash();
      const snap = captureCam();
      if (snap) snapshots.push({ id: ev.data.id, img: snap, t: ev.t });
    }
    renderLog();
  }
  function flash() { const b = $('mBanner'); b.classList.remove('alert'); void b.offsetWidth; b.classList.add('alert'); }
  const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  function renderLog() {
    $('mLog').innerHTML = log.slice(0, 60).map(e => `<div class="ev ev-${e.type}"><span class="evt">${fmt(e.t)}</span> ${e.icon || '•'} ${e.text}</div>`).join('');
  }

  // ---------- 開始・停止 ----------
  function newWorld() {
    world = makeScenario($('mScenario').value, P.field.w, P.field.h, seed);
    sim = createSim(world, seed, params());
    mission = null; log = []; snapshots = []; renderLog(); lastHot = null;
  }
  function start() {
    if (mode === 'real') {
      if (!swarmHook?.api?.calibrated()) { alert('実機モードの自動移動には、群制御タブで俯瞰カメラ + フィールド校正が必要です。\n(校正なしでも熱源アラートとAI判定テストは使えます)'); return; }
      if (!robots.some(r => r.ok)) { alert('ロボットが接続されていません'); return; }
      swarmHook.stop(); if (run) stopRun();
    }
    if (mode === 'sim' && !sim) newWorld();
    if (!mission || mission.phase === 'complete') {
      if (mode === 'sim' && mission) newWorld();
      mission = createMission(P.field.w, P.field.h, params(), onEvent);
      onEvent({ t: 0, type: 'info', icon: '▶', text: `ミッション開始 (${mode === 'sim' ? 'シミュレーション' : '実機'})`, say: '捜索ミッションを開始します' });
    }
    running = true; updateButtons();
  }
  function pause() { running = false; updateButtons(); robots.forEach(r => r.send(0, 0, true)); }
  function reset() {
    running = false; mission = null;
    if (mode === 'sim') newWorld(); else { log = []; snapshots = []; renderLog(); }
    updateButtons(); draw();
  }
  function updateButtons() {
    $('mStart').textContent = running ? '⏸ 一時停止' : (mission && mission.phase !== 'complete' ? '▶ 再開' : '▶ ミッション開始');
  }
  $('mStart').onclick = () => running ? pause() : start();
  $('mReset').onclick = reset;
  $('mNewMap').onclick = () => { seed = Math.floor(Math.random() * 1e6); reset(); };
  $('mScenario').onchange = () => { seed = Math.floor(Math.random() * 1e6); reset(); };
  document.querySelectorAll('[data-mmode]').forEach(b => b.onclick = () => {
    if (running) pause();
    mode = b.dataset.mmode;
    document.querySelectorAll('[data-mmode]').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.simOnly').forEach(e => e.style.display = mode === 'sim' ? '' : 'none');
    document.querySelectorAll('.realOnly').forEach(e => e.style.display = mode === 'real' ? '' : 'none');
    reset();
  });
  document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => {
    speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('active', x === b));
  });
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {
    tool = tool === b.dataset.tool ? null : b.dataset.tool;
    document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x.dataset.tool === tool));
  });
  $('mTruth').onchange = () => { showTruth = $('mTruth').checked; draw(); };
  $('mDispatch').onclick = () => { const c = mission?.cands.filter(c => c.status === 'pending').pop(); if (c) mission.dispatchTo(c); else alert('未確認の熱源がありません'); };
  $('mYes').onclick = () => mission?.forceVerdict(true);
  $('mNo').onclick = () => mission?.forceVerdict(false);
  $('mResume').onclick = () => { if (mission) { mission.setPhase('explore', '探索を再開 (手動指示)', '🔁'); } };
  $('mReport').onclick = exportReport;

  // マップクリック: シミュレーションの配置編集
  map.addEventListener('click', e => {
    if (mode !== 'sim' || !tool || !world) return;
    const r = map.getBoundingClientRect(), x = (e.clientX - r.left - mv.ox) / mv.s, y = (e.clientY - r.top - mv.oy) / mv.s;
    if (tool === 'erase') {
      world.sources = world.sources.filter(s => Math.hypot(s.x - x, s.y - y) > 12);
      world.obstacles = world.obstacles.filter(o => !inRect(x, y, o, 4));
    } else if (tool === 'rubble') world.obstacles.push({ x: x - 10, y: y - 8, w: 20, h: 16 });
    else world.sources.push({ x, y, type: tool });
    draw();
  });

  // ---------- 実機の入力 (BLE) ----------
  const chunks = new Uint8Array(192);
  window.missionInput = {
    hot(id, t) {                                   // "H-12,345,18,80,5" / "H-"
      if (id !== R_THERM + 1) return;
      if (t === 'H-') { thermalHotInfo = null; return; }
      const v = t.slice(1).split(',').map(Number);
      const h = { bearing: v[0], tmax: v[1] / 10, n: v[2], conf: v[3], width: v[4] || 3 };
      thermalHotInfo = h;
      if (mode === 'real') hotNew = h;
    },
    chunk(id, dv) {                                // サーマル画像の分割パケット
      if (id !== R_THERM + 1) return;
      const c = dv.getUint8(0) & 0x7f;
      for (let k = 1; k < dv.byteLength && c * 19 + k - 1 < 192; k++) chunks[c * 19 + k - 1] = dv.getUint8(k);
      if (c === 10 && mode === 'real') { thermalThumb = chunks.slice(); }
    },
  };

  // ---------- 実機のカメラ AI (COCO-SSD) ----------
  let model = null, modelLoading = null, aiLoopOn = false, aiTest = false;
  const loadScript = src => new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ng(new Error(src)); document.head.appendChild(s); });
  async function ensureModel() {
    if (model) return model;
    if (!modelLoading) modelLoading = (async () => {
      $('mAiState').textContent = 'AIモデル読込中…';
      if (!window.tf) await loadScript('lib/tf.min.js');
      if (!window.cocoSsd) await loadScript('lib/coco-ssd.min.js');
      model = await cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: 'lib/ssd/model.json' });
      $('mAiState').textContent = 'AI準備完了 (オフライン)';
      return model;
    })().catch(e => { modelLoading = null; $('mAiState').textContent = 'AI読込失敗: ' + e.message + ' (http://localhost で開いていますか？)'; throw e; });
    return modelLoading;
  }
  $('mCamStart').onclick = () => {
    if (typeof cam !== 'undefined') cam.src = '';               // 操作タブ側の接続を切る (同時に2本は不可)
    mImg.crossOrigin = 'anonymous';
    mImg.src = $('camUrl').value.trim() + '?m=' + Date.now();
  };
  $('mAiTest').onclick = async () => { aiTest = !aiTest; $('mAiTest').classList.toggle('active', aiTest); if (aiTest) { await ensureModel(); aiLoop(); } };
  async function aiLoop() {
    if (aiLoopOn) return; aiLoopOn = true;
    const work = document.createElement('canvas');
    while (mode === 'real' && (aiTest || mission?.phase === 'verify')) {
      try {
        await ensureModel();
        if (mImg.naturalWidth) {
          work.width = mImg.naturalWidth; work.height = mImg.naturalHeight;
          work.getContext('2d').drawImage(mImg, 0, 0);
          const preds = (await model.detect(work)).filter(p => p.class === 'person');
          const best = preds.sort((a, b) => b.score - a.score)[0];
          lastAI = best ? { person: true, score: best.score, box: best.bbox, w: work.width, h: work.height,
                            bearing: ((best.bbox[0] + best.bbox[2] / 2) / work.width - 0.5) * CAM_FOV } : { person: false, score: 0 };
          if (mission?.phase === 'verify') aiNew = lastAI;
        } else $('mAiState').textContent = 'カメラ映像がありません (「映像を接続」)';
      } catch (e) { console.warn(e); $('mAiState').textContent = 'AI判定エラー: ' + e.message + ' (映像のCORS設定/接続を確認)'; await new Promise(r => setTimeout(r, 1000)); }
      await new Promise(r => setTimeout(r, 350));
    }
    aiLoopOn = false;
  }

  // ---------- 制御ループ (送信ループから 20Hz で呼ばれる) ----------
  function tickReal() {
    const api = swarmHook?.api;
    const now = performance.now();
    const poses = robots.map((_, i) => { const p = api?.poses[i]; return p && now - p.t < 400 ? p : null; });
    const cmds = mission.step(0.05, { poses, tof: tofReal(), hot: hotNew, ai: aiNew });
    hotNew = null; aiNew = null;
    if (mission.phase === 'verify') aiLoop();
    if (mission.phase === 'complete') { running = false; updateButtons(); }
    return poses.map((p, i) => p ? cmds[i] : [0, 0]);
  }
  function tickSim() {
    const n = speed;
    for (let k = 0; k < n; k++) {
      const out = sim.step(0.05, mission ? mission.lastCmds || [[0, 0], [0, 0], [0, 0]] : [[0, 0], [0, 0], [0, 0]], mission?.phase === 'verify');
      if (out.frame) { thermalThumb = thumbOf(out.frame); thermalHotInfo = out.hot; }
      if (out.ai) lastAI = out.ai;
      if (mission && running) {
        mission.lastCmds = mission.step(0.05, { poses: sim.poses.map(p => ({ ...p })), tof: out.tof, hot: out.hot, ai: out.ai });
        if (mission.phase === 'complete') { running = false; mission.lastCmds = null; updateButtons(); break; }
      } else if (mission) mission.lastCmds = null;
    }
  }

  missionHook = {
    active: () => mode === 'real' && running && !!mission,
    tick: () => tickReal(),
    stop: () => { if (mode === 'real' && running) pause(); },
    show: () => { if (!sim) newWorld(); draw(); },
  };
  setInterval(() => {
    if (mode === 'sim' && sim && view === 'mission') tickSim();
    if (view === 'mission') draw();
  }, 50);

  // =====================================================================
  //  描画
  // =====================================================================
  let mv = { s: 1, ox: 0, oy: 0 };
  function fitCanvas(c, ctx) {
    const b = c.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
    if (c.width !== Math.round(b.width * d) || c.height !== Math.round(b.height * d)) { c.width = Math.round(b.width * d); c.height = Math.round(b.height * d); }
    ctx.setTransform(d, 0, 0, d, 0, 0); return b;
  }
  function wedge(ctx, x, y, h, fov, r, color) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.arc(x, y, r, rad(h - 90 - fov / 2), rad(h - 90 + fov / 2)); ctx.closePath(); ctx.fill();
  }
  function draw() {
    if (view !== 'mission') return;
    const W = P.field.w, H = P.field.h, b = fitCanvas(map, mctx), now = performance.now();
    const s = Math.min((b.width - 30) / W, (b.height - 30) / H);
    mv = { s, ox: (b.width - W * s) / 2, oy: (b.height - H * s) / 2 };
    const T = (x, y) => [mv.ox + x * s, mv.oy + y * s];
    mctx.clearRect(0, 0, b.width, b.height);
    const [x0, y0] = T(0, 0);
    mctx.fillStyle = '#16191f'; mctx.fillRect(x0, y0, W * s, H * s);
    // 捜索済みエリア
    if (mission) {
      const cw = Math.ceil(W / 10);
      mctx.fillStyle = 'rgba(61,220,132,0.10)';
      mission.cov.forEach((v, i) => { if (v) { const [x, y] = T((i % cw) * 10, Math.floor(i / cw) * 10); mctx.fillRect(x, y, 10 * s, 10 * s); } });
    }
    mctx.strokeStyle = '#ffffff10';
    for (let x = 0; x <= W; x += 10) { const [a] = T(x, 0); mctx.beginPath(); mctx.moveTo(a, y0); mctx.lineTo(a, y0 + H * s); mctx.stroke(); }
    for (let y = 0; y <= H; y += 10) { const [, c] = T(0, y); mctx.beginPath(); mctx.moveTo(x0, c); mctx.lineTo(x0 + W * s, c); mctx.stroke(); }
    mctx.strokeStyle = '#555'; mctx.strokeRect(x0, y0, W * s, H * s);
    // 拠点
    const [bx, by] = T(0, H - 40); mctx.fillStyle = 'rgba(59,91,219,0.18)'; mctx.fillRect(bx, by, 55 * s, 40 * s);
    mctx.fillStyle = '#8fa8ff'; mctx.font = '11px system-ui'; mctx.fillText('拠点', bx + 4, by + 13);

    // 正解 (シミュレーションの実際の配置)
    if (mode === 'sim' && world) {
      world.obstacles.forEach(o => { const [x, y] = T(o.x, o.y); mctx.fillStyle = showTruth ? '#4a4038' : '#2a2620'; mctx.fillRect(x, y, o.w * s, o.h * s); });
      if (showTruth) world.sources.forEach(src => {
        const [x, y] = T(src.x, src.y); mctx.font = `${Math.max(14, 13 * s)}px system-ui`; mctx.textAlign = 'center'; mctx.globalAlpha = 0.85;
        mctx.fillText(SRC[src.type].icon, x, y + 6); mctx.globalAlpha = 1; mctx.textAlign = 'left';
      });
    }
    if (mission) {
      // 走査ルート
      mctx.strokeStyle = '#ffffff22'; mctx.setLineDash([3, 5]); mctx.beginPath();
      mission.lanes.forEach((p, k) => { const [x, y] = T(p.x, p.y); k ? mctx.lineTo(x, y) : mctx.moveTo(x, y); }); mctx.stroke(); mctx.setLineDash([]);
      // 探索機が通った安全ルート
      mctx.strokeStyle = COLORS[R_SCOUT] + '70'; mctx.lineWidth = 2; mctx.beginPath();
      mission.crumbs.forEach((p, k) => { const [x, y] = T(p.x, p.y); k ? mctx.lineTo(x, y) : mctx.moveTo(x, y); }); mctx.stroke(); mctx.lineWidth = 1;
      // 発見した障害物
      mctx.fillStyle = '#ff9f43';
      mission.obst.forEach(o => { const [x, y] = T(o.x, o.y); mctx.fillRect(x - 2, y - 2, 4, 4); });
      // 候補・要救助者
      mission.cands.forEach(c => {
        const [x, y] = T(c.x, c.y), pulse = 1 + 0.25 * Math.sin(now / 150);
        if (c.status === 'victim') {
          mctx.strokeStyle = '#ff3b30'; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(x, y, 16 * pulse, 0, 7); mctx.stroke();
          mctx.fillStyle = '#ff3b30'; mctx.font = 'bold 12px system-ui'; mctx.fillText(`🆘 要救助者 #${c.id}`, x + 18, y - 10);
        } else if (c.status === 'false') {
          mctx.strokeStyle = '#888'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(x - 7, y - 7); mctx.lineTo(x + 7, y + 7); mctx.moveTo(x + 7, y - 7); mctx.lineTo(x - 7, y + 7); mctx.stroke();
          mctx.fillStyle = '#999'; mctx.font = '11px system-ui'; mctx.fillText(`#${c.id} 人ではない`, x + 10, y + 4);
        } else {
          mctx.strokeStyle = '#ffc94a'; mctx.lineWidth = 2; mctx.setLineDash([4, 3]); mctx.beginPath(); mctx.arc(x, y, 14 * pulse, 0, 7); mctx.stroke(); mctx.setLineDash([]);
          mctx.fillStyle = '#ffc94a'; mctx.font = 'bold 12px system-ui'; mctx.fillText(`? 熱源 #${c.id}`, x + 16, y - 8);
        }
        mctx.lineWidth = 1;
      });
      if (mission.phase === 'dispatch' && mission.goal) { const [x, y] = T(mission.goal.x, mission.goal.y); mctx.strokeStyle = COLORS[R_CONF]; mctx.beginPath(); mctx.arc(x, y, 6, 0, 7); mctx.stroke(); }
    }
    // ロボット + センサーの視野
    const poses = mode === 'sim' ? (sim ? sim.poses : []) : robots.map((_, i) => swarmHook?.api?.poses[i] || null);
    poses.forEach((p, i) => {
      if (!p) return;
      const [x, y] = T(p.x, p.y);
      if (i === R_THERM) wedge(mctx, x, y, p.h, T_FOV, 120 * s, 'rgba(255,120,40,0.10)');
      if (i === R_CONF) wedge(mctx, x, y, p.h, CAM_FOV, CAM_RANGE * s, mission?.phase === 'verify' ? 'rgba(63,169,255,0.28)' : 'rgba(63,169,255,0.10)');
      if (i === R_SCOUT) {
        const d = mode === 'sim' ? sim?.tof : tofReal();
        if (d != null) { const [hx, hy] = T(p.x + Math.sin(rad(p.h)) * d, p.y - Math.cos(rad(p.h)) * d); mctx.strokeStyle = d < 20 ? '#ff6b5a' : '#3ddc84aa'; mctx.lineWidth = 2; mctx.beginPath(); mctx.moveTo(x, y); mctx.lineTo(hx, hy); mctx.stroke(); mctx.lineWidth = 1; }
      }
      const R = Math.max(9, ROBOT_R * s);
      mctx.save(); mctx.translate(x, y); mctx.rotate(rad(p.h));
      mctx.fillStyle = COLORS[i]; mctx.beginPath(); mctx.roundRect(-R * .8, -R * .9, R * 1.6, R * 1.8, R * .3); mctx.fill();
      mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(0, -R * .75); mctx.lineTo(R * .4, -R * .15); mctx.lineTo(-R * .4, -R * .15); mctx.fill();
      mctx.restore();
      mctx.font = 'bold 11px system-ui'; mctx.fillStyle = '#fff'; mctx.textAlign = 'center'; mctx.fillText(`${ROLE_ICON[i]}${i + 1}`, x, y + R + 13); mctx.textAlign = 'left';
    });
    if (mode === 'real' && !swarmHook?.api?.calibrated()) {
      mctx.fillStyle = '#8a90a2'; mctx.font = '13px system-ui';
      mctx.fillText('実機の位置表示・自動移動には、群制御タブで俯瞰カメラとフィールド校正が必要です', x0 + 10, y0 + 22);
    }
    drawBanner(); drawThermal(); drawCam(); drawRoles();
  }

  const PHASE = {
    idle: ['待機中', '#8a90a2'], explore: ['🔍 捜索中', '#3ddc84'], hotspot: ['🎯 熱源を検知', '#ffc94a'], dispatch: ['🚀 確認機を派遣中', '#3fa9ff'],
    verify: ['🧠 AI判定中', '#b18cff'], rescue: ['🆘 要救助者を発見 — 救助隊形', '#ff3b30'], complete: ['🏁 捜索完了', '#e8eaf0'],
  };
  function drawBanner() {
    const ph = mission ? mission.phase : 'idle', [label, color] = PHASE[ph];
    $('mPhase').textContent = running || ph === 'complete' ? label : (mission ? '⏸ 一時停止中 — ' + label : '待機中');
    $('mPhase').style.color = color;
    $('mTimer').textContent = mission ? fmt(mission.t) : '00:00';
    const cv = mission ? Math.round(mission.cov.reduce((a, v) => a + v, 0) / mission.cov.length * 100) : 0;
    const n = st => mission ? mission.cands.filter(c => c.status === st).length : 0;
    $('mStats').innerHTML = `<span>捜索済み <b>${cv}%</b></span><span>熱源 <b>${mission ? mission.cands.length : 0}</b></span><span style="color:#ff6b6b">要救助者 <b>${n('victim')}</b></span><span>おとり除外 <b>${n('false')}</b></span>`;
  }
  // 鉄色パレット (サーマル表示)
  function iron(v) {
    const st = [[0, 0, 0, 0], [0.25, 80, 0, 140], [0.5, 220, 40, 60], [0.75, 255, 160, 0], [1, 255, 255, 220]];
    for (let k = 1; k < st.length; k++) if (v <= st[k][0]) { const a = st[k - 1], b2 = st[k], f = (v - a[0]) / (b2[0] - a[0]); return [0, 1, 2].map(c => Math.round(a[c + 1] + (b2[c + 1] - a[c + 1]) * f)); }
    return [255, 255, 220];
  }
  const thSmall = document.createElement('canvas'); thSmall.width = 16; thSmall.height = 12;
  function drawThermal() {
    const b = fitCanvas(thc, tctx);
    tctx.fillStyle = '#000'; tctx.fillRect(0, 0, b.width, b.height);
    if (!thermalThumb) { tctx.fillStyle = '#8a90a2'; tctx.font = '12px system-ui'; tctx.fillText(mode === 'sim' ? 'ミッション開始で表示' : '2号機 (MLX90640) の接続待ち', 10, 20); return; }
    let mn = 255, mx = 0; thermalThumb.forEach(v => { mn = Math.min(mn, v); mx = Math.max(mx, v); });
    mx = Math.max(mx, mn + 24);                                 // 最低 6℃ のレンジ
    const sc = thSmall.getContext('2d'), img = sc.createImageData(16, 12);
    thermalThumb.forEach((v, i) => { const [r, g, bb] = iron((v - mn) / (mx - mn)); img.data.set([r, g, bb, 255], i * 4); });
    sc.putImageData(img, 0, 0);
    const w = b.width, h = Math.min(b.height, w * 0.75), oy = (b.height - h) / 2;
    tctx.imageSmoothingEnabled = true; tctx.drawImage(thSmall, 0, oy, w, h);
    const hi = thermalHotInfo;
    tctx.font = '12px system-ui'; tctx.fillStyle = '#fff';
    tctx.fillText(`${(mn / 4 + 15).toFixed(1)}〜${(mx / 4 + 15).toFixed(1)}℃`, 6, oy + h - 6);
    if (hi) {
      const x = (hi.bearing / T_FOV + 0.5) * w;
      tctx.strokeStyle = hi.conf >= (+$('mMinConf').value || 50) ? '#3ddc84' : '#ffc94a'; tctx.lineWidth = 2;
      tctx.strokeRect(x - 18, oy + h * 0.25, 36, h * 0.5);
      tctx.fillStyle = '#fff'; tctx.font = 'bold 13px system-ui';
      tctx.fillText(`人らしき熱源 ${hi.tmax.toFixed(1)}℃ 確度${hi.conf}% 方位${hi.bearing > 0 ? '+' : ''}${hi.bearing}°`, 6, oy + 34);
    }
  }
  function drawCam() {
    const b = fitCanvas(camc, cctx), w = b.width, h = b.height;
    cctx.clearRect(0, 0, w, h);
    if (mode === 'sim') {
      // 仮想カメラ映像 (1号機視点)
      const g = cctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#3a3f4a'); g.addColorStop(0.5, '#555'); g.addColorStop(1, '#2b2b2b');
      cctx.fillStyle = g; cctx.fillRect(0, 0, w, h);
      if (sim && world) {
        const p = sim.poses[R_CONF];
        const items = [];
        world.obstacles.forEach(o => items.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, k: 'o', size: Math.max(o.w, o.h) }));
        world.sources.forEach(s2 => items.push({ x: s2.x, y: s2.y, k: s2.type, size: SRC[s2.type].size }));
        items.map(it => ({ ...it, d: Math.hypot(it.x - p.x, it.y - p.y), b: norm(deg(Math.atan2(it.x - p.x, -(it.y - p.y))) - p.h) }))
          .filter(it => it.d < 160 && Math.abs(it.b) < CAM_FOV / 2 + 10 && (it.k === 'o' || los(world, p.x, p.y, it.x, it.y))).sort((a, b2) => b2.d - a.d)
          .forEach(it => {
            const x = w / 2 + it.b / (CAM_FOV / 2) * w / 2, sz = clamp(it.size / it.d * h * 1.1, 6, h * 0.9), y = h * 0.55 + clamp(40 / it.d, 0, 1) * h * 0.3;
            if (it.k === 'o') { cctx.fillStyle = '#6b5a48'; cctx.fillRect(x - sz / 2, y - sz * 0.6, sz, sz * 0.7); }
            else { cctx.font = `${sz}px system-ui`; cctx.textAlign = 'center'; cctx.fillText(SRC[it.k].icon, x, y + sz * 0.3); cctx.textAlign = 'left'; }
          });
        if (lastAI?.person && mission?.phase === 'verify') {
          const x = w / 2 + lastAI.bx * w / 2, bw = lastAI.bw * w;
          cctx.strokeStyle = '#3ddc84'; cctx.lineWidth = 3; cctx.strokeRect(x - bw / 2, h * 0.25, bw, h * 0.6);
          cctx.fillStyle = '#3ddc84'; cctx.font = 'bold 13px system-ui'; cctx.fillText(`person ${(lastAI.score * 100).toFixed(0)}%`, x - bw / 2, h * 0.25 - 5);
        }
      }
      cctx.fillStyle = '#ffffffaa'; cctx.font = '11px system-ui'; cctx.fillText('(仮想映像)', w - 70, 14);
    } else if (lastAI?.person && lastAI.box && mImg.naturalWidth) {
      const r = mImg.getBoundingClientRect(), pr = camc.getBoundingClientRect();
      const sx = r.width / lastAI.w, sy = r.height / lastAI.h, [bx, by, bw, bh] = lastAI.box;
      cctx.strokeStyle = '#3ddc84'; cctx.lineWidth = 3; cctx.strokeRect(r.left - pr.left + bx * sx, r.top - pr.top + by * sy, bw * sx, bh * sy);
      cctx.fillStyle = '#3ddc84'; cctx.font = 'bold 13px system-ui'; cctx.fillText(`person ${(lastAI.score * 100).toFixed(0)}%`, r.left - pr.left + bx * sx, r.top - pr.top + by * sy - 5);
    }
    const ph = mission?.phase;
    if (ph === 'verify') { const yes = mission.votes.filter(v => v.person && v.score >= (+$('mAiTh').value || 60) / 100).length; cctx.fillStyle = '#b18cff'; cctx.font = 'bold 13px system-ui'; cctx.fillText(`AI判定中… 人の検出 ${mission.votes.slice(-6).filter(v => v.person && v.score >= (+$('mAiTh').value || 60) / 100).length}/3 (直近6フレーム)`, 6, h - 8); }
  }
  function drawRoles() {
    const el = $('mRoles'); if (el.children.length !== 3) el.innerHTML = [0, 1, 2].map(i => `<div class="role" style="border-color:${COLORS[i]}"><b style="color:${COLORS[i]}">${ROLE_ICON[i]} ${i + 1}号機</b><span>${ROLE[i]}</span><em></em></div>`).join('');
    const ph = mission?.phase || 'idle';
    const task = [
      { explore: '後方で待機', hotspot: '待機', dispatch: '熱源へ移動中', verify: 'AIで判定中', rescue: '要救助者を監視', complete: '停止' },
      { explore: '安全ルートを追従・熱スキャン', hotspot: '熱源へ向き直り', dispatch: '熱源を監視', verify: '熱源を監視', rescue: '救助隊形', complete: '停止' },
      { explore: '先行して走査・障害物を地図化', hotspot: '停止', dispatch: '停止', verify: '停止', rescue: '救助隊形', complete: '停止' },
    ];
    [0, 1, 2].forEach(i => { el.children[i].querySelector('em').textContent = mission ? (task[i][ph] || '') : (mode === 'real' ? (robots[i].ok ? '接続済み' : '未接続') : '待機'); });
  }

  // ---------- スナップショット & レポート ----------
  function captureCam() {
    try {
      const c = document.createElement('canvas');
      if (mode === 'real' && mImg.naturalWidth) { c.width = mImg.naturalWidth; c.height = mImg.naturalHeight; c.getContext('2d').drawImage(mImg, 0, 0); }
      else { c.width = camc.width; c.height = camc.height; c.getContext('2d').drawImage(camc, 0, 0); }
      return c.toDataURL('image/jpeg', 0.8);
    } catch { return null; }
  }
  function exportReport() {
    if (!mission) { alert('ミッションの記録がありません'); return; }
    const mapImg = map.toDataURL('image/png');
    const vs = mission.cands.filter(c => c.status === 'victim');
    const html = `<!doctype html><meta charset=utf-8><title>捜索レポート</title><body style="font-family:sans-serif;max-width:900px;margin:20px auto">
<h1>🚨 SwarmBot 捜索レポート</h1><p>${new Date().toLocaleString()} / モード: ${mode === 'sim' ? 'シミュレーション' : '実機'} / 経過 ${fmt(mission.t)} / 捜索済み ${Math.round(mission.cov.reduce((a, v) => a + v, 0) / mission.cov.length * 100)}%</p>
<h2>要救助者 ${vs.length}名</h2><table border=1 cellpadding=6 style="border-collapse:collapse"><tr><th>#</th><th>位置 (cm)</th><th>温度</th><th>AI確度</th><th>写真</th></tr>
${vs.map(c => { const sn = snapshots.find(s => s.id === c.id); return `<tr><td>${c.id}</td><td>X ${c.x.toFixed(0)} / Y ${c.y.toFixed(0)}</td><td>${c.tmax?.toFixed(1)}℃</td><td>${c.score ? (c.score * 100).toFixed(0) + '%' : '-'}</td><td>${sn ? `<img src="${sn.img}" width=200>` : ''}</td></tr>`; }).join('')}</table>
<h2>地図</h2><img src="${mapImg}" style="max-width:100%;background:#111">
<h2>経過</h2><ol>${log.slice().reverse().map(e => `<li>${fmt(e.t)} ${e.icon || ''} ${e.text}</li>`).join('')}</ol></body>`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = 'rescue-report.html'; a.click();
  }

  // =====================================================================
  //  一括実験 (検証): 同じ現場を「段階的確認 (提案)」と「サーマルだけ」で比較
  // =====================================================================
  $('mBatch').onclick = async () => {
    const trials = clamp(+$('mTrials').value || 20, 1, 200), out = $('mBatchOut');
    $('mBatch').disabled = true;
    const res = { staged: [], thermalOnly: [] };
    for (let k = 0; k < trials; k++) {
      const sd = 1000 + k * 17;
      for (const pipe of ['staged', 'thermalOnly']) res[pipe].push(runTrial(sd, pipe));
      out.innerHTML = `実行中… ${k + 1} / ${trials}`;
      await new Promise(r => setTimeout(r, 0));
    }
    const sum = arr => {
      const humans = arr.reduce((a, r) => a + r.humans, 0), found = arr.reduce((a, r) => a + r.trueFound, 0), fp = arr.reduce((a, r) => a + r.falseVictims, 0);
      const times = arr.filter(r => r.firstFound != null).map(r => r.firstFound);
      return { rate: humans ? found / humans * 100 : 0, fp, fpPer: fp / arr.length, time: times.length ? times.reduce((a, v) => a + v, 0) / times.length : null, cov: arr.reduce((a, r) => a + r.cov, 0) / arr.length };
    };
    const a = sum(res.staged), b2 = sum(res.thermalOnly);
    out.innerHTML = `<table><tr><th></th><th>段階的確認<br>(サーマル→カメラAI)</th><th>サーマルだけ</th></tr>
      <tr><td>要救助者の発見率</td><td><b>${a.rate.toFixed(0)}%</b></td><td>${b2.rate.toFixed(0)}%</td></tr>
      <tr><td>誤報 (人でないものを要救助者と報告)</td><td><b>${a.fp}件</b> (${a.fpPer.toFixed(2)}/回)</td><td>${b2.fp}件 (${b2.fpPer.toFixed(2)}/回)</td></tr>
      <tr><td>最初の発見までの時間</td><td>${a.time ? a.time.toFixed(0) + '秒' : '-'}</td><td>${b2.time ? b2.time.toFixed(0) + '秒' : '-'}</td></tr>
      <tr><td>捜索済み面積</td><td>${a.cov.toFixed(0)}%</td><td>${b2.cov.toFixed(0)}%</td></tr></table>
      <div class="muted">シナリオ「${$('mScenario').selectedOptions[0].text}」× ${trials}回 (各回ランダム配置、両方式で同じ現場)。誤報は救助隊の無駄な出動につながる。</div>`;
    $('mBatch').disabled = false;
  };
  function runTrialTrace(sd) {
    const prm = { ...params(), pipeline: 'staged' }, w = makeScenario('random', P.field.w, P.field.h, sd);
    const s2 = createSim(w, sd, prm), m = createMission(P.field.w, P.field.h, prm, () => {}); let cmds = [[0, 0], [0, 0], [0, 0]], tr = [], last = -9;
    for (let t = 0; t < 420 && m.phase !== 'complete'; t += 0.05) {
      const o = s2.step(0.05, cmds, m.phase === 'verify');
      cmds = m.step(0.05, { poses: s2.poses.map(p => ({ ...p })), tof: o.tof, hot: o.hot, ai: o.ai });
      if (m.phase === 'dispatch' && t - last > 2) { last = t; const C = s2.poses[0], pl = m.paths[0]; tr.push(`t${t.toFixed(0)} C(${C.x | 0},${C.y | 0},${C.h | 0}) goal(${m.goal ? (m.goal.x | 0) + ',' + (m.goal.y | 0) : '-'}) pts${pl ? pl.pts.length : '-'} wp${m.dbg ? (m.dbg.wp.x|0)+','+(m.dbg.wp.y|0)+'/'+m.dbg.n : ''} ob${m.obst.filter(o=>Math.hypot(o.x-C.x,o.y-C.y)<20).map(o=>(o.x|0)+','+(o.y|0)).join(';')} T(${s2.poses[1].x|0},${s2.poses[1].y|0}) e${m.dbg2 && m.dbg2.e != null ? (m.dbg2.e|0)+' a'+(m.dbg2.ax|0)+','+(m.dbg2.ay|0)+' ph'+(m.dbg2.ph|0) : ''} obst${m.obst.length} cmd${cmds[0]}`); }
    }
    return { obstacles: w.obstacles.map(o => [o.x | 0, o.y | 0, o.w | 0, o.h | 0]), tr };
  }
  function runTrial(sd, pipeline) {
    const prm = { ...params(), pipeline };
    const w = makeScenario($('mScenario').value === 'basic' ? 'random' : $('mScenario').value, P.field.w, P.field.h, sd);
    const s2 = createSim(w, sd, prm), m = createMission(P.field.w, P.field.h, prm, () => {});
    let cmds = [[0, 0], [0, 0], [0, 0]];
    for (let t = 0; t < 420 && m.phase !== 'complete'; t += 0.05) {
      const o = s2.step(0.05, cmds, m.phase === 'verify');
      cmds = m.step(0.05, { poses: s2.poses.map(p => ({ ...p })), tof: o.tof, hot: o.hot, ai: o.ai });
    }
    const humans = w.sources.filter(s => s.type === 'human');
    const victims = m.cands.filter(c => c.status === 'victim');
    const isHuman = c => humans.some(h => Math.hypot(h.x - c.x, h.y - c.y) < 45);
    const trueFound = humans.filter(h => victims.some(c => Math.hypot(h.x - c.x, h.y - c.y) < 45)).length;
    const why = humans.filter(h => !victims.some(c => Math.hypot(h.x - c.x, h.y - c.y) < 45)).map(h => {
      const c = m.cands.filter(c => Math.hypot(h.x - c.x, h.y - c.y) < 60).sort((a, b) => Math.hypot(h.x - a.x, h.y - a.y) - Math.hypot(h.x - b.x, h.y - b.y))[0];
      if (!c) return 'notDetected';
      const v = c.vpose; if (!v) return c.status + ':noverify';
      const d = Math.hypot(h.x - v.x, h.y - v.y), b = norm(deg(Math.atan2(h.x - v.x, -(h.y - v.y))) - v.h);
      return `${c.status} est${Math.hypot(h.x - c.x, h.y - c.y).toFixed(0)} camD${d.toFixed(0)} b${b.toFixed(0)} los${los(w, v.x, v.y, h.x, h.y) ? 1 : 0}${v.timeout ? ' TO' : ''}`;
    });
    return { why, humans: humans.length, trueFound, falseVictims: victims.filter(c => !isHuman(c)).length, firstFound: m.stats.firstFound, cov: m.cov.reduce((a, v) => a + v, 0) / m.cov.length * 100 };
  }

  addEventListener('resize', () => draw());
  window.__missionDebug = { runTrial, runTrialTrace, get mission() { return mission; }, get sim() { return sim; }, makeScenario, analyzeThermal, thermalFrame };
})();
