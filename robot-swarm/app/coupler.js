// =====================================================================
//  🔗 連結走行 (UI と制御)  — 運動学は coupler-core.js
//
//  ・どの号機でも、どの順番でも連結できる (例 "2-1-3", "3-1,2" = 3-1 の列と 2 単独)
//  ・連結器のロック/解除 (BLE: K1 / K0) を各機体に送る
//  ・ヒンジ連結: トラクタ・トレーラの拘束式で、後ろの機体を「前の機体のピンの動き」に合わせて走らせる
//  ・固定連結 : 塊を1つの剛体として各車輪の速度を計算
//  ・折れ角は 群制御タブの俯瞰カメラで測れればそれを使い、無ければ指令から推定
//  ・群制御タブ: 連結した列を1台のように扱い、自動ドッキング (近づいてロック) もできる
//
//  index.html のグローバル (robots, N, COLORS, P, $, makePad, padVec, keyVec, KEYSETS, swarmHook) を使用
// =====================================================================
(() => {
  const CC = window.CouplerCore;
  const KEY = 'swarmbot-coupler-v1';
  const st = {
    spec: '1-2-3', mode: 'hinge', geom: { ...CC.DEFAULT_GEOM }, gains: robots.map(() => 100),
    lockDeg: 90, unlockDeg: 10,
    hookSide: 'rear',                  // サーボ付きフック(ゲート)が付いている側: 'rear' 後ろ / 'front' 前
  };
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY)) || {}); st.geom = { ...CC.DEFAULT_GEOM, ...st.geom }; } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };

  let trains = [];                     // [[i0,i1,..], ...] (0始まりの号機 index)
  const phiEst = new Map();            // 列キー → 推定折れ角
  const locked = robots.map(() => null);
  let info = { jack: false, slip: 0, src: '推定' };

  // ---------- 列の指定を解釈 ----------
  function parseSpec(s) {
    const used = new Set(), out = [];
    for (const part of String(s).split(/[,、\s]+/).filter(Boolean)) {
      const ids = part.split(/[-ー−>→]+/).map(x => parseInt(x, 10)).filter(n => n >= 1 && n <= N);
      const t = ids.map(n => n - 1).filter(i => !used.has(i) && used.add(i));
      if (t.length) out.push(t);
    }
    robots.forEach((_, i) => { if (!used.has(i)) out.push([i]); });   // 指定されていない機体は単独
    return out;
  }
  const tkey = t => t.join('-');
  function setSpec(s) {
    st.spec = s; trains = parseSpec(s); save();
    trains.forEach(t => { if (!phiEst.has(tkey(t))) phiEst.set(tkey(t), new Array(t.length - 1).fill(0)); });
    if ($('cpSpec')) $('cpSpec').value = s;
    renderLocks();
  }
  const trainOf = i => trains.find(t => t.includes(i));
  const sameTrain = (i, j) => { const t = trainOf(i); return !!t && t.length > 1 && t.includes(j); };

  // ---------- BLE: 連結器コマンド ----------
  async function sendRaw(r, text) {
    if (!r.ok) return;
    for (let k = 0; k < 20 && r.busy; k++) await new Promise(res => setTimeout(res, 10));
    r.busy = true;
    try {
      const d = new TextEncoder().encode(text + '\n');
      if (r.rx.writeValueWithoutResponse) await r.rx.writeValueWithoutResponse(d); else await r.rx.writeValue(d);
    } catch (e) { console.warn(e); }
    r.busy = false;
  }
  async function lock(i, on) {
    const r = robots[i]; if (!r.ok) return;
    await sendRaw(r, 'KL' + st.lockDeg); await sendRaw(r, 'KU' + st.unlockDeg);
    await sendRaw(r, on ? 'K1' : 'K0');
  }
  // 連結 L(前)→F(後ろ) を開け閉めするのはどちらの機体のサーボか
  const linkOwner = (L, F) => st.hookSide === 'rear' ? L : F;
  const lockLink = (L, F, on) => lock(linkOwner(L, F), on);
  // index.html の Robot.onMsg から呼ばれる
  window.couplerInput = {
    status(id, t) { locked[id - 1] = t === 'K1'; renderLocks(); },
    connected(id) { setTimeout(() => sendRaw(robots[id - 1], 'K?'), 500); },
  };

  // ---------- 折れ角 (カメラ → 無ければ推定) ----------
  function camPoses(t, now) {
    const api = swarmHook?.api; if (!api || !api.calibrated()) return null;
    const ps = t.map(i => api.poses[i]);
    if (ps.some(p => !p || now - p.t > 400)) return null;
    return ps.map(p => ({ x: p.x, y: -p.y, th: -p.h * Math.PI / 180 }));   // 画面座標(時計回り) → 左回り
  }
  function phisFor(t, now) {
    const cp = camPoses(t, now);
    if (cp) { const f = CC.phisFromPoses(cp); phiEst.set(tkey(t), f); return { phis: f, src: 'カメラ' }; }
    return { phis: phiEst.get(tkey(t)) || new Array(t.length - 1).fill(0), src: '推定' };
  }

  // ---------- 1つの列の指令 ----------
  function trainPWM(t, V, W, now, dt = 0.05) {
    const { phis, src } = phisFor(t, now);
    const gains = t.map(i => (st.gains[i] || 100) / 100);
    const c = CC.trainCommand(V, W, phis, st.geom, t.length > 1 ? st.mode : 'hinge', gains);
    // 推定値を進める (カメラが無いとき)
    if (src === '推定' && t.length > 1 && st.mode === 'hinge')
      phiEst.set(tkey(t), phis.map((f, k) => clampA(f + (c.vws[k + 1].w - c.vws[k].w) * dt)));
    if (t.length > 1) info = { jack: c.jack, slip: c.slip, src };
    const minP = (P.minPct || 0) / 100 * 255;
    const lift = x => Math.abs(x) < 4 ? 0 : Math.sign(x) * Math.max(Math.abs(x), minP);
    return c.pwm.map(([l, r]) => [Math.round(lift(l)), Math.round(lift(r))]);
  }
  const clampA = f => Math.max(-Math.PI, Math.min(Math.PI, f));
  const pwmToVW = ([l, r]) => ({ V: (l + r) / 2 / 255 * st.geom.vmax, W: (r - l) / 255 * st.geom.vmax / st.geom.track });

  // ---------- 操作タブ: 連結モードの送信 ----------
  function driveCmds() {
    const [x, y] = padVec(0, [keyVec(KEYSETS[0]), keyVec(KEYSETS[1])]);
    const cmds = robots.map(() => [0, 0]), now = performance.now();
    if (Math.hypot(x, y) < 0.12) { sim.step(cmds); return cmds; }
    const { V, W } = CC.stickToVW(x, y, st.geom, $('speed').value / 100);
    for (const t of trains) trainPWM(t, V, W, now).forEach((c, k) => cmds[t[k]] = c);
    sim.step(cmds); drawInfo();
    return cmds;
  }

  // ---------- 群制御タブ: 先頭の指令から列全体の指令を作る ----------
  function adjustSwarm(cmds, now) {
    for (const t of trains) {
      if (t.length < 2) continue;
      const { V, W } = pwmToVW(cmds[t[0]]);
      if (Math.abs(V) < 0.2 && Math.abs(W) < 0.02) { t.forEach(i => cmds[i] = [0, 0]); continue; }
      trainPWM(t, V, W, now).forEach((c, k) => cmds[t[k]] = c);
    }
    return cmds;
  }

  // ---------- 自動ドッキング (群制御タブ・カメラ必須) ----------
  //  後ろにつく機体 F が、前の機体 L の後ろピンに真っ直ぐ近づいてロックする
  let dock = null;
  function startDock(li, fi) {
    if (li === fi) { alert('別の機体を選んでください'); return false; }
    dock = { L: li, F: fi, phase: 'pre', t0: performance.now(), tries: 0 };
    return true;
  }
  function dockTick(api, now) {
    const cmds = robots.map(() => [0, 0]);
    if (!dock) return cmds;
    const L = api.poses[dock.L], F = api.poses[dock.F], g = st.geom;
    if (!L || !F || now - L.t > 400 || now - F.t > 400) { api.label('ドッキング: タグを見失い中 (待機)'); return cmds; }
    const fwd = h => [Math.sin(h * Math.PI / 180), -Math.cos(h * Math.PI / 180)];   // 画面座標の前方向
    const [lx, ly] = fwd(L.h), [fx, fy] = fwd(F.h);
    const pin = { x: L.x - lx * g.hitchR, y: L.y - ly * g.hitchR };               // L の後ろピン
    const fpin = { x: F.x + fx * g.hitchF, y: F.y + fy * g.hitchF };              // F の前ピン
    const gap = Math.hypot(pin.x - fpin.x, pin.y - fpin.y);
    const herr = Math.abs(((F.h - L.h) % 360 + 540) % 360 - 180);
    const el = (now - dock.t0) / 1000;
    if (dock.phase === 'pre') {             // ① 後ろピンの延長線上 (12cm 手前) に、同じ向きで止まる
      const pre = { x: pin.x - lx * (g.hitchF + 12), y: pin.y - ly * (g.hitchF + 12), h: L.h };
      cmds[dock.F] = api.goTo(dock.F, pre, now);
      api.targets[dock.F] = pre;
      if (api.arrived[dock.F] && cmds[dock.F][0] === 0 && cmds[dock.F][1] === 0) next('approach');
      if (el > 25) next('pre', true);
    } else if (dock.phase === 'approach') { // ② ゆっくり真っ直ぐ寄る (向きを補正しながら)
      const aim = { x: pin.x + lx * 2, y: pin.y + ly * 2 };
      const bearing = Math.atan2(aim.x - fpin.x, -(aim.y - fpin.y)) * 180 / Math.PI;
      cmds[dock.F] = api.headTo(F, bearing, Math.max(gap, 8), 0.35, 1);
      api.targets[dock.F] = pin;
      if (gap < 2.5) { lockLink(dock.L, dock.F, true); next('seat'); }
      else if (herr > 25 || el > 10) next('pre', true);   // ずれた → やり直し
    } else if (dock.phase === 'seat') {     // ③ ロック後、軽く押し付けて座らせる
      cmds[dock.F] = el < 0.8 ? [0, 0] : el < 1.2 ? api.wheels(0.25, 0) : [0, 0];
      if (el > 1.4) {
        // 列を更新: F を L の列の後ろへ (F の列は L の列にくっつく)
        const tl = trainOf(dock.L), tf = trainOf(dock.F);
        if (tl && tf && tl !== tf && tl[tl.length - 1] === dock.L && tf[0] === dock.F) {
          const merged = trains.filter(t => t !== tl && t !== tf);
          merged.unshift([...tl, ...tf]);
          setSpec(merged.filter(t => t.length > 1).map(t => t.map(i => i + 1).join('-')).join(', ') || '');
        }
        api.label(`✓ ${dock.F + 1}号機 → ${dock.L + 1}号機 に連結しました`); dock = null; api.done(); return cmds;
      }
    }
    api.label(`ドッキング ${dock.F + 1}→${dock.L + 1}号機: ${{ pre: '位置合わせ', approach: '接近', seat: 'ロック' }[dock.phase]} ・ ピン間 ${gap.toFixed(1)} cm` + (dock.tries ? ` (再試行 ${dock.tries})` : ''));
    return cmds;
    function next(ph, retry) { dock.phase = ph; dock.t0 = now; if (retry) { dock.tries++; if (dock.tries > 4) { api.label('ドッキング失敗 (4回やり直した)'); dock = null; api.done(); } } }
  }

  // 分離: 指定した機体の前の連結を外す
  function detach(i) {
    const t = trainOf(i); if (!t || t.length < 2) return;
    const k = t.indexOf(i); if (k === 0) return;
    lockLink(t[k - 1], i, false);
    const rest = trains.filter(x => x !== t); rest.push(t.slice(0, k), t.slice(k));
    setSpec(rest.filter(x => x.length > 1).map(x => x.map(j => j + 1).join('-')).join(', '));
  }

  // =====================================================================
  //  仮想プレビュー (実機が無くても動きを確認できる)
  // =====================================================================
  const sim = {
    ps: null,
    reset() {
      this.ps = []; const y0 = 0;
      for (const t of trains) {
        const lead = { x: 0, y: y0, th: Math.PI / 2 };
        const chain = CC.posesFromLead(lead, new Array(t.length - 1).fill(0), st.geom);
        t.forEach((i, k) => this.ps[i] = chain[k]);
      }
      // 列どうしを横に並べる
      trains.forEach((t, n) => t.forEach(i => this.ps[i].x += (n - (trains.length - 1) / 2) * 30));
      trains.forEach(t => phiEst.set(tkey(t), new Array(t.length - 1).fill(0)));
    },
    step(cmds) {
      if (!this.ps) this.reset();
      const dt = 0.05;
      const free = this.ps.map((p, i) => { const q = CC.fromPWM(cmds[i], st.geom); return CC.integrate(p, q.v, q.w, dt); });
      for (const t of trains) {           // ピン拘束
        for (let k = 1; k < t.length; k++) {
          const h = CC.hitchPt(free[t[k - 1]], -st.geom.hitchR), f = free[t[k]];
          const th = st.mode === 'rigid' ? free[t[k - 1]].th + (this.ps[t[k]].th - this.ps[t[k - 1]].th) : Math.atan2(h.y - f.y, h.x - f.x);
          free[t[k]] = { x: h.x - st.geom.hitchF * Math.cos(th), y: h.y - st.geom.hitchF * Math.sin(th), th };
        }
      }
      this.ps = free; draw();
    },
  };
  function draw() {
    const cv = $('cpSim'); if (!cv || !cv.isConnected) return;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const ps = sim.ps; if (!ps) return;
    const cx = ps.reduce((a, p) => a + p.x, 0) / ps.length, cy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    const s = 2.2, T = p => [W / 2 + (p.x - cx) * s, H / 2 - (p.y - cy) * s];
    c.strokeStyle = '#ffffff10';
    const gx = ((-cx * s) % 20 + 20) % 20, gy = ((cy * s) % 20 + 20) % 20;
    for (let x = gx; x < W; x += 20) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
    for (let y = gy; y < H; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    const g = st.geom;
    for (const t of trains) for (let k = 1; k < t.length; k++) {   // 連結バー
      const a = T(CC.hitchPt(ps[t[k - 1]], -g.hitchR)), b = T(CC.hitchPt(ps[t[k]], g.hitchF));
      c.strokeStyle = locked[t[k]] === false ? '#ff6b5a' : '#c792ff'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(...T(ps[t[k - 1]])); c.lineTo(...a); c.lineTo(...b); c.lineTo(...T(ps[t[k]])); c.stroke();
      c.fillStyle = '#c792ff'; c.beginPath(); c.arc(...a, 3, 0, 7); c.fill();
    }
    ps.forEach((p, i) => {
      const [u, v] = T(p);
      c.save(); c.translate(u, v); c.rotate(-p.th + Math.PI / 2);
      c.fillStyle = COLORS[i]; c.beginPath(); c.roundRect(-g.track / 2 * s, -6 * s, g.track * s, 12 * s, 4); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -5 * s); c.lineTo(2.5 * s, -1 * s); c.lineTo(-2.5 * s, -1 * s); c.fill();
      c.restore(); c.fillStyle = '#fff'; c.font = 'bold 11px system-ui'; c.fillText(i + 1, u + 14, v + 4);
    });
  }
  function drawInfo() {
    const el = $('cpInfo'); if (!el) return;
    const parts = [`折れ角: ${info.src}`];
    for (const t of trains) if (t.length > 1) {
      const f = phiEst.get(tkey(t)) || [];
      parts.push(t.map(i => i + 1).join('-') + ' : ' + f.map(x => (x * 180 / Math.PI).toFixed(0) + '°').join(' / '));
    }
    if (info.jack) parts.push('<span class="ng">⚠ 折れすぎ → 減速中</span>');
    if (st.mode === 'rigid' && info.slip > 3) parts.push('<span class="ng">⚠ 固定連結の旋回で横滑り ' + info.slip.toFixed(0) + ' cm/s</span>');
    el.innerHTML = parts.join('　');
  }

  // =====================================================================
  //  パネル (操作タブの「🔗 連結」モード)
  // =====================================================================
  function renderLocks() {
    const box = $('cpLocks'); if (!box) return;
    box.innerHTML = '';
    robots.forEach((r, i) => {
      const b = document.createElement('button'); b.className = 'small';
      b.style.color = COLORS[i]; b.style.borderColor = locked[i] ? COLORS[i] : '#4a5570'; if (locked[i]) b.style.background = 'color-mix(in srgb,' + COLORS[i] + ' 22%,#151a24)';
      b.textContent = `${i + 1}号機 ${locked[i] == null ? '?' : locked[i] ? '🔒' : '🔓'}`;
      b.title = 'クリックでロック/解除を切り替え';
      b.onclick = () => lock(i, !locked[i]);
      box.appendChild(b);
    });
    drawInfo();
  }
  function render(area) {
    const pad = makePad(0, '🔗 連結走行', '#c792ff', false);
    pad.querySelector('.hint').textContent = 'キー: 矢印 / WASD ・ 列ごとに連結を保って走る';
    const panel = document.createElement('div'); panel.className = 'card'; panel.id = 'cpPanel';
    panel.style.cssText = 'max-width:440px;flex:1;min-width:280px';
    const presets = ['1-2-3', '2-1-3', '3-2-1', '1-2, 3', '2-3, 1', '1-3, 2', ''];
    panel.innerHTML = `
      <h3>🔗 連結 <span class="muted" style="font-weight:400">前 → 後ろ の順。「,」で別の列</span></h3>
      <div class="row">列 <input type="text" id="cpSpec" style="width:110px" value="${st.spec}">
        ${presets.map(p => `<button class="small cpPre" data-s="${p}">${p || '全部単独'}</button>`).join('')}</div>
      <div class="row">連結のしかた
        <label><input type="radio" name="cpMode" value="hinge" ${st.mode === 'hinge' ? 'checked' : ''}> ヒンジ (首振り)</label>
        <label><input type="radio" name="cpMode" value="rigid" ${st.mode === 'rigid' ? 'checked' : ''}> 固定</label></div>
      <div class="row">連結器 <span id="cpLocks" class="row" style="margin:0"></span>
        <button class="small" id="cpLockAll">全ロック</button><button class="small" id="cpUnlockAll">全解除</button></div>
      <canvas id="cpSim" style="width:100%;height:190px;background:#0f131b;border:1px solid var(--line);border-radius:8px;display:block"></canvas>
      <div class="row"><button class="small" id="cpStraight">まっすぐ並べた (折れ角0)</button>
        <span class="muted" id="cpInfo"></span></div>
      <details><summary class="muted">寸法・補正 (実測して合わせる)</summary>
        <div class="row">トレッド <input type="number" id="cpTrack" step="0.5" style="width:56px"> cm
          軸→前ピン <input type="number" id="cpHF" step="0.5" style="width:56px"> cm
          軸→後ピン <input type="number" id="cpHR" step="0.5" style="width:56px"> cm</div>
        <div class="row">最高速 <input type="number" id="cpVmax" step="1" style="width:56px"> cm/s (PWM255 で1秒に進む距離)
          限界折れ角 <input type="number" id="cpPhiMax" step="5" style="width:50px"> °</div>
        <div class="row">速度補正 ${robots.map((_, i) => `<span style="color:${COLORS[i]}">${i + 1}</span><input type="number" class="cpGain" data-i="${i}" value="${st.gains[i] || 100}" step="1" style="width:50px">%`).join(' ')}</div>
        <div class="row">サーボ角 ロック <input type="number" id="cpLockDeg" style="width:50px">° 解除 <input type="number" id="cpUnlockDeg" style="width:50px">°
          <button class="small" id="cpTestServo">1号機で試す</button></div>
        <div class="row">サーボ付きフックの位置
          <label><input type="radio" name="cpHook" value="rear" ${st.hookSide === 'rear' ? 'checked' : ''}> 後ろ</label>
          <label><input type="radio" name="cpHook" value="front" ${st.hookSide === 'front' ? 'checked' : ''}> 前</label>
          <span class="muted">(反対側はフォーク)</span></div>
        <div class="muted">速度補正: 同じ指令で遅い機体は 90% のように下げる (その機体の指令が大きくなる)。</div>
      </details>`;
    area.append(pad, panel);
    const bind = (id, obj, k) => { const e = $(id); e.value = obj[k]; e.onchange = () => { obj[k] = +e.value; save(); sim.reset(); draw(); }; };
    bind('cpTrack', st.geom, 'track'); bind('cpHF', st.geom, 'hitchF'); bind('cpHR', st.geom, 'hitchR');
    bind('cpVmax', st.geom, 'vmax'); bind('cpPhiMax', st.geom, 'phiMax'); bind('cpLockDeg', st, 'lockDeg'); bind('cpUnlockDeg', st, 'unlockDeg');
    panel.querySelectorAll('.cpGain').forEach(e => e.onchange = () => { st.gains[+e.dataset.i] = +e.value || 100; save(); });
    $('cpSpec').onchange = () => { setSpec($('cpSpec').value); sim.reset(); draw(); };
    panel.querySelectorAll('.cpPre').forEach(b => b.onclick = () => { setSpec(b.dataset.s); sim.reset(); draw(); });
    panel.querySelectorAll('input[name=cpHook]').forEach(e => e.onchange = () => { st.hookSide = e.value; save(); });
    panel.querySelectorAll('input[name=cpMode]').forEach(e => e.onchange = () => { st.mode = e.value; save(); });
    $('cpLockAll').onclick = () => robots.forEach((_, i) => lock(i, true));
    $('cpUnlockAll').onclick = () => robots.forEach((_, i) => lock(i, false));
    $('cpStraight').onclick = () => { trains.forEach(t => phiEst.set(tkey(t), new Array(t.length - 1).fill(0))); sim.reset(); draw(); drawInfo(); };
    $('cpTestServo').onclick = async () => { const r = robots[0]; if (!r.ok) return alert('1号機が未接続です'); await sendRaw(r, 'KA' + st.lockDeg); setTimeout(() => sendRaw(r, 'KA' + st.unlockDeg), 1200); };
    renderLocks(); requestAnimationFrame(draw);
  }

  setSpec(st.spec);
  window.couplerHook = { render, driveCmds, adjustSwarm, sameTrain, trainOf, startDock, dockTick, detach, lock,
    trains: () => trains, setSpec, lockLink, sim, cancelDock: () => { dock = null; } };
})();
