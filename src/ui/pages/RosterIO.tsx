import { useRef, useState } from 'preact/hooks';
import type { Division, Track } from '../../data';
import { readXlsx, writeXlsx } from '../../import';
import { Alert, Button, Modal } from '../components';
import { downloadBytes, XLSX_MIME } from '../download';
import { applyImport, exportRows, planImport, templateRows, type ImportPlan, type UnknownClassAction } from '../rosterIO';
import { setClassTrack, type Doc } from '../store';
import { parseRosterWorkbook } from '../step2';

const DIV_NAME: Record<Division, string> = { senior: '高中部', junior: '國中部' };

/** 設定頁學生名單的 Excel 範本下載／匯入／下載（DESIGN 10.3，UI-09/10） */
export function RosterIO(p: { doc: Doc; division: Division; onChange: (d: Doc) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<(ImportPlan & { layout: string; issues: string[]; tracks?: Record<number, Track> }) | null>(null);
  const [useTracks, setUseTracks] = useState(true);
  const [unk, setUnk] = useState<UnknownClassAction>('add');
  const [err, setErr] = useState('');
  const [tpl, setTpl] = useState(false);
  const classNames = p.doc.settings.classes.filter((c) => c.division === p.division).map((c) => c.name);

  const onFile = async (file: File) => {
    setErr('');
    try {
      const sheets = await readXlsx(await file.arrayBuffer());
      const r = parseRosterWorkbook(sheets, classNames);
      if (r.students.length === 0) {
        setErr(r.issues[0]?.message ?? '檔案裡沒有讀到學生，請確認表頭有「座號」「姓名」');
        return;
      }
      setUnk('add');
      setPlan({ ...planImport(p.doc, p.division, r.students), layout: r.layout, issues: r.issues.map((i) => i.message), tracks: r.classTracks });
    } catch (e) {
      setErr(`讀不了這個檔案：${e instanceof Error ? e.message : String(e)}。請確認是 .xlsx 檔`);
    }
  };

  const confirm = () => {
    if (!plan) return;
    let d = applyImport(p.doc, p.division, plan, unk);
    if (useTracks && plan.tracks && p.division === 'senior') {
      for (const [no, t] of Object.entries(plan.tracks)) d = setClassTrack(d, 'senior', Number(no), t);
    }
    p.onChange(d);
    setPlan(null);
  };

  return (
    <>
      <Button onClick={() => setTpl(true)}>下載名單範本</Button>
      <Button onClick={() => input.current?.click()}>匯入學生名單</Button>
      <Button onClick={async () => downloadBytes(`${DIV_NAME[p.division]}學生名單.xlsx`, await writeXlsx(exportRows(p.doc.rosters[p.division]), '學生名單'), XLSX_MIME)}>下載學生名單</Button>
      <input ref={input} type="file" accept=".xlsx" hidden aria-label="選擇學生名單 Excel 檔"
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void onFile(f); }} />
      {tpl && (
        <Modal title="下載名單範本" onClose={() => setTpl(false)}
          actions={<><Button onClick={() => setTpl(false)}>取消</Button><Button kind="primary" onClick={async () => { downloadBytes('學生名單範本.xlsx', await writeXlsx(templateRows(), '學生名單'), XLSX_MIME); setTpl(false); }}>下載範本</Button></>}>
          <p class="small muted">先下載範本、照格式整理學生資料，再按「匯入學生名單」放進來。檔名：學生名單範本.xlsx。</p>
          <div class="scroll"><table class="t compact nw">
            <thead><tr><th>班級</th><th>座號</th><th>姓名</th><th>學號（選填）</th></tr></thead>
            <tbody><tr><td>溫</td><td>1</td><td>王小明</td><td>1150101</td></tr><tr><td>溫</td><td>2</td><td>李小華</td><td class="muted">（沒有就留空）</td></tr></tbody>
          </table></div>
          <ul class="small muted" style="margin:0;padding-left:18px">
            <li>班級、座號、姓名一定要填；學號沒有就留空，不影響排座。</li>
            <li>考生編號由班級＋座號自動產生，不用填。</li>
            <li>{p.division === 'junior' ? '國中部不分文理組，範本沒有組別欄。' : '高中部的組別來自每次的考試名單，範本不用填。'}</li>
          </ul>
        </Modal>
      )}
      {err && <div style="flex-basis:100%"><Alert tone="danger">{err}</Alert></div>}
      {plan && (
        <Modal title={`匯入${DIV_NAME[p.division]}學生名單`} onClose={() => setPlan(null)}
          actions={<><Button onClick={() => setPlan(null)}>取消</Button><Button kind="primary" onClick={confirm}>確認取代為 {plan.after} 人名單</Button></>}>
          <p>讀到 <strong>{plan.after}</strong> 人（目前 {plan.before} 人）。確定後會<strong>取代</strong>{DIV_NAME[p.division]}整份名單；之後可用「↶ 復原」回到匯入前。</p>
          <p class="muted small">偵測到的格式：{plan.layout === 'blocks' ? '各班並排（區塊標題）' : plan.layout === 'wide' ? '各班並排（表頭欄位）' : '一人一列'}</p>
          {plan.unknownClasses.length > 0 && (() => {
            const labels = plan.unknownClasses.map((n) => `${String(n).padStart(2, '0')} 班（${plan.unknownCounts[n] ?? 0} 人）`).join('、');
            const total = plan.unknownClasses.reduce((a, n) => a + (plan.unknownCounts[n] ?? 0), 0);
            return (
              <Alert tone="warn">
                <div>名單裡有「班級資料」沒有的班級：{labels}。請選一種處理方式：</div>
                <label class="small" style="display:block;margin-top:6px"><input type="radio" name="unk" checked={unk === 'add'} onChange={() => setUnk('add')} /> 新增這些班級（名稱先用「第NN班」，之後可到「班級資料」改名、改色），這 {total} 人照常匯入、可以排座</label>
                <label class="small" style="display:block"><input type="radio" name="unk" checked={unk === 'skip'} onChange={() => setUnk('skip')} /> 略過這些學生：這 {total} 人不會匯入名單，因此<strong>無法排座</strong>；之後要補，得先新增班級再重新匯入</label>
              </Alert>
            );
          })()}
          {plan.issues.length > 0 && <Alert tone="warn">有 {plan.issues.length} 列已略過：{plan.issues.slice(0, 3).join('；')}{plan.issues.length > 3 ? '…' : ''}</Alert>}
          {plan.tracks && p.division === 'senior' && (
            <label class="small" style="display:block;margin-top:8px">
              <input type="checkbox" checked={useTracks} onChange={(e) => setUseTracks(e.currentTarget.checked)} /> 同時更新共用班級資料的文理組，依名單的類組欄（
              {Object.entries(plan.tracks).map(([n, t]) => `${String(n).padStart(2, '0')}班${t === 'science' ? '理' : '文'}`).join('、')}
              ，其餘班級不變；所有模擬考都會套用）
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
