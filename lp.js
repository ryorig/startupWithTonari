// 隣の高専生 LP / 詳細ページ共通スクリプト
(() => {
  // スクロールでフェードイン（要素ごとに方向を変え、同じ親の兄弟は 80ms ずつずらす）
  const REVEAL = [
    ['.partners__label, .problem__title, .members__eyebrow, .members__title, .pitch__head, .page__intro', 'blur'],
    ['.partners__item, .problem__card, .flow__node, .flow__arrow, .member-card', 'up'],
    ['.solution__heading, .solution__lead, .pitch__viewer, .company__card', 'zoom'],
    ['.eyebrow-en, .services__heading, .services__banner, .company__row, .info-table__row', 'left'],
    ['.service-row', 'right'],
    ['.steps__card, .page > .panel, .page > .btn-brand, .footer__top > *, .footer__sns, .footer__bottom', 'up'],
  ];
  if ('IntersectionObserver' in window) {
    document.documentElement.classList.add('js-fade');
    const groups = new Map();
    const els = [];
    REVEAL.forEach(([sel, dir]) => document.querySelectorAll(sel).forEach(el => {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      el.dataset.reveal = dir;
      const i = groups.get(el.parentElement) || 0;
      groups.set(el.parentElement, i + 1);
      el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 0.08}s`);
      els.push(el);
    }));
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.15 });
    els.forEach(el => io.observe(el));
    // 予備: IntersectionObserver が遅れる環境でも、画面内に入った要素は必ず表示する
    const check = () => {
      const limit = innerHeight * 0.95;
      els.forEach(el => {
        if (!el.classList.contains('is-visible') && el.getBoundingClientRect().top < limit) {
          el.classList.add('is-visible');
          io.unobserve(el);
        }
      });
    };
    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check);
    addEventListener('load', check);
    check();
  }

  // モバイル用グローバルナビ
  const nav = document.querySelector('.gnav');
  const toggle = nav?.querySelector('.gnav__toggle');
  toggle?.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav?.querySelectorAll('.gnav__links a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('is-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
  });

  // メンバー / 横にドラッグしてスクロール
  const scroller = document.querySelector('.members__scroller');
  if (scroller) {
    let startX = 0;
    let startScroll = 0;
    let dragging = false;
    scroller.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') return;
      dragging = true;
      startX = e.clientX;
      startScroll = scroller.scrollLeft;
      scroller.classList.add('is-dragging');
      scroller.setPointerCapture(e.pointerId);
    });
    scroller.addEventListener('pointermove', e => {
      if (!dragging) return;
      scroller.scrollLeft = startScroll - (e.clientX - startX);
    });
    const end = () => {
      dragging = false;
      scroller.classList.remove('is-dragging');
    };
    scroller.addEventListener('pointerup', end);
    scroller.addEventListener('pointercancel', end);
  }

  // 背景 / 青い四角形・下端固定・高さランダム（Figma 188:482 の配置を 1414px 基準の % で再現）
  const skyline = document.querySelector('.skyline');
  if (skyline) {
    const blocks = [
      // [left, width, height, color]
      [0, 76, 57, '#1c459b'], [76, 122, 86, '#006fb6'], [240, 72, 55, '#00a0db'],
      [312, 153, 105, '#1c459b'], [519, 93, 68, '#006fb6'], [660, 177, 120, '#00a0db'],
      [837, 117, 83, '#1c459b'], [1015, 146, 101, '#006fb6'], [1207, 104, 76, '#1c459b'],
      [1311, 66, 51, '#00a0db'], [198, 42, 36, '#1c459b'], [465, 54, 44, '#00a0db'],
      [612, 48, 40, '#1c459b'], [954, 61, 48, '#00a0db'], [1161, 46, 38, '#00a0db'],
      [1377, 37, 33, '#006fb6'],
      // Foreground / 重なり
      [55, 64, 31, '#00a0db'], [205, 55, 39, '#1c459b'], [359, 68, 46, '#006fb6'],
      [492, 56, 29, '#00a0db'], [692, 76, 43, '#1c459b'], [876, 60, 38, '#00a0db'],
      [1089, 69, 33, '#1c459b'], [1277, 58, 30, '#006fb6'],
    ];
    const W = 1414;
    blocks.forEach(([left, width, height, color], i) => {
      const el = document.createElement('span');
      el.style.left = `${(left / W) * 100}%`;
      el.style.width = `${(width / W) * 100}%`;
      el.style.height = `${height}px`;
      el.style.background = color;
      el.style.animationDelay = `${-(i * 0.7) % 6}s`;
      el.style.animationDuration = `${5 + (i % 4)}s`;
      skyline.appendChild(el);
    });
  }

  // ボタンの沈み込みを手のアニメーションと同じ時間軸にそろえる
  const syncTap = () => {
    const btn = document.querySelector('.hero__register');
    const hand = document.querySelector('.tap__hand');
    if (!btn || !hand) return;
    const h = hand.getAnimations().find(a => a.animationName === 'tap-hand');
    const b = btn.getAnimations().find(a => a.animationName === 'tap-press');
    if (h && b && h.startTime != null) b.startTime = h.startTime;
  };
  document.querySelectorAll('.hero__register, .hero__business').forEach(el => {
    el.addEventListener('animationend', e => { if (e.animationName === 'rise-in') { el.classList.add('is-entered'); requestAnimationFrame(syncTap); } });
    setTimeout(() => { el.classList.add('is-entered'); requestAnimationFrame(syncTap); }, 2000);
  });

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // --- hero: カーソル位置で光の色と位置・視差が変わる ---
  const panel = document.querySelector('.hero__panel');
  if (false && panel && !reduce) {
    panel.addEventListener('pointermove', e => {
      const r = panel.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      panel.style.setProperty('--mx', `${x * 100}%`);
      panel.style.setProperty('--my', `${y * 100}%`);
      panel.style.setProperty('--hue', String(Math.round(180 + x * 160 + y * 40)));
      panel.style.setProperty('--px', (x - 0.5).toFixed(3));
      panel.style.setProperty('--py', (y - 0.5).toFixed(3));
    });
    panel.addEventListener('pointerleave', () => {
      panel.style.setProperty('--px', '0');
      panel.style.setProperty('--py', '0');
    });
  }

  // --- スクロール進捗 / ヘッダーの出し入れ / 01–03 スティッキー ---
  const progress = document.querySelector('.progress');
  const steps = document.querySelector('[data-steps]');
  const stepEls = steps ? [...steps.querySelectorAll('.chip')] : [];
  const dots = steps ? [...steps.querySelectorAll('.chip__head')] : [];
  let lastY = scrollY;
  let ticking = false;
  const setStep = i => {
    if (!steps || steps.dataset.index === String(i)) return;
    steps.dataset.index = String(i);
    stepEls.forEach((el, k) => {
      el.classList.toggle('is-active', k === i);
      el.classList.toggle('is-past', k < i);
    });
    dots.forEach((d, k) => d.setAttribute('aria-expanded', String(k === i)));
  };
  const onScroll = () => {
    ticking = false;
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (nav) {
      nav.classList.toggle('is-scrolled', y > 10);
      nav.classList.toggle('is-hidden', y > lastY && y > 300);
    }
    lastY = y;
    if (steps) {
      const r = steps.getBoundingClientRect();
      const t = Math.min(Math.max(-r.top / (r.height - innerHeight), 0), 0.999);
      setStep(Math.floor(t * stepEls.length));
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();
  dots.forEach((d, i) => d.addEventListener('click', () => {
    const top = steps.getBoundingClientRect().top + scrollY;
    const span = steps.offsetHeight - innerHeight;
    scrollTo({ top: top + span * ((i + 0.5) / stepEls.length), behavior: reduce ? 'auto' : 'smooth' });
  }));

  if (finePointer && !reduce) {
    // --- カスタムカーソル（少し遅れて追従） ---
    const cursor = document.querySelector('.cursor');
    if (cursor) {
      let tx = -100, ty = -100, cx = -100, cy = -100;
      addEventListener('pointermove', e => {
        tx = e.clientX; ty = e.clientY;
        const t = e.target;
        cursor.classList.toggle('is-hover', !!t.closest?.('a, button, .tilt, [data-goto]'));
        cursor.classList.toggle('is-dark', !!t.closest?.('.solution, .members, .company, .footer') && !t.closest?.('.steps__card'));
      });
      const loop = () => {
        cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2;
        cursor.style.setProperty('--cx', `${cx}px`);
        cursor.style.setProperty('--cy', `${cy}px`);
        requestAnimationFrame(loop);
      };
      loop();
    }

    // --- マグネットボタン ---
    document.querySelectorAll('.magnetic').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--tx', `${(e.clientX - r.left - r.width / 2) * 0.06}px`);
        el.style.setProperty('--ty', `${(e.clientY - r.top - r.height / 2) * 0.1}px`);
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); });
    });

    // --- 3D チルト ---
    document.querySelectorAll('.tilt').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.classList.add('is-tilting');
        el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 10}deg) rotateY(${(x - 0.5) * 12}deg)`;
        el.style.setProperty('--gx', `${x * 100}%`);
        el.style.setProperty('--gy', `${y * 100}%`);
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('is-tilting'); el.style.transform = ''; });
    });
  }

  // --- メンバー: ゆっくり自動スクロール（触れている間は停止、端で折り返し） ---
  const ms = document.querySelector('.members__scroller');
  if (ms && !reduce) {
    let paused = false, dir = 1, acc = 0;
    ['pointerenter', 'pointerdown', 'touchstart', 'focusin'].forEach(ev => ms.addEventListener(ev, () => { paused = true; }, { passive: true }));
    ['pointerleave', 'focusout'].forEach(ev => ms.addEventListener(ev, () => { paused = false; }));
    ms.addEventListener('touchend', () => setTimeout(() => { paused = false; }, 2500), { passive: true });
    const drift = () => {
      if (!paused && ms.scrollWidth > ms.clientWidth) {
        acc += 0.5 * dir;
        if (Math.abs(acc) >= 1) { ms.scrollLeft += Math.trunc(acc); acc -= Math.trunc(acc); }
        if (ms.scrollLeft + ms.clientWidth >= ms.scrollWidth - 1) dir = -1;
        else if (ms.scrollLeft <= 0) dir = 1;
      }
      requestAnimationFrame(drift);
    };
    drift();
  }

  // ===== 臨場感のあるスクロール演出 =====
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Project Portfolio: 縦スクロールを横送りに変換
  const works = document.querySelector('.works');
  const wList = works?.querySelector('.works__list');
  const wCards = wList ? [...wList.querySelectorAll('.work-card')] : [];
  const wCurrent = works?.querySelector('.works__current');
  if (works && wCards.length && !reduce) {
    works.classList.add('works--scroll');
  }
  const updateWorks = () => {
    if (!works || !works.classList.contains('works--scroll')) return;
    const r = works.getBoundingClientRect();
    const span = works.offsetHeight - innerHeight;
    const p = clamp(-r.top / Math.max(span, 1), 0, 1);
    const f = p * (wCards.length - 1);
    const card = wCards[0].offsetWidth;
    const gap = parseFloat(getComputedStyle(wList).columnGap) || 48;
    const vw = works.querySelector('.works__viewport').clientWidth;
    const x = vw / 2 - card / 2 - f * (card + gap);
    wList.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    wCards.forEach((c, i) => {
      const d = i - f;
      const a = Math.min(Math.abs(d), 1.4);
      const scale = 1.06 - 0.16 * Math.min(a, 1);
      const rot = clamp(-d * 28, -38, 38);
      c.style.transform = `rotateY(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      c.style.opacity = (1 - 0.5 * Math.min(a, 1)).toFixed(2);
      c.classList.toggle('is-active', Math.abs(d) < 0.5);
    });
    if (wCurrent) wCurrent.textContent = String(Math.round(f) + 1).padStart(2, '0');
  };

  // 事業内容: 画面中央に最も近い行にフォーカス
  const sList = document.querySelector('.services__list');
  const sItems = sList ? [...sList.children] : [];
  const updateServices = () => {
    if (!sList || reduce) return;
    const r = sList.getBoundingClientRect();
    const mid = innerHeight * 0.5;
    const inView = r.top < innerHeight * 0.75 && r.bottom > innerHeight * 0.25;
    sList.classList.toggle('is-focusing', inView);
    if (!inView) { sItems.forEach(el => el.classList.remove('is-focus')); return; }
    let best = null, bestD = Infinity;
    sItems.forEach(el => { const b = el.getBoundingClientRect(); const d = Math.abs(b.top + b.height / 2 - mid); if (d < bestD) { bestD = d; best = el; } });
    sItems.forEach(el => el.classList.toggle('is-focus', el === best));
  };

  // 後半セクション: 入場時に引きから全体表示へズーム
  const zoomEls = reduce ? [] : ['.pitch__viewer', '.company__card'].map(q => document.querySelector(q)).filter(Boolean);
  zoomEls.forEach(el => el.setAttribute('data-zoom', ''));
  const updateZoom = () => zoomEls.forEach(el => {
    const r = el.getBoundingClientRect();
    const e = clamp((innerHeight - r.top) / (innerHeight * 0.7), 0, 1);
    const ease = 1 - Math.pow(1 - e, 3);
    el.style.transform = `scale(${(0.88 + 0.12 * ease).toFixed(4)})`;
    el.style.borderRadius = `${((1 - ease) * 36).toFixed(1)}px`;
  });

  let fxTick = false;
  const fx = () => { fxTick = false; updateWorks(); updateServices(); updateZoom(); };
  addEventListener('scroll', () => { if (!fxTick) { fxTick = true; requestAnimationFrame(fx); } }, { passive: true });
  addEventListener('resize', fx);
  fx();
  window.__fx = fx;
})();
