// =====================================================================
//   ゲームコントローラー (Nintendo Switch Pro コントローラー / Xbox / PS 共通)
//  ブラウザの Gamepad API (standard mapping) を使う。ボタン番号は「位置」で決まる:
//    0=下 1=右 2=左 3=上 (Switch の B A Y X / Xbox の A B X Y / PS の × ○ □ △)
//  割り当て表は GP_MAP。画面の「 割り当て」から表示できる。
// =====================================================================
(() => {
  const DEAD = 0.14;
  // [ボタン番号, Switch表記, Xbox表記, 動作キー, 説明]
  const GP_MAP = [
    ['LS', 'Lスティック', '左スティック', 'drive', '走る (前後 + 左右旋回)'],
    ['RS', 'Rスティック', '右スティック', 'turn', '旋回だけ (左手は前後に専念)'],
    [12, '十字キー', '十字キー', 'dpad', '一定速度で 前後・その場旋回'],
    [7, 'ZR', 'RT', 'boost', '押している間 最高速'],
    [6, 'ZL', 'LT', 'slow', '押している間 ゆっくり'],
    [4, 'L', 'LB', 'prevTarget', '操作する機体を 前へ'],
    [5, 'R', 'RB', 'nextTarget', '操作する機体を 次へ'],
    [0, 'B', 'A', 'stop', '停止'],
    [16, 'HOME', 'Xbox', 'stop', '全停止'],
    [17, 'キャプチャ', '—', 'stop', '全停止'],
    [3, 'X', 'Y', 'lockOn', '連結器 ロック'],
    [2, 'Y', 'X', 'lockOff', '連結器 解除'],
    [1, 'A', 'B', 'speedStep', '基本速度 40 → 70 → 100% / 停止中は 1.2秒長押しで再開'],
    [11, 'Rスティック押し込み', 'RS押し込み', 'camera', 'カメラ表示 切替'],
    [9, '+', 'Menu', 'nextTab', '次の画面'],
    [8, '−', 'View', 'prevTab', '前の画面'],
  ];
  const gp = {
    connected: false, name: '', kind: 'switch', x: 0, y: 0, mul: 1, active: false,
    map: GP_MAP, onAction: null, pressed: new Set(), lx: 0, ly: 0, rx: 0, ry: 0,
  };
  window.gp = gp;
  const prev = new Set();
  const dz = v => Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);

  function pick() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return pads.find(p => p.mapping === 'standard') || pads[0] || null;
  }
  function poll() {
    const p = pick();
    if (!p) { if (gp.connected) { gp.connected = false; gp.x = gp.y = 0; gp.active = false; gp.onChange?.(); } return; }
    if (!gp.connected || gp.name !== p.id) {
      gp.connected = true; gp.name = p.id;
      gp.kind = /057e|nintendo|pro controller/i.test(p.id) ? 'switch' : /054c|playstation|dualsense|dualshock/i.test(p.id) ? 'ps' : 'xbox';
      gp.onChange?.();
    }
    const b = i => !!p.buttons[i]?.pressed;
    const val = i => p.buttons[i]?.value || 0;
    // スティック
    let x = dz(p.axes[0] || 0), y = -dz(p.axes[1] || 0);
    const rx = dz(p.axes[2] || 0);
    if (Math.abs(rx) > 0) x = rx;                                   // 右スティックの旋回を優先
    // 十字キー
    const dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(12) ? 1 : 0) - (b(13) ? 1 : 0);
    if (dx || dy) { x = dx * (dy ? 0.5 : 0.7); y = dy * 0.8; }
    gp.x = x; gp.y = y;
    gp.mul = val(7) > 0.3 ? 100 / Math.max(1, +($('speed')?.value || 70)) : val(6) > 0.3 ? 0.45 : 1;
    gp.active = Math.hypot(x, y) > 0.05;
    // ボタン (押した瞬間だけ)
    for (const [i, , , act] of GP_MAP) {
      if (typeof i !== 'number' || i === 12 || i === 6 || i === 7) continue;
      const k = 'b' + i;
      if (b(i) && !prev.has(k)) { prev.add(k); gp.onAction?.(act); }
      else if (!b(i)) prev.delete(k);
    }
    gp.pressed = new Set(p.buttons.map((q, i) => q.pressed ? i : -1).filter(i => i >= 0));
    gp.lx = p.axes[0] || 0; gp.ly = p.axes[1] || 0; gp.rx = p.axes[2] || 0; gp.ry = p.axes[3] || 0;
    gp.onTick?.();

  }
  gp.rumble = (ms = 120, s = 0.6) => {
    const p = pick(); const a = p?.vibrationActuator;
    if (a?.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: s, weakMagnitude: s }).catch(() => {});
  };
  gp.label = act => { const r = GP_MAP.find(m => m[3] === act); return r ? (gp.kind === 'switch' ? r[1] : r[2]) : ''; };
  addEventListener('gamepadconnected', () => gp.onChange?.());
  addEventListener('gamepaddisconnected', () => gp.onChange?.());
  setInterval(poll, 16);   // RAF だと画面が裏にあると止まるので一定間隔で読む
})();
