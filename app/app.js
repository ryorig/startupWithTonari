// 隣の高専生 アプリ UI（Figma「改善案（To-Be）」の実装）
// 画面は #hash ごとに描画する。データはデモ用（Firestore 連携前のモック）。
(() => {
'use strict';
const C = { navy:'#263983', ink:'#1F2430', sub:'#6B7280', off:'#8A909E', white:'#FFFFFF' };
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// ---------- icons (Phosphor, MIT) ----------
function icon(name, size = 24, color = C.ink) {
  const d = (window.ICONS[name] || '').split('|').map(p => `<path d="${p}"/>`).join('');
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 256 256" fill="${color}" aria-hidden="true">${d}</svg>`;
}

// ---------- state ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('tonari.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tonari.' + k, JSON.stringify(v)); } catch {} }
};
const S = {
  user: { name: '袴田泰斗', initial: '袴', email: 'kmc2626@kamiyama.ac.jp', school: '神山まるごと高専', dept: 'デザイン・エンジニアリング学科', year: '本科1年',
    portfolio: 'https://github.com/HT5a今取り組んでいる研究は災害用小型探索群ロボットです。ロボットが協力して動き、連結したりして災害時に瓦礫の中に入って要救助者を探すロボットを作っています' },
  project: { title: '生活リズムに合わせた仮想の空の研究開発', cat: 'アプリ', tags: ['固定報酬', '研究開発', '学生歓迎', 'リモート可', '継続相談'], skills: ['Flutter', 'Python', 'Firebase', 'Figma', 'データ分析', 'UI/UX'],
    pay: '内容に応じて相談', deadline: '締切未設定', applicants: 0, date: '9/9', company: '依頼企業（匿名）', field: '研究開発', rating: '0.00', reviews: 0,
    body: '社会で使われる時計の時刻と、夜勤・シフト勤務者などが感じる生活リズムの間に生じる「時間のズレ」をテーマに、個人ごとの生活リズムに合わせた相対的な時刻を設定し、その時刻帯に応じた朝・昼・夕方・夜の空を表示するプロトタイプを開発します。仮説検証のための実験設計、アプリ実装、記録・分析まで、得意分野に応じて参加できます。' },
  notif: store.get('notif', { chat: true, status: true, news: false }),
  joined: store.get('joined', false),
  liked: store.get('liked', false),
  chat: store.get('chat', []),
  onboarded: store.get('onboarded', false),
  coachSeen: store.get('coachSeen', false)
};
const save = k => store.set(k, S[k]);
const cats = [['web','Web開発',0,'web'],['app','アプリ',1,'app'],['bolt','MVP制作',0,'mvp'],['brief','業務DX',0,'dx'],['chart','データ',0,'data'],['chip','IoT',0,'iot'],['spark','AI/ML',0,'ai'],['pen','デザイン',0,'design']];

// ---------- shared pieces ----------
const TABS = [['home','ホーム','home','F:house'],['search','さがす','search','F:magnifying-glass'],['hiroba','ひろば','comm','F:users-three'],['applications','応募中','doc','F:file-text'],['mypage','マイページ','user','F:user']];
const tabbar = act => `<nav class="tabbar" aria-label="メインメニュー">${TABS.map(([r, l, i, fi]) =>
  `<a href="#${r}" ${r === act ? 'aria-current="page"' : ''}>${icon(r === act ? fi : i, 24, r === act ? C.navy : C.off)}${l}</a>`).join('')}</nav>`;
const nav = (title, back = true, right = '') => `<header class="nav">${back ? `<button class="left backbtn" data-back aria-label="もどる">${icon('back', 20, C.navy)}</button>` : ''}<span class="t">${title}</span>${right ? `<div class="right">${right}</div>` : ''}</header>`;
const shapes = `<img class="shapes" src="assets/shapes.svg" alt="">`;
const av = (ch, cls = '', bg) => `<span class="av ${cls}"${bg ? ` style="background:${bg}"` : ''}>${ch}</span>`;
const tagList = (first, rest) => `<div class="tags"><span class="tag tint">${first}</span>${rest.map(t => `<span class="tag">${t}</span>`).join('')}</div>`;
const toastEl = () => $('#toast');
let tt; function toast(msg) { const t = toastEl(); t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 1800); }

// ---------- screens ----------
const R = {};

