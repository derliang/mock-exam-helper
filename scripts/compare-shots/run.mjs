import { launchChrome, Browser } from './cdp.mjs';
import { SEED } from './seed.mjs';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';

const PORT = 5517, SCR = process.argv[2], OUT = process.argv[3];
const ONLY = (process.argv[4] || '').split(',').filter(Boolean);
const WIDTHS = (process.argv[5] || '375,820,1280').split(',').map(Number);
const MODES = (process.argv[6] || 'light,dark').split(',');
mkdirSync(OUT, { recursive: true });
const TAGLIST = process.env.TAGS ? (await import('node:fs')).readFileSync(process.env.TAGS, 'utf8').split(',') : null;
const APP = `http://localhost:${PORT}/`;
const PROTO = `http://localhost:${PORT}/docs/design/mockups/%E5%8E%9F%E5%9E%8B.html`;
const STEP = ['考試設定', '考試名單', '教室設定', '標示與抽離規則', '排座與預覽', '下載'];

const { proc, ws } = await launchChrome(9333, SCR + '/prof');
const b = new Browser(ws); await b.open();
const pa = await b.newPage(), pp = await b.newPage(), pc = await b.newPage();
await pa.cmd('Page.addScriptToEvaluateOnNewDocument', { source: "window.showDirectoryPicker=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('模擬考資料',{create:true})" });
await pa.setup(1280, 900, false);
await pa.goto(APP);
console.log('seed', await pa.ev(SEED));

// ---- 實作端導覽 ----
const appList = async (p) => { await p.goto(APP); await p.sleep(600); if (await p.ev(`[...document.querySelectorAll('button')].some(x=>x.textContent.trim()==='選擇資料夾')`)) await p.clickText('選擇資料夾'); await p.sleep(900); };
const appOpen = async (p, name) => {
  await appList(p);
  const ok = await p.ev(`(()=>{const h=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim().includes(${JSON.stringify(name)}));
    for(const e of h){let c=e;for(let i=0;i<8&&c;i++){const bt=[...c.querySelectorAll('button')].find(x=>x.textContent.trim()==='開啟');if(bt){bt.click();return true}c=c.parentElement}}return false})()`);
  if (!ok) throw new Error('開不了 ' + name);
  await p.sleep(800);
};
const appStep = async (p, name, n) => { await appOpen(p, name); if (n > 1) await p.clickText(STEP[n - 1]); await p.sleep(500); };
// ---- 原型端導覽 ----
const protoInit = async (p) => { await p.goto(PROTO); await p.sleep(500); };
const protoGo = async (p, k, id) => {
  await protoInit(p);
  await p.ev(`document.querySelector('#pnav [data-go=list]').click()`); await p.sleep(300);
  if (id) { await p.ev(`document.querySelector('[data-act=open][data-id="${id}"]').click()`); await p.sleep(300); }
  if (k) { await p.ev(`document.querySelector('#pnav [data-go=${k}]').click()`); await p.sleep(400); }
};
const protoSettings = async (p, tab) => { await protoGo(p, 'settings'); if (tab) await p.clickText(tab); await p.sleep(300); };
const appSettings = async (p, tab) => { await appList(p); await p.clickText('設定'); await p.sleep(400); if (tab) await p.clickText(tab, '.utabs button'); await p.sleep(300); };

const S = [
  { id: '01初始化', app: async (p) => { await appList(p); await p.clickText('資料夾設定', '.nav button'); await p.sleep(400); }, proto: protoInit },
  { id: '02模擬考列表', app: appList, proto: (p) => protoGo(p) },
  { id: '03新增模擬考', app: async (p) => { await appList(p); await p.clickText('新增模擬考'); await p.sleep(400); }, proto: (p) => protoGo(p, 'new') },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `04步驟${'①②③④⑤⑥'[n - 1]}`, app: (p) => appStep(p, '學測第三次', n), proto: (p) => protoGo(p, 'ws' + n, 3) })),
  { id: '04b步驟②待處理', app: (p) => appStep(p, '學測第二次', 2), proto: (p) => protoGo(p, 'ws2', 2) },
  { id: '04b步驟④待處理', app: (p) => appStep(p, '學測第二次', 4), proto: (p) => protoGo(p, 'ws4', 2) },
  { id: '04b步驟⑤擋下', app: (p) => appStep(p, '學測第二次', 5), proto: (p) => protoGo(p, 'ws5', 2) },
  { id: '04c會考步驟③', app: (p) => appStep(p, '會考第一次', 3), proto: (p) => protoGo(p, 'ws3', 1) },
  { id: '05設定-學生名單', app: (p) => appSettings(p, '學生名單'), proto: (p) => protoSettings(p, '學生名單') },
  { id: '05設定-班級資料', app: (p) => appSettings(p, '班級資料'), proto: (p) => protoSettings(p, '班級資料') },
  { id: '05設定-學校與表頭', app: (p) => appSettings(p, '學校與表頭'), proto: (p) => protoSettings(p, '學校與表頭') },
  { id: '05設定-教室清單', app: (p) => appSettings(p, '教室清單'), proto: (p) => protoSettings(p, '教室清單') },
  { id: '05設定-節次與時長', app: (p) => appSettings(p, '節次與時長'), proto: (p) => protoSettings(p, '節次與時長') },
  { id: '05設定-選用功能', app: (p) => appSettings(p, '選用功能') },
  { id: '06版權', app: async (p) => { await appList(p); await p.clickText('© 版權所有'); await p.sleep(400); } },
  { id: '07隱私', app: async (p) => { await appList(p); await p.clickText('隱私權'); await p.sleep(400); } },
];

