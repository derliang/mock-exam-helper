import { launchChrome, Browser } from './cdp.mjs';
const PORT = 5517, SCR = process.argv[2];
export const SEED = `(async()=>{
  const [{emptyDoc,withDefaults},{newExam,updateExam},{reseat,seatingBlockers},{saveDoc},{createHandleFS}] = await Promise.all([
    import('/src/ui/repository.ts'),import('/src/ui/store.ts'),import('/src/ui/seating.ts'),import('/src/data/folder.ts'),import('/src/data/dirfs.ts')]);
  const pad=n=>String(n).padStart(2,'0');
  let doc=withDefaults(emptyDoc());
  doc.settings.schoolName='範例高中';doc.settings.headerText='115 學年度 模擬考';
  const senior=[],junior=[];
  for(let c=1;c<=6;c++)for(let s=1;s<=35;s++)senior.push({classNo:c,seatNo:s,name:'甲生'+pad(c)+pad(s)});
  for(let c=1;c<=4;c++)for(let s=1;s<=30;s++)junior.push({classNo:c,seatNo:s,name:'乙生'+pad(c)+pad(s)});
  doc.rosters={senior,junior};
  const rooms=[];
  for(let i=1;i<=3;i++)rooms.push({id:'S'+i,name:'A10'+i,kind:'class',rows:6,depth:7,seatCount:42,track:'science'});
  for(let i=1;i<=3;i++)rooms.push({id:'L'+i,name:'B10'+i,kind:'class',rows:6,depth:7,seatCount:42,track:'liberal'});
  for(let i=1;i<=3;i++)rooms.push({id:'J'+i,name:'C10'+i,kind:'class',rows:6,depth:7,seatCount:42});
  rooms.push({id:'P1',name:'預備一',kind:'reserve',rows:5,depth:6,seatCount:30});
  doc.settings.classrooms=rooms;
  const mk=(kind,name,t)=>{const r=newExam(doc,kind,name,new Date(t));if(!r.ok)throw new Error(r.error);doc=r.doc;return doc.exams[doc.exams.length-1]};
  const e2=mk('gsat','學測第二次','2026-10-12T01:00:00Z');
  const e3=mk('bcct','會考第一次','2026-10-28T06:00:00Z');
  const e1=mk('gsat','學測第三次','2026-11-05T08:00:00Z');
  const fix=(id,p)=>{const r=updateExam(doc,id,p);if(!r.ok)throw new Error(r.error);doc=r.doc};
  fix(e2.id,{round:2});fix(e1.id,{round:3});
  const E=id=>doc.exams.find(x=>x.id===id);
  const subjOf=(exam,c,s,mode)=>exam.subjects.filter(x=>{
    const n=x.name;
    if(/自然|數學A/.test(n)) return mode==='half'?((c+s)%2===0):c<=3;
    if(/社會|數學B/.test(n)) return mode==='half'?((c+s)%2===1):c>=4;
    return true}).map(x=>x.id);
  const entriesOf=(exam,list,mode)=>list.map(st=>({classNo:st.classNo,seatNo:st.seatNo,name:st.name,subjectIds:subjOf(exam,st.classNo,st.seatNo,mode)}));
  doc.examFiles={};
  doc.examFiles[e1.id]={entries:entriesOf(E(e1.id),senior,'track')};
  doc.examFiles[e2.id]={entries:entriesOf(E(e2.id),senior,'half')};
  doc.examFiles[e3.id]={entries:junior.map(st=>({classNo:st.classNo,seatNo:st.seatNo,name:st.name,subjectIds:E(e3.id).subjects.map(x=>x.id)}))};
  fix(e1.id,{classroomIds:['S1','S2','S3','L1','L2','L3','P1']});
  fix(e2.id,{classroomIds:['S1','L1']});
  fix(e3.id,{classroomIds:['J1','J2','J3']});
  const info={};
  let r=reseat(doc,E(e1.id),'2026-11-08T07:30:00Z');
  info.seat1=r.ok?'ok':r.error;
  if(r.ok)doc=r.doc;
  info.blk2=seatingBlockers(doc,E(e2.id)).map(b=>b.text);
  info.blk3=seatingBlockers(doc,E(e3.id)).map(b=>b.text);
  const top=await navigator.storage.getDirectory();
  const root=await top.getDirectoryHandle('模擬考資料',{create:true});
  for await(const [k] of root.entries())await root.removeEntry(k,{recursive:true});
  await saveDoc(createHandleFS(root),doc);
  info.exams=doc.exams.map(e=>e.id+':'+e.name);
  return JSON.stringify(info);
})()`;
if (process.argv[1].endsWith('seed.mjs')) {
  const { proc, ws } = await launchChrome(9333, SCR + '/prof');
  const b = new Browser(ws); await b.open();
  const p = await b.newPage(); await p.setup(1280, 900, false);
  await p.goto(`http://localhost:${PORT}/`);
  console.log(await p.ev(SEED));
  b.close(); proc.kill();
}