// Onboarding (AirWallet-style: illustration in white circle, heading, dots, bottom CTA)
const ONB = [
  ['隣の高専生なら<br>スキルを活かせる案件が<br>スマホひとつで見つかります', 'il_projects', '次へ進む'],
  ['学校を越えて、制作・学び・挑戦を<br>高専生どうしで共有できます', 'il_connect', '次へ進む'],
  ['学校認定と公開チャットで<br>企業とも安心してやりとりできます', 'il_safe', 'はじめる', '学校認定の条件や詳細は利用規約をご覧ください。'],
  ['応募状況や公開チャットなど<br>大切なお知らせを受け取りましょう', 'il_notify', '次へ進む', '次の画面で通知を許可してください。<br>許可すると、アプリを開かずに大切なお知らせに気づけます。']
];
for (let i = 0; i < 4; i++) R['onboarding-' + (i + 1)] = () => {
  const [h, il, cta, cap] = ONB[i];
  const next = i < 3 ? '#onboarding-' + (i + 2) : '#signup';
  return `<div class="onb"><h1>${h}</h1><div class="stage"><img src="assets/illustrations/${il}.svg" alt=""></div>${cap ? `<p class="cap">${cap}</p>` : ''}
    ${i < 3 ? `<div class="dots">${[0, 1, 2].map(k => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>` : '<div style="margin-top:auto"></div>'}
    <a class="btn" href="${next}">${cta}</a></div>`;
};
R.signup = () => `<div class="onb"><p class="h" style="margin:0;color:var(--navy);font-size:13px">＼ 登録は約1分 ／</p><h1 style="margin-top:4px">まずはアカウントをつくりましょう</h1>
  <div class="stage"><img src="assets/illustrations/il_projects.svg" alt=""></div>
  <div class="notice" style="width:100%;margin-top:16px">${icon('school', 24, C.navy)}<span>学校メールで登録すると、<br>学校認定がスムーズに進みます。</span></div>
  <a class="btn" href="#created" style="margin-top:auto">アカウントの新規作成</a><a class="link" href="#login">すでにアカウントをお持ちの方はこちら</a></div>`;
R.created = () => `<div class="onb"><div class="card" style="width:100%;text-align:center;padding:32px 16px">
  <div style="width:72px;height:72px;border-radius:50%;border:3px solid var(--navy);display:grid;place-items:center;margin:0 auto">${icon('check', 40, C.navy)}</div>
  <h1 style="margin:16px 0">アカウントが作成されました</h1>
  <div style="background:var(--tint);border-radius:12px;padding:16px"><div class="card sh row" style="text-align:left">${av(S.user.initial)}<div><b>${S.user.name}</b><div class="small muted">${S.user.school} ${S.user.year}</div></div></div>
  <p style="margin:12px 0 0;color:var(--navy);font-weight:700">次は学校認定を申請しましょう。</p></div></div>
  <button class="btn" data-finish-onb style="margin-top:auto">次へ進む</button></div>`;

R.login = () => `<div class="band" style="padding-bottom:140px">${shapes}<div class="band-top" style="height:120px"><img class="logo-w" src="assets/logo-white.png" alt="隣の高専生" style="height:44px"></div></div>
  <div class="body overlap"><form class="card sh col" style="gap:16px;padding:20px" data-login>
    <h1 class="h" style="margin:0;font-size:20px">アカウント</h1><p class="muted" style="margin:0">登録済みのメールアドレスでログインします。</p>
    <div class="seg" role="tablist"><button type="button" role="tab" aria-selected="true">ログイン</button><button type="button" role="tab" aria-selected="false" data-go="#signup">新規登録</button></div>
    <div class="input"><input id="login-email" type="email" placeholder="メールアドレス" autocomplete="email" aria-label="メールアドレス"></div>
    <div class="input"><input id="login-pass" type="password" placeholder="パスワード" autocomplete="current-password" aria-label="パスワード"><button type="button" data-peek aria-label="パスワードを表示">${icon('eye', 20, C.sub)}</button></div>
    <button class="btn" type="submit">ログインする</button><a class="center" style="color:var(--navy);font-weight:700" href="#login" data-toast="パスワード再設定のメールを送りました">パスワードを忘れた場合</a></form></div>`;

R.home = () => `<div class="band" style="padding-bottom:140px">${shapes}<div class="band-top"><img class="logo-w" src="assets/logo-white.png" alt="隣の高専生"><button class="right" aria-label="お知らせ" data-toast="新しいお知らせはありません">${icon('bell', 24, C.white)}</button></div></div>
  <div class="body overlap">
    <a class="card sh col" href="#mypage" style="gap:12px"><div class="row">${av(S.user.initial)}<div><b style="font-size:15px">${S.user.name}</b><div class="muted">${S.user.school} ${S.user.year}</div></div></div>
      <div class="divider"></div><div class="row" style="justify-content:flex-end;gap:8px;align-items:baseline"><span class="muted">今週の新着案件</span><span class="num" style="font-size:28px;line-height:1">1</span><b>件</b></div></a>
    <div class="card row" style="justify-content:space-around" id="task-status">
      ${[['doc', '応募中', '#applications'], ['msg', '未読', '#messages'], ['check', '完了', '#applications']].map(([i, l, h]) => `<a class="col" href="${h}" style="align-items:center;gap:4px">${icon(i, 28, C.navy)}<span style="color:var(--navy);font-size:11px;font-weight:700">${l}</span><span><span class="num" style="font-size:15px">0</span> <span class="small muted">件</span></span></a>`).join('')}</div>
    <div class="sec"><h2>カテゴリから探す</h2></div>
    <div class="card" style="display:grid;grid-template-columns:repeat(4,1fr);row-gap:16px">
      ${cats.map(([i, l, n, k]) => `<a class="col" href="#search" data-cat="${l}" style="align-items:center;gap:4px"><span class="tile" style="background:var(--c-${k}-l)">${icon(i, 24, getComputedStyle(document.documentElement).getPropertyValue('--c-' + k).trim())}</span><b class="small">${l}</b>${n ? `<span class="small" style="color:var(--navy);font-weight:700">${n}件</span>` : ''}</a>`).join('')}</div>
    <div class="sec"><h2>注目のプロジェクト</h2><a href="#search">すべて見る</a></div>
    <a class="card row" href="#project" style="align-items:flex-start"><span class="tile" style="background:var(--tint);border-radius:50%;width:40px;height:40px">${icon('app', 20, C.navy)}</span>
      <div class="grow"><div class="small muted">${S.project.cat}</div><b style="font-size:15px">${S.project.title}</b><div class="small muted">${S.project.date}</div></div></a>
  </div>${!S.coachSeen ? coach() : ''}`;
function coach() {
  return `<div class="coach" data-coach><div data-coach-space style="height:258px"></div><div class="card" style="padding:16px;display:flex;justify-content:space-around">${['応募中', '未読', '完了'].map(l => `<span class="col" style="align-items:center;color:var(--navy);font-weight:700;font-size:11px">${l}<span class="num" style="font-size:15px;color:var(--ink)">0</span></span>`).join('')}</div>
  <div class="pop" style="margin-top:16px"><button class="x" data-coach-close aria-label="閉じる">${icon('close', 16, C.navy)}</button>
    <span class="tile" style="background:var(--tint);border-radius:50%;width:64px;height:64px;margin:0 auto">${icon('app', 32, C.navy)}</span>
    <h3 class="h" style="margin:12px 0 8px;color:var(--navy)">まずは案件をさがしてみよう！</h3><p class="muted" style="margin:0 0 16px">応募すると、選考中・進行中の案件や<br>未読メッセージの件数がここに表示されます</p>
    <a class="btn" href="#search" data-coach-close>案件をさがす</a></div></div>`;
}

R.search = () => `<div style="height:12px"></div><div class="body">
  <div class="row"><label class="search grow">${icon('search', 20, C.off)}<input id="q" placeholder="案件をさがす…" aria-label="案件をさがす"></label><button class="tile" style="background:#fff;border-radius:50%;width:48px;height:48px" aria-label="カテゴリ一覧" data-toast="カテゴリ一覧は準備中です">${icon('grid', 24, C.navy)}</button></div>
  <div class="sec"><h2>${S.user.name} さん向けのおすすめ</h2></div>
  <div class="card col" style="gap:8px"><span>プロフィールのポートフォリオに近い案件が 0 件あります。</span><div class="muted ellipsis" style="background:var(--bg);border-radius:12px;padding:12px">${S.user.portfolio}</div></div>
  <div class="chips" role="group" aria-label="カテゴリ">${[['star', 'すべて'], ...cats.map(c => [c[0], c[1]])].map(([i, l], k) => `<button class="ctab" aria-pressed="${k === 0}" data-filter="${l}">${icon(i, 16, C.ink)}${l}</button>`).join('')}</div>
  <div class="sec"><h2>案件</h2><span id="count">1件</span></div>
  <a class="card col" href="#project" style="gap:8px" id="pcard"><div class="row"><div class="tags grow"><span class="tag tint">${S.project.cat}</span><span class="tag">固定報酬</span></div><span class="small muted num">${S.project.date}</span></div>
    <b class="h" style="font-size:17px">${S.project.title}</b><div class="tags">${S.project.skills.slice(0, 4).map(s => `<span class="tag white" style="background:var(--bg)">${s}</span>`).join('')}</div>
    <div class="divider"></div><div class="row"><b class="grow" style="color:var(--navy);font-size:15px">${S.project.pay}</b><span class="small muted">応募 ${S.project.applicants}件 ・ ${S.project.deadline}</span></div></a>
  <p class="empty muted" id="noresult" hidden>このカテゴリの案件はまだありません。</p></div>`;

// ひろば: top tabs フィード / コミュニティ, DM via paper plane
const hirobaHead = tab => `<header class="nav" style="justify-content:flex-start;background:#fff"><span class="h" style="font-size:20px">ひろば</span><div class="right">
  <button aria-label="投稿する" data-toast="学校認定が完了すると投稿できます">${icon('plus', 24, C.ink)}</button>
  <a href="#messages" aria-label="メッセージ" style="position:relative">${icon('send', 24, C.ink)}${S.chat.length ? '' : '<span class="badge">1</span>'}</a></div></header>
  <div class="toptabs" role="tablist"><button role="tab" aria-selected="${tab === 'feed'}" data-go="#hiroba">フィード</button><button role="tab" aria-selected="${tab === 'community'}" data-go="#hiroba-community">コミュニティ</button></div>`;
R.hiroba = () => `${hirobaHead('feed')}
  <div class="stories"><a class="story" href="#hiroba" data-toast="学校認定が完了すると投稿できます"><span class="ring off">${av(S.user.initial, 'lg')}<span class="plus">${icon('plus', 12, C.white)}</span></span>投稿する</a>
    <a class="story" href="#community"><span class="ring">${av('中', 'lg', '#4A63C7')}</span>中本怜祐</a></div>
  <div class="stats3">${[['7', '投稿'], ['38', '認定高専生'], ['0', 'フォロー中']].map(([n, l]) => `<div><div class="num" style="font-size:17px">${n}</div><div class="small muted">${l}</div></div>`).join('')}</div>
  <div class="ftabs" role="tablist"><button role="tab" aria-selected="true">すべての投稿</button><button role="tab" aria-selected="false" data-toast="フォロー中の投稿はまだありません">フォロー中</button></div>
  <div class="composer"><div class="row">${av(S.user.initial, 'sm')}<div class="grow muted" style="background:var(--bg);border-radius:999px;padding:8px 16px">学校認定が完了すると投稿できます</div>${icon('image', 24, C.sub)}</div>
    <a class="notice" href="#school">${icon('shield', 20, C.navy)}<span class="grow small">安全な交流のため、投稿・いいね・コメントには学校認定が必要です</span><b style="color:var(--navy)">認定へ</b></a>
    ${tagList('制作ログ', ['技術相談', '学校生活', 'イベント', '仲間募集'])}</div>
  <article class="post"><a class="row" href="#topic" style="padding:12px 16px">${av('中', 'sm', '#4A63C7')}<div class="grow"><b>中本怜祐</b><div class="small muted">高専スタートアップ ・ 8/22</div></div>${icon('dots', 20, C.ink)}</a>
    <a class="media" href="#topic" style="display:block">${shapes.replace('class="shapes"', 'class="shapes" style="position:absolute;right:-200px;bottom:-120px;width:520px;opacity:.9"')}<h3>高専をもっと盛り上げたい！！！</h3><p>全国の高専生と繋がりたいです！</p></a>
    <div class="acts"><button data-like aria-pressed="${S.liked}" aria-label="いいね">${icon('heart', 24, S.liked ? '#E5484D' : C.ink)}</button><a href="#topic" aria-label="コメント">${icon('msg', 24, C.ink)}</a><a href="#messages" aria-label="メッセージで送る">${icon('send', 24, C.ink)}</a><span class="sp"></span>${icon('bookmark', 24, C.ink)}</div>
    <div style="padding:6px 16px 0"><b class="small">いいね <span class="num">${S.liked ? 1 : 0}</span>件</b><div class="small muted">コメント0件をすべて見る</div></div></article>`;
R['hiroba-community'] = () => `${hirobaHead('community')}<div style="height:12px"></div><div class="body">
  <div class="card row" style="justify-content:space-around">${[['compass', '見つける'], ['comm', '参加中'], ['cal', 'イベント'], ['school', '高専生']].map(([i, l], k) => `<button class="col" style="align-items:center;gap:4px;color:var(--navy);font-size:11px;font-weight:${k ? 400 : 700}" data-toast="${l}は準備中です">${icon(i, 28, C.navy)}${l}</button>`).join('')}</div>
  <button class="card row" data-toast="コミュニティの作成は学校認定後に使えます" style="text-align:left"><span class="tile" style="background:var(--tint);width:36px;height:36px">${icon('plus', 20, C.navy)}</span><div class="grow"><b style="color:var(--navy)">コミュニティをつくる</b><div class="small muted">好きな技術から、学校を越えてつながろう。</div></div></button>
  <label class="search">${icon('search', 20, C.off)}<input placeholder="コミュニティ名・キーワードで検索" aria-label="コミュニティを検索"></label>
  <label class="input" style="background:#fff"><select aria-label="地域"><option>すべての地域</option><option>北海道・東北</option><option>関東</option><option>中部</option><option>近畿</option><option>中国・四国</option><option>九州・沖縄</option><option>全国・オンライン</option></select></label>
  <div class="chips">${['すべて', '地域', '技術', '学科', 'ものづくり'].map((l, k) => `<button class="chip" aria-pressed="${k === 0}" data-chip>${l}</button>`).join('')}</div>
  <div class="sec"><h2>いま注目のコミュニティ</h2><span>1件</span></div>
  <a class="card" href="#community" style="padding:0;overflow:hidden"><div style="height:96px;background:var(--navy);position:relative;padding:12px;overflow:hidden">${shapes.replace('class="shapes"', 'class="shapes" style="position:absolute;right:-180px;bottom:-140px;width:460px"')}<span class="tag white" style="position:relative">技術</span></div>
    <div style="padding:16px"><b class="h" style="font-size:15px">高専スタートアップ</b><p class="muted" style="margin:4px 0">企業を志す高専生、自分でプロダクトを開発している高専生</p><span class="small muted">8人のメンバー ・ 1トピック${S.joined ? ' ・ 参加中' : ''}</span></div></a></div>`;
R.messages = () => `<header class="nav" style="justify-content:flex-start;gap:12px;background:#fff"><button data-back aria-label="もどる">${icon('back', 24, C.ink)}</button><span class="h" style="font-size:20px">メッセージ</span><div class="right">${icon('edit', 22, C.ink)}</div></header>
  <div style="background:#fff;min-height:100%"><div style="padding:8px 16px"><label class="search" style="background:var(--bg);height:40px;border-radius:12px">${icon('search', 18, C.off)}<input placeholder="検索" aria-label="メッセージを検索"></label></div>
  <div style="padding:4px 16px"><span class="chip" style="background:var(--ink);color:#fff;font-weight:700;height:28px">公開チャット</span></div>
  <div class="sec" style="padding:12px 16px 4px"><h2>メッセージ</h2><span>1件</span></div>
  <a class="dmrow" href="#chat">${av('研', 'lg')}<div class="grow"><b class="ellipsis" style="display:block">${S.project.title}</b><div class="muted">公開チャット ・ ${S.project.company}</div><div class="small muted ellipsis">${S.chat.length ? esc(S.chat[S.chat.length - 1]) : 'まだ投稿はありません'}</div></div>${S.chat.length ? '' : '<span class="dot"></span>'}</a></div>`;
R.chat = () => `<header class="row" style="background:#fff;padding:12px 16px;border-bottom:1px solid var(--line)"><button data-back aria-label="もどる">${icon('back', 24, C.navy)}</button>${av('研', 'sm')}<div class="grow"><b class="ellipsis" style="display:block">${S.project.title}</b><div class="small muted">公開チャット ・ ${S.project.company}</div></div></header>
  <div class="chatlog" id="log">${S.chat.length ? S.chat.map(m => `<div class="bubble me">${esc(m)}</div>`).join('') : `<div class="empty"><img class="illu" src="assets/illustrations/il_empty_chat.svg" alt="" style="width:260px"><span class="muted">メッセージはまだありません。</span></div>`}</div>`;
R.applications = () => `${nav('案件管理', false)}<p class="lead">応募中と進行中の案件を Firestore から表示します</p><div class="body">
  <div class="card empty"><img class="illu" src="assets/illustrations/il_empty_apply.svg" alt="" style="width:260px"><h3>まだ応募中の案件はありません</h3><p class="muted" style="margin:0">気になる案件に応募すると、選考中の案件と進行中の案件がここにまとまります。</p></div></div>`;
R.mypage = () => `<div class="band" style="padding-bottom:120px">${shapes}<div class="band-top"><span class="h" style="font-size:15px">マイページ</span></div></div>
  <div class="body overlap" style="margin-top:-104px"><div class="card sh col" style="gap:16px">
    <div class="row">${av(S.user.initial, 'lg')}<div class="grow"><b style="font-size:17px">${S.user.name}</b><div class="muted">${S.user.email}</div><div class="muted">${S.user.school} ${S.user.year}</div></div><a href="#profile-edit" aria-label="プロフィール編集">${icon('edit', 20, C.navy)}</a></div>
    <div class="divider"></div><div class="row" style="justify-content:space-between;text-align:center">${[['0件', '完了'], ['未評価', '評価'], ['未設定', '時給'], ['0', 'フォロワー'], ['0', 'フォロー中']].map(([v, l]) => `<div class="col"><b style="color:var(--navy)">${v}</b><span class="small muted">${l}</span></div>`).join('')}</div></div>
  <div><span class="tag tint">ポートフォリオ登録済み</span></div>
  <div class="card flush">${[['edit', 'プロフィール編集', '#profile-edit'], ['shield', '学校認定', '#school'], ['bell', 'お知らせ設定', '#notifications'], ['bank', 'PAY.JP受取設定', '#payout'], ['doc', '利用規約', '#terms']].map(([i, l, h]) => `<a class="listrow" href="${h}">${icon(i, 24, C.navy)}<span class="grow" style="font-size:15px">${l}</span>${icon('chev', 16, C.off)}</a>`).join('')}</div>
  <div class="sec"><h2>所属情報</h2></div><dl class="card flush" style="margin:0">${[['高専名', S.user.school], ['学科', S.user.dept], ['学年', S.user.year]].map(([k, v]) => `<div class="kv"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
  <div class="sec"><h2>ポートフォリオ</h2></div><div class="card" style="word-break:break-all">${S.user.portfolio}</div></div>`;
const field = (id, label, value = '', ph = '', hint = '', type = 'text') => `<div class="field"><label for="${id}">${label}</label>${hint ? `<span class="hint">${hint}</span>` : ''}<div class="input"><input id="${id}" type="${type}" value="${esc(value)}" placeholder="${ph}"></div></div>`;
R['profile-edit'] = () => `${nav('プロフィール編集')}<p class="lead">公開プロフィールに表示する基本情報を編集できます。</p><form class="body" data-save="プロフィールを保存しました">
  <div class="card col" style="align-items:center;gap:8px;text-align:center">${av(S.user.initial, 'xl')}<b>プロフィール画像</b><span class="small muted">JPG / PNG / WebP を選べます。保存するとプロフィールや検索結果にも反映されます。</span>
    <label class="btn tint sm" style="cursor:pointer">${icon('image', 16, C.navy)}画像を選択<input type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
  <div class="sec"><h2>基本情報</h2></div><div class="card col" style="gap:16px">${field('pe-name', '表示名', S.user.name)}${field('pe-school', '学校名', S.user.school)}${field('pe-dept', '学科・コース', S.user.dept)}</div>
  <button class="btn" type="submit">保存する</button></form>`;
R.school = () => `${nav('学校認定を申請')}<p class="lead">学校情報は運営確認用の申請キューへ送信され、確認後に認定ステータスを反映できます。</p><form class="body" data-save="学校認定を申請しました">
  <div class="card col" style="gap:16px"><div class="row"><span class="tile" style="background:var(--tint)">${icon('school', 24, C.navy)}</span><div class="grow"><span class="tag">未申請</span><div class="muted">学校名・学校メールなどを送信すると、認定フローを開始できます。</div></div></div>
    <div class="steps"><span class="row on" style="gap:4px"><span class="n">1</span>申請</span><span class="bar"></span><span class="row off" style="gap:4px"><span class="n">2</span>運営確認</span><span class="bar"></span><span class="row off" style="gap:4px"><span class="n">3</span>認定完了</span></div></div>
  <div class="sec"><h2>送信先</h2></div><div class="card col" style="gap:8px"><span>申請データは Firestore の運営確認キューへ保存されます。</span><div class="code">school_verification_requests/<br>K7pnMs7z7gNyD2Jl3fAaeQZHvQ62</div><span class="small muted">保存先: \`school_verification_requests/{uid}\` この申請内容を運営側の確認対象として扱います。</span></div>
  <div class="sec"><h2>申請情報</h2></div><div class="card col" style="gap:16px">${field('sc-school', '学校名', S.user.school)}${field('sc-mail', '学校メールアドレス', '', 'example@kosen.ac.jp', '', 'email')}</div>
  <button class="btn" type="submit">申請する</button></form>`;
R.notifications = () => `${nav('お知らせ設定')}<p class="lead">アプリ内で受け取りたい通知を選べます。</p><div class="body">
  <div class="sec"><h2>通知の種類</h2></div><div class="card flush">${[['chat', '公開チャットの新着', '案件に紐づく公開チャットの投稿を通知します。'], ['status', '応募状況の更新', '応募した案件の進行やステータス変更を通知します。'], ['news', '運営からのお知らせ', '新機能やキャンペーンなどのお知らせを通知します。']].map(([k, t, d]) => `<div class="listrow"><div class="grow"><b style="font-size:15px">${t}</b><div class="small muted">${d}</div></div><button class="toggle" role="switch" aria-checked="${S.notif[k]}" aria-label="${t}" data-toggle="${k}"></button></div>`).join('')}</div></div>
  <div class="cta"><button class="btn" data-save-notif>設定を保存する</button></div>`;
R.terms = () => `${nav('利用規約')}<p class="lead">サービス利用時に守っていただきたい主な内容です。最新版: 2026-06-06</p><div class="body">${[
  ['1. アカウント利用', '登録情報は正確に入力し、第三者への貸与や共有は行わないでください。学校認定や本人確認のために追加情報の提出をお願いする場合があります。'],
  ['2. 契約の成立', '案件の受託は、案件条件の確認と当事者双方の合意が前提です。企業側の採用決定後、高専生が契約内容と利用規約に同意し、その後に企業側で支払い予約が確認された時点で着手できます。'],
  ['3. チャットと証跡管理', 'チャットは案件に紐づく公開スレッドのみ利用できます。進捗共有、仕様変更、検収相談、キャンセル相談は公開チャット上で記録を残してください。']].map(([h, t]) => `<div class="card col" style="gap:8px"><b class="h" style="color:var(--navy);font-size:15px">${h}</b><p style="margin:0;line-height:1.8">${t}</p></div>`).join('')}</div>`;
R.payout = () => `${nav('PAY.JP受取設定')}<p class="lead">銀行口座を登録または更新すると、PAY.JPの受取先として保存されます。</p><form class="body" data-save="口座を保存しました">
  <div class="sec"><h2>振込先口座</h2></div><div class="card col" style="gap:16px">${field('po-name', '表示名', S.user.name, '', 'PAY.JP側のテナント名として利用します。')}
  <div class="row" style="align-items:flex-start">${field('po-bank', '銀行コード', '', '例: 0001', '4桁の数字')}${field('po-branch', '支店コード', '', '例: 001', '3桁の数字')}</div>
  <div class="field"><label for="po-type">口座種別</label><div class="input"><select id="po-type"><option>普通</option><option>当座</option></select></div></div>${field('po-no', '口座番号', '', '例: 1234567')}</div>
  <button class="btn" type="submit">口座を保存する</button></form>`;
R.project = () => { const p = S.project; return `${nav('案件詳細')}<div class="body">
  <div class="card col" style="gap:12px">${tagList(p.cat, p.tags)}<b class="h" style="font-size:20px;line-height:1.4">${p.title}</b>
    <div class="col" style="background:var(--tint);border-radius:12px;padding:16px;align-items:center"><span class="small muted">報酬</span><b class="h" style="color:var(--navy);font-size:20px">${p.pay}</b></div>
    <div class="row" style="text-align:center"><div class="grow"><div class="small muted">締切</div><b>${p.deadline}</b></div><div class="grow"><div class="small muted">応募</div><b><span class="num">${p.applicants}</span>件</b></div></div></div>
  <div class="card row">${av('研')}<div class="grow"><b>${p.company}</b><div class="small muted">${p.field} ・ <span class="num">${p.rating}</span> 評価 (${p.reviews})</div></div>${icon('chev', 16, C.off)}</div>
  <div class="sec"><h2>必要スキル</h2></div><div class="tags">${p.skills.map(s => `<span class="tag white">${s}</span>`).join('')}</div>
  <div class="sec"><h2>案件詳細</h2></div><div class="card" style="line-height:1.8">${p.body}</div></div>
  <div class="cta"><a class="btn" href="#school" style="flex:1">学校認定が必要</a><a class="backbtn" href="#chat" style="width:48px;height:48px" aria-label="公開チャットを開く">${icon('msg', 22, C.navy)}</a></div>`; };
R.community = () => `<div class="band" style="padding:12px 16px 104px">${shapes}<button class="row" data-back style="gap:4px;color:#fff;background:rgba(255,255,255,.15);border-radius:999px;padding:6px 12px;font-weight:700">${icon('back', 14, C.white)}コミュニティ一覧</button>
  <div class="tags" style="margin-top:16px"><span class="tag white">技術</span><span class="tag white">全国・オンライン</span></div><h1 class="h" style="margin:8px 0 4px;font-size:28px;line-height:1.3">高専スタートアップ</h1><p style="margin:0;opacity:.8">企業を志す高専生、自分でプロダクトを開発している高専生</p></div>
  <div class="body" style="margin-top:-80px;position:relative"><div class="card sh row" style="justify-content:space-around;text-align:center">${[[(8 + (S.joined ? 1 : 0)) + '人', 'メンバー'], ['1', 'トピック'], ['中本怜祐', 'オーナー']].map(([v, l]) => `<div class="col"><b style="color:var(--navy);font-size:15px">${v}</b><span class="small muted">${l}</span></div>`).join('')}</div>
  <button class="btn ${S.joined ? 'tint' : ''}" data-join>${S.joined ? '参加中' : '参加する'}</button>
  <div class="toptabs" style="background:none;padding:0">${['トピック', 'イベント', 'メンバー 8', 'コミュニティ'].map((l, k) => `<button aria-selected="${k === 0}" style="font-size:13px">${l}</button>`).join('')}</div>
  ${S.joined ? '' : `<div class="notice">${icon('hand', 24, C.navy)}<span class="small">参加すると、トピック投稿・コメント・イベント作成ができます。</span></div>`}
  <a class="card col" href="#topic" style="gap:8px"><div class="row">${av('中', 'sm', '#4A63C7')}<div><b>中本怜祐</b><div class="small muted">8/22</div></div></div><b class="h" style="font-size:17px">高専をもっと盛り上げたい！！！</b><span class="muted">全国の高専生と繋がりたいです！</span>
    <div class="row small muted">${icon('heart', 18, C.sub)}0 ${icon('msg', 18, C.sub)}0</div></a></div>`;
R.topic = () => `${nav('高専スタートアップ')}<div class="body ${S.joined ? '' : ''}">
  <div class="card col" style="gap:8px"><div class="row">${av('中', '', '#4A63C7')}<div class="grow"><b>中本怜祐</b><div class="small muted">8/22</div></div>${icon('chev', 16, C.off)}</div><b class="h" style="font-size:20px;line-height:1.4">高専をもっと盛り上げたい！！！</b><span class="muted">全国の高専生と繋がりたいです！</span>
    <div class="divider"></div><button class="row" data-like style="gap:4px;color:var(--sub)">${icon('heart', 18, S.liked ? '#E5484D' : C.sub)}いいね</button></div>
  <div class="sec"><h2>コメント 0</h2></div><div class="card empty muted">まだコメントはありません。最初のコメントを送ってみましょう。</div>
  ${S.joined ? '' : '<div class="notice" style="justify-content:center"><b class="small" style="color:var(--navy)">コミュニティに参加するとコメントできます。</b></div>'}</div>
  ${S.joined ? '' : '<div class="cta"><button class="btn" data-join>コミュニティに参加する</button></div>'}`;
R.student = () => `${nav('学生詳細')}<div class="body"><div class="empty" style="padding-top:48px"><img class="illu" src="assets/illustrations/il_notfound.svg" alt="" style="width:260px"><h3>プロフィールが見つかりませんでした。</h3><a class="btn tint sm" href="#home">ホームに戻る</a></div></div>`;

// tab ownership per route
const OWNER = { home: 'home', search: 'search', project: 'search', hiroba: 'hiroba', 'hiroba-community': 'hiroba', messages: 'hiroba', chat: 'hiroba', community: 'hiroba', topic: 'hiroba', applications: 'applications', mypage: 'mypage', 'profile-edit': 'mypage', school: 'mypage', notifications: 'mypage', terms: 'mypage', payout: 'mypage', student: 'home' };
// where ← goes when the screen was opened directly (shared link / reload)
const PARENT = { chat: 'messages', messages: 'hiroba', 'hiroba-community': 'hiroba', community: 'hiroba-community', topic: 'community', project: 'search', 'profile-edit': 'mypage', school: 'mypage', notifications: 'mypage', terms: 'mypage', payout: 'mypage', student: 'home' };
const currentRoute = () => { const r = location.hash.slice(1); return R[r] ? r : 'home'; };
const NO_TABS = /^(onboarding-\d|signup|created|login)$/;
const CTA_ROUTES = /^(notifications|project|topic)$/;

// ---------- router ----------
const app = $('#app');
function render() {
  let route = location.hash.slice(1) || (S.onboarded ? 'home' : 'onboarding-1');
  if (!R[route]) route = 'home';
  const html = R[route]();
  const tabs = NO_TABS.test(route) ? '' : tabbar(OWNER[route] || 'home');
  const chatBar = route === 'chat' ? `<form class="inputbar" data-chat><input id="msg" placeholder="メッセージを入力…" aria-label="メッセージ" autocomplete="off"><button class="sendbtn" aria-label="送信">${icon('send', 20, C.white)}</button></form>` : '';
  app.innerHTML = `<main class="screen ${CTA_ROUTES.test(route) && !(route === 'topic' && S.joined) ? 'has-cta' : ''}" id="screen">${html}</main>${chatBar}${tabs}<div class="toast" id="toast" role="status"></div>`;
  if (route.startsWith('onboarding') || /^(signup|created)$/.test(route)) $('#screen').style.display = 'flex';
  document.title = `隣の高専生 | ${({ home: 'ホーム', search: 'さがす', hiroba: 'ひろば', applications: '応募中', mypage: 'マイページ' })[OWNER[route]] || 'はじめに'}`;
  $('#screen').scrollTop = 0;
  const log = $('#log'); if (log) log.scrollTop = log.scrollHeight;
  // align the first-time guide's highlight with the real status card
  const sp = $('[data-coach-space]'), ts = $('#task-status');
  if (sp && ts) sp.style.height = (ts.getBoundingClientRect().top - $('#screen').getBoundingClientRect().top) + 'px';
}
let inAppNavs = 0; // back button: only use browser history for screens opened inside the app
window.addEventListener('hashchange', () => { inAppNavs++; render(); });

// ---------- interactions ----------
document.addEventListener('click', e => {
  const t = e.target.closest('[data-back],[data-go],[data-toast],[data-toggle],[data-join],[data-like],[data-coach-close],[data-finish-onb],[data-chip],[data-filter],[data-peek],[data-save-notif]');
  if (!t) return;
  if (t.matches('[data-back]')) { if (inAppNavs > 0) { inAppNavs -= 2; history.back(); } else location.hash = '#' + (PARENT[currentRoute()] || 'home'); return; }
  if (t.matches('[data-go]')) { e.preventDefault(); location.hash = t.dataset.go; return; }
  if (t.matches('[data-toggle]')) { const k = t.dataset.toggle; S.notif[k] = !S.notif[k]; t.setAttribute('aria-checked', S.notif[k]); return; }
  if (t.matches('[data-save-notif]')) { save('notif'); toast('設定を保存しました'); return; }
  if (t.matches('[data-join]')) { S.joined = !S.joined; save('joined'); toast(S.joined ? '高専スタートアップに参加しました' : '参加をやめました'); render(); return; }
  if (t.matches('[data-like]')) { S.liked = !S.liked; save('liked'); render(); return; }
  if (t.matches('[data-coach-close]')) { S.coachSeen = true; save('coachSeen'); const c = $('[data-coach]'); if (c) c.remove(); return; }
  if (t.matches('[data-finish-onb]')) { S.onboarded = true; save('onboarded'); location.hash = '#home'; return; }
  if (t.matches('[data-peek]')) { const i = $('#login-pass'); i.type = i.type === 'password' ? 'text' : 'password'; return; }
  if (t.matches('[data-chip]')) { t.parentElement.querySelectorAll('[data-chip]').forEach(b => b.setAttribute('aria-pressed', b === t)); return; }
  if (t.matches('[data-filter]')) {
    t.parentElement.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-pressed', b === t));
    const show = ['すべて', 'アプリ'].includes(t.dataset.filter);
    $('#pcard').hidden = !show; $('#noresult').hidden = show; $('#count').textContent = show ? '1件' : '0件'; return;
  }
  if (t.matches('[data-toast]')) { if (t.tagName === 'A' && t.getAttribute('href') === location.hash) e.preventDefault(); toast(t.dataset.toast); }
});
document.addEventListener('submit', e => {
  const f = e.target; e.preventDefault();
  if (f.matches('[data-login]')) { S.onboarded = true; save('onboarded'); location.hash = '#home'; return; }
  if (f.matches('[data-chat]')) { const i = $('#msg'); const v = i.value.trim(); if (!v) return; S.chat.push(v); save('chat'); render(); return; }
  if (f.matches('[data-save]')) toast(f.dataset.save);
});
render();
})();
