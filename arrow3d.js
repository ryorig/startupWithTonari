// 双方向 3D 矢印をリアルタイム描画（60fps）。2 本とも同じ時計で回し、向きに合わせてラベルを切り替える。
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const PERIOD = 6000; // 1 周の時間(ms)
const hosts = [...document.querySelectorAll('.flow__arrow--3d')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeArrow() {
  const s = new THREE.Shape();
  s.moveTo(-1.6, -0.34); s.lineTo(0.45, -0.34); s.lineTo(0.45, -0.82); s.lineTo(1.6, 0);
  s.lineTo(0.45, 0.82); s.lineTo(0.45, 0.34); s.lineTo(-1.6, 0.34); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.42, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelSegments: 6, curveSegments: 8 });
  g.center();
  const m = new THREE.MeshPhysicalMaterial({ color: 0xf2f5ff, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  return new THREE.Mesh(g, m);
}

const items = [];
try {
  hosts.forEach(host => {
    const slot = host.querySelector('.a3d__sprite');
    const canvas = document.createElement('canvas');
    canvas.className = 'a3d__canvas';
    slot.replaceWith(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(28, 300 / 176, 0.1, 100);
    cam.position.set(0, 0.6, 9); cam.lookAt(0, 0, 0);
    const mesh = makeArrow(); scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a6fb8, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(3, 5, 6); scene.add(d);
    const d2 = new THREE.DirectionalLight(0xbcd0ff, 1.0); d2.position.set(-5, -2, -4); scene.add(d2);
    const fwd = host.querySelector('.a3d__label--fwd');
    const back = host.querySelector('.a3d__label--back');
    [fwd, back].forEach(l => { l.style.animation = 'none'; });
    items.push({ host, canvas, renderer, scene, cam, mesh, fwd, back, visible: true });
  });
  document.documentElement.classList.add('a3d-live');
} catch (e) {
  // WebGL が使えない環境では CSS のコマ送りのまま
  console.warn('3D arrow fallback', e);
}

const resize = () => items.forEach(it => {
  // 回転前のサイズ（スマホでは親ごと 90° 回しているため getBoundingClientRect は使わない）
  const w = Math.max(1, it.canvas.offsetWidth), h = Math.max(1, it.canvas.offsetHeight);
  it.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  it.renderer.setSize(w, h, false);
  it.cam.aspect = w / h; it.cam.updateProjectionMatrix();
});
resize();
addEventListener('resize', resize);

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    const it = items.find(i => i.host === e.target); if (it) it.visible = e.isIntersecting;
  }));
  items.forEach(it => io.observe(it.host));
}

let lastFacing = null;
const frame = now => {
  const angle = reduce ? 0 : ((now % PERIOD) / PERIOD) * Math.PI * 2;
  const facingFwd = Math.cos(angle) >= 0;
  items.forEach(it => {
    if (!it.visible) return;
    it.mesh.rotation.y = angle;
    it.renderer.render(it.scene, it.cam);
  });
  if (facingFwd !== lastFacing) {
    lastFacing = facingFwd;
    items.forEach(it => {
      it.fwd.style.opacity = facingFwd ? '1' : '0';
      it.back.style.opacity = facingFwd ? '0' : '1';
    });
  }
  if (!reduce) requestAnimationFrame(frame);
};
if (items.length) requestAnimationFrame(frame);
