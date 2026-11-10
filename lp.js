// 隣の高専生 LP / 詳細ページ共通スクリプト
(() => {
  // スクロールでフェードイン（要素ごとに方向を変え、同じ親の兄弟は 80ms ずつずらす）
  const REVEAL = [
    ['.partners__label, .problem__title, .members__eyebrow, .members__title, .pitch__head, .page__intro', 'blur'],
    ['.partners__item, .problem__card, .flow__node, .flow__arrow, .member-card', 'up'],
    ['.solution__heading, .solution__lead, .pitch__viewer, .company__card', 'zoom'],
    ['.eyebrow-en, .services__heading, .services__banner, .company__row, .info-table__row', 'left'],
    ['.service-row', 'right'],
    ['.merit__title, .merit__text, .page > .panel, .page > .btn-brand, .footer__top > *, .footer__sns, .footer__bottom', 'up'],
    ['.merit__phone', 'right'],
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
})();
