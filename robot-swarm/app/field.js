// =====================================================================
//  災害現場向けの運用機能
//  ・通信途絶の検知 (1.5秒受信なし) → 号機ボタン点滅 + 警報 + 音
//  ・切断されたら自動で再接続を試す (人が切断したときは除く)
//  ・警報は「確認」を押すまで点滅 (航空機の警報と同じ考え方)
//  ・操作記録 (接続・切断・停止・再開・警報) を CSV で保存できる → 事後の報告に使う
//  ・手袋・屋外モード: 画面を大きく、白黒はっきり
// =====================================================================
(() => {
  const LOST_MS = 1500;
  const logs = [];
  const fmt = d => d.toLocaleTimeString('ja-JP', { hour12: false });
  function log(kind, text) {
    logs.unshift({ t: new Date(), kind, text });
    if ($('logPanel').classList.contains('show')) renderLog();
  }
  function renderLog() {
    $('logTable').innerHTML = logs.map(l => `<tr><td>${fmt(l.t)}</td><td>${l.kind}</td><td>${l.text}</td></tr>`).join('') || '<tr><td>記録はまだありません</td></tr>';
  }
  // ---- 警報 ----
  const active = new Map();
  function alarm(key, level, title, text) {
    if (active.has(key)) return;
    const el = document.createElement('div'); el.className = `alert ${level} new`;
    el.innerHTML = `<b>${title}</b><span>${text}</span><button class="small">確認</button>`;
    el.querySelector('button').onclick = () => { el.classList.remove('new'); setTimeout(() => clear(key), 4000); };
    $('alerts').appendChild(el); active.set(key, el);
    log('警報', `${title} ${text}`);
    if (level !== 'info') { window.sfx?.('stop'); window.gp?.rumble?.(300, 0.8); }
  }
  function clear(key) { const el = active.get(key); if (el) { el.remove(); active.delete(key); } }
  // ---- 通信の監視 ----
  setInterval(() => {
    const now = performance.now();
    robots.forEach(r => {
      if (!r.ok) { r.btn.classList.remove('lost'); return; }
      const dt = now - (r.lastRx || now);
      const lost = dt > LOST_MS;
      r.btn.classList.toggle('lost', lost);
      if (lost) { r.btn.textContent = `${r.id}号機: 通信途絶 ${(dt / 1000).toFixed(1)}s`; alarm('lost' + r.id, 'crit', `${r.id}号機 通信途絶`, '受信がありません。機体はファームの安全機能で 0.5 秒後に自動停止します'); }
      else if (active.has('lost' + r.id)) { clear('lost' + r.id); r.updateLabel(); alarm('back' + r.id, 'info', `${r.id}号機 通信回復`, ''); setTimeout(() => clear('back' + r.id), 3000); }
    });
  }, 250);
  // ---- 自動再接続 ----
  async function reconnect(r) {
    for (let k = 1; k <= 15 && !r.ok && !r.manual; k++) {
      r.btn.textContent = `${r.id}号機: 再接続中 ${k}/15`;
      try {
        const s = await (await r.dev.gatt.connect()).getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
        r.rx = await s.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
        try {
          const tx = await s.getCharacteristic('6e400003-b5a3-f393-e0a9-e50e24dcca9e'); await tx.startNotifications();
          tx.addEventListener('characteristicvaluechanged', e => { const dv = e.target.value; if (!(dv.byteLength && (dv.getUint8(0) & 0x80))) r.onMsg(new TextDecoder().decode(dv)); });
        } catch {}
        r.dot.classList.add('on'); r.lastRx = performance.now(); r.updateLabel();
        clear('disc' + r.id); alarm('re' + r.id, 'info', `${r.id}号機 再接続しました`, ''); setTimeout(() => clear('re' + r.id), 3000);
        log('再接続', r.id + '号機'); return;
      } catch { await new Promise(res => setTimeout(res, 2000)); }
    }
    if (!r.ok && !r.manual) { r.updateLabel(); alarm('disc' + r.id, 'crit', `${r.id}号機 再接続できません`, '電源・距離を確認し、号機ボタンから接続し直してください'); }
  }
  window.fieldOps = {
    log, alarm, clear,
    lost(r) {
      clear('lost' + r.id);
      if (r.manual) { log('切断', r.id + '号機 (手動)'); return; }
      log('切断', r.id + '号機 (予期しない切断)');
      alarm('disc' + r.id, 'warn', `${r.id}号機 切断`, '自動で再接続しています…');
      setTimeout(() => reconnect(r), 500);
    },
  };
  // ---- 停止・再開も記録 ----
  const es = window.emergencyStop, rs = window.resume;
  window.emergencyStop = emergencyStop = function () { log('停止', 'STOP が押されました'); return es.apply(this, arguments); };
  window.resume = resume = function () { log('再開', '長押しで再開'); return rs.apply(this, arguments); };
  // ---- 記録パネル ----
  $('logBtn').onclick = () => { renderLog(); $('logPanel').classList.add('show'); };
  $('logClose').onclick = () => $('logPanel').classList.remove('show');
  $('logPanel').onclick = e => { if (e.target.id === 'logPanel') $('logPanel').classList.remove('show'); };
  $('logCsv').onclick = () => {
    const csv = '時刻,種類,内容\n' + logs.slice().reverse().map(l => [l.t.toISOString(), l.kind, '"' + l.text.replace(/"/g, '""') + '"'].join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = 'swarmbot_log_' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '') + '.csv'; a.click();
  };
  // ---- 手袋・屋外モード ----
  const KEY = 'swarmbot-field';
  const setField = on => { document.body.classList.toggle('field', on); $('fieldBtn').classList.toggle('on', on); try { localStorage.setItem(KEY, on ? '1' : ''); } catch {} };
  $('fieldBtn').onclick = () => setField(!document.body.classList.contains('field'));
  try { setField(localStorage.getItem(KEY) === '1'); } catch {}
  log('起動', 'アプリを開きました');
})();
