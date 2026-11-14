import { useEffect, useRef, useState } from 'preact/hooks';
import type { ExamConfig, ExamEntry, Participation, RosterDiff, RosterDiffChoice } from '../../data';
import { allResolved, applyDiffs, compareRosters, diffsStale, isResolved, readXlsx, refreshDiffs, validateResolved, type Sheet } from '../../import';
import { Alert, Badge, Button, ClassChip, ConfirmButton, More, Seg, StatsBar, StepHead } from '../components';
import { confirmCopy } from '../flow';
import { addClass, diffOptions, rosterName, syncDiffs, updateExam, type Doc } from '../store';
import { ImportWizard, scanOptionsFor } from './ImportWizard';

/** 差異卡標題（稿 v2.34 H-6 的 7 種情形；「班級或座號不同」「姓名不同」由兩邊內容判斷） */
const titleOf = (d: RosterDiff): string => {
  if (d.kind === 'only-in-exam') return '考試名單有，學生名單沒有';
  if (d.kind === 'only-in-roster') return '學生名單有，考試名單沒有';
  if (d.kind === 'group-diff') return '同一人的組別不同';
  if (d.kind === 'new-class') return '考試名單有這個班級，班級資料沒有';
  return d.exam && d.roster && d.exam.classNo === d.roster.classNo && d.exam.seatNo === d.roster.seatNo ? '同一人的姓名不同' : '同一人的班級或座號不同';
};
const CHOICE_TEXT: Record<RosterDiffChoice, string> = {
  'use-exam': '以考試名單為準', 'use-roster': '以學生名單為準', manual: '手動編輯',
  'add-class': '新增班級', 'remap-class': '改成既有班級', 'skip-class': '不匯入這班',
};
const optionsOf = (d: RosterDiff): RosterDiffChoice[] =>
  d.kind === 'new-class' ? ['add-class', 'remap-class', 'skip-class'] : d.kind === 'group-diff' ? ['use-exam', 'use-roster'] : ['use-exam', 'use-roster', 'manual'];

