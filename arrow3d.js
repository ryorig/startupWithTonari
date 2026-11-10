// 双方向 3D 矢印 + 押し出し 3D 文字をリアルタイム描画。
// 文字は Noto Sans JP（OFL）の字形を opentype.js で読み、three.js の ExtrudeGeometry で厚みを付けた本物の 3D モデル。
// 矢印と文字は同じグループで回転し、真横（見えない瞬間）で表裏の文字が入れ替わる。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import opentype from 'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.module.js';

const PERIOD = 6000;
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
  const fwd = new THREE.Mesh(textGeometry(font, item.fwdText, vertical ? 4.2 : 4.8), textMat);
  const back = new THREE.Mesh(textGeometry(font, item.backText, vertical ? 4.2 : 4.8), textMat);
  if (vertical) {
    // 縦並び: 矢印は下向き、文字は右側。上下に回転（X 軸）して上向きに反転する
    arrow.rotation.z = -Math.PI / 2; arrow.position.x = -2.2;
    fwd.position.x = back.position.x = 1.15;
    back.rotation.x = Math.PI;
    item.axis = 'x';
  } else {
    arrow.position.y = -0.55;
    fwd.position.y = back.position.y = 1.0;
    back.rotation.y = Math.PI;
    item.axis = 'y';
  }
  back.visible = false;
  group.add(arrow, fwd, back);
  scene.add(group);
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
  if (it.vertical) { it.cam.fov = 30; it.cam.position.set(0, 0, 10.5); it.cam.lookAt(0, 0, 0); }
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
  const angle = reduce ? 0 : ((now % PERIOD) / PERIOD) * Math.PI * 2;
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
