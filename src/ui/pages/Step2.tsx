import { useRef, useState } from 'preact/hooks';
import type { ExamConfig, ExamEntry, RosterDiff, RosterDiffChoice } from '../../data';
import { studentCode } from '../../data';
import { allResolved, applyDiffs, compareRosters, readXlsx, type Sheet } from '../../import';
import { Alert, Badge, Button, ConfirmButton, EmptyState, StatsBar } from '../components';
import { confirmCopy } from '../flow';
import { updateExam, type Doc } from '../store';
import { ImportWizard } from './ImportWizard';

const KIND_TEXT: Record<RosterDiff['kind'], string> = {
  'only-in-exam': '考試名單有、學生名單沒有',
  'only-in-roster': '學生名單有、考試名單沒有',
  mismatch: '同一人的班級、座號或姓名不一致',
};
const who = (x?: { classNo: number; seatNo: number; name: string }) => (x ? `${studentCode(x.classNo, x.seatNo)} ${x.name}` : '—');

/** ② 考試名單（D63）：匯入大考中心格式名單 → 與學生名單比對（D42/D54/D64） */
export function Step2(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onToRoster: () => void }) {
  const { exam, doc } = p;
  const roster = doc.rosters[exam.division];
  const files = doc.examFiles?.[exam.id];
  const entries: ExamEntry[] | null = files?.entries ?? null;
  const diffs: RosterDiff[] = files?.diffs ?? [];
  /** 考試名單與比對結果存在 doc.examFiles，隨整份快照復原 */
  const save = (patch: Partial<NonNullable<Doc['examFiles']>[string]>, extra: Partial<Doc> = {}) =>
    p.onChange({ ...doc, ...extra, examFiles: { ...doc.examFiles, [exam.id]: { ...files, ...patch } } });
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const fullyAbsent = entries ? entries.filter((e) => e.subjectIds.length === 0).length : 0;
  const classNames = doc.settings.classes.filter((c) => c.division === exam.division).map((c) => c.name);
  const compare = (list: ExamEntry[]) => compareRosters(roster, list, exam.participation);

  const onFile = async (file: File) => {
    setErr('');
    try {
      const s = await readXlsx(await file.arrayBuffer());
      if (s.length === 0) setErr('檔案裡沒有工作表');
      else setSheets(s);
    } catch (e) {
      setErr(`讀不了這個檔案：${e instanceof Error ? e.message : String(e)}。請確認是 .xlsx 檔`);
    }
  };

  const adopt = (list: ExamEntry[], markMap: Record<string, string>) => {
    const settings = { ...doc.settings, markMap };
    save({ entries: list, diffs: compare(list).diffs }, { settings });
    setSheets(null);
  };

  const setChoice = (code: string, choice: RosterDiffChoice, edited?: RosterDiff['edited']) =>
    save({ diffs: diffs.map((d) => (d.code === code ? { ...d, choice, edited } : d)) });

  /** 全部處理完才套用：學生名單與考試名單依選擇更新（一次 onChange，可復原） */
  const apply = () => {
    if (!entries) return;
    const r = applyDiffs(roster, entries, diffs);
    save({ entries: r.entries, diffs: [] }, { rosters: { ...doc.rosters, [exam.division]: r.students } });
  };

  const resolved = diffs.filter((d) => d.choice !== undefined && (d.choice !== 'manual' || d.edited)).length;
  const done = entries !== null && diffs.length === 0;
  const notJoin = entries && exam.participation === 'partial' ? compare(entries).notParticipating : 0;

  return (
    <section>
      <h2>② 考試名單</h2>
      <p class="muted small">這次誰參加、考什麼科。匯入大考中心格式的考生資料名單，再和設定頁的學生名單比對。</p>

      <div class="card" style="margin:12px 0;padding:12px">
        <strong>學生名單快照</strong>　{exam.division === 'senior' ? '高中部' : '國中部'}共 {roster.length} 人
        <Button small onClick={p.onToRoster}>到設定頁看學生名單</Button>
        {roster.length === 0 && <div style="margin-top:8px"><Alert tone="warn">學生名單是空的，比對時所有考生都會列為差異。請先到設定頁匯入學生名單。</Alert></div>}
      </div>

      <div class="btnrow">
        {entries
          ? <ConfirmButton kind="primary" undoable copy={confirmCopy.reimportList(entries.length)} onConfirm={() => input.current?.click()}>重新匯入考試名單</ConfirmButton>
          : <Button kind="primary" onClick={() => input.current?.click()}>匯入考試名單 Excel</Button>}
        {exam.participation === 'partial' && <Badge tone="info">部分參加：沒報名的人不算差異</Badge>}
        {done && <Badge tone="ok">已完成</Badge>}
        <input ref={input} type="file" accept=".xlsx" hidden aria-label="選擇考試名單 Excel 檔"
          onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void onFile(f); }} />
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}
      {!entries && !sheets && (
        <div style="margin-top:12px"><EmptyState title="還沒有匯入考試名單">按上方「匯入考試名單 Excel」，選大考中心提供的考生資料名單（.xlsx）。匯入後會自動和學生名單比對，有差異再逐筆處理。</EmptyState></div>
      )}

      {sheets && (
        <ImportWizard sheets={sheets} exam={exam} classNames={classNames} previous={entries ?? undefined} saved={doc.settings.markMap ?? {}}
          onCancel={() => setSheets(null)} onDone={adopt} />
      )}

      {entries && (
        <>
          <div style="margin-top:12px"><StatsBar items={[
            { label: '考生', value: entries.length },
            { label: '差異', value: diffs.length, bad: diffs.length > 0 },
            { label: '已處理', value: `${resolved}／${diffs.length}` },
            ...(exam.participation === 'partial' ? [{ label: '未參加', value: notJoin }] : []),
            ...(fullyAbsent > 0 ? [{ label: '全科缺考', value: fullyAbsent }] : []),
          ]} /></div>
          {fullyAbsent > 0 && (
            <div style="margin-top:12px"><Alert tone="info">
              有 {fullyAbsent} 人全科缺考：{exam.seatFullyAbsent ? '目前照樣排座。' : '預設不排座、不計領卷份數。'}
              <label style="margin-left:12px"><input type="checkbox" checked={!!exam.seatFullyAbsent}
                onChange={(e) => { const r = updateExam(doc, exam.id, { seatFullyAbsent: (e.target as HTMLInputElement).checked }); if (r.ok) p.onChange(r.doc); }} /> 仍排座</label>
            </Alert></div>
          )}
          {diffs.length === 0 ? (
            <div style="margin-top:12px"><Alert tone="ok">考試名單與學生名單一致，可以繼續下一步。</Alert></div>
          ) : (
            <>
              <h3 style="margin-top:20px">名單差異（逐筆處理，全部處理完才能繼續）</h3>
              <div style="overflow-x:auto"><table class="t">
                <thead><tr><th>類型</th><th>考試名單</th><th>學生名單</th><th>處理方式</th></tr></thead>
                <tbody>
                  {diffs.map((d) => (
                    <tr key={d.code}>
                      <td>{KIND_TEXT[d.kind]}</td><td>{who(d.exam)}</td><td>{who(d.roster)}</td>
                      <td>
                        <div class="btnrow">
                          <Button small kind={d.choice === 'use-exam' ? 'primary' : 'default'} onClick={() => setChoice(d.code, 'use-exam')}>以考試名單為準</Button>
                          <Button small kind={d.choice === 'use-roster' ? 'primary' : 'default'} onClick={() => setChoice(d.code, 'use-roster')}>以學生名單為準</Button>
                          <Button small kind={d.choice === 'manual' ? 'primary' : 'default'} onClick={() => setEditing(editing === d.code ? null : d.code)}>手動編輯</Button>
                        </div>
                        {editing === d.code && <Editor diff={d} onSave={(e) => { setChoice(d.code, 'manual', e); setEditing(null); }} />}
                        {d.choice === 'manual' && d.edited && editing !== d.code && <div class="hint">已改為 {who(d.edited)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <div class="btnrow" style="margin-top:12px">
                <Button kind="primary" disabled={!allResolved(diffs)} onClick={apply}>套用處理結果</Button>
                {!allResolved(diffs) && <span class="hint">還有 {diffs.length - resolved} 筆未處理</span>}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

/** 手動編輯：在該筆原地改班級、座號、姓名（D54） */
function Editor(p: { diff: RosterDiff; onSave: (e: NonNullable<RosterDiff['edited']>) => void }) {
  const base = p.diff.edited ?? p.diff.exam ?? p.diff.roster ?? { classNo: 1, seatNo: 1, name: '' };
  const [c, setC] = useState(String(base.classNo));
  const [s, setS] = useState(String(base.seatNo));
  const [n, setN] = useState(base.name);
  const ok = Number.isInteger(Number(c)) && Number(c) > 0 && Number.isInteger(Number(s)) && Number(s) > 0 && n.trim() !== '';
  return (
    <div class="btnrow" style="margin-top:8px">
      <input class="input" style="width:72px" aria-label="班級" inputMode="numeric" value={c} onInput={(e) => setC(e.currentTarget.value)} />
      <input class="input" style="width:72px" aria-label="座號" inputMode="numeric" value={s} onInput={(e) => setS(e.currentTarget.value)} />
      <input class="input" style="width:140px" aria-label="姓名" value={n} onInput={(e) => setN(e.currentTarget.value)} />
      <Button small kind="primary" disabled={!ok} onClick={() => p.onSave({ classNo: Number(c), seatNo: Number(s), name: n.trim() })}>完成編輯</Button>
    </div>
  );
}
