'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {parseArgs, startServer, render, resolveBrowser} = require('../s06-60s/render60.js');
test('rejects invalid scene and ranges', () => {
  for (const args of [['--scene','other'], ['--start','-1'], ['--start','2','--end','1'], ['--end','1801'], ['--start','1x'], ['--unknown','x']]) assert.throws(() => parseArgs(args));
});
test('accepts inclusive range and output directory containing spaces', () => {
  const o = parseArgs(['--scene','s06-60s','--start','3','--end','4','--out-dir','path with spaces']);
  assert.equal(o.start, 3); assert.equal(o.end, 4); assert.match(o.outDir, /path with spaces$/);
});
test('browser resolution rejects unavailable or invalid override', () => {
  assert.throws(() => resolveBrowser({platform:'win32', env:{MOTIONFORGE_BROWSER:'C:\\Not Found\\chrome.exe'}, run:()=>null}), /browser/i);
  assert.throws(() => resolveBrowser({platform:'linux', env:{MOTIONFORGE_BROWSER:'python'}, run:()=> 'Python 3.12'}), /browser/i);
});
test('local server returns 404 for missing page and asset and closes', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mf-server-'));
  const server=await startServer(dir);
  try {
    const get = name => new Promise((resolve,reject)=>http.get(`http://127.0.0.1:${server.address().port}/${name}`,r=>{r.resume();resolve(r.statusCode);}).on('error',reject));
    assert.equal(await get('index.html'),404); assert.equal(await get('missing.js'),404);
  } finally { await new Promise(r=>server.close(r)); fs.rmSync(dir,{recursive:true,force:true}); }
  assert.equal(server.listening,false);
});
test('existing output fails before browser launch and stays intact', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mf-output-')); const file=path.join(dir,'frame-0000.png'); fs.writeFileSync(file,'original');
  try { await assert.rejects(render({start:0,end:0,outDir:dir},{launch:()=>{throw Error('unexpected launch');}}),/exist/i); assert.equal(fs.readFileSync(file,'utf8'),'original'); } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('browser launch failure closes server and reports cause', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mf-fail-')); let server;
  try { await assert.rejects(render({start:0,end:0,outDir:dir},{browserPath:'mock', startServer:async d => (server=await startServer(d)), launch:async()=>{throw Error('intentional launch failure');}}), /launch failure/i); assert.equal(server.listening,false); } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('page failure closes browser and server without creating output', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mf-fail-')); let closed=false,server;
  const browser={newPage:async()=>{throw Error('page failure');},close:async()=>{closed=true;}};
  try { await assert.rejects(render({start:0,end:0,outDir:dir},{browserPath:'mock',startServer:async d => (server=await startServer(d)),launch:async()=>browser}),/page failure/); assert.equal(server.listening,false); assert.equal(closed,true); assert.equal(fs.existsSync(path.join(dir,'frame-0000.png')),false); } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('a missing asset causes render failure and closes browser and server', async () => {
  const {EventEmitter}=require('node:events'); const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mf-asset-')); let server, closed=false;
  const page=new EventEmitter(); page.setViewport=async()=>{}; page.goto=async()=>{page.emit('response',{status:()=>404,url:()=> 'http://127.0.0.1/missing.js'}); return {ok:()=>true};}; page.waitForFunction=async()=>{}; page.evaluate=async()=>null;
  const browser={newPage:async()=>page,close:async()=>{closed=true;}};
  try {await assert.rejects(render({start:0,end:0,outDir:dir},{browserPath:'mock',startServer:async d=>(server=await startServer(d)),launch:async()=>browser}),/HTTP 404/);assert.equal(closed,true);assert.equal(server.listening,false);assert.equal(fs.existsSync(path.join(dir,'frame-0000.png')),false);} finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('Windows explicit browser paths with spaces are passed as a single executable', () => {
  const value='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  assert.equal(resolveBrowser({platform:'win32',env:{MOTIONFORGE_BROWSER:value},run:name=>name===value?'Google Chrome 130.0.0.0':null}),value);
});