const AUDIT = `(()=>{const ok=new Set(['26px','18px','14px','13px']);const bad={},all={};
 document.querySelectorAll('body *').forEach(e=>{if(e.closest('svg,code,.seatchart,.sc,[class*=seat],[class*=lprev],[class*=stat-big],.toast'))return;
  if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;
  const fs=getComputedStyle(e).fontSize;all[fs]=(all[fs]||0)+1;
  if(!ok.has(fs)){(bad[fs]=bad[fs]||[]);if(bad[fs].length<4)bad[fs].push((e.tagName+'.'+(e.className&&e.className.baseVal===undefined?e.className:'')).slice(0,40)+'「'+e.textContent.trim().slice(0,14)+'」')}});
 return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,sizes:all,bad,h:document.documentElement.scrollHeight}})()`;

const colW = { 375: 375, 820: 574, 1280: 768 };
async function compose(a, pr, w, dark, name) {
  const cw = colW[w];
  const col = (t, d) => d ? `<div><div class="l">${t}</div><img src="data:image/png;base64,${d}" style="width:${cw}px;display:block;border:1px solid #888"></div>` : '';
  await pc.setup(cw * (pr ? 2 : 1) + (pr ? 18 : 0) + 20, 600, dark);
  await pc.goto('about:blank');
  await pc.ev(`document.body.style.cssText='margin:0;padding:10px;background:${dark ? '#000' : '#ddd'};font:bold 14px sans-serif;color:${dark ? '#fff' : '#000'}';
    document.body.innerHTML=${JSON.stringify(`<style>.l{margin:0 0 4px}.r{display:flex;gap:18px;align-items:flex-start}</style><div class="r">${col('稿（原型.html）', pr)}${col('實作', a)}</div>`)}`);
  await pc.sleep(400);
  const jpg = await pc.shot('jpeg', 55);
  writeFileSync(`${OUT}/${name}.jpg`, Buffer.from(jpg, 'base64'));
}

const report = [];
for (const sc of S) {
  if (ONLY.length && !ONLY.some((o) => sc.id.startsWith(o))) continue;
  for (const w of WIDTHS) for (const m of MODES) {
    const dark = m === 'dark', tag = `${sc.id}-${w}${dark ? '深' : ''}`;
    if (TAGLIST && !TAGLIST.includes(tag)) continue;
    try {
      await pa.setup(w, 900, dark); await pa.goto(APP); await pa.ev(SEED); await sc.app(pa); await pa.sleep(300);
      const audit = await pa.ev(AUDIT);
      const a = await pa.shot('png');
      let pr = null;
      if (sc.proto) { await pp.setup(w, 900, dark); await sc.proto(pp); await pp.sleep(300); pr = await pp.shot('png'); }
      await compose(a, pr, w, dark, tag);
      const line = { tag, ...audit, hasProto: !!pr };
      report.push(line); appendFileSync(`${OUT}/_audit.jsonl`, JSON.stringify(line) + '\n');
      console.log(tag, 'overflow', audit.overflow, 'bad', JSON.stringify(audit.bad));
    } catch (e) { if (process.env.DBG) console.log(await pa.ev(`location.href+' '+[...document.querySelectorAll('button')].map(x=>x.textContent.trim().slice(0,10)).join('|')`)); console.log('FAIL', tag, e.message.split('\n')[0]); appendFileSync(`${OUT}/_fail.txt`, tag + ' ' + e.message.split('\n')[0] + '\n'); }
  }
}
b.close(); proc.kill();
