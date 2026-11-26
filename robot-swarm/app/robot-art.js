// =====================================================================
//  ロボットの絵 (田宮 トラック&ホイールセット + ユニバーサルプレート の見た目)
//  呼ぶ前に ctx を ロボット中心へ translate し、前方が −y になるよう rotate しておく。
//  R = 半長さ (px)。前方はライトバーと矢印で必ずわかるようにする。
// =====================================================================
(function (root) {
  function drawTank(ctx, R, color, o = {}) {
    const L = R * 2, W = R * 1.7, tw = W * 0.26;          // 全長, 全幅, キャタピラ幅
    const phase = o.phase || 0;                            // キャタピラの動き (0〜1)
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    // 影
    ctx.fillStyle = '#0000008c';
    ctx.beginPath(); ctx.roundRect(-W / 2 + 2, -R + 3, W, L, R * 0.25); ctx.fill();
    // キャタピラ (左右)
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - tw / 2);
      ctx.fillStyle = '#16171a';
      ctx.beginPath(); ctx.roundRect(x - tw / 2, -R, tw, L, tw * 0.45); ctx.fill();
      // 履帯の溝
      ctx.save(); ctx.beginPath(); ctx.roundRect(x - tw / 2, -R, tw, L, tw * 0.45); ctx.clip();
      const pitch = Math.max(3, R * 0.16), off = (phase * pitch) % pitch;
      ctx.strokeStyle = '#3a3c42'; ctx.lineWidth = Math.max(1, R * 0.05);
      for (let y = -R - pitch + off; y < R + pitch; y += pitch) { ctx.beginPath(); ctx.moveTo(x - tw / 2, y); ctx.lineTo(x + tw / 2, y); ctx.stroke(); }
      ctx.restore();
      // 転輪
      ctx.fillStyle = '#5b5e66';
      for (const k of [-0.72, -0.24, 0.24, 0.72]) { ctx.beginPath(); ctx.arc(x, k * R, tw * 0.28, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x - tw / 2, -R, tw, L, tw * 0.45); ctx.stroke();
    }
    // 車体 (ユニバーサルプレート)
    const bw = W - tw * 2 + tw * 0.3, bh = L * 0.86;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, R * 0.12); ctx.fill();
    ctx.fillStyle = '#00000038';                           // プレートの穴
    const hole = Math.max(0.8, R * 0.045), step = Math.max(3, R * 0.2);
    for (let y = -bh / 2 + step * 0.7; y < bh / 2 - step * 0.4; y += step)
      for (let x = -bw / 2 + step * 0.6; x < bw / 2 - step * 0.3; x += step) { ctx.beginPath(); ctx.arc(x, y, hole, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#0000008c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, R * 0.12); ctx.stroke();
    // 基板 (ESP32) と電池
    ctx.fillStyle = '#0d3b2a'; ctx.beginPath(); ctx.roundRect(-bw * 0.28, -bh * 0.08, bw * 0.56, bh * 0.36, 2); ctx.fill();
    ctx.fillStyle = '#25272c'; ctx.beginPath(); ctx.roundRect(-bw * 0.3, bh * 0.32, bw * 0.6, bh * 0.14, 2); ctx.fill();
    // 前: ライトバー + 進行方向の矢印
    ctx.fillStyle = '#fffbe6'; ctx.beginPath(); ctx.roundRect(-bw * 0.36, -bh / 2 + 1, bw * 0.72, Math.max(2, R * 0.1), 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.moveTo(0, -bh * 0.4); ctx.lineTo(bw * 0.3, -bh * 0.14); ctx.lineTo(bw * 0.12, -bh * 0.14);
    ctx.lineTo(bw * 0.12, -bh * 0.02); ctx.lineTo(-bw * 0.12, -bh * 0.02); ctx.lineTo(-bw * 0.12, -bh * 0.14); ctx.lineTo(-bw * 0.3, -bh * 0.14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#0006'; ctx.lineWidth = 1; ctx.stroke();
    // 後ろ: 連結器
    ctx.fillStyle = '#9aa0aa'; ctx.beginPath(); ctx.roundRect(-R * 0.14, R * 0.92, R * 0.28, R * 0.2, 2); ctx.fill();
    // 選択リング
    if (o.selected) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(0, 0, R * 1.35, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }
  // 号機番号のラベル (丸いバッジ)
  function drawBadge(ctx, x, y, text, color) {
    ctx.save(); ctx.font = '700 12px "DIN Alternate","Hiragino Sans",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.max(20, ctx.measureText(text).width + 12);
    ctx.fillStyle = '#111214e6'; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - 10, w, 20, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + 1); ctx.restore();
  }
  root.drawTank = drawTank; root.drawBadge = drawBadge;
})(window);