/**
 * ② 考試名單（D63）：匯入大考中心格式名單 → 與學生名單比對（D42/D54/D64）。
 * 總覽（狀態 alert、本次考試名單、誰會參加、各班人數／比對、學生名單快照）與獨立的逐筆比對畫面（原型 vCmp）。
 */
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
  const [showCmp, setShowCmp] = useState(false);
  const [err, setErr] = useState('');
  const [applyErr, setApplyErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const fullyAbsent = entries ? entries.filter((e) => e.subjectIds.length === 0).length : 0;
  const classNames = doc.settings.classes.filter((c) => c.division === exam.division).map((c) => c.name);
  const dopts = diffOptions(doc, exam);
  const compare = (list: ExamEntry[]) => compareRosters(roster, list, exam.participation, dopts);

  // 共用名單、考試名單、參加方式任一改變，已存的差異就過期：重算並只沿用內容完全相同的選擇（#60）
  const stale = !!entries && diffsStale(diffs, refreshDiffs(roster, entries, exam.participation, diffs, dopts));
  useEffect(() => {
    if (entries && stale) save({ diffs: refreshDiffs(roster, entries, exam.participation, diffs, dopts) });
  }, [stale, roster, entries, exam.participation]);

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
    const d = compare(list).diffs;
    save({ entries: list, diffs: d }, { settings });
    setSheets(null);
    setShowCmp(d.length > 0); // 有差異就直接進逐筆比對（原型：匯入並比對）
  };

  const setChoice = (code: string, choice: RosterDiffChoice, edited?: RosterDiff['edited'], targetClassNo?: number) =>
    save({ diffs: diffs.map((d) => (d.code === code ? { ...d, choice, edited, targetClassNo } : d)) });

  /** 全部處理完才套用：學生名單與考試名單依選擇更新（一次 onChange，可復原） */
  const apply = (): boolean => {
    if (!entries) return false;
    const groupTable = scanOptionsFor(exam, []).groupTable;
    const r = applyDiffs(roster, entries, diffs, { subjectsOfGroup: (k) => groupTable?.[k] });
    const bad = validateResolved(r, new Set([...classes.map((c) => c.no), ...r.addedClasses]));
    if (bad) { setApplyErr(bad); return false; } // 有碰撞就不寫入任何一份名單（#67）
    // 選了「新增班級」：先把班級加進班級資料（名稱先用「第NN班」，可到共用設定改），任一班加不成就整批不套用
    let next: Doc = { ...doc, rosters: { ...doc.rosters, [exam.division]: r.students } };
    for (const no of r.addedClasses) {
      const added = addClass(next, exam.division, { no });
      if (!added.ok) { setApplyErr(added.error); return false; }
      next = added.doc;
    }
    setApplyErr('');
    p.onChange({ ...next, examFiles: { ...doc.examFiles, [exam.id]: { ...files, entries: r.entries, diffs: [] } } });
    return true;
  };

  const resolved = diffs.filter(isResolved).length;
  /** 會考全員參加：沒匯入名單時，學生名單就是考試名單，這一步視為完成 */
  const bcctAll = exam.kind === 'bcct' && entries === null;
  const done = bcctAll ? roster.length > 0 : entries !== null && diffs.length === 0;
  const notJoin = entries && exam.participation === 'partial' ? compare(entries).notParticipating : 0;
  const classes = doc.settings.classes.filter((c) => c.division === exam.division);
  /** 「恭班 45 號　張小翔」：班名＋座號＋姓名（原型寫法） */
  const who = (x?: { classNo: number; seatNo: number; name: string }) => (x ? `${classes.find((c) => c.no === x.classNo)?.name ?? x.classNo}班 ${x.seatNo} 號　${x.name}` : "—");
  const gtext = (g?: string) => (g ? `　組別 ${g}` : '');
  const clsLabel = (no: number) => `第${String(no).padStart(2, '0')}班`;
  const perClass = classes.map((c) => ({ c, n: roster.filter((s) => s.classNo === c.no).length }));
  const filePick = (
    <input ref={input} type="file" accept=".xlsx" hidden aria-label="選擇考試名單 Excel 檔"
      onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) void onFile(f); }} />
  );

  // 名單比對：獨立的逐筆處理畫面；「先不處理」回到總覽，已選的先留著
  if (entries && diffs.length > 0 && showCmp) {
    return (
      <section class="stack" style="max-width:860px">
        <div class="card stephead"><div><h2>名單比對</h2><p class="small muted">② 考試名單：和共用學生名單逐筆比對。</p></div></div>
        <div class="card stack">
          <p>匯入「{exam.name}」考試名單後，和共用學生名單比對，找到 <b>{diffs.length}</b> 筆差異；全部處理完才能繼續排座。</p>
          <More title="說明：每一筆怎麼處理">每一筆選一種處理方式（多數是：以考試名單為準、以學生名單為準，或兩邊都不對就手動編輯）。</More>
          <StatsBar items={[{ label: '差異', value: diffs.length }, { label: '已處理', value: resolved }, { label: '未處理', value: diffs.length - resolved, bad: diffs.length - resolved > 0 }]} />
        </div>
        {diffs.map((d, i) => {
          const picked = isResolved(d);
          const nc = d.kind === 'new-class';
          const members = d.members ?? [];
          const cno = members[0]?.classNo ?? 0;
          return (
            <div class="card stack" style="gap:12px" key={d.code}>
              <div class="row" style="justify-content:space-between">
                <Badge tone="warn">{`${i + 1}／${diffs.length}　${titleOf(d)}`}</Badge>
                {picked ? <Badge tone="ok">{`已選：${CHOICE_TEXT[d.choice as RosterDiffChoice]}`}</Badge> : <Badge>未處理</Badge>}
              </div>
              <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))">
                {nc ? (
                  <>
                    <div class="fact"><b>考試名單</b>{`${clsLabel(cno)} ${members.length} 人（${members.map((m) => `${m.seatNo} 號　${m.name}`).join('、')}）`}</div>
                    <div class="fact"><b>學生名單</b>{`（班級資料沒有「${clsLabel(cno)}」）`}</div>
                  </>
                ) : (
                  <>
                    <div class="fact"><b>考試名單</b>{d.exam ? who(d.exam) + (d.kind === 'group-diff' ? gtext(d.groups?.exam) : '') : '（沒有這個人）'}</div>
                    <div class="fact"><b>學生名單</b>{d.roster ? who(d.roster) + (d.kind === 'group-diff' ? gtext(d.groups?.roster) : '') : '（沒有這個人）'}</div>
                  </>
                )}
              </div>
              <Seg<RosterDiffChoice> label={`第 ${i + 1} 筆處理方式`} value={(d.choice ?? '') as RosterDiffChoice}
                onChange={(v) => {
                  setEditing(v === 'manual' ? d.code : null);
                  setChoice(d.code, v, v === 'manual' ? d.edited : undefined, v === 'remap-class' ? (d.targetClassNo ?? classes[0]?.no) : undefined);
                }}
                options={optionsOf(d).map((v) => ({ value: v, label: nc && v === 'add-class' ? `新增班級「${clsLabel(cno)}」` : nc && v === 'skip-class' ? `不匯入這班（${members.length} 人）` : CHOICE_TEXT[v] }))} />
              {nc && <More title="說明：新增班級會怎樣"><span class="hint">選「新增班級」會當場在班級資料多一班（名稱先用「{clsLabel(cno)}」，之後可到共用設定改），不用先離開去設定頁。</span></More>}
              {nc && d.choice === 'remap-class' && (
                <div class="field"><label>這班的人改到哪一班
                  <select class="input" value={String(d.targetClassNo ?? '')} onChange={(e) => setChoice(d.code, 'remap-class', undefined, Number(e.currentTarget.value))}>
                    {classes.map((c) => <option key={c.no} value={String(c.no)}>{c.name}（{String(c.no).padStart(2, '0')}）</option>)}
                  </select></label>
                  <span class="hint">座號照原樣帶過去；目標班級同座號已有人時，套用會擋下並指出是哪兩人。</span></div>
              )}
              {d.choice === 'manual' && (editing === d.code || !d.edited) && <Editor diff={d} classNos={classes.map((c) => c.no)} onSave={(e) => { setChoice(d.code, 'manual', e); setEditing(null); }} />}
              {d.choice === 'manual' && d.edited && editing !== d.code && <div class="hint">已改為 {who(d.edited)}　<Button small onClick={() => setEditing(d.code)}>再改</Button></div>}
            </div>
          );
        })}
        {fullyAbsent > 0 && (
          <div class="card stack" style="gap:12px">
            <div class="row" style="justify-content:space-between">
              <Badge tone="warn">{`${fullyAbsent} 人全科缺考`}</Badge>
              <Badge tone="ok">{`目前：${exam.seatFullyAbsent ? '仍排座' : '列入缺考清單，不排座'}`}</Badge>
            </div>
            <div class="fact"><b>考試名單</b>{(entries ?? []).filter((e) => e.subjectIds.length === 0).map((e) => who(e)).join('、')}（備註：全科缺考）</div>
            <Seg<'list' | 'seat'> label="全科缺考處理方式" value={exam.seatFullyAbsent ? 'seat' : 'list'}
              onChange={(v) => { const r = updateExam(doc, exam.id, { seatFullyAbsent: v === 'seat' }); if (r.ok) p.onChange(r.doc); }}
              options={[{ value: 'list', label: '列入缺考清單，不排座' }, { value: 'seat', label: '仍排座' }]} />
            <span class="hint">全科缺考的人不佔座位，座位表與領卷份數都不含；也可以改成仍排座。這一項已有預設，不必選也能繼續。</span>
          </div>
        )}
        {applyErr && <Alert tone="danger"><b>沒有套用，兩份名單都維持原樣。</b>{applyErr}</Alert>}
        <div class="row" style="justify-content:flex-end">
          <Button onClick={() => setShowCmp(false)}>先不處理</Button>
          <Button kind="primary" disabled={!allResolved(diffs)} onClick={() => { if (apply()) setShowCmp(false); }}>
            {allResolved(diffs) ? `套用 ${diffs.length} 筆核對結果` : `還有 ${diffs.length - resolved} 筆沒選`}
          </Button>
        </div>
        <p class="small muted">按鈕在全部選完前停用。</p>
      </section>
    );
  }

  const status = !entries && bcctAll
    ? (roster.length > 0
      ? <Alert tone="ok" action={<Button onClick={() => input.current?.click()}>仍要匯入考試名單</Button>}><b>全員參加，不需匯入。</b>會考每位同學都考，學生名單就是考試名單（共 {roster.length} 人）；只有要記錄缺考時才需要匯入。</Alert>
      : <Alert tone="warn" action={<Button kind="primary" onClick={p.onToRoster}>去匯入學生名單</Button>}><b>國三學生名單是空的。</b>會考不需匯入考試名單，請先到「共用設定」匯入國三學生名單。</Alert>)
    : !entries
    ? <Alert tone="warn" action={<Button kind="primary" onClick={() => input.current?.click()}>匯入本次考試名單</Button>}><b>還沒有匯入本次考試名單。</b>匯入後會和共用學生名單比對，排座前要處理完所有差異。</Alert>
    : diffs.length > 0
      ? <Alert tone="warn" action={<Button kind="primary" onClick={() => setShowCmp(true)}>處理差異</Button>}><b>還有 {diffs.length - resolved} 筆差異沒處理</b>：共 {diffs.length} 筆，全部處理完才能繼續排座。</Alert>
      : <Alert tone="ok" action={<ConfirmButton kind="default" undoable copy={confirmCopy.reimportList(entries.length)} onConfirm={() => input.current?.click()}>再匯入一次</ConfirmButton>}><b>已比對：</b>考試名單與學生名單沒有未處理的差異。</Alert>;

  const sn = rosterName(exam.division);
  const reimport = entries
    ? <ConfirmButton kind="default" undoable copy={confirmCopy.reimportList(entries.length)} onConfirm={() => input.current?.click()}>再匯入一次</ConfirmButton>
    : null;
  const headBadge = !entries && bcctAll ? <Badge tone="ok">全員參加，不需匯入</Badge>
    : !entries ? <Badge tone="warn">尚未匯入</Badge>
    : diffs.length > 0 ? <Badge tone="warn">差異 {diffs.length} 筆</Badge>
    : <Badge tone="ok">✓ 已比對，沒有差異</Badge>;

  // 稿 v2.22（校-60）：步驟② 合成一張「考試名單」卡，區塊內上下分區；待處理時才多一則帶動作的提示
  return (
    <section class="stack">
      <StepHead title="② 考試名單" />
      <div class="card stack">
        <div class="row" style="justify-content:space-between;gap:10px">
          <div class="row" style="gap:10px"><h3>考試名單</h3>{headBadge}</div>
          {reimport}
        </div>
        {done && !diffs.length ? null : status}
        {filePick}
        {err && <Alert tone="danger">{err}</Alert>}
        <div class="row" style="gap:12px;justify-content:space-between">
          <div class="row" style="gap:10px">
            <Badge>考試名單.xlsx</Badge>
            <span class="muted small">{entries ? `已匯入 ${entries.length} 筆` : bcctAll ? `不需匯入（全員 ${roster.length} 人）` : '尚未匯入'}</span>
            {entries && diffs.length > 0 && (
              <ConfirmButton kind="default" small undoable copy={confirmCopy.reimportList(entries.length)} onConfirm={() => input.current?.click()}>重新匯入</ConfirmButton>
            )}
          </div>
          <div class="row" style="gap:8px"><span class="label" style="margin:0">誰會參加</span>
            <Seg<Participation> label="參加模式" value={exam.participation}
              onChange={(v) => { const r = updateExam(doc, exam.id, { participation: v }); if (r.ok) p.onChange(syncDiffs(r.doc)); }}
              options={[{ value: 'all', label: '全員參加' }, { value: 'partial', label: '部分參加' }]} />
          </div>
        </div>
        <p class="small muted">{exam.participation === 'partial'
          ? '未列入本次考試的人不視為名單差異，不排座、不出現在座位表。'
          : '學生名單有、考試名單沒有的人，列為差異，逐筆處理。'}</p>
        {fullyAbsent > 0 && (
          <Alert tone="info">
            有 {fullyAbsent} 人全科缺考：{exam.seatFullyAbsent ? '目前照樣排座。' : '預設不排座、不計領卷份數。'}
            <label style="margin-left:12px"><input type="checkbox" checked={!!exam.seatFullyAbsent}
              onChange={(e) => { const r = updateExam(doc, exam.id, { seatFullyAbsent: (e.target as HTMLInputElement).checked }); if (r.ok) p.onChange(r.doc); }} /> 全科缺考者仍排座</label>
          </Alert>
        )}
        {sheets && (
          <ImportWizard sheets={sheets} exam={exam} classNames={classNames} trackOf={(n) => doc.settings.classes.find((c) => c.division === exam.division && c.no === n)?.track} previous={entries ?? undefined} saved={doc.settings.markMap ?? {}}
            onCancel={() => setSheets(null)} onDone={adopt} />
        )}
        <div class="row" style="justify-content:space-between;gap:10px;border-top:1px solid var(--line);padding-top:12px">
          <div class="row" style="gap:10px 22px">
            <span class="label" style="margin:0">各班人數</span>
            {perClass.map(({ c, n }) => <span class="row" style="gap:6px" key={c.no}><ClassChip colorIndex={c.colorIndex}>{c.name}</ClassChip><b class="num" style="font-size:17px">{n}</b></span>)}
            {perClass.length === 0 && <span class="small muted">共用設定還沒有這個部別的班級。</span>}
            <span class="muted">合計 <b class="num">{roster.length}</b></span>
            {entries && <span class="small muted">考生 {entries.length} 人{exam.participation === 'partial' ? `，未參加 ${notJoin} 人` : ''}{fullyAbsent > 0 ? `，全科缺考 ${fullyAbsent} 人` : ''}</span>}
          </div>
          <Button small onClick={p.onToRoster}>查看／編輯{sn}</Button>
        </div>
        {roster.length === 0 && <Alert tone="warn">{sn}是空的，比對時所有考生都會列為差異。請先到「共用設定」匯入學生名單。</Alert>}
      </div>
    </section>
  );
}

