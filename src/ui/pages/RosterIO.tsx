import { useRef, useState } from 'preact/hooks';
import type { Division, Track } from '../../data';
import { readXlsx, writeXlsx } from '../../import';
import { Alert, Button, Modal } from '../components';
import { downloadBytes, XLSX_MIME } from '../download';
import { applyImport, exportRows, planImport, templateRows, type ImportPlan } from '../rosterIO';
import { setClassTrack, type Doc } from '../store';
import { parseRosterWorkbook } from '../step2';

const DIV_NAME: Record<Division, string> = { senior: '高中部', junior: '國中部' };

/** 設定頁學生名單的 Excel 範本下載／匯入／匯出（DESIGN 10.3，UI-09/10） */
export function RosterIO(p: { doc: Doc; division: Division; onChange: (d: Doc) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<(ImportPlan & { layout: string; issues: string[]; tracks?: Record<number, Track> }) | null>(null);
  const [useTracks, setUseTracks] = useState(true);
  const [err, setErr] = useState('');
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
      setPlan({ ...planImport(p.doc, p.division, r.students), layout: r.layout, issues: r.issues.map((i) => i.message), tracks: r.classTracks });
    } catch (e) {
      setErr(`讀不了這個檔案：${e instanceof Error ? e.message : String(e)}。請確認是 .xlsx 檔`);
    }
  };

  const confirm = () => {
    if (!plan) return;
    let d = applyImport(p.doc, p.division, plan);
    if (useTracks && plan.tracks && p.division === 'senior') {
      for (const [no, t] of Object.entries(plan.tracks)) d = setClassTrack(d, 'senior', Number(no), t);
    }
    p.onChange(d);
    setPlan(null);
  };

  return (
    <>
      <Button onClick={async () => downloadBytes('學生名單範本.xlsx', await writeXlsx(templateRows(), '學生名單'), XLSX_MIME)}>下載 Excel 範本</Button>
      <Button onClick={() => input.current?.click()}>匯入 Excel</Button>
      <Button onClick={async () => downloadBytes(`${DIV_NAME[p.division]}學生名單.xlsx`, await writeXlsx(exportRows(p.doc.rosters[p.division]), '學生名單'), XLSX_MIME)}>匯出 Excel</Button>
      <input ref={input} type="file" accept=".xlsx" hidden aria-label="選擇學生名單 Excel 檔"
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void onFile(f); }} />
      {err && <div style="flex-basis:100%"><Alert tone="danger">{err}</Alert></div>}
      {plan && (
        <Modal title={`匯入${DIV_NAME[p.division]}學生名單`} onClose={() => setPlan(null)}
          actions={<><Button onClick={() => setPlan(null)}>取消</Button><Button kind="primary" onClick={confirm}>取代目前名單</Button></>}>
          <p>讀到 <strong>{plan.after}</strong> 人（目前 {plan.before} 人）。確定後會<strong>取代</strong>{DIV_NAME[p.division]}整份名單；之後可用「↶ 復原」回到匯入前。</p>
          <p class="muted small">版式：{plan.layout === 'blocks' ? '各班並排（區塊標題）' : plan.layout === 'wide' ? '各班並排（表頭欄位）' : '一人一列'}</p>
          {plan.unknownClasses.length > 0 && (
            <Alert tone="warn">名單裡有班級 {plan.unknownClasses.map((n) => String(n).padStart(2, '0')).join('、')}，目前「班級資料」裡沒有，請先新增班級，否則這些人無法排座。</Alert>
          )}
          {plan.issues.length > 0 && <Alert tone="warn">有 {plan.issues.length} 列已略過：{plan.issues.slice(0, 3).join('；')}{plan.issues.length > 3 ? '…' : ''}</Alert>}
          {plan.tracks && p.division === 'senior' && (
            <label class="small" style="display:block;margin-top:8px">
              <input type="checkbox" checked={useTracks} onChange={(e) => setUseTracks(e.currentTarget.checked)} /> 依名單的類組欄設定文理組（
              {Object.entries(plan.tracks).map(([n, t]) => `${String(n).padStart(2, '0')}班${t === 'science' ? '理' : '文'}`).join('、')}
              ，其餘班級不變）
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
