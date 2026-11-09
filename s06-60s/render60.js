#!/usr/bin/env node
'use strict';
// S06 frame renderer. The scene and drawFrame(t) remain unchanged.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const { browserCandidates } = require('../scripts/doctor.cjs');
const SCENE = __dirname;
const ROOT = path.resolve(SCENE, '..');

function parseArgs(args) {
  const o = {scene:'s06-60s', start:0, end:1799, outDir:path.join(ROOT,'renders','s06-60s'), noSandbox:false};
  for (let i=0; i<args.length; i++) {
    const key=args[i];
    if (key === '--no-sandbox') { o.noSandbox=true; continue; }
    if (!['--scene','--start','--end','--out-dir'].includes(key) || i+1 >= args.length || args[i+1].startsWith('--')) throw Error(`Unknown or incomplete option: ${key}`);
    const value=args[++i];
    if (key === '--scene') o.scene=value;
    if (key === '--out-dir') { if (!value.trim()) throw Error('Output directory cannot be empty'); o.outDir=path.resolve(value); }
    if (key === '--start' || key === '--end') { if (!/^\d+$/.test(value)) throw Error(`Invalid frame: ${value}`); o[key.slice(2)]=Number(value); }
  }
  if (o.scene !== 's06-60s') throw Error(`Unknown scene: ${o.scene}; supported: s06-60s`);
  if (!Number.isSafeInteger(o.start) || !Number.isSafeInteger(o.end) || o.start<0 || o.end>1800 || o.start>o.end) throw Error('Invalid frame range: expected 0 <= start <= end <= 1800');
  return o;
}
function resolveBrowser({platform=process.platform, env=process.env, run}={}) {
  const probe=run || (name => { const r=spawnSync(name,['--version'],{encoding:'utf8',timeout:5000,windowsHide:true}); return !r.error && r.status===0 ? (r.stdout||r.stderr).trim().split(/\r?\n/)[0] : null; });
  const list=env.MOTIONFORGE_BROWSER ? [env.MOTIONFORGE_BROWSER] : browserCandidates(platform,env);
  for (const name of list) {
    const version=probe(name);
    if (version && /^(?:Chromium|Google Chrome|Microsoft Edge)\s+\d+(?:\.\d+)+(?:\s|$)/i.test(version.trim())) {
      if (run || path.isAbsolute(name) || (platform==='win32' && path.win32.isAbsolute(name))) return name;
      const ext=platform==='win32' ? (path.extname(name) ? [''] : (env.PATHEXT||'.EXE;.CMD;.BAT').split(';')) : [''];
      for (const dir of (env.PATH||'').split(path.delimiter)) for (const suffix of ext) {
        const full=path.resolve(dir||'.',name+suffix);
        try { fs.accessSync(full, fs.constants.X_OK); return full; } catch {}
      }
    }
  }
  throw Error('Browser missing or invalid. Install Chromium/Chrome/Edge or set MOTIONFORGE_BROWSER to its executable path.');
}
async function startServer(dir=SCENE) {
  const server=http.createServer(async (req,res)=>{
    try {
      const url=new URL(req.url,'http://127.0.0.1');
      const name=decodeURIComponent(url.pathname.slice(1));
      if (req.method!=='GET' || !/^[\w.-]+\.(html|js)$/.test(name)) {res.writeHead(404).end();return;}
      const file=path.join(dir,name); const data=await fsp.readFile(file);
      res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':'application/javascript; charset=utf-8','Cache-Control':'no-store'}); res.end(data);
    } catch {res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{ server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  return server;
}
const frameName = i => `frame-${String(i).padStart(4,'0')}.png`;
async function render(o, deps={}) {
  const target=path.resolve(o.outDir);
  // The old master frames folder is never used as the new output location.
  const legacy=path.resolve(SCENE,'frames');
  if (target===legacy || target.startsWith(legacy+path.sep)) throw Error('Output cannot be inside the legacy S06 master frames directory.');
  await fsp.mkdir(target,{recursive:true});
  for (let i=o.start;i<=o.end;i++) {
    try { await fsp.lstat(path.join(target,frameName(i))); throw Error(`Output exists: ${frameName(i)}; choose a new output directory.`); }
    catch(e) { if (e.code!=='ENOENT') throw e; }
  }
  const browserPath=deps.browserPath || resolveBrowser();
  let server, browser, interrupted=false;
  const cleanup=async()=>{ if (browser) {const b=browser; browser=null; await b.close().catch(()=>{});} if (server) {const s=server; server=null; await new Promise(r=>s.close(r));} };
  const onSignal=()=>{ interrupted=true; process.exitCode=130; if (browser) void browser.close().catch(()=>{}); };
  process.once('SIGINT',onSignal); process.once('SIGTERM',onSignal);
  try {
    server=await (deps.startServer||startServer)(SCENE);
    const launch=deps.launch||require('puppeteer-core').launch;
    try { browser=await launch({executablePath:browserPath,headless:true,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false,args:o.noSandbox?['--no-sandbox']:[]}); }
    catch(e){throw Error(`Browser launch failed: ${e.message}. Check MOTIONFORGE_BROWSER and OS sandbox support; use --no-sandbox only in an isolated trusted environment.`);}
    if (interrupted) throw Error('Interrupted');
    const page=await browser.newPage();
    await page.setViewport({width:720,height:1280,deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror', e=>errors.push(`Page error: ${e.message}`));
    page.on('console', m=>{if(m.type()==='error') errors.push(`Console error: ${m.text()}`);});
    page.on('requestfailed', r=>errors.push(`Request failed: ${r.url()} ${r.failure()?.errorText||''}`));
    page.on('response', r=>{if(r.status()>=400) errors.push(`HTTP ${r.status()}: ${r.url()}`);});
    const response=await page.goto(`http://127.0.0.1:${server.address().port}/index.html`,{waitUntil:'load',timeout:30000});
    if (!response || !response.ok()) throw Error('Scene page failed to load');
    await page.waitForFunction('window.__done === true',{timeout:30000});
    const check=async()=>{const err=await page.evaluate(()=>window.__drawErr||null); if(err) errors.push(`Draw error: ${err}`); if(errors.length) throw Error(errors.join('\n'));};
    await check();
    for (let i=o.start;i<=o.end;i++) {
      await page.evaluate(t=>{window.__done=false;window.__drawErr=null;try{drawFrame(t);}catch(e){window.__drawErr=e.message;window.__done=true;}},i/30);
      await page.waitForFunction('window.__done === true',{timeout:60000});
      await check();
      const png=await page.screenshot({type:'png'});
      await check();
      await fsp.writeFile(path.join(target,frameName(i)),png,{flag:'wx'});
      console.log(`Rendered ${frameName(i)}`);
    }
    console.log(`Rendered ${o.end-o.start+1} frame(s) to ${target}; no page or resource errors.`);
  } finally { process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal); await cleanup(); }
}
module.exports={parseArgs,resolveBrowser,startServer,render};
if(require.main===module) { let o; try {o=parseArgs(process.argv.slice(2));} catch(e){console.error(e.message);process.exitCode=1;} if(o) render(o).catch(e=>{console.error(e.message);if(process.exitCode!==130) process.exitCode=1;}); }
