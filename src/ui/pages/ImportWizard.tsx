import { useMemo, useState } from 'preact/hooks';
import type { ExamConfig, ExamEntry, Track } from '../../data';
import { AST_DEFAULT_BY_TRACK, AST_GROUP_TABLE, astTrackOfSubjects } from '../subjects';
import {
  buildEntries, diffEntries, GROUP_TABLES, IGNORE, prefillMapping, rememberMapping, scanExamSheet,
  type ExamScan, type ReviewItem, type RowDecision, type SavedMarkMap, type ScanOptions, type Sheet,
} from '../../import';
import { Alert, Badge, Button, StatsBar } from '../components';
import { FIELD_LABEL, SUBJECT_ID_MAP } from '../step2';

const KIND_TEXT: Record<ReviewItem['kind'], string> = { 'bad-id': '班級／座號無法辨識', 'no-name': '缺少姓名', dup: '班級與座號重複', 'bad-group': '未知組別代碼' };

/** 本次考試的掃描設定：組別表換成考科表的 id；會考沒有組別欄，用固定科目 */
export function scanOptionsFor(exam: ExamConfig, classNames: readonly string[], trackOf?: (classNo: number) => Track | undefined): ScanOptions {
  const ids = new Set(exam.subjects.map((s) => s.id));
  const bcct = exam.kind === 'bcct';
  if (exam.kind === 'ast') {
    const ids = new Set(exam.subjects.map((s) => s.id));
    const defaultByClass = (n: number): string[] => { const t = trackOf?.(n); return t ? AST_DEFAULT_BY_TRACK[t].filter((x) => ids.has(x)) : []; };
    const groupTable = Object.fromEntries(Object.entries(AST_GROUP_TABLE).map(([k, v]) => [k, v.filter((x) => ids.has(x))]));
    return { subjects: exam.subjects, classNames, groupAsSubjects: true, groupTable, defaultByClass, trackOfSubjects: astTrackOfSubjects };
  }
  const table = GROUP_TABLES[(exam.round ?? 1) >= 3 ? 'second' : 'first'];
  const groupTable = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.map((x) => SUBJECT_ID_MAP[x] ?? x).filter((x) => ids.has(x))]));
  return { subjects: exam.subjects, classNames, ...(bcct ? { defaultSubjectIds: exam.subjects.map((s) => s.id) } : { groupTable }) };
}

/** 工作表挑選：考生列最多者；其次是待確認列最多者 */
const best = (scans: ExamScan[]): number => scans.reduce((b, s, i) => (s.rows.length + s.review.length > (scans[b]?.rows.length ?? 0) + (scans[b]?.review.length ?? 0) ? i : b), 0);

/**
 * 智慧匯入精靈（E 包）：欄位確認 → 標示分群對應 → 待確認清單 → 差異預覽 → 確認才寫入。
 * 每一步的「為什麼不能繼續」都寫在確認鈕旁邊。
 */
