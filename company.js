// 法人企業様向けページ：スクロールで移り変わる演出
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // 1. 要素ごとの出現アニメーション
  const MAP = [
    ['.biz-head, .biz-proof__item, .biz-timeline li, .biz-founder > div', 'up'],
    ['.biz-case__visual, .biz-founder img', 'up'],
    ['.biz-case__body, .biz-inquiry__copy', 'left'],
    ['.biz-inquiry__card', 'right'],
  ];
  if (!reduce && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-biz');
    const counts = new Map();
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    MAP.forEach(([sel, kind]) => $$(sel).forEach(el => {
      el.dataset.biz = kind;
      const i = counts.get(el.parentElement) || 0;
      counts.set(el.parentElement, i + 1);
      el.style.setProperty('--d', `${Math.min(i, 5) * 0.1}s`);
      io.observe(el);
    }));
  }

  // 2. 数字のカウントアップ
  $$('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (reduce || !('IntersectionObserver' in window)) { el.textContent = target; return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = now => {
        const k = Math.min((now - t0) / 1400, 1);
        el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    io.observe(el);
  });

  // 3. スクロール連動（プログレス・パララックス・スティッキー切替・タイムライン）
  const progress = $('.biz-progress');
  const photos = $$('.biz-hero__photos img');
  const caseImg = $('.biz-case__visual img');
  const scope = $('[data-scope]');
  const cards = scope ? $$('.biz-scope__text', scope) : [];
  const stage = scope ? $('.biz-scope__stage', scope) : null;
  const FX = ['dissolve', 'push', 'slide', 'move'];
  const navs = scope ? $$('.biz-scope__nav li', scope) : [];
  const bar = scope ? $('.biz-scope__bar', scope) : null;
  const timeline = $('.biz-timeline');
  const tItems = timeline ? $$('li', timeline) : [];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  let current = -1;

  const update = () => {
    const vh = innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    progress?.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
    if (reduce) return;

    photos.forEach(img => { img.style.transform = `translateY(${scrollY * (+img.dataset.speed || 0)}px)`; });

    if (caseImg) {
      const r = caseImg.parentElement.getBoundingClientRect();
      const k = clamp(1 - (r.top + r.height / 2) / vh);
      caseImg.style.setProperty('--zoom', (1.12 - k * 0.12).toFixed(3));
    }

    if (scope && cards.length) {
      const r = scope.getBoundingClientRect();
      const span = scope.offsetHeight - vh;
      const k = clamp(-r.top / span);
      bar?.style.setProperty('--sp', k.toFixed(3));
      const i = Math.min(cards.length - 1, Math.floor(k * cards.length));
      if (i !== current) {
        const dir = i > current ? 1 : -1;
        const fx = FX[Math.max(i, 0) % FX.length];
        cards.forEach((c, n) => {
          c.dataset.fx = fx;
          c.style.setProperty('--dir', n === i ? dir : -dir);
          c.classList.toggle('is-active', n === i);
        });
        stage.dataset.step = i;
        current = i;
        navs.forEach((l, n) => l.classList.toggle('is-active', n === i));
      }
    }

    if (timeline) {
      const r = timeline.getBoundingClientRect();
      const pin = timeline.closest('[data-pin]');
      let k;
      if (pin) { const pr = pin.getBoundingClientRect(); k = clamp(-pr.top / Math.max(pin.offsetHeight - vh, 1) * 1.15); }
      else k = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.4));
      timeline.style.setProperty('--tp', k.toFixed(3));
      tItems.forEach((li, n) => li.classList.toggle('is-on', k >= n / Math.max(1, tItems.length - 1) - 0.001));
    }
  };

  // 背景：ページ全体に続く立体ブロック（ページの長さに応じて増える）
  const bgfx = $('.biz-bgfx');
  // 本物の3D多面体を回転・投影して描く（裏面は描かず、面の向きで陰影）
  const SOLIDS = (() => {
    const prism = (n, h = .8) => { const v = [], f = []; for (let i = 0; i < n; i++) { const t = i * 2 * Math.PI / n; v.push([Math.cos(t), -h, Math.sin(t)], [Math.cos(t), h, Math.sin(t)]); }
      f.push([...Array(n)].map((_, i) => 2 * i).reverse(), [...Array(n)].map((_, i) => 2 * i + 1));
      for (let i = 0; i < n; i++) { const k = (i + 1) % n; f.push([2 * i, 2 * k, 2 * k + 1, 2 * i + 1]); } return { v, f }; };
    const pyramid = n => { const v = [], f = []; for (let i = 0; i < n; i++) { const t = i * 2 * Math.PI / n; v.push([Math.cos(t), -.7, Math.sin(t)]); } v.push([0, 1.1, 0]);
      f.push([...Array(n)].map((_, i) => i).reverse()); for (let i = 0; i < n; i++) f.push([i, (i + 1) % n, n]); return { v, f }; };
    const octa = { v: [[1,0,0],[-1,0,0],[0,1.2,0],[0,-1.2,0],[0,0,1],[0,0,-1]], f: [[0,2,4],[4,2,1],[1,2,5],[5,2,0],[4,3,0],[1,3,4],[5,3,1],[0,3,5]] };
    const cube = prism(4, .72);
    return { tri: prism(3, .9), cube, pent: prism(5, .6), hex: prism(6, .5), pyramid: pyramid(4), tetra: pyramid(3), octa, slab: prism(4, .25), pentpyr: pyramid(5) };
  })();
  const KINDS = Object.keys(SOLIDS);
  const blockSVG = (c, kind, rot) => {
    const S = SOLIDS[kind];
    const ax = rot * 1.7 + .4, ay = rot * 2.3, az = rot * .9;
    const R = p => { let [x, y, z] = p;
      let t = y * Math.cos(ax) - z * Math.sin(ax); z = y * Math.sin(ax) + z * Math.cos(ax); y = t;
      t = x * Math.cos(ay) + z * Math.sin(ay); z = -x * Math.sin(ay) + z * Math.cos(ay); x = t;
      t = x * Math.cos(az) - y * Math.sin(az); y = x * Math.sin(az) + y * Math.cos(az); x = t; return [x, y, z]; };
    const V = S.v.map(R);
    const L = [-.45, -.7, .55], ln = Math.hypot(...L);
    const faces = [];
    S.f.forEach(f => {
      const [a, b, c2] = [V[f[0]], V[f[1]], V[f[2]]];
      const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], w = [c2[0]-a[0], c2[1]-a[1], c2[2]-a[2]];
      let n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
      const nl = Math.hypot(...n) || 1; n = n.map(x => x / nl);
      if (n[2] <= 0.02) return; // 裏面は描かない
      const lit = Math.max(0, (n[0]*L[0] + n[1]*L[1] + n[2]*L[2]) / ln);
      const z = f.reduce((s, i) => s + V[i][2], 0) / f.length;
      faces.push({ f, lit, z });
    });
    faces.sort((p, q) => p.z - q.z);
    const pts = f => f.map(i => (70 + V[i][0] * 50).toFixed(1) + ',' + (70 + V[i][1] * 50).toFixed(1)).join(' ');
    const body = faces.map(({ f, lit }) => {
      const r = Math.round(150 + 105 * lit), g = Math.round(175 + 70 * lit), bl = 255;
      return `<polygon points="${pts(f)}" fill="rgba(${r},${g},${bl},${(.10 + .14 * lit) * c})" stroke="rgba(255,255,255,${.08 * c})" stroke-width=".6"/>`;
    }).join('');
    return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  };
  let rnd = 7;
  const rand = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
  const shapes = [];
  const buildBg = () => {
    if (!bgfx) return;
    bgfx.innerHTML = ''; shapes.length = 0; rnd = 7;
    const H = bgfx.parentElement.offsetHeight, W = bgfx.offsetWidth;
    const step = innerWidth < 900 ? 380 : 340;
    // 画面の端やエリアの端で切れないよう、左右の帯の内側に1つずつ収める
    const half = W / 2, pad = 24;
    for (let y = 120, n = 0; y < H - 160; y += step, n++) {
      for (let s = 0; s < 2; s++) {
        const maxS = Math.min(innerWidth < 900 ? 190 : 420, half - pad * 2);
        const tier = rand(); const size = maxS * (tier < .35 ? .4 + rand() * .12 : tier < .7 ? .62 + rand() * .14 : .88 + rand() * .12);
        const m = size * 0.2; // 回転したときのはみ出し分
        const lo = s === 0 ? pad + m : half + pad + m;
        const hi = s === 0 ? half - pad - size - m : W - pad - size - m;
        const left = lo + rand() * Math.max(0, hi - lo);
        const top = Math.min(H - size - m - pad, y + rand() * Math.max(0, step - size - m * 2));
        const wrap = document.createElement('div');
        wrap.innerHTML = blockSVG(.6 + rand() * .6, KINDS[(n * 2 + s + Math.floor(rand() * 3)) % KINDS.length], rand() * Math.PI);
        const el = wrap.firstChild;
        el.style.cssText = `left:${left}px;top:${top}px;width:${size}px;height:${size}px`;
        el.dataset.rot = (rand() * 50 - 25).toFixed(1);
        el.dataset.sp = (0.04 + rand() * 0.14).toFixed(3);
        bgfx.appendChild(el); shapes.push(el);
      }
    }
    moveBg();
  };
  const moveBg = () => {
    const y = scrollY;
    shapes.forEach(el => { el.style.transform = `rotate(${el.dataset.rot}deg)`; });
  };
  if (bgfx) {
    addEventListener('load', buildBg); addEventListener('resize', () => { clearTimeout(buildBg.t); buildBg.t = setTimeout(buildBg, 200); });
    
    buildBg();
  }

  // アーチ：尖った図形を弾けさせてから見出しを出す
  const arch = $('[data-burst]');
  if (arch && !reduce && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('js-burst');
    const burst = $('.arch-burst', arch);
    const COLORS = ['#87c9ea', '#9396f4', '#ff7eb6', '#ffffff', '#c8f0ea', '#6fa8ec'];
    const fire = () => {
      const W = arch.offsetWidth, n = innerWidth < 900 ? 34 : 64;
      for (let i = 0; i < n; i++) {
        const el = document.createElement('i');
        const w = 8 + Math.random() * 22, hh = w * (1.6 + Math.random() * 1.6);
        el.style.cssText = `width:${w}px;height:${hh}px;margin:${-hh / 2}px 0 0 ${-w / 2}px;background:${COLORS[i % COLORS.length]}`;
        burst.appendChild(el);
        const ang = Math.random() * Math.PI * 2;
        const dist = (0.18 + Math.random() * 0.42) * W * (Math.abs(Math.sin(ang)) > .7 ? .55 : 1);
        const x = Math.cos(ang) * dist, y = Math.sin(ang) * dist * 0.55;
        const r0 = Math.random() * 360, r1 = r0 + (Math.random() * 540 - 270);
        const keep = Math.abs(x) > W * .3 && Math.random() < .6;
        el.animate([
          { transform: `translate(0,0) rotate(${r0}deg) scale(.2)`, opacity: 0 },
          { transform: `translate(${x * .82}px,${y * .82}px) rotate(${(r0 + r1) / 2}deg) scale(1.1)`, opacity: 1, offset: .55 },
          { transform: `translate(${x}px,${y}px) rotate(${r1}deg) scale(1)`, opacity: keep ? .55 : 0 }
        ], { duration: 1100 + Math.random() * 700, delay: Math.random() * 120, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
      }
      arch.classList.add('is-burst');
    };
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); fire(); } }, { threshold: 0.35 });
    io.observe(arch);
  }

  // メンバー：地域フィルター＋スポットライト
  const mx = $('[data-mx]');
  if (mx) {
    const chips = $$('.mx-chip', mx), cards = $$('.mx-card', mx), bar = $('.mx-bar', mx), segs = $$('.mx-bar span', mx);
    let spotT = null, spotI = 0;
    const filter = r => {
      chips.forEach(c => c.classList.toggle('is-active', c.dataset.r === r));
      bar.classList.toggle('is-filtered', r !== 'all');
      segs.forEach(s => s.classList.toggle('is-on', s.dataset.r === r));
      let d = 0;
      cards.forEach(c => {
        const on = r === 'all' || c.dataset.r === r;
        c.hidden = !on;
        if (on) { c.style.setProperty('--d', d++); c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; }
      });
    };
    chips.forEach(c => c.addEventListener('click', () => filter(c.dataset.r)));
    segs.forEach(s => { s.style.cursor = 'pointer'; s.addEventListener('click', () => filter(s.dataset.r)); });
    const spot = () => {
      const vis = cards.filter(c => !c.hidden);
      cards.forEach(c => c.classList.remove('is-spot'));
      if (vis.length) vis[spotI++ % vis.length].classList.add('is-spot');
    };
    if (!reduce) {
      const sio = new IntersectionObserver(([e]) => { clearInterval(spotT); if (e.isIntersecting) spotT = setInterval(spot, 1600); }, { threshold: .25 });
      sio.observe(mx);
    }
  }

  // サービス：1スクロール＝1サービス。左カードは横Push、右の3つの球は三角形の位置を1つずつ回る
  const orb = $('[data-orb]');
  if (orb) {
    const cards = $$('.orb-card', orb), dots = $$('.svc5-dots i', orb), labels = $$('.orb-label', orb);
    const box = $('.orb-3d', orb), canvas = $('.orb-canvas', orb);
    const N = cards.length;
    let cur = 0, locked = false, lastWheel = 0, lastStep = 0;
    const items = cards.map(c => c.dataset.items.split('|'));
    // --- 3D ---
    let renderer, scene, camera, meshes = [], hasGL = false;
    const SLOTS = [[0, 1.15], [1.38, -1.0], [-1.38, -1.0]];
    const COLORS = [0x8fd0de, 0xb6d47a, 0xf58a72];
    const pos = [0, 1, 2].map(k => ({ from: k, to: k, t: 1 }));
    if (hasGL) {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50); camera.position.set(0, 0, 9);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x7d88b8, 0.75));
      const key = new THREE.DirectionalLight(0xffffff, 0.55); key.position.set(-3, 4, 6); scene.add(key);
      const rim = new THREE.DirectionalLight(0xffffff, 0.25); rim.position.set(4, -2, 3); scene.add(rim);
      COLORS.forEach((col, k) => {
        const g = new THREE.SphereGeometry(1.06, 64, 48);
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.9, metalness: 0 }));
        scene.add(m); meshes.push(m);
      });
    }
    const slotOf = k => (k + cur) % 3; // 球kが今いる三角形の位置
    const size = () => {
      const w = box.clientWidth, hh = box.clientHeight;
      if (renderer) { renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); camera.position.z = w < 420 ? 10.5 : 9; }
    };
    const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const v = hasGL ? new THREE.Vector3() : null;
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(now - last, 50); last = now;
      meshes.forEach((m, k) => {
        const s = pos[k]; s.t = Math.min(1, s.t + dt / 650);
        const e = ease(s.t), A = SLOTS[s.from], B = SLOTS[s.to];
        const arc = Math.sin(e * Math.PI) * 0.6;
        const x = A[0] + (B[0] - A[0]) * e, y = A[1] + (B[1] - A[1]) * e;
        m.position.set(x, y, arc);
        if (!reduce) { m.rotation.y += dt * 0.00025; m.rotation.x += dt * 0.00012 + (s.t < 1 ? dt * 0.003 : 0); }
        v.copy(m.position).project(camera);
        const L = labels[k];
        L.style.left = ((v.x + 1) / 2 * box.clientWidth) + 'px';
        L.style.top = ((1 - v.y) / 2 * box.clientHeight) + 'px';
      });
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    const go = i => {
      if (i === cur || i < 0 || i >= N) return;
      const prev = cur; cur = i;
      cards.forEach((c, n) => { c.classList.toggle('is-on', n === i); c.classList.toggle('is-past', n < i); });
      dots.forEach((d, n) => d.classList.toggle('is-on', n === i));
      const steps = i - prev;
      labels.forEach(l => l.classList.add('is-hide'));
      pos.forEach((s, k) => { s.from = ((k + prev) % 3 + 3) % 3; s.to = ((k + i) % 3 + 3) % 3; s.t = reduce ? 1 : 0; });
      if (!hasGL) place();
      setTimeout(() => { labels.forEach((l, k) => { l.textContent = items[i][slotOf(k)]; l.classList.remove('is-hide'); }); }, reduce ? 0 : 320);
    };
    labels.forEach((l, k) => { l.textContent = items[0][slotOf(k)]; });
    const place = () => labels.forEach((l, k) => { const S = SLOTS[slotOf(k)]; l.style.left = (50 + S[0] * 17) + '%'; l.style.top = (50 - S[1] * 21) + '%'; });
    if (!hasGL) place();
    size(); addEventListener('resize', size);
    if (hasGL) requestAnimationFrame(loop);

    // 1回のスクロール／スワイプで必ず1つだけ進む
    const geo = () => { const top = orb.getBoundingClientRect().top + scrollY; const span = orb.offsetHeight - innerHeight; return { top, span }; };
    const target = i => { const g = geo(); return g.top + g.span * ((i + 0.5) / N); };
    const inside = () => { const r = orb.getBoundingClientRect(); return r.top <= 1 && r.bottom >= innerHeight - 1; };
    const step = dir => {
      const n = cur + dir;
      if (n < 0 || n >= N) return false;
      locked = true; go(n);
      scrollTo({ top: target(n), behavior: 'instant' });
      setTimeout(() => { locked = false; }, 750);
      return true;
    };
    addEventListener('wheel', e => {
      if (!inside()) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      if ((dir > 0 && cur === N - 1) || (dir < 0 && cur === 0)) return;
      e.preventDefault();
      const now = performance.now(), gap = now - lastWheel; lastWheel = now;
      // 1つのスクロール操作（慣性を含む）につき1つだけ進む
      if (!locked && (gap > 220 || now - lastStep > 900) && Math.abs(e.deltaY) > 2) { lastStep = now; step(dir); }
    }, { passive: false });
    let ty = null;
    addEventListener('touchstart', e => { ty = inside() ? e.touches[0].clientY : null; }, { passive: true });
    addEventListener('touchmove', e => {
      if (ty === null || !inside()) return;
      const dy = ty - e.touches[0].clientY, dir = dy > 0 ? 1 : -1;
      if ((dir > 0 && cur === N - 1) || (dir < 0 && cur === 0)) return;
      e.preventDefault();
      if (!locked && Math.abs(dy) > 30) { step(dir); ty = e.touches[0].clientY; }
    }, { passive: false });
    addEventListener('keydown', e => {
      if (!inside() || !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key)) return;
      const dir = ['ArrowUp', 'PageUp'].includes(e.key) ? -1 : 1;
      if ((dir > 0 && cur === N - 1) || (dir < 0 && cur === 0)) return;
      e.preventDefault(); if (!locked) step(dir);
    });
    // スクロールバー等で飛んだ場合は位置から合わせる
    addEventListener('scroll', () => {
      if (locked) return;
      const g = geo(); const k = clamp((scrollY - g.top) / Math.max(g.span, 1));
      const i = Math.min(N - 1, Math.floor(k * N));
      if (i !== cur) go(i);
    }, { passive: true });
  }

  // お問い合わせフォーム：入力 → 確認 → 送信（メールアプリで送信）
  const cf = $('[data-cf]');
  if (cf) {
    const TO = 'nakamotoryoke@gmail.com';
    const LABEL = { name: 'お名前', org: '会社名・団体名・学校名', role: '所属・役職', email: 'メールアドレス', tel: '電話番号', body: 'お問い合わせ内容' };
    const steps = $$('.cf__step', cf), err = $('.cf__error', cf), conf = $('.cf__confirm', cf);
    const modal = cf.closest('.cf-modal');
    const show = s => { steps.forEach(x => x.hidden = x.dataset.step !== s); modal.scrollTop = 0; };
    const open = () => { modal.hidden = false; document.body.classList.add('cf-open'); show('input'); };
    const close = () => { modal.hidden = true; document.body.classList.remove('cf-open'); };
    $$('[data-cf-open]').forEach(b => b.addEventListener('click', open));
    $$('[data-cf-close]', modal).forEach(b => b.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) close(); });
    const vals = () => Object.fromEntries(Object.keys(LABEL).map(k => [k, (cf.elements[k].value || '').trim()]));
    $$('[data-go]', cf).forEach(b => b.addEventListener('click', () => {
      if (b.dataset.go === 'confirm') {
        const v = vals();
        const ok = v.name && v.body && /.+@.+\..+/.test(v.email) && cf.elements.agree.checked;
        err.hidden = !!ok; if (!ok) return;
        conf.innerHTML = '';
        Object.keys(LABEL).forEach(k => { const d = document.createElement('div'); const dt = document.createElement('dt'); const dd = document.createElement('dd'); dt.textContent = LABEL[k]; dd.textContent = v[k] || '—'; d.append(dt, dd); conf.append(d); });
      }
      show(b.dataset.go);
    }));
    cf.addEventListener('submit', e => {
      e.preventDefault();
      const v = vals();
      const body = Object.keys(LABEL).map(k => `【${LABEL[k]}】\n${v[k] || '—'}`).join('\n\n');
      location.href = `mailto:${TO}?subject=${encodeURIComponent('【隣の高専生】お問い合わせ（' + (v.org || v.name) + '）')}&body=${encodeURIComponent(body)}`;
      show('done');
    });
  }

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  addEventListener('resize', update);
  update();
})();
