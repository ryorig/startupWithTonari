// 双方向 3D 矢印 + 押し出し 3D 文字をリアルタイム描画。
// 文字は Noto Sans JP（OFL）の字形を opentype.js で読み、three.js の ExtrudeGeometry で厚みを付けた本物の 3D モデル。
// 矢印と文字は同じグループで回転し、真横（見えない瞬間）で表裏の文字が入れ替わる。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import opentype from 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js';

const PERIOD = 6000;
const EASE = 0.4; // 0〜0.5。大きいほど緩急が強い（正面での速さ = 1 - 2×EASE 倍、真横 = 1 + 2×EASE 倍）
const FONT_URL = 'assets/lp/fonts/noto-sans-jp-800-arrow-labels.woff';
const hosts = [...document.querySelectorAll('.flow__arrow--3d')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mqVertical = matchMedia('(max-width: 900px)');

function textGeometry(font, text, maxWidth) {
  const path = font.getPath(text, 0, 0, 100);
  const sp = new THREE.ShapePath();
  for (const c of path.commands) {
    if (c.type === 'M') sp.moveTo(c.x, -c.y);
    else if (c.type === 'L') sp.lineTo(c.x, -c.y);
    else if (c.type === 'Q') sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === 'C') sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  const g = new THREE.ExtrudeGeometry(sp.toShapes(false), { depth: 22, bevelEnabled: true, bevelThickness: 2.2, bevelSize: 1.2, bevelSegments: 3, curveSegments: 6 });
  g.computeBoundingBox();
  g.center();
  const w = g.boundingBox.max.x - g.boundingBox.min.x;
  const k = Math.min(0.0062, maxWidth / w); // 1 文字あたり約 0.62 単位、長い文言は幅に収める
  g.scale(k, k, k);
  return g;
}

function verticalText(font, text, maxHeight, mat) {
  const g = new THREE.Group();
  const chars = [...text];
  const step = Math.min(0.62, maxHeight / chars.length);
  chars.forEach((ch, i) => {
    const geo = textGeometry(font, ch, 10);
    geo.computeBoundingBox();
    const bb = geo.boundingBox; const h = bb.max.y - bb.min.y || 1; const w = bb.max.x - bb.min.x || 1;
    const k = (step * 0.86) / Math.max(h, w, 0.62 * 0.6);
    geo.scale(k, k, k);
    const m = new THREE.Mesh(geo, mat);
    if (ch === 'ー' || ch === '－') m.rotation.z = -Math.PI / 2;
    if (ch === '・') m.scale.setScalar(0.7);
    m.position.y = ((chars.length - 1) / 2 - i) * step;
    g.add(m);
  });
  return g;
}

function arrowGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-1.6, -0.34); s.lineTo(0.45, -0.34); s.lineTo(0.45, -0.82); s.lineTo(1.6, 0);
  s.lineTo(0.45, 0.82); s.lineTo(0.45, 0.34); s.lineTo(-1.6, 0.34); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 6, curveSegments: 8 });
  g.center();
  return g;
}

const arrowMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f5ff, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
const textMat = [
  new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.5 }),
  new THREE.MeshPhysicalMaterial({ color: 0x9fb0e2, roughness: 0.5 }),
];

function build(item, font) {
  const vertical = mqVertical.matches;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6fb8, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 5, 6); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xbcd0ff, 1.0); d2.position.set(-5, -2, -4); scene.add(d2);
  const group = new THREE.Group();
  const arrow = new THREE.Mesh(arrowGeometry(), arrowMat);
  let fwd, back;
  if (vertical) {
    // 縦並び: 矢印（下向き）と縦書きの文字を左右に並べ、全体を中央に配置。X 軸回転で上向きに反転
    fwd = verticalText(font, item.fwdText, 4.2, textMat);
    back = verticalText(font, item.backText, 4.2, textMat);
    arrow.rotation.z = -Math.PI / 2; arrow.scale.x = 0.8; arrow.position.x = 0;
    fwd.position.x = back.position.x = 1.45; // 矢印を中央に置き、文字は右へずらす
    item.axis = 'x';
  } else {
    fwd = new THREE.Mesh(textGeometry(font, item.fwdText, 4.8), textMat);
    back = new THREE.Mesh(textGeometry(font, item.backText, 4.8), textMat);
    arrow.position.y = -0.55;
    fwd.position.y = back.position.y = 1.0;
    item.axis = 'y';
  }
  back.visible = false;
  // 文字は回さず正面に固定し、矢印だけを回す
  group.add(arrow);
  scene.add(group, fwd, back);
  Object.assign(item, { scene, group, fwd, back, vertical });
}

const items = [];
let font = null;
try {
  font = opentype.parse(await (await fetch(FONT_URL)).arrayBuffer());
  hosts.forEach(host => {
    const slot = host.querySelector('.a3d__sprite, .a3d__canvas');
    const canvas = document.createElement('canvas');
    canvas.className = 'a3d__canvas';
    slot.replaceWith(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const cam = new THREE.PerspectiveCamera(30, 1.4, 0.1, 100);
    const item = {
      host, canvas, renderer, cam, visible: true,
      fwdText: host.querySelector('.a3d__label--fwd').textContent.trim(),
      backText: host.querySelector('.a3d__label--back').textContent.trim(),
    };
    build(item, font);
    items.push(item);
  });
  document.documentElement.classList.add('a3d-live', 'a3d-text3d');
} catch (e) {
  console.warn('3D arrow fallback', e);
}

const resize = () => items.forEach(it => {
  if (it.vertical !== mqVertical.matches) build(it, font);
  const w = Math.max(1, it.canvas.offsetWidth), h = Math.max(1, it.canvas.offsetHeight);
  it.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  it.renderer.setSize(w, h, false);
  it.cam.aspect = w / h;
  if (it.vertical) { it.cam.fov = 30; it.cam.position.set(0, 0, 11); it.cam.lookAt(0, 0, 0); }
  else { it.cam.fov = 30; it.cam.position.set(0, 0.5, 9.5); it.cam.lookAt(0, 0.15, 0); }
  it.cam.updateProjectionMatrix();
});
resize();
addEventListener('resize', resize);

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    const it = items.find(i => i.host === e.target); if (it) it.visible = e.isIntersecting;
  }));
  items.forEach(it => io.observe(it.host));
}

const draw = now => {
  // 緩急: 正面（大きく見える 0°/180°）付近はゆっくり、真横（見えにくい 90°/270°）付近は速く
  const u = ((now % PERIOD) / PERIOD) * Math.PI * 2;
  const angle = reduce ? 0 : u - EASE * Math.sin(2 * u);
  const facingFwd = Math.cos(angle) >= 0;
  items.forEach(it => {
    if (!it.visible) return;
    it.group.rotation.set(0, 0, 0);
    it.group.rotation[it.axis] = angle;
    it.fwd.visible = facingFwd;
    it.back.visible = !facingFwd;
    it.renderer.render(it.scene, it.cam);
  });
};
const loop = now => { draw(now); if (!reduce) requestAnimationFrame(loop); };
if (items.length) requestAnimationFrame(loop);
// 検証用: 任意の時刻の 1 コマを描画
window.__a3dAt = t => draw(t);