export function ImportWizard(p: {
  sheets: readonly Sheet[]; exam: ExamConfig; classNames: readonly string[]; trackOf?: (classNo: number) => Track | undefined; previous?: readonly ExamEntry[];
  saved: SavedMarkMap; onCancel: () => void; onDone: (entries: ExamEntry[], saved: SavedMarkMap) => void;
}) {
  const opts = useMemo(() => scanOptionsFor(p.exam, p.classNames, p.trackOf), [p.exam, p.classNames, p.trackOf]);
  const scans = useMemo(() => p.sheets.map((s) => scanExamSheet(s.rows, opts)), [p.sheets, opts]);
  const [sheetIx, setSheetIx] = useState(() => best(scans));
  const scan = scans[sheetIx] as ExamScan;
  const subjectIds = p.exam.subjects.map((s) => s.id);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [rowDec, setRowDec] = useState<Record<number, RowDecision>>({});
  const [remember, setRemember] = useState(true);
  const [showSkipped, setShowSkipped] = useState(false);

  // 已存的對應當預設；使用者本次的選擇優先
  const mapping = useMemo(() => ({ ...prefillMapping(scan.groups, p.saved, subjectIds), ...chosen }), [scan, p.saved, chosen]);
  const res = useMemo(() => buildEntries(scan, opts, { mapping, rows: rowDec }), [scan, opts, mapping, rowDec]);
  const diff = useMemo(() => diffEntries(p.previous, res.entries), [p.previous, res.entries]);
  const name = (id: string) => p.exam.subjects.find((s) => s.id === id)?.name ?? id;
  const switchSheet = (i: number) => { setSheetIx(i); setChosen({}); setRowDec({}); };

  const reasons = [
    ...scan.problems,
    ...(res.pendingGroups.length ? [`還有 ${res.pendingGroups.length} 組標示寫法沒有對應`] : []),
    ...(res.pendingReview.length ? [`還有 ${res.pendingReview.length} 列待確認沒處理`] : []),
    ...(res.entries.length === 0 && scan.problems.length === 0 ? ['目前沒有任何考生可以匯入'] : []),
  ];

  return (
    <div class="card" style="margin-top:12px;padding:12px">
      <h3>匯入考試名單：檢查資料</h3>
      <p class="muted small">程式先讀懂整份檔案，把看不懂或可能出錯的地方列在下面請你決定。全部處理完、看過預覽並按「確認匯入」之後才會寫入並取代本次的考試名單，之前取消不會改到任何資料。</p>

      {scans.length > 1 && (
        <div class="field" style="margin:8px 0"><label for="wz-sheet">工作表</label>
          <select id="wz-sheet" class="input" value={String(sheetIx)} onChange={(e) => switchSheet(Number(e.currentTarget.value))}>
            {p.sheets.map((s, i) => <option key={i} value={String(i)}>{s.name}（{(scans[i] as ExamScan).rows.length} 位考生）</option>)}
          </select></div>
      )}
      {scan.problems.map((m) => <div key={m} style="margin:8px 0"><Alert tone="danger">{m}</Alert></div>)}

      {scan.header && (
        <>
          <h4 style="margin-top:12px">① 欄位對應{scan.header.span === 2 && <> <Badge tone="info">表頭佔兩列，已合併判讀</Badge></>}</h4>
          <p class="muted small">表頭在第 {scan.header.row + 1} 列。確認程式有抓對欄位；沒認出的欄不會匯入。</p>
          <table class="t"><thead><tr><th>用途</th><th>檔案中的欄位</th></tr></thead><tbody>
            {Object.entries(scan.headers).map(([f, h]) => <tr key={f}><td>{FIELD_LABEL[f] ?? f}</td><td>{h}</td></tr>)}
            {Object.values(scan.subjectColumns).map((h) => <tr key={h}><td>科目欄（打勾表示要考）</td><td>{h}</td></tr>)}
          </tbody></table>
        </>
      )}

      {scan.groups.length > 0 && (
        <>
          <h4 style="margin-top:16px">② 科目標示的寫法（共 {scan.groups.length} 組）</h4>
          <p class="muted small">整份名單用到的標示寫法已依相似度分組、計次。請為每一組選擇它代表哪一科，或選「忽略」。程式的建議只是參考，不會自動套用；但你先前確認並記住的對應會先帶入，請核對。</p>
          <div style="overflow-x:auto"><table class="t"><thead><tr><th>原始標示</th><th>出現次數</th><th>對應科目</th></tr></thead><tbody>
            {scan.groups.map((g) => (
              <tr key={g.id}>
                <td>{g.members.map((m) => `「${m.raw}」×${m.count}`).join('　')}</td>
                <td>{g.total}</td>
                <td><div class="btnrow">
                  <select class="input" aria-label={`「${g.id}」代表哪一科`} value={mapping[g.id] ?? ''} onChange={(e) => { const v = e.currentTarget.value; setChosen((c) => { const n = { ...c }; if (v) n[g.id] = v; else delete n[g.id]; return n; }); }}>
                    <option value="">— 尚未選擇 —</option>
                    {p.exam.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value={IGNORE}>忽略（不是科目標示）</option>
                  </select>
                  {g.suggestion && mapping[g.id] !== g.suggestion && <Button small onClick={() => setChosen((c) => ({ ...c, [g.id]: g.suggestion as string }))}>套用建議：{name(g.suggestion)}</Button>}
                  {mapping[g.id] === undefined && <Badge tone="warn">待選擇</Badge>}
                </div></td>
              </tr>
            ))}
          </tbody></table></div>
          <label class="small" style="display:block;margin-top:8px"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} /> 記住科目對應供下次匯入使用</label>
        </>
      )}

      {scan.review.length > 0 && (
        <>
          <h4 style="margin-top:16px">③ 待確認資料（{res.pendingReview.length} 筆待處理／共 {scan.review.length} 筆）</h4>
          <p class="muted small">這些列程式無法確定，不會被默默略過。請修正後套用，或明確選擇略過。</p>
          {scan.review.map((it) => (
            <ReviewRow key={it.row} item={it} decision={rowDec[it.row]} groupCodes={Object.keys(opts.groupTable ?? {})}
              onDecide={(d) => setRowDec((r) => { const n = { ...r }; if (d) n[it.row] = d; else delete n[it.row]; return n; })} />
          ))}
        </>
      )}

      {(scan.skipped.length > 0 || scan.blankRows > 0) && (
        <div style="margin-top:12px">
          <Button small onClick={() => setShowSkipped(!showSkipped)}>{showSkipped ? '收合' : '檢查'}已略過的說明列（{scan.skipped.length} 列，另有 {scan.blankRows} 列空白）</Button>
          {showSkipped && <table class="t"><thead><tr><th>列</th><th>內容</th><th>原因</th></tr></thead><tbody>
            {scan.skipped.map((s) => <tr key={s.row}><td>{s.row}</td><td>{s.cells.filter(Boolean).join('｜')}</td><td>{s.reason}</td></tr>)}
          </tbody></table>}
        </div>
      )}

      <h4 style="margin-top:16px">④ 匯入預覽</h4>
      <StatsBar items={[
        { label: '將匯入考生', value: res.entries.length },
        { label: '新增', value: diff.added.length },
        { label: '變更', value: diff.changed.length },
        { label: '移除', value: diff.removed.length, bad: diff.removed.length > 0 },
        { label: '不變', value: diff.unchanged },
      ]} />
      {p.previous && p.previous.length > 0 && <p class="muted small" style="margin-top:8px">和目前的考試名單（{p.previous.length} 人）相比。確認匯入後可用「復原」回到匯入前。</p>}
      {diff.changed.length > 0 && <details style="margin-top:8px"><summary>查看 {diff.changed.length} 筆變更</summary>
        <table class="t"><thead><tr><th>班級-座號</th><th>姓名</th><th>變動</th><th>科目（前→後）</th></tr></thead><tbody>
          {diff.changed.slice(0, 50).map((c) => <tr key={c.code}><td>{c.code}</td><td>{c.after.name}</td><td>{c.fields.map((f) => ({ name: '姓名', subjects: '科目', group: '組別' })[f]).join('、')}</td>
            <td>{c.fields.includes('subjects') ? `${c.before.subjectIds.map(name).join('、') || '無'} → ${c.after.subjectIds.map(name).join('、') || '無'}` : '—'}</td></tr>)}
        </tbody></table></details>}
      {diff.removed.length > 0 && <div style="margin-top:8px"><Alert tone="warn">本次名單將移除 {diff.removed.length} 人。請先確認是否漏列考生。</Alert></div>}
      {res.skippedByUser > 0 && <p class="muted small">已略過 {res.skippedByUser} 筆，不會匯入。</p>}

      <div class="btnrow" style="margin-top:12px">
        <Button onClick={p.onCancel}>取消匯入</Button>
        <Button kind="primary" disabled={!res.ready} onClick={() => p.onDone(res.entries, remember ? rememberMapping(scan.groups, mapping, p.saved) : p.saved)}>確認匯入 {res.entries.length} 人（取代本次名單）</Button>
        {reasons.length > 0 && <span class="hint">尚有待處理項目：{reasons.join('；')}</span>}
      </div>
    </div>
  );
}

