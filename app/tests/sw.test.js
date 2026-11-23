// Service-worker checks for /app/ with a real HTTP server (started and stopped inside this script).
// Usage: node sw.test.js [path-to-old-sw.js]   (old sw = the version before /app/ was excluded)
const http=require('http'),fs=require('fs'),path=require('path');const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'../..');const OLD_SW=process.argv[2]||path.join(__dirname,'fixtures/sw-v79.js');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff':'font/woff','.webmanifest':'application/manifest+json','.gif':'image/gif'};
let swSource='new', appJsOverride=null;
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://x');let p=path.join(ROOT,decodeURIComponent(u.pathname));
  if(u.pathname==='/sw.js'&&swSource==='old'){res.writeHead(200,{'Content-Type':MIME['.js'],'Cache-Control':'no-cache'});return res.end(fs.readFileSync(OLD_SW));}
  if(u.pathname==='/app/app.js'&&appJsOverride){res.writeHead(200,{'Content-Type':MIME['.js'],'Cache-Control':'no-cache'});return res.end(appJsOverride);}
  if(p.endsWith('/'))p+='index.html';if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(p).pipe(res);});
const results=[];let fails=0;const ok=(n,c,d='')=>{results.push(`${c?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);if(!c)fails++;};
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const B=`http://localhost:${server.address().port}`;
 const browser=await chromium.launch();
 const swState=page=>page.evaluate(async()=>{const regs=await navigator.serviceWorker.getRegistrations();const keys=await caches.keys();const out={regs:regs.length,keys,entries:{}};
   for(const k of keys){const c=await caches.open(k);out.entries[k]=(await c.keys()).map(r=>new URL(r.url).pathname);}
   const ix=await caches.match('./index.html')||await caches.match(new Request(location.origin+'/index.html'));out.cachedIndex=ix?(await ix.text()).slice(0,4000):null;return out;});
 // ---------- 1. new visitor: nothing registers a service worker ----------
 {const ctx=await browser.newContext();const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  for(const p of ['/','/company.html','/app/']){await page.goto(B+p);await page.waitForTimeout(800);}
  const s=await swState(page);ok('1a new visitor: no service worker is installed by any page',s.regs===0,JSON.stringify(s.keys));
  ok('1b new visitor: app works',(await page.textContent('#screen')).length>20);ok('1c no errors',errs.length===0,errs.join('|'));await ctx.close();}
 // ---------- 2. returning visitor who still has the OLD service worker ----------
 if(OLD_SW){const ctx=await browser.newContext();const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
  swSource='old';await page.goto(B+'/');await page.evaluate(()=>navigator.serviceWorker.register('/sw.js'));
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForTimeout(500);
  await page.goto(B+'/app/');await page.waitForTimeout(800);
  let s=await swState(page);const bugReproduced=s.cachedIndex&&s.cachedIndex.includes('id="app"');
  ok('2a (before fix) old worker overwrote the cached homepage with the app — problem reproduced',bugReproduced);
  // site deploys new sw.js; returning visitor opens any page → browser checks sw.js and updates
  swSource='new';await page.goto(B+'/app/');await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  // wait until the new worker has installed (downloads its files), taken over, and removed the old cache
  for(let i=0;i<60;i++){const done=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();const k=await caches.keys();return !!(r&&r.active&&r.active.state==='activated'&&!r.installing&&!r.waiting&&k.length===1&&k[0]==='tonari-pwa-v80');});if(done)break;await page.waitForTimeout(500);}
  await page.waitForTimeout(800);s=await swState(page);
  ok('2b returning visitor gets the new worker and the old cache is deleted',JSON.stringify(s.keys)==='["tonari-pwa-v80"]',JSON.stringify(s.keys));
  await page.goto(B+'/app/');await page.waitForTimeout(500);await page.goto(B+'/app/#home');await page.waitForTimeout(500);s=await swState(page);
  ok('2c opening the app no longer overwrites the cached homepage',s.cachedIndex&&!s.cachedIndex.includes('id="app"')&&s.cachedIndex.includes('隣の高専生'),s.cachedIndex?s.cachedIndex.slice(0,80):'none');
  ok('2d no app files are stored in the site cache',!Object.values(s.entries).flat().some(p=>p.includes('/app/')),JSON.stringify(Object.values(s.entries).flat().filter(p=>p.includes('/app/'))));
  // app update reaches the user immediately (no stale cached app.js)
  appJsOverride=fs.readFileSync(path.join(ROOT,'app/app.js'),'utf8')+"\nwindow.__APP_VERSION='updated';";await page.reload();await page.waitForTimeout(600);
  ok('2e an updated app.js is served right away (not an old cached copy)',await page.evaluate(()=>window.__APP_VERSION)==='updated');appJsOverride=null;
  // offline: homepage still opens from cache and is the real homepage
  await ctx.setOffline(true);await page.goto(B+'/').catch(()=>{});await page.waitForTimeout(500);
  const offlineHome=await page.content();ok('2f offline: homepage opens from cache and is the site, not the app',!offlineHome.includes('id="app"')&&offlineHome.includes('隣の高専生'));
  await ctx.setOffline(false);await page.goto(B+'/app/');await page.waitForTimeout(500);
  ok('2g back online: app works after all of the above',(await page.textContent('#screen')).length>20);ok('2h no errors',errs.length===0,errs.join('|'));await ctx.close();}
 await browser.close();server.close();console.log(results.join('\n'));console.log(`\n${results.length-fails} passed, ${fails} failed`);process.exit(fails?1:0);})();