/** 手動編輯：在該筆原地改班級、座號、姓名（D54） */
function Editor(p: { diff: RosterDiff; classNos: readonly number[]; onSave: (e: NonNullable<RosterDiff['edited']>) => void }) {
  const base = p.diff.edited ?? p.diff.exam ?? p.diff.roster ?? { classNo: 1, seatNo: 1, name: '' };
  const [c, setC] = useState(String(base.classNo));
  const [s, setS] = useState(String(base.seatNo));
  const [n, setN] = useState(base.name);
  const cn = Number(c), sn = Number(s);
  const msg = !Number.isInteger(cn) || !p.classNos.includes(cn) ? '班級不存在，請先到「班級資料」新增'
    : !Number.isInteger(sn) || sn < 1 || sn > 99 ? '座號要是 1～99 的整數' : n.trim() === '' ? '姓名不能空白' : '';
  const ok = msg === '';
  return (
    <div class="stack">
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));align-items:start">
        <div class="field"><label>班級<input class="input" aria-label="班級" inputMode="numeric" value={c} onInput={(e) => setC(e.currentTarget.value)} /></label></div>
        <div class="field"><label>座號<input class="input" aria-label="座號" inputMode="numeric" value={s} onInput={(e) => setS(e.currentTarget.value)} /></label></div>
        <div class="field"><label>姓名<input class="input" aria-label="姓名" value={n} onInput={(e) => setN(e.currentTarget.value)} /></label></div>
      </div>
      <div class="row"><Button small kind="primary" disabled={!ok} onClick={() => p.onSave({ classNo: Number(c), seatNo: Number(s), name: n.trim() })}>確認修正</Button>
        <span class={msg ? 'field-msg' : 'hint'}>{msg || '改完就算處理好，套用時以這裡的資料為準。'}</span></div>
    </div>
  );
}