function ReviewRow(p: { item: ReviewItem; decision?: RowDecision; groupCodes: string[]; onDecide: (d: RowDecision | null) => void }) {
  const { item } = p;
  const [c, setC] = useState(item.draft.classNo === undefined ? '' : String(item.draft.classNo));
  const [s, setS] = useState(item.draft.seatNo === undefined ? '' : String(item.draft.seatNo));
  const [n, setN] = useState(item.draft.name);
  const [g, setG] = useState(item.draft.groupCode ?? '');
  const ok = Number(c) > 0 && Number.isInteger(Number(c)) && Number(s) > 0 && Number.isInteger(Number(s)) && n.trim() !== '' && (item.kind !== 'bad-group' || p.groupCodes.includes(g.charAt(0).toUpperCase()));
  const done = p.decision;
  return (
    <div class="card" style="padding:8px;margin:6px 0">
      <div><Badge tone={done ? 'ok' : 'warn'}>{done ? (done.action === 'skip' ? '已略過' : '已修正') : '待處理'}</Badge> 第 {item.row} 列・{KIND_TEXT[item.kind]}：{item.message}</div>
      <div class="muted small">Excel 原始內容：{item.cells.filter(Boolean).join('｜')}</div>
      <div class="btnrow" style="margin-top:6px">
        <input class="input" style="width:72px" aria-label="班級" inputMode="numeric" value={c} onInput={(e) => setC(e.currentTarget.value)} />
        <input class="input" style="width:72px" aria-label="座號" inputMode="numeric" value={s} onInput={(e) => setS(e.currentTarget.value)} />
        <input class="input" style="width:120px" aria-label="姓名" value={n} onInput={(e) => setN(e.currentTarget.value)} />
        {item.kind === 'bad-group' && (
          <select class="input" aria-label="組別" value={g} onChange={(e) => setG(e.currentTarget.value)}>
            <option value="">— 選組別 —</option>{p.groupCodes.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <Button small kind="primary" disabled={!ok} onClick={() => p.onDecide({ action: 'fix', classNo: Number(c), seatNo: Number(s), name: n.trim(), ...(g ? { groupCode: g } : {}) })}>確認修正</Button>
        <Button small kind={done?.action === 'skip' ? 'primary' : 'default'} onClick={() => p.onDecide({ action: 'skip' })}>略過此筆</Button>
        {done && <Button small onClick={() => p.onDecide(null)}>重新處理</Button>}
      </div>
    </div>
  );
}
