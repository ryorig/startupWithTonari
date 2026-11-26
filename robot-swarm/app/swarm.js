// =====================================================================
//  群制御 (俯瞰カメラ + AprilTag による閉ループ制御)
//
//  ・俯瞰カメラで各ロボットの AprilTag (tag36h11, ID = 号機番号) を検出
//  ・フィールド4隅のタグ (ID10〜13) またはクリックでホモグラフィー校正 → cm 座標
//  ・各ロボットを「目標点へ向かう」フィードバック制御 + 近いロボット同士の斥力で衝突回避
//  ・その上に 隊形 / リーダー追従 / 円周回 / 集合 / 分散 / パス閉ループ実行 を構成
//
//  index.html のグローバル (robots, P, N, COLORS, mix, padVec, keyVec, KEYSETS, makePad ...) を使用
// =====================================================================
(() => {
  const CORNER_IDS = [10, 11, 12, 13];          // 左上, 右上, 右下, 左下
  const STALE_MS = 400;                         // これ以上タグが見えなければ停止
  const SW_KEY = 'swarmbot-swarm-v1';
  const $ = id => document.getElementById(id);
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const norm = a => ((a + 180) % 360 + 360) % 360 - 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const EDGE = 8;   // ロボットの半径ぶん、目標をフィールドの縁から内側に
  const cx_ = v => clamp(v, EDGE, P.field.w - EDGE), cy_ = v => clamp(v, EDGE, P.field.h - EDGE);

  const video = $('swVideo'), ov = $('swOverlay'), octx = ov.getContext('2d');
  const map = $('swMap'), mctx = map.getContext('2d');
  const proc = document.createElement('canvas'), pctx = proc.getContext('2d', { willReadFrequently: true });
  const detector = new AR.Detector({ dictionaryName: 'APRILTAG_36h11', maxHammingDistance: 5 });

  // ---------- 状態 ----------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SW_KEY)) || {}; } catch {}
  let H = saved.H || null;                    // 画像(px) → フィールド(cm)
  let markers = [];                           // 最新フレームの検出結果 (画像座標)
  let cornerSeen = {};                        // id -> {x,y,t}
  const poses = robots.map(() => null);       // {x,y,h,t}
  const trails = robots.map(() => []);
  const targets = robots.map(() => null);     // {x,y,h?}
  const arrived = robots.map(() => false);
  let mode = null, modeT0 = 0, active = false;
  let clickCal = null;                        // 4隅クリック中の点
  let center = null;                          // 隊形/円周回の中心 (cm)
  let pathState = null;                       // {k, waitUntil}
  let stream = null, fpsCount = 0, fpsT = performance.now();

  const save = () => { try { localStorage.setItem(SW_KEY, JSON.stringify({ H })); } catch {} };
  const num = id => parseFloat($(id).value) || 0;

  // ---------- 対象セレクト ----------
  robots.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.id + '号機だけ'; $('swTarget').appendChild(o); });

  // =====================================================================
  //  カメラ
  // =====================================================================
  async function listCams() {
    try {
      const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      const sel = $('swCamSel'), cur = sel.value; sel.innerHTML = '';
      devs.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || ('カメラ ' + (i + 1)); sel.appendChild(o); });
      if (cur) sel.value = cur;
    } catch {}
  }
  $('swCamBtn').onclick = async () => {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; $('swCamBtn').textContent = 'カメラ開始'; $('swVidMsg').style.display = ''; return; }
    try {
      const id = $('swCamSel').value;
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: id ? { exact: id } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream; await video.play();
      $('swCamBtn').textContent = 'カメラ停止'; $('swVidMsg').style.display = 'none';
      listCams();
      requestAnimationFrame(loop);
    } catch (e) { alert('カメラを開けません: ' + e.message + '\nChrome のカメラ許可を確認してください。'); }
  };
  listCams();

  // =====================================================================
  //  ホモグラフィー (4点対応 → 3x3)
  // =====================================================================
  function solveHomography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {                       // ガウスの消去法
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < 8; r++) if (r !== c) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }
  const applyH = (M, x, y) => { const w = M[6] * x + M[7] * y + M[8]; return [(M[0] * x + M[1] * y + M[2]) / w, (M[3] * x + M[4] * y + M[5]) / w]; };
  const fieldCorners = () => [[0, 0], [P.field.w, 0], [P.field.w, P.field.h], [0, P.field.h]];

  $('swCalTag').onclick = () => {
    const now = performance.now();
    const miss = CORNER_IDS.filter(id => !cornerSeen[id] || now - cornerSeen[id].t > 1500);
    if (miss.length) { alert('見えていないコーナータグ: ID ' + miss.join(', ')); return; }
    const M = solveHomography(CORNER_IDS.map(id => [cornerSeen[id].x, cornerSeen[id].y]), fieldCorners());
    if (!M) { alert('校正に失敗しました (タグが一直線に並んでいませんか？)'); return; }
    H = M; save(); calibMsg();
  };
  $('swCalClick').onclick = () => {
    if (!stream) { alert('先にカメラを開始してください'); return; }
    clickCal = []; calibMsg();
  };
  ov.addEventListener('click', e => {
    if (!clickCal) return;
    const r = ov.getBoundingClientRect();
    clickCal.push([(e.clientX - r.left) * video.videoWidth / r.width, (e.clientY - r.top) * video.videoHeight / r.height]);
    if (clickCal.length === 4) {
      const M = solveHomography(clickCal, fieldCorners());
      if (M) { H = M; save(); } else alert('校正に失敗しました');
      clickCal = null;
    }
    calibMsg();
  });
  function calibMsg() {
    const names = ['左上', '右上', '右下', '左下'];
    $('swCalibMsg').innerHTML = clickCal ? `<b style="color:#ffb000">フィールドの「${names[clickCal.length]}」をクリック (${clickCal.length + 1}/4)</b>`
      : H ? '<span class="ok">● 校正済み</span> (カメラを動かしたら校正し直してください)' : '<span class="ng">● 未校正</span> — フィールド校正をしてください';
    $('swFieldSize').textContent = `${P.field.w} × ${P.field.h} cm`;
  }
  calibMsg();

  // =====================================================================
  //  検出ループ
  // =====================================================================
  function loop() {
    if (!stream) return;
    if (video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const s = Math.min(1, 1280 / vw);                   // 処理解像度 (小さいタグも拾えるよう最大1280px)
      proc.width = Math.round(vw * s); proc.height = Math.round(vh * s);
      pctx.drawImage(video, 0, 0, proc.width, proc.height);
      let found = [];
      try { found = detector.detect(pctx.getImageData(0, 0, proc.width, proc.height)); } catch (e) { console.warn(e); }
      const now = performance.now();
      markers = found.map(m => {
        const c = m.corners.map(p => [p.x / s, p.y / s]);
        const cx = c.reduce((a, p) => a + p[0], 0) / 4, cy = c.reduce((a, p) => a + p[1], 0) / 4;
        // タグの上辺 (corner0→1) の中点 = ロボットの前
        const fx = (c[0][0] + c[1][0]) / 2, fy = (c[0][1] + c[1][1]) / 2;
        return { id: m.id, c, cx, cy, fx, fy };
      });
      for (const m of markers) {
        if (CORNER_IDS.includes(m.id)) cornerSeen[m.id] = { x: m.cx, y: m.cy, t: now };
        const i = m.id - 1;
        if (i >= 0 && i < N && H) {
          const [x, y] = applyH(H, m.cx, m.cy), [x2, y2] = applyH(H, m.fx, m.fy);
          const h = deg(Math.atan2(x2 - x, -(y2 - y)));
          const prev = poses[i];
          // 軽い平滑化 (ノイズ対策)
          const a = prev && now - prev.t < 300 ? 0.6 : 1;
          poses[i] = prev && a < 1
            ? { x: prev.x + (x - prev.x) * a, y: prev.y + (y - prev.y) * a, h: norm(prev.h + norm(h - prev.h) * a), t: now }
            : { x, y, h, t: now };
          const tr = trails[i]; tr.push([poses[i].x, poses[i].y]); if (tr.length > 150) tr.shift();
        }
      }
      drawOverlay();
      fpsCount++;
      if (now - fpsT > 1000) { $('swFps').textContent = fpsCount + ' fps'; fpsCount = 0; fpsT = now; }
    }
    if (view === 'swarm') drawMap();
    requestAnimationFrame(loop);
  }

  function drawOverlay() {
    const r = ov.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (ov.width !== Math.round(r.width * dpr)) { ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr); }
    octx.setTransform(dpr * r.width / video.videoWidth, 0, 0, dpr * r.height / video.videoHeight, 0, 0);
    octx.clearRect(0, 0, video.videoWidth, video.videoHeight);
    const lw = video.videoWidth / r.width;
    // フィールド枠
    if (H) {
      const inv = invertH(H);
      if (inv) {
        octx.strokeStyle = '#ffffff'; octx.lineWidth = 2 * lw; octx.beginPath();
        fieldCorners().forEach(([x, y], k) => { const [u, v] = applyH(inv, x, y); k ? octx.lineTo(u, v) : octx.moveTo(u, v); });
        octx.closePath(); octx.stroke();
      }
    }
    for (const m of markers) {
      const isBot = m.id >= 1 && m.id <= N, color = isBot ? COLORS[m.id - 1] : CORNER_IDS.includes(m.id) ? '#ffffff' : '#888';
      octx.strokeStyle = color; octx.lineWidth = 3 * lw; octx.beginPath();
      m.c.forEach(([x, y], k) => k ? octx.lineTo(x, y) : octx.moveTo(x, y)); octx.closePath(); octx.stroke();
      octx.beginPath(); octx.moveTo(m.cx, m.cy); octx.lineTo(m.fx, m.fy); octx.stroke();
      octx.fillStyle = color; octx.font = `bold ${14 * lw}px system-ui`;
      octx.fillText(isBot ? m.id + '号機' : 'ID' + m.id, m.cx + 10 * lw, m.cy - 10 * lw);
    }
    if (clickCal) {
      octx.fillStyle = '#ffb000';
      clickCal.forEach(([x, y]) => { octx.beginPath(); octx.arc(x, y, 6 * lw, 0, 7); octx.fill(); });
    }
  }
  function invertH(M) {
    const [a, b, c, d, e, f, g, h, i] = M;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C; if (Math.abs(det) < 1e-12) return null;
    return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
  }

  // =====================================================================
  //  マップ描画
  // =====================================================================
  let mv = { s: 1, ox: 0, oy: 0 };
  function drawMap() {
    const box = $('swMapBox').getBoundingClientRect(), dpr = devicePixelRatio || 1;
    if (map.width !== Math.round(box.width * dpr) || map.height !== Math.round(box.height * dpr)) {
      map.width = Math.round(box.width * dpr); map.height = Math.round(box.height * dpr);
    }
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = 20, s = Math.min((box.width - pad * 2) / P.field.w, (box.height - pad * 2) / P.field.h);
    mv = { s, ox: (box.width - P.field.w * s) / 2, oy: (box.height - P.field.h * s) / 2 };
    const T = (x, y) => [mv.ox + x * s, mv.oy + y * s];
    mctx.clearRect(0, 0, box.width, box.height);
    const [x0, y0] = T(0, 0), [x1, y1] = T(P.field.w, P.field.h);
    mctx.fillStyle = '#1e1e1e'; mctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    mctx.strokeStyle = '#ffffff12';
    for (let x = 0; x <= P.field.w; x += 10) { const [a] = T(x, 0); mctx.beginPath(); mctx.moveTo(a, y0); mctx.lineTo(a, y1); mctx.stroke(); }
    for (let y = 0; y <= P.field.h; y += 10) { const [, b] = T(0, y); mctx.beginPath(); mctx.moveTo(x0, b); mctx.lineTo(x1, b); mctx.stroke(); }
    mctx.strokeStyle = '#555'; mctx.strokeRect(x0, y0, x1 - x0, y1 - y0);

    if (center && (mode === 'orbit' || mode === 'form')) {
      const [cx, cy] = T(center.x, center.y);
      mctx.strokeStyle = '#ffffff40'; mctx.setLineDash([4, 4]);
      if (mode === 'orbit') { mctx.beginPath(); mctx.arc(cx, cy, num('swRadius') * s, 0, 7); mctx.stroke(); }
      mctx.setLineDash([]); mctx.fillStyle = '#ffffff60'; mctx.beginPath(); mctx.arc(cx, cy, 4, 0, 7); mctx.fill();
    }
    const now = performance.now();
    robots.forEach((_, i) => {
      const c = COLORS[i];
      // 軌跡
      mctx.strokeStyle = c + '50'; mctx.lineWidth = 2; mctx.beginPath();
      trails[i].forEach(([x, y], k) => { const [u, v] = T(x, y); k ? mctx.lineTo(u, v) : mctx.moveTo(u, v); }); mctx.stroke();
      // 目標
      const g = targets[i];
      if (g) {
        const [u, v] = T(g.x, g.y);
        mctx.strokeStyle = c; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(u, v, 8, 0, 7); mctx.stroke();
        mctx.beginPath(); mctx.moveTo(u - 5, v); mctx.lineTo(u + 5, v); mctx.moveTo(u, v - 5); mctx.lineTo(u, v + 5); mctx.stroke();
        if (poses[i]) { const [px, py] = T(poses[i].x, poses[i].y); mctx.setLineDash([3, 4]); mctx.beginPath(); mctx.moveTo(px, py); mctx.lineTo(u, v); mctx.stroke(); mctx.setLineDash([]); }
      }
      // ロボット
      const p = poses[i];
      if (p) {
        const [u, v] = T(p.x, p.y), R = Math.max(9, 6 * s), stale = now - p.t > STALE_MS;
        mctx.save(); mctx.translate(u, v); mctx.rotate(rad(p.h)); mctx.globalAlpha = stale ? 0.3 : 1;
        mctx.fillStyle = c; mctx.beginPath(); mctx.roundRect(-R * .8, -R * .9, R * 1.6, R * 1.8, R * .3); mctx.fill();
        mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.moveTo(0, -R * .75); mctx.lineTo(R * .4, -R * .15); mctx.lineTo(-R * .4, -R * .15); mctx.fill();
        mctx.restore();
        mctx.fillStyle = '#fff'; mctx.font = 'bold 12px system-ui'; mctx.textAlign = 'center';
        mctx.fillText(String(i + 1) + (stale ? ' (見失い)' : ''), u, v + R * 1.3 + 12); mctx.textAlign = 'left';
      }
    });
    if (!H) { mctx.fillStyle = '#8a90a2'; mctx.font = '13px system-ui'; mctx.fillText('フィールド校正をするとロボットの位置が表示されます', x0 + 10, y0 + 22); }
    updateStatus();
  }

  function updateStatus() {
    const tb = $('swStatus').querySelector('tbody'), now = performance.now();
    if (tb.children.length !== N) tb.innerHTML = robots.map((_, i) => `<tr><td style="color:${COLORS[i]};font-weight:700">${i + 1}号機</td><td></td><td></td><td></td><td></td></tr>`).join('');
    robots.forEach((r, i) => {
      const td = tb.children[i].children, p = poses[i], seen = p && now - p.t < STALE_MS, g = targets[i];
      td[1].innerHTML = seen ? '<span class="ok">✓</span>' : '<span class="ng">✗</span>';
      td[2].textContent = p ? `${p.x.toFixed(0)}, ${p.y.toFixed(0)}` : '-';
      td[3].textContent = p ? `${p.h.toFixed(0)}°` : '-';
      td[4].textContent = g && p ? (arrived[i] ? '到着' : Math.hypot(g.x - p.x, g.y - p.y).toFixed(0) + ' cm') : '-';
    });
  }

  // マップクリック → 目標
  map.addEventListener('click', e => {
    const r = map.getBoundingClientRect();
    const x = clamp((e.clientX - r.left - mv.ox) / mv.s, 0, P.field.w), y = clamp((e.clientY - r.top - mv.oy) / mv.s, 0, P.field.h);
    const sel = $('swTarget').value;
    if (mode === 'orbit') { center = { x, y }; return; }
    if (mode === 'form') { center = { x, y }; return; }
    if (mode === 'train') {
      const ts = window.couplerHook?.trains() || [];
      const pick = sel === 'all' ? ts : ts.filter(t => t.includes(+sel - 1));
      const hs = pick.map(t => t[0]).filter(i => poses[i]);
      if (!hs.length) return;
      const cx = hs.reduce((a, i) => a + poses[i].x, 0) / hs.length, cy = hs.reduce((a, i) => a + poses[i].y, 0) / hs.length;
      hs.forEach(i => { targets[i] = { x: cx_(poses[i].x + x - cx), y: cy_(poses[i].y + y - cy) }; arrived[i] = false; });
      return;
    }
    if (!mode || mode === 'goto' || mode === 'gather' || mode === 'disperse') {
      if (sel === 'all') {
        // 現在の並びを保ったまま、重心がクリック位置に来るように移動
        const vis = robots.map((_, i) => poses[i]).filter(Boolean);
        if (!vis.length) return;
        const cx = vis.reduce((a, p) => a + p.x, 0) / vis.length, cy = vis.reduce((a, p) => a + p.y, 0) / vis.length;
        robots.forEach((_, i) => { if (poses[i]) targets[i] = { x: cx_(poses[i].x + x - cx), y: cy_(poses[i].y + y - cy) }; });
      } else targets[+sel - 1] = { x: cx_(x), y: cy_(y) };
      setMode('goto');
    }
  });

  // =====================================================================
  //  隊形テンプレート
  // =====================================================================
  // ローカル座標 (前 = -y)。index 0 が先頭 (リーダー)
  function shapeSlots(shape, sp, n = N) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const rank = Math.ceil(k / 2), side = k % 2 ? -1 : 1;
      if (shape === 'vee') out.push([k ? side * rank * sp * 0.75 : 0, rank * sp * 0.75]);
      else if (shape === 'row') out.push([k ? side * rank * sp : 0, 0]);
      else if (shape === 'col') out.push([0, k * sp]);
      else { const R = n > 1 ? sp / (2 * Math.sin(Math.PI / n)) : 0, a = rad(k * 360 / n); out.push([Math.sin(a) * R, -Math.cos(a) * R]); }
    }
    return out;
  }
  const rotate = ([x, y], a) => [x * Math.cos(rad(a)) - y * Math.sin(rad(a)), x * Math.sin(rad(a)) + y * Math.cos(rad(a))];

  // ロボット→スロットの割当 (総移動距離が最小になる組み合わせ。交差を減らす)
  function assign(points) {
    const ids = robots.map((_, i) => i).filter(i => poses[i]);
    if (!ids.length) return;
    let best = null, bestCost = Infinity;
    const perm = (arr, l) => {
      if (l === arr.length) {
        let cost = 0;
        ids.forEach((id, k) => cost += Math.hypot(points[arr[k]][0] - poses[id].x, points[arr[k]][1] - poses[id].y));
        if (cost < bestCost) { bestCost = cost; best = arr.slice(); }
        return;
      }
      for (let i = l; i < arr.length; i++) { [arr[l], arr[i]] = [arr[i], arr[l]]; perm(arr, l + 1); [arr[l], arr[i]] = [arr[i], arr[l]]; }
    };
    perm(points.map((_, k) => k), 0);   // 台数が少ないので全探索
    ids.forEach((id, k) => targets[id] = { x: points[best[k]][0], y: points[best[k]][1] });
  }

  function formationTargets(cx, cy) {
    const sp = num('swSpacing') || 30, a = num('swAngle'), slots = shapeSlots($('swShape').value, sp);
    const mx = slots.reduce((s, p) => s + p[0], 0) / N, my = slots.reduce((s, p) => s + p[1], 0) / N;
    return slots.map(p => { const [x, y] = rotate([p[0] - mx, p[1] - my], a); return [cx_(cx + x), cy_(cy + y)]; });
  }
  function visibleCentroid() {
    const vis = poses.filter(Boolean);
    if (!vis.length) return { x: P.field.w / 2, y: P.field.h / 2 };
    return { x: vis.reduce((a, p) => a + p.x, 0) / vis.length, y: vis.reduce((a, p) => a + p.y, 0) / vis.length };
  }

  // =====================================================================
  //  モード
  // =====================================================================
  const MODE_NAMES = { dock: '自動ドッキング', train: '連結列で移動', goto: 'クリック移動', form: '隊形', follow: 'リーダー追従', orbit: '円周回', gather: '集合', disperse: '分散', path: 'パス閉ループ' };
  document.querySelectorAll('#swModes button').forEach(b => b.onclick = () => setMode(b.dataset.m, true));

  function setMode(m, fresh = false) {
    if (!H) { alert('先にフィールド校正をしてください'); return; }
    if (!robots.some(r => r.ok)) { alert('ロボットが接続されていません'); return; }
    if (run) stopRun();
    mode = m; active = true; modeT0 = performance.now();
    arrived.fill(false);
    document.querySelectorAll('#swModes button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
    $('swModeLabel').textContent = '実行中: ' + MODE_NAMES[m];
    $('swLeaderPad').innerHTML = '';
    if (fresh) {
      if (m === 'form') { const c = visibleCentroid(); center = c; assign(formationTargets(c.x, c.y)); }
      if (m === 'orbit') { center = center || { x: P.field.w / 2, y: P.field.h / 2 }; }
      if (m === 'gather') { const c = visibleCentroid(); center = c; assign(shapeSlots('circle', 22).map(([x, y]) => [c.x + x, c.y + y])); }
      if (m === 'disperse') targets.fill(null);
      if (m === 'goto') targets.forEach((t, i) => { if (!t && poses[i]) targets[i] = { x: poses[i].x, y: poses[i].y }; });
      if (m === 'path') { pathState = { k: 0, waitUntil: 0 }; }
      if (m === 'train') targets.fill(null);
      if (m === 'follow') {
        const el = makePad(0, '1号機 (リーダー) を操作', COLORS[0], true);
        el.querySelector('.hint').textContent = 'キー: 矢印 / WASD';
        $('swLeaderPad').appendChild(el);
      }
    }
  }
  function stop() {
    if (!active) return;
    active = false; mode = null;
    document.querySelectorAll('#swModes button').forEach(b => b.classList.remove('active'));
    $('swModeLabel').textContent = ''; $('swLeaderPad').innerHTML = '';
    robots.forEach(r => r.send(0, 0, true));
  }
  $('swStop').onclick = stop;

  // =====================================================================
  //  制御則: 目標点へ向かう (差動二輪 / ユニサイクル)
  // =====================================================================
  function goTo(i, g, now) {
    const p = poses[i];
    if (!p || now - p.t > STALE_MS || !g) return [0, 0];
    const tol = num('swTol') || 4, tolH = num('swTolH') || 10, vmax = clamp(num('swVmax'), 10, 100) / 100;
    const kw = num('swKw') || 1, avoidR = num('swAvoid');
    let dx = g.x - p.x, dy = g.y - p.y;
    const d = Math.hypot(dx, dy);

    if (d < tol || (arrived[i] && d < tol * 2)) {      // 到着 (ヒステリシス付き)
      arrived[i] = true;
      if (g.h == null) return [0, 0];
      const e = norm(g.h - p.h);
      if (Math.abs(e) < tolH) return [0, 0];
      return wheels(0, clamp(e / 90 * kw, -0.5, 0.5));
    }
    arrived[i] = false;

    // 目標への引力 + 他ロボットからの斥力 (ポテンシャル法)
    let ax = dx / d * Math.min(d, 40), ay = dy / d * Math.min(d, 40);
    if (avoidR > 0) robots.forEach((_, j) => {
      const q = poses[j]; if (j === i || !q || now - q.t > 1000) return;
      if (window.couplerHook?.sameTrain(i, j)) return;          // 連結している相手は避けない
      if (dockPair(i, j)) return;                                 // ドッキング中の相手も避けない
      const vx = p.x - q.x, vy = p.y - q.y, dist = Math.hypot(vx, vy);
      if (dist > 0.1 && dist < avoidR) { const k = 60 * (avoidR - dist) / avoidR; ax += vx / dist * k; ay += vy / dist * k; }
    });
    // フィールドの縁に近づいたら内側へ押し戻す (場外に出て見失うのを防ぐ)
    const wm = EDGE + 4;
    if (p.x < wm) ax += (wm - p.x) * 4; if (p.x > P.field.w - wm) ax -= (p.x - P.field.w + wm) * 4;
    if (p.y < wm) ay += (wm - p.y) * 4; if (p.y > P.field.h - wm) ay -= (p.y - P.field.h + wm) * 4;
    return headTo(p, deg(Math.atan2(ax, -ay)), d, vmax, kw);
  }
  function headTo(p, bearing, d, vmax, kw) {
    const e = norm(bearing - p.h);
    let v = clamp(d / 30, 0, 1) * vmax;
    if (Math.abs(e) > 60) v = 0; else v *= Math.cos(rad(e));
    const w = clamp(e / 90 * kw, -0.6, 0.6);
    return wheels(v, w);
  }
  // v, w (−1〜1) → 左右PWM。小さすぎて動かない出力は最低出力まで持ち上げる
  function wheels(v, w) {
    let l = v + w, r = v - w;
    const m = Math.max(1, Math.abs(l), Math.abs(r)); l /= m; r /= m;
    const minP = (P.minPct || 0) / 100;
    const lift = x => Math.abs(x) < 0.02 ? 0 : Math.sign(x) * Math.max(Math.abs(x), minP);
    return [Math.round(lift(l) * 255), Math.round(lift(r) * 255)];
  }

  // 分散: 近い仲間と壁から離れる方向へ
  function disperse(i, now) {
    const p = poses[i]; if (!p || now - p.t > STALE_MS) return [0, 0];
    const want = Math.max(num('swSpacing'), 20) * 2;
    let ax = 0, ay = 0;
    robots.forEach((_, j) => {
      const q = poses[j]; if (j === i || !q) return;
      if (window.couplerHook?.sameTrain(i, j)) return;
      const vx = p.x - q.x, vy = p.y - q.y, dist = Math.hypot(vx, vy) || 0.1;
      if (dist < want) { ax += vx / dist * (want - dist); ay += vy / dist * (want - dist); }
    });
    const m = 20;   // 壁
    if (p.x < m) ax += (m - p.x) * 2; if (p.x > P.field.w - m) ax -= (p.x - P.field.w + m) * 2;
    if (p.y < m) ay += (m - p.y) * 2; if (p.y > P.field.h - m) ay -= (p.y - P.field.h + m) * 2;
    const mag = Math.hypot(ax, ay);
    if (mag < 3) { arrived[i] = true; targets[i] = null; return [0, 0]; }
    arrived[i] = false;
    targets[i] = { x: clamp(p.x + ax, 0, P.field.w), y: clamp(p.y + ay, 0, P.field.h) };
    return headTo(p, deg(Math.atan2(ax, -ay)), Math.min(mag, 30), clamp(num('swVmax'), 10, 100) / 100, num('swKw') || 1);
  }

  // =====================================================================
  //  20Hz の制御ループ (index.html の送信ループから呼ばれる)
  // =====================================================================
  function tick() {
    const now = performance.now(), cmds = robots.map(() => [0, 0]);
    const align = $('swAlign').checked, ang = num('swAngle');

    if (mode === 'dock') return window.couplerHook ? couplerHook.dockTick(dockApi, now) : cmds;
    if (mode === 'train') {
      // 各列の先頭だけを目標へ (後ろの機体は adjustSwarm が連結を保って動かす)
      const heads = new Set((window.couplerHook?.trains() || robots.map((_, i) => [i])).map(t => t[0]));
      robots.forEach((_, i) => { if (heads.has(i)) cmds[i] = goTo(i, targets[i], now); else targets[i] = null; });
    }
    else if (mode === 'goto' || mode === 'gather') {
      robots.forEach((_, i) => cmds[i] = goTo(i, targets[i], now));
    }
    else if (mode === 'form') {
      if (center) assignIfNeeded(formationTargets(center.x, center.y));
      robots.forEach((_, i) => { if (targets[i]) targets[i].h = align ? ang : null; cmds[i] = goTo(i, targets[i], now); });
    }
    else if (mode === 'follow') {
      // リーダー (1号機) は手動、他は リーダー基準の隊形スロットへ
      const L = poses[0];
      cmds[0] = mix(...padVec(0, [keyVec(KEYSETS[0]), keyVec(KEYSETS[1])]));
      if (L && now - L.t < STALE_MS) {
        const slots = shapeSlots($('swShape').value, num('swSpacing') || 30);
        for (let i = 1; i < N; i++) {
          const [ox, oy] = rotate(slots[i], L.h);
          targets[i] = { x: cx_(L.x + ox), y: cy_(L.y + oy), h: align ? L.h : null };
          cmds[i] = goTo(i, targets[i], now);
        }
      }
      targets[0] = null;
    }
    else if (mode === 'orbit') {
      const R = num('swRadius') || 40, om = num('swOmega') || 15, t = (now - modeT0) / 1000;
      robots.forEach((_, i) => {
        const a = rad(om * t + i * 360 / N);
        targets[i] = { x: cx_(center.x + Math.sin(a) * R), y: cy_(center.y - Math.cos(a) * R) };
        arrived[i] = false;   // 動く目標なので常に追いかける
        cmds[i] = goTo(i, targets[i], now);
      });
    }
    else if (mode === 'disperse') {
      robots.forEach((_, i) => cmds[i] = disperse(i, now));
    }
    else if (mode === 'path') {
      const f = P.frames[pathState.k];
      robots.forEach((_, i) => { targets[i] = { ...f.pos[i] }; cmds[i] = goTo(i, targets[i], now); });
      const used = robots.map((_, i) => i).filter(i => robots[i].ok);
      const lost = used.filter(i => !poses[i] || now - poses[i].t > STALE_MS);
      const allDone = used.length && !lost.length && used.every(i => arrived[i] && cmds[i][0] === 0 && cmds[i][1] === 0);
      if (allDone) {
        if (!pathState.waitUntil) pathState.waitUntil = now + (f.wait || 0) * 1000;
        if (now >= pathState.waitUntil) {
          if (pathState.k >= P.frames.length - 1) { $('swModeLabel').textContent = '✓ パス完了'; active = false; mode = null; robots.forEach(r => r.send(0, 0, true)); document.querySelectorAll('#swModes button').forEach(b => b.classList.remove('active')); return cmds; }
          pathState.k++; pathState.waitUntil = 0; arrived.fill(false);
        }
      }
      $('swModeLabel').textContent = `実行中: パス 隊形${pathState.k + 1} / ${P.frames.length}` + (lost.length ? ` ⚠ ${lost.map(i => i + 1).join('・')}号機を見失い中 (待機)` : '');
    }
    // 連結している列: 先頭の指令から後ろの機体の指令を作り直す (連結部に無理な力がかからないように)
    return window.couplerHook ? couplerHook.adjustSwarm(cmds, now) : cmds;
  }
  // 隊形の形・向き・間隔が変わったときだけ割当し直す
  let lastFormKey = '';
  function assignIfNeeded(points) {
    const key = JSON.stringify(points.map(p => p.map(v => Math.round(v))));
    if (key !== lastFormKey) { lastFormKey = key; assign(points); }
  }

  // ---------- 🔗 ドッキング / 分離 UI ----------
  const dockApi = {
    poses, targets, arrived, goTo, headTo, wheels,
    label: t => { $('swModeLabel').textContent = t; },
    done: () => { active = false; mode = null; document.querySelectorAll('#swModes button').forEach(b => b.classList.remove('active')); robots.forEach(r => r.send(0, 0, true)); showTrains(); },
  };
  let dockSel = null;
  const dockPair = (i, j) => mode === 'dock' && dockSel && ((i === dockSel[0] && j === dockSel[1]) || (i === dockSel[1] && j === dockSel[0]));
  ['swDockF', 'swDockL', 'swDetach'].forEach((id, n) => robots.forEach((r, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = r.id + '号機'; $(id).appendChild(o);
    if (n === 1 && i === 0) o.selected = true; if (n === 0 && i === 1) o.selected = true;
  }));
  function showTrains() {
    const ts = (window.couplerHook?.trains() || []).filter(t => t.length > 1);
    $('swTrains').textContent = '現在の列: ' + (ts.length ? ts.map(t => t.map(i => i + 1).join('→')).join(' / ') : 'なし');
  }
  $('swDock').onclick = () => {
    const F = +$('swDockF').value, L = +$('swDockL').value;
    if (!window.couplerHook || !couplerHook.startDock(L, F)) return;
    dockSel = [F, L]; couplerHook.lockLink(L, F, false);   // この連結のゲートだけ開けて待つ
    setMode('dock', true);
  };
  $('swDetachBtn').onclick = () => { couplerHook?.detach(+$('swDetach').value); showTrains(); };
  setTimeout(showTrains, 0);

  swarmHook = { active: () => active, tick, stop: () => { window.couplerHook?.cancelDock(); stop(); }, show: () => { calibMsg(); drawMap(); showTrains(); },
    api: { poses, calibrated: () => !!H, dock: dockApi } };   // 救助ミッション (mission.js) から利用
  addEventListener('resize', () => { if (view === 'swarm') drawMap(); });
})();
