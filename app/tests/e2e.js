// End-to-end checks for /app/: every route, every control, user journeys, persistence, layout.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const ROOT=path.resolve(__dirname,'../..'), BASE='https://tonari.test/app/';
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
const results=[];let fails=0;
const ok=(name,cond,detail='')=>{results.push(`${cond?'PASS':'FAIL'}  ${name}${detail?'  — '+detail:''}`);if(!cond)fails++;};
async function newPage(browser,vp={width:390,height:844}){
  const ctx=await browser.newContext({viewport:vp});
  await ctx.route('https://tonari.test/**',r=>{const u=new URL(r.request().url());let p=path.join(ROOT,decodeURIComponent(u.pathname));if(p.endsWith('/'))p+='index.html';
    if(!fs.existsSync(p))return r.fulfill({status:404,body:'nf'});r.fulfill({status:200,body:fs.readFileSync(p),contentType:MIME[path.extname(p)]||'application/octet-stream'});});
  const page=await ctx.newPage();page.errs=[];page.bad=[];
  page.on('pageerror',e=>page.errs.push(e.message));page.on('console',m=>{if(m.type()==='error')page.errs.push(m.text())});
  page.on('response',r=>{if(r.status()>=400&&r.url().includes('tonari.test'))page.bad.push(r.status()+' '+r.url())});
  return {ctx,page};
}
const go=async(page,h)=>{await page.evaluate(x=>location.hash=x,h);await page.waitForTimeout(120);};
const text=async(page,sel='#screen')=>page.$eval(sel,e=>e.innerText).catch(()=>'');
(async()=>{
 const browser=await chromium.launch();
 const ROUTES=['onboarding-1','onboarding-2','onboarding-3','onboarding-4','signup','created','login','home','search','hiroba','hiroba-community','messages','chat','applications','mypage','profile-edit','school','notifications','terms','payout','project','community','topic','student'];
 // ---------- 1. every route renders, no errors, no broken assets, no horizontal overflow (phone + desktop) ----------
 for(const vp of [{width:375,height:812},{width:1280,height:900}]){
  const {ctx,page}=await newPage(browser,vp);await page.goto(BASE);await page.waitForTimeout(400);
  for(const r of ROUTES){await go(page,'#'+r);
    const html=await page.$eval('#screen',e=>e.innerHTML.length).catch(()=>0);
    const over=await page.evaluate(()=>{const d=document.querySelector('.device');const s=document.getElementById('screen');
      const bad=[...s.querySelectorAll('*')].filter(e=>{const b=e.getBoundingClientRect();const D=d.getBoundingClientRect();return b.width>0&&(b.right>D.right+1||b.left<D.left-1)&&getComputedStyle(e).position!=='absolute'&&!e.closest('.chips,.stories,.shapes,.band,.media')});
      return bad.slice(0,3).map(e=>e.className||e.tagName);});
    ok(`[${vp.width}px] #${r} renders`,html>200);ok(`[${vp.width}px] #${r} no element sticks out of the screen`,over.length===0,over.join(','));}
  ok(`[${vp.width}px] no JS errors across all routes`,page.errs.length===0,page.errs.slice(0,3).join(' | '));
  ok(`[${vp.width}px] no missing files (404)`,page.bad.length===0,page.bad.slice(0,3).join(' | '));
  // images actually decoded
  await go(page,'#onboarding-1');await page.waitForTimeout(300);
  const imgs=await page.$$eval('img',a=>a.map(i=>[i.getAttribute('src'),i.complete&&i.naturalWidth>0]));
  ok(`[${vp.width}px] onboarding illustration loads`,imgs.every(x=>x[1]),JSON.stringify(imgs));
  await ctx.close();}

 // ---------- 2. every link/button on every route: clicking never errors, every hash link points to a real screen ----------
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.evaluate(()=>{localStorage.setItem('tonari.onboarded','true');localStorage.setItem('tonari.coachSeen','true')});await page.reload();await page.waitForTimeout(250);
  const dead=[];let clicks=0;
  for(const r of ROUTES){await go(page,'#'+r);
   const hrefs=await page.$$eval('a[href]',a=>a.map(x=>x.getAttribute('href')));
   for(const h of hrefs){if(h.startsWith('#')&&!ROUTES.includes(h.slice(1)))dead.push(r+' → '+h);}
   const n=await page.$$eval('#screen button, #screen a, .tabbar a, .cta button, .cta a, .inputbar button',a=>a.length);
   for(let i=0;i<n;i++){await go(page,'#'+r);const els=await page.$$('#screen button, #screen a, .tabbar a, .cta button, .cta a, .inputbar button');if(!els[i])continue;
     const vis=await els[i].isVisible();if(!vis)continue;
     const before=page.errs.length;await els[i].click({timeout:2000}).catch(e=>page.errs.push('click failed on #'+r+' item '+i+': '+e.message.split('\n')[0]));clicks++;await page.waitForTimeout(80);
     if(page.errs.length>before)dead.push('#'+r+' item '+i+' → '+page.errs[page.errs.length-1]);}
  }
  ok(`every link points to an existing screen`,dead.filter(d=>d.includes('→ #')).length===0,dead.filter(d=>d.includes('→ #')).join(', '));
  ok(`clicked ${clicks} controls on ${ROUTES.length} screens without any error`,page.errs.length===0,page.errs.slice(0,4).join(' | '));
  await ctx.close();}

 // ---------- 3. journeys ----------
 // A: first-time user
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.waitForTimeout(300);
  ok('A1 first visit starts at onboarding',page.url().endsWith('/app/')&&(await text(page)).includes('スマホひとつで'));
  for(let i=0;i<3;i++){await page.click('.onb .btn');await page.waitForTimeout(120);}
  ok('A2 4th onboarding page = notification explanation',(await text(page)).includes('通知を許可'));
  await page.click('.onb .btn');await page.waitForTimeout(120);ok('A3 → account creation page',(await text(page)).includes('まずはアカウントをつくりましょう'));
  await page.click('text=アカウントの新規作成');await page.waitForTimeout(120);ok('A4 → account created',(await text(page)).includes('アカウントが作成されました'));
  await page.click('[data-finish-onb]');await page.waitForTimeout(200);ok('A5 → home with first-time guide',page.url().endsWith('#home')&&await page.$('[data-coach]')!==null);
  await page.click('[data-coach-close]');await page.waitForTimeout(100);ok('A6 guide closes',await page.$('[data-coach]')===null);
  await page.reload();await page.waitForTimeout(300);ok('A7 after reload: no onboarding, no guide again',await page.$('[data-coach]')===null&&(await text(page)).includes('今週の新着案件'));
  await page.goto(BASE);await page.waitForTimeout(300);ok('A8 reopening the app goes straight to home',(await text(page)).includes('今週の新着案件'));
  ok('A no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // B: returning user logs in; guide's own CTA works
 {const {ctx,page}=await newPage(browser);await page.goto(BASE+'#signup');await page.waitForTimeout(300);
  await page.click('text=すでにアカウントをお持ちの方はこちら');await page.waitForTimeout(120);ok('B1 → login',(await text(page)).includes('アカウント'));
  await page.fill('#login-email','kmc2626@kamiyama.ac.jp');await page.fill('#login-pass','secret');await page.click('[data-peek]');
  ok('B2 show-password toggles',await page.$eval('#login-pass',e=>e.type)==='text');
  await page.click('[data-go="#signup"]');await page.waitForTimeout(100);ok('B3 新規登録 tab goes to sign-up',page.url().endsWith('#signup'));
  await go(page,'#login');await page.click('form[data-login] button[type=submit]');await page.waitForTimeout(200);ok('B4 login → home',page.url().endsWith('#home'));
  await page.click('.coach .btn');await page.waitForTimeout(150);ok('B5 guide CTA → search and guide dismissed',page.url().endsWith('#search')&&await page.evaluate(()=>localStorage.getItem('tonari.coachSeen'))==='true');
  ok('B no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // C: browse projects
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.evaluate(()=>{localStorage.setItem('tonari.onboarded','true');localStorage.setItem('tonari.coachSeen','true')});await page.reload();await page.waitForTimeout(250);await go(page,'#home');
  await page.click('a[data-cat="アプリ"]');await page.waitForTimeout(120);ok('C1 category → search',page.url().endsWith('#search'));
  await page.click('[data-filter="データ"]');ok('C2 filter with no projects shows empty message',await page.isVisible('#noresult')&&!(await page.isVisible('#pcard'))&&(await page.textContent('#count'))==='0件');
  await page.click('[data-filter="アプリ"]');ok('C3 matching filter shows the project',await page.isVisible('#pcard'));
  await page.fill('#q','Flutter');ok('C4 search box accepts input',(await page.inputValue('#q'))==='Flutter');
  await page.click('#pcard');await page.waitForTimeout(120);ok('C5 project detail opens',(await text(page)).includes('必要スキル'));
  ok('C6 tab bar keeps さがす selected on detail',(await page.textContent('.tabbar [aria-current]')).includes('さがす'));
  await page.click('.cta .btn');await page.waitForTimeout(120);ok('C7 学校認定が必要 → school verification',page.url().endsWith('#school'));
  await page.fill('#sc-mail','t@kamiyama.ac.jp');await page.click('form[data-save] button[type=submit]');await page.waitForTimeout(100);ok('C8 apply form shows confirmation',(await page.textContent('#toast')).includes('申請しました'));
  await page.click('[data-back]');await page.waitForTimeout(150);ok('C9 back returns to project',page.url().endsWith('#project'));
  await page.click('a[aria-label="公開チャットを開く"]');await page.waitForTimeout(120);ok('C10 chat button on project opens chat',page.url().endsWith('#chat'));
  ok('C no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // D: community join/leave, like
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.evaluate(()=>{localStorage.setItem('tonari.onboarded','true');localStorage.setItem('tonari.coachSeen','true')});await page.reload();await page.waitForTimeout(250);await go(page,'#home');
  await page.click('.tabbar a[href="#hiroba"]');await page.waitForTimeout(120);ok('D1 tab bar → ひろば feed',(await text(page)).includes('すべての投稿'));
  await page.click('[data-like]');await page.waitForTimeout(100);ok('D2 like increments',(await text(page)).includes('いいね 1件'));
  await page.click('[data-like]');await page.waitForTimeout(100);ok('D3 unlike decrements',(await text(page)).includes('いいね 0件'));
  await page.click('[data-go="#hiroba-community"]');await page.waitForTimeout(120);ok('D4 コミュニティ tab',(await text(page)).includes('いま注目のコミュニティ'));
  await page.selectOption('select','関東');ok('D5 region select works',(await page.$eval('select',s=>s.value))==='関東');
  await page.click('a[href="#community"]');await page.waitForTimeout(120);
  await page.click('.body [data-join]');await page.waitForTimeout(120);ok('D6 join → 参加中 + 9人',(await text(page)).includes('参加中')&&(await text(page)).includes('9人'));
  await page.click('a[href="#topic"]');await page.waitForTimeout(120);ok('D7 topic after joining: no join prompt',!(await text(page)).includes('参加するとコメントできます')&&await page.$('.cta')===null);
  await page.reload();await page.waitForTimeout(250);ok('D8 membership survives reload',!(await text(page)).includes('参加するとコメントできます'));
  await go(page,'#community');await page.click('.body [data-join]');await page.waitForTimeout(120);ok('D9 leave → 参加する + 8人',(await text(page)).includes('参加する')&&(await text(page)).includes('8人'));
  await go(page,'#topic');await page.click('.cta [data-join]');await page.waitForTimeout(120);ok('D10 join from topic bottom button',(await page.evaluate(()=>localStorage.getItem('tonari.joined')))==='true');
  ok('D no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // E: messages
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.evaluate(()=>{localStorage.setItem('tonari.onboarded','true');localStorage.setItem('tonari.coachSeen','true')});await page.reload();await page.waitForTimeout(250);await go(page,'#hiroba');
  ok('E1 unread badge on DM icon',await page.$('a[href="#messages"] .badge')!==null);
  await page.click('a[href="#messages"]');await page.waitForTimeout(120);await page.click('a[href="#chat"]');await page.waitForTimeout(120);
  await page.click('.sendbtn');await page.waitForTimeout(80);ok('E2 empty message is not sent',(await page.$$('.bubble')).length===0);
  await page.fill('#msg','はじめまして、よろしくお願いします');await page.press('#msg','Enter');await page.waitForTimeout(120);
  ok('E3 message appears',(await page.$$eval('.bubble',b=>b.map(x=>x.textContent))).includes('はじめまして、よろしくお願いします'));
  await page.fill('#msg','<b>x</b>');await page.click('.sendbtn');await page.waitForTimeout(120);ok('E4 HTML in message is shown as text, not run',(await page.$$('.bubble b')).length===0);
  await page.reload();await page.waitForTimeout(250);ok('E5 messages survive reload',(await page.$$('.bubble')).length===2);
  await page.click('[data-back]');await page.waitForTimeout(150);ok('E6 list shows last message, unread dot gone',(await text(page)).includes('<b>x</b>')&&await page.$('.dmrow .dot')===null);
  ok('E no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // F: settings & profile
 {const {ctx,page}=await newPage(browser);await page.goto(BASE);await page.evaluate(()=>{localStorage.setItem('tonari.onboarded','true');localStorage.setItem('tonari.coachSeen','true')});await page.reload();await page.waitForTimeout(250);await go(page,'#mypage');
  for(const [h,check] of [['#profile-edit','基本情報'],['#school','申請情報'],['#notifications','通知の種類'],['#payout','振込先口座'],['#terms','契約の成立']]){await go(page,'#mypage');await page.click(`.listrow[href="${h}"]`);await page.waitForTimeout(120);ok(`F menu ${h} opens`,(await text(page)).includes(check));await page.click('[data-back]');await page.waitForTimeout(150);ok(`F back from ${h} → マイページ`,page.url().endsWith('#mypage'));}
  await go(page,'#notifications');await page.click('[data-toggle="news"]');await page.click('[data-toggle="chat"]');await page.click('[data-save-notif]');await page.waitForTimeout(100);
  await page.reload();await page.waitForTimeout(250);const st=await page.$$eval('[data-toggle]',a=>a.map(x=>x.getAttribute('aria-checked')));ok('F toggles saved after reload',JSON.stringify(st)==='["false","true","true"]',JSON.stringify(st));
  await go(page,'#payout');await page.fill('#po-bank','0001');await page.selectOption('#po-type','当座');await page.click('form[data-save] button[type=submit]');await page.waitForTimeout(100);ok('F payout form confirms',(await page.textContent('#toast')).includes('保存しました'));
  await go(page,'#profile-edit');await page.setInputFiles('input[type=file]',{name:'a.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])});ok('F image picker accepts a file',true);
  ok('F no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // G: deep links, unknown links, back on first page, keyboard focus
 {const {ctx,page}=await newPage(browser);await page.goto(BASE+'#project');await page.waitForTimeout(300);ok('G1 direct link to a screen works (shared URL)',(await text(page)).includes('必要スキル'));
  await page.click('[data-back]');await page.waitForTimeout(200);ok('G2 back on a directly opened screen goes up one level (案件詳細 → さがす)',page.url().endsWith('#search'));
  await page.goto(BASE+'#does-not-exist');await page.waitForTimeout(250);ok('G3 unknown link falls back to home',(await text(page)).includes('今週の新着案件'));
  await page.keyboard.press('Tab');const f=await page.evaluate(()=>document.activeElement&&document.activeElement.tagName);ok('G4 keyboard can reach controls',['A','BUTTON','INPUT'].includes(f),f);
  ok('G no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 // H: storage blocked (private mode) still usable
 {const {ctx,page}=await newPage(browser);await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})});await page.goto(BASE);await page.waitForTimeout(300);
  ok('H1 app opens with storage blocked',(await text(page)).length>20);await go(page,'#chat');await page.fill('#msg','test');await page.click('.sendbtn');await page.waitForTimeout(100);ok('H2 can still send a message',(await page.$$('.bubble')).length===1);
  ok('H no errors',page.errs.length===0,page.errs.join(' | '));await ctx.close();}
 await browser.close();
 console.log(results.join('\n'));console.log(`\n${results.length-fails} passed, ${fails} failed`);
})();
