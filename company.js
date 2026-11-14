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
    ['.biz-service, .biz-inquiry__card', 'right'],
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
      const k = clamp((vh * 0.75 - r.top) / (r.height + vh * 0.25));
      timeline.style.setProperty('--tp', k.toFixed(3));
      tItems.forEach((li, n) => li.classList.toggle('is-on', k >= (n + 0.3) / tItems.length));
    }
  };

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { update(); ticking = false; });
  }, { passive: true });
  addEventListener('resize', update);
  update();
})();
