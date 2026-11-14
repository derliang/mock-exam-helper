import { useState } from 'preact/hooks';
import type { ExamConfig, SeatingResult } from '../../data';
import { seatLabel, studentCode } from '../../data';
import { mixedMarkCodes, overridePurpose } from '../../core/detach';
import { Alert, Badge, Button, ConfirmButton, Modal, More, Seg, StatsBar, StepHead } from '../components';
import { confirmCopy } from '../flow';
import { ChartLegend, SeatChart } from '../components/SeatChart';
import {
  afterOverrideChange, chartModel, detachChartModel, seatableEntries, detachSummary, nameMapOf, examClasses, examEntries, examOverrides, examResult, examRooms,
  isStale, overrideNotes, removeOverride, reseat, roomStatTable, seatingBlockers, setOverride, validationChecks, type StepNo,
} from '../seating';
import { roomCapacity } from '../rooms';
import type { Doc } from '../store';

const PLACES = ['教務處', '圖書館', '輔導室'];
const taipei = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });

/** 排座失敗時給原因與修法（擋下，不輸出不合規則的結果，D25） */
function SeatError(p: { errors: string[]; onStep: (n: StepNo) => void }) {
  const seats = p.errors.some((e) => /座位不足|不夠|容量/.test(e));
  return (
    <Alert tone="danger" action={<Button onClick={() => p.onStep(3)}>前往 ③ 教室設定</Button>}>
      <b>排座失敗，座位表沒有更新：</b>
      <ul style="margin:6px 0 0 18px">{p.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
      {p.errors.length > 5 && <div class="small">…共 {p.errors.length} 項</div>}
      <div class="small" style="margin-top:6px">{seats ? '座位不夠：請到 ③ 多勾教室或增加座位。' : '請依上面的說明修正名單或教室後再排一次。'}</div>
    </Alert>
  );
}

/** ⑤ 排座與預覽（DESIGN 10.4、原型 v5） */
export function Step5(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep: (n: StepNo) => void; onReserve?: () => void }) {
  const { doc, exam } = p;
  const [err, setErr] = useState<string[] | null>(null);
  const [roomId, setRoomId] = useState('');
  const [only, setOnly] = useState('');
  const [pullKey, setPullKey] = useState('');
  const [editing, setEditing] = useState<{ code: string; co: string } | null>(null);
  const [managing, setManaging] = useState(false);

  const blockers = seatingBlockers(doc, exam);
  const result = examResult(doc, exam);
  const run = () => {
    const r = reseat(doc, exam, new Date().toISOString());
    if (r.ok) { setErr(null); p.onChange(r.doc); } else setErr(r.errors ?? [r.error]);
  };

  if (blockers.length) {
    return (
      <section class="stack">
        <StepHead title="⑤ 排座與預覽">排座、看座位表與統計；名單或設定改了要重新排座。</StepHead>
        <div class="card stack">
          <Alert tone="danger"><b>還不能排座：</b>下面的事項要先處理完，系統不會輸出不合規則的結果。</Alert>
          {blockers.map((b) => (
            <div class="blk-row" key={b.text}><span>{b.text}</span><Button small onClick={() => p.onStep(b.step)}>{`前往 ${'①②③④⑤⑥'[b.step - 1]} 處理`}</Button></div>
          ))}
        </div>
        {result && <p class="small muted">之前排過的座位表只供參考，不能直接使用；處理完後請重新排座。</p>}
      </section>
    );
  }

  if (!result) {
    return (
      <section class="stack">
        <StepHead title="⑤ 排座與預覽">排座、看座位表與統計；名單或設定改了要重新排座。</StepHead>
        <div class="card stack">
          <Alert tone="info"><b>還沒有排座。</b>名單、教室與標示都已就緒。按「開始排座」後，程式依班級輪流把每一排排給下一班，空位只留在最後；排完自動驗證。</Alert>
          {err && <SeatError errors={err} onStep={p.onStep} />}
          <div class="btnrow"><Button kind="primary" onClick={run}>開始排座</Button></div>
        </div>
      </section>
    );
  }

  const stale = isStale(doc, exam);
  const senior = exam.division === 'senior'; // 會考沒有標示、抽離、個別覆寫（單人特例）
  const trackOf = (t?: string) => (senior && t ? (t === 'science' ? '（理）' : '（文）') : '');
  const rooms = examRooms(doc, exam);
  const classRooms = rooms.filter((r) => r.kind === 'class');
  const reserveRooms = rooms.filter((r) => r.kind === 'reserve');
  const resSel = reserveRooms.find((r) => r.id === roomId);
  const room = resSel ? undefined : (classRooms.find((r) => r.id === roomId) ?? classRooms[0]);
  const roomOptions = [
    ...classRooms.map((r) => ({ value: r.id, label: `${r.name}${trackOf(r.track)}` })),
    ...reserveRooms.map((r) => ({ value: r.id, label: `${r.name}（預備）` })),
  ];
  const checks = stale ? null : validationChecks(doc, exam, result);
  const pass = checks?.filter((c) => c.ok).length ?? 0;
  const allPass = !!checks && pass === checks.length;
  const classes = examClasses(doc, exam);
  const seats = classRooms.reduce((a, r) => a + r.seatCount, 0);
  const notes = overrideNotes(doc, exam, result);
  const overrides = examOverrides(doc, exam);
  const names = nameMapOf(doc, exam);
  const summary = detachSummary(exam, result);
  const pulls = summary.flatMap((s) => s.examRooms.map((r) => ({ key: `${s.subjectId}|${r.roomId}`, subjectId: s.subjectId, name: s.name, roomId: r.roomId })));
  const model = room ? chartModel(doc, exam, result, room) : null;
  const present = model ? [...new Set(model.lines.flat().flatMap((c) => (c.kind === 'student' ? [c.classNo] : [])))].sort((a, b) => a - b) : [];
  const stat = room ? roomStatTable(doc, exam, result, room.id) : null;
  const vcode = <div class="vcode">產生 {taipei(result.generatedAt)}　資料版本 {result.dataVersion}（名單或設定改了，版本碼就會變）</div>;

  const statsBar = (
    <StatsBar items={[
        { label: '考生', value: seatableEntries(doc, exam).length },
        { label: '座位', value: seats },
        { label: '禁用', value: classRooms.reduce((a, r) => a + roomCapacity(r) - r.seatCount, 0) },
        { label: '班級教室', value: `${classRooms.length} 間` },
        ...(senior ? [{ label: '預備教室', value: `${rooms.length - classRooms.length} 間` }] : []),
        { label: '驗證', value: stale ? '需重新排座' : allPass ? '通過' : '不通過', bad: !stale && !allPass },
      ]} />
  );

  return (
    <section class="stack">
      <StepHead title="⑤ 排座與預覽">排座、看座位表與統計；名單或設定改了要重新排座。</StepHead>
      {stale && (
        <div class="stale-banner" role="status">
          <Badge tone="warn">需重新排座</Badge>名單或設定在排座之後有修改，座位表是舊的；驗證與下載要等重新排座。
          <Button small kind="primary" onClick={run}>重新排座</Button>
        </div>
      )}
      {err && <SeatError errors={err} onStep={p.onStep} />}

      {resSel && (
        <div class="card stack">
          {statsBar}
          <div><h3>座位表預覽</h3><p class="small muted">預備教室只排「抽離考試」的人；抽離自習不排座位、不印標籤，只出名單。</p></div>
          <Seg label="教室" value={resSel.id} onChange={(v) => { setRoomId(v); setOnly(''); }} options={roomOptions} />
          {(() => {
            const here = pulls.filter((x) => x.roomId === resSel.id);
            const cur = here.find((x) => x.key === pullKey) ?? here[0];
            const m = cur ? detachChartModel(doc, exam, result, resSel, cur.subjectId) : null;
            return cur && m ? (
              <>
                {here.length > 1 && <Seg label="抽離考試科目" value={cur.key} onChange={setPullKey} options={here.map((x) => ({ value: x.key, label: x.name }))} />}
                <SeatChart model={m} title={`【${exam.name}】抽離考試（＋${cur.name}）座位表`} sub={`${resSel.name}　考生 ${m.count} 人`} pull />
              </>
            ) : <Alert tone="info">這間預備教室目前沒有抽離考試的人：抽離自習不排座位、不印標籤，只出名單。</Alert>;
          })()}
        </div>
      )}

      {room && model && (
        <div class="card stack">
          {statsBar}
          <div class="btnrow" style="justify-content:space-between">
            <div><h3>座位表預覽</h3><p class="small muted">班級色；橫排（左右）與深位（前後）；點任一格可做個別覆寫。</p></div>
            <ConfirmButton kind="default" copy={confirmCopy.reseat(overrides.length)} onConfirm={run}>重新排座</ConfirmButton>
          </div>
          {roomOptions.length > 1 && (
            <Seg label="教室" value={room.id} onChange={(v) => { setRoomId(v); setOnly(''); }} options={roomOptions} />
          )}
          {present.length > 1 && (
            <Seg label="檢視班級" value={only} onChange={setOnly} options={[{ value: '', label: '全部班級' }, ...present.map((c) => ({ value: String(c), label: `只看${classes.find((x) => x.no === c)?.name ?? c}` }))]} />
          )}
          <SeatChart
            model={model}
            title={`【${exam.name}】座位表`}
            sub={`${room.name}　考生 ${model.count} 人`}
            onlyClass={only ? Number(only) : undefined}
            onPick={stale || !senior ? undefined : (code, co) => setEditing({ code, co })}
          />
          <ChartLegend override={overrides.length > 0} marks={exam.division === 'senior'} />
          {vcode}
          <p class="small muted">不開放拖曳換座位：會破壞「同班編號沿座位遞增」的規則。{senior && '「個別覆寫」不是換座位，只改指定考科的去處。'}</p>
          {stat && (
            <div>
              <div class="lab">本教室各科應考人數</div>
              <div class="scroll">
                <table class="t compact">
                  <thead><tr><th>項目</th>{stat.classes.map((c) => <th key={c.no}>{c.name}</th>)}<th>合計</th></tr></thead>
                  <tbody>{stat.rows.map((r) => <tr key={r.label}><td>{r.label}</td>{r.per.map((n, i) => <td class="n" key={i}>{n}</td>)}<td class="n"><b>{r.total}</b></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div class="card stack">
        <div class="btnrow" style="justify-content:space-between">
          <div><h3>驗證</h3><p class="small muted">任何一項不通過不能下載。</p></div>
          {checks ? <Badge tone={allPass ? 'ok' : 'danger'}>{`${pass}／${checks.length} 項通過`}</Badge> : <Badge tone="warn">待重排</Badge>}
        </div>
        {checks
          ? (
            <More open={!allPass} title={allPass ? `全部通過；看 ${checks.length} 項檢查內容` : `有 ${checks.length - pass} 項沒通過，已自動展開`}>
              <div class="stack" style="gap:8px">
                {checks.map((c) => <Alert key={c.title} tone={c.ok ? 'ok' : 'danger'}><b>{c.title}</b>　{c.detail}</Alert>)}
              </div>
            </More>
          )
          : <Alert tone="warn">需要重新排座：名單或設定已變更，舊座位表不能下載，重新排座後才會驗證。</Alert>}
      </div>

      {senior && (
        <div class="card stack">
          <div class="lab">進階</div>
          <div class="btnrow" style="justify-content:space-between">
            <div>
              <h3>個別覆寫（單人特例）</h3><p class="small muted">只改指定考科的去處，不換座位。</p>
              <More title="說明：覆寫怎麼運作">保留原教室座位並標註地點，不佔預備教室；改了會自動重排並再驗證。在上面的座位表點考生就能設定。</More>
            </div>
            <Button disabled={stale} onClick={() => setManaging(true)}>管理覆寫</Button>
          </div>
          {overrides.length === 0
            ? <p class="small muted">目前沒有個別覆寫。</p>
            : overrides.map((o) => (
              <div class="blk-row" key={o.code}>
                <span><b>{o.code}</b>　{names.get(o.code) ?? ''}　→　{o.location}{notes.has(o.code) && <>　<Badge tone="warn">{notes.get(o.code)}</Badge></>}</span>
                <Button small onClick={() => p.onChange(afterOverrideChange(removeOverride(doc, exam, o.code), exam, new Date().toISOString()))}>移除此設定</Button>
              </div>
            ))}
          <div class="psec">
            <div class="btnrow" style="justify-content:space-between">
              <div><h3>預備教室與抽離</h3><p class="small muted">被標「X」的人抽離自習、被標「＋」的人抽離考試，與座位表同一份資料。{summary.length === 0 && '這次沒有人要抽離。'}</p></div>
              {p.onReserve && <Button onClick={p.onReserve}>查看</Button>}
            </div>
          </div>
        </div>
      )}

      {managing && (
        <ManageOverridesModal doc={doc} exam={exam} result={result} names={names} notes={notes}
          onClose={() => setManaging(false)}
          onRemove={(code) => p.onChange(afterOverrideChange(removeOverride(doc, exam, code), exam, new Date().toISOString()))}
          onPick={(code, co) => { setManaging(false); setEditing({ code, co }); }} />
      )}
      {editing && <OverrideModal doc={doc} exam={exam} result={result} code={editing.code} co={editing.co} name={names.get(editing.code) ?? ''} onClose={() => setEditing(null)} onSave={(d) => { p.onChange(d); setEditing(null); }} />}
    </section>
  );
}

/** 校-41：沒有被標示科目的考生不能新增個別覆寫（稿 v2.30）：他每科都照原座位考，覆寫不會有作用 */
export const noMarkOverrideReason = (code: string, name: string): string =>
  `${code}${name ? ` ${name}` : ''} 沒有被標示的科目，不能新增個別覆寫：他每一科都照原座位考，覆寫不會有任何作用。要改去向，請先到 ④ 設定標示與抽離規則。`;

export function OverrideModal(p: { doc: Doc; exam: ExamConfig; result: SeatingResult; code: string; co: string; name: string; onClose: () => void; onSave: (d: Doc) => void }) {
  const cur = examOverrides(p.doc, p.exam).find((o) => o.code === p.code);
  const [place, setPlace] = useState(cur?.location ?? '');
  const [err, setErr] = useState('');
  /** 沒有被標示科目的考生：只有一個整體用途（稿 v2.22：彈窗對任何考生都是完整表單） */
  const [one, setOne] = useState<'exam' | 'study'>(cur?.purpose ?? 'study');
  const subj = new Map(p.exam.subjects.map((s) => [s.id, s.name]));
  const marks = p.result.marks.filter((m) => m.code === p.code);
  const now = () => new Date().toISOString();
  // 各科各自選用途（#66）：預設依標示方向；已存過的照舊值
  const mixed = mixedMarkCodes(p.result.marks).has(p.code);
  const [purp, setPurp] = useState<Record<string, 'exam' | 'study'>>(() =>
    Object.fromEntries(marks.map((m) => [m.subjectId, cur ? overridePurpose(cur, m.subjectId, m.mode, mixed) : m.mode === 'extra' ? 'exam' : 'study'] as const)));
  const save = () => {
    const purposes = Object.fromEntries(marks.map((m) => [m.subjectId, purp[m.subjectId] ?? (m.mode === 'extra' ? 'exam' : 'study')] as const));
    const r = setOverride(p.doc, p.exam, marks.length === 0
      ? { kind: 'single', code: p.code, location: place, purpose: one }
      : { kind: 'single', code: p.code, location: place, purpose: Object.values(purposes).includes('exam') ? 'exam' : 'study', purposes });
    if (!r.ok) { setErr(`${r.error}：例如「教務處」，會印在座位表與名單上`); return; }
    p.onSave(afterOverrideChange(r.doc, p.exam, now()));
  };
  return (
    <Modal
      title={`個別覆寫：${p.code}　${p.name}`}
      onClose={p.onClose}
      actions={<>
        {cur && <Button kind="danger" onClick={() => p.onSave(afterOverrideChange(removeOverride(p.doc, p.exam, p.code), p.exam, now()))}>移除覆寫</Button>}
        <Button onClick={p.onClose}>取消</Button>
        {!(marks.length === 0 && !cur) && <Button kind="primary" onClick={save}>儲存</Button>}
      </>}
    >
      {marks.length === 0 && !cur ? <Alert tone="danger">{noMarkOverrideReason(p.code, p.name)}</Alert> : <>
      <p class="small muted">原座位 {p.co} 不變，只改這個人被標示的那幾節考科要到哪裡。</p>
      {(
          <>
            <div class="stack">
              {marks.length === 0 && (
                <>
                  <div class="field"><span class="label">要做什麼</span>
                    <Seg<'exam' | 'study'> label="類型" value={one} onChange={setOne} options={[{ value: 'study', label: '到他處自習' }, { value: 'exam', label: '到他處考試' }]} />
                  </div>
                  <Alert tone="warn">這位考生目前每科都在原教室考，沒有被標示的科目；覆寫會先存下來，等他有被標示的科目才會生效。</Alert>
                </>
              )}
              {marks.map((m) => (
                <div class="row" key={m.subjectId} style="justify-content:space-between">
                  <span>{m.mode === 'absent' ? 'X' : '＋'}{subj.get(m.subjectId)}（{m.mode === 'absent' ? '原本不考' : '原本加考'}）</span>
                  <Seg<'exam' | 'study'> label={`${subj.get(m.subjectId)}用途`} value={purp[m.subjectId] ?? 'study'} onChange={(v) => setPurp((x) => ({ ...x, [m.subjectId]: v }))} options={[{ value: 'exam', label: '到他處考試' }, { value: 'study', label: '到他處自習' }]} />
                </div>
              ))}
            </div>
            <div class={`field${err ? ' err' : ''}`}>
              <label for="ovr-place">地點</label>
              <input
                id="ovr-place" class="input" value={place} aria-invalid={!!err} aria-describedby="ovr-hint"
                onInput={(e) => { setPlace((e.target as HTMLInputElement).value); setErr(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              />
              <span class="hint" id="ovr-hint">{err || '自填，例如教務處；會印在座位表與抽離名單上'}</span>
              <div class="btnrow">{PLACES.map((x) => <Button small key={x} onClick={() => { setPlace(x); setErr(''); }}>{x}</Button>)}</div>
            </div>
          </>
        )}
      </>}
    </Modal>
  );
}

/** 管理覆寫：列出全部個別覆寫（可移除），並可輸入考生編號新增一筆 */
function ManageOverridesModal(p: {
  doc: Doc; exam: ExamConfig; result: SeatingResult; names: Map<string, string>; notes: Map<string, string>;
  onClose: () => void; onRemove: (code: string) => void; onPick: (code: string, co: string) => void;
}) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const list = examOverrides(p.doc, p.exam);
  const classRoomIds = new Set(examRooms(p.doc, p.exam).filter((r) => r.kind === 'class').map((r) => r.id));
  const add = () => {
    const c = code.trim();
    const a = p.result.assignments.find((x) => x.code === c && classRoomIds.has(x.classroomId));
    if (!a) { setErr('找不到這個考生編號（班級兩碼加座號兩碼，例如 0305），或這位考生沒有座位'); return; }
    if (!p.result.marks.some((m) => m.code === c)) { setErr(noMarkOverrideReason(c, p.names.get(c) ?? '')); return; }
    p.onPick(c, seatLabel(a));
  };
  return (
    <Modal title="管理個別覆寫" onClose={p.onClose} actions={<Button kind="primary" onClick={p.onClose}>關閉</Button>}>
      {list.length === 0
        ? <p class="small muted">目前沒有個別覆寫。</p>
        : list.map((o) => (
          <div class="blk-row" key={o.code}>
            <span><b>{o.code}</b>　{p.names.get(o.code) ?? ''}　→　{o.location}（{o.purpose === 'exam' ? '考試' : '自習'}）{p.notes.has(o.code) && <>　<Badge tone="warn">{p.notes.get(o.code)}</Badge></>}</span>
            <Button small onClick={() => p.onRemove(o.code)}>移除此設定</Button>
          </div>
        ))}
      <div class={`field${err ? ' err' : ''}`}>
        <label for="ovr-code">新增覆寫：考生編號</label>
        <div class="row">
          <input id="ovr-code" class="input" value={code} aria-invalid={!!err} onInput={(e) => { setCode((e.target as HTMLInputElement).value); setErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <Button onClick={add}>設定</Button>
        </div>
        <span class={err ? 'field-msg' : 'hint'}>{err || '也可以在座位表上直接點考生。'}</span>
      </div>
    </Modal>
  );
}
