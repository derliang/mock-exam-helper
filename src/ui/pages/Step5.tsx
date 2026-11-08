import { useState } from 'preact/hooks';
import type { ExamConfig, SeatingResult } from '../../data';
import { studentCode } from '../../data';
import { Alert, Badge, Button, ConfirmButton, Modal, Seg, StatsBar } from '../components';
import { confirmCopy } from '../flow';
import { ChartLegend, SeatChart } from '../components/SeatChart';
import {
  afterOverrideChange, chartModel, detachChartModel, detachSummary, examClasses, examEntries, examOverrides, examResult, examRooms,
  isStale, overrideNotes, removeOverride, reseat, roomStatTable, seatingBlockers, setOverride, validationChecks, type StepNo,
} from '../seating';
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
export function Step5(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep: (n: StepNo) => void }) {
  const { doc, exam } = p;
  const [err, setErr] = useState<string[] | null>(null);
  const [roomId, setRoomId] = useState('');
  const [only, setOnly] = useState('');
  const [pullKey, setPullKey] = useState('');
  const [editing, setEditing] = useState<{ code: string; co: string } | null>(null);

  const blockers = seatingBlockers(doc, exam);
  const result = examResult(doc, exam);
  const run = () => {
    const r = reseat(doc, exam, new Date().toISOString());
    if (r.ok) { setErr(null); p.onChange(r.doc); } else setErr(r.errors ?? [r.error]);
  };

  if (blockers.length) {
    return (
      <section class="stack">
        <div class="card stephead"><div><h2>⑤ 排座與預覽</h2><p class="small muted">排座、看座位表與統計；名單或設定改了要重新排座。</p></div></div>
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
        <div class="card stephead"><div><h2>⑤ 排座與預覽</h2><p class="small muted">排座、看座位表與統計；名單或設定改了要重新排座。</p></div></div>
        <div class="card stack">
          <Alert tone="info"><b>還沒有排座。</b>名單、教室與標示都已就緒。按「開始排座」後，程式依班級輪流把每一排排給下一班，空位只留在最後；排完自動驗證。</Alert>
          {err && <SeatError errors={err} onStep={p.onStep} />}
          <div class="btnrow"><Button kind="primary" onClick={run}>開始排座</Button></div>
        </div>
      </section>
    );
  }

  const stale = isStale(doc, exam);
  const rooms = examRooms(doc, exam);
  const classRooms = rooms.filter((r) => r.kind === 'class');
  const room = classRooms.find((r) => r.id === roomId) ?? classRooms[0];
  const checks = stale ? null : validationChecks(doc, exam, result);
  const pass = checks?.filter((c) => c.ok).length ?? 0;
  const allPass = !!checks && pass === checks.length;
  const classes = examClasses(doc, exam);
  const seats = classRooms.reduce((a, r) => a + r.seatCount, 0);
  const notes = overrideNotes(doc, exam, result);
  const overrides = examOverrides(doc, exam);
  const names = new Map(examEntries(doc, exam).map((e) => [studentCode(e.classNo, e.seatNo), e.name]));
  const summary = detachSummary(exam, result);
  const pulls = summary.flatMap((s) => s.examRooms.map((r) => ({ key: `${s.subjectId}|${r.roomId}`, subjectId: s.subjectId, name: s.name, roomId: r.roomId })));
  const pull = pulls.find((x) => x.key === pullKey) ?? pulls[0];
  const pullRoom = pull && rooms.find((r) => r.id === pull.roomId);
  const pullModel = pull && pullRoom ? detachChartModel(doc, exam, result, pullRoom, pull.subjectId) : null;
  const model = room ? chartModel(doc, exam, result, room) : null;
  const present = model ? [...new Set(model.lines.flat().flatMap((c) => (c.kind === 'student' ? [c.classNo] : [])))].sort((a, b) => a - b) : [];
  const stat = room ? roomStatTable(doc, exam, result, room.id) : null;
  const trackOf = (t?: string) => (exam.division === 'senior' && t ? (t === 'science' ? '（理）' : '（文）') : '');
  const vcode = <div class="vcode">產生 {taipei(result.generatedAt)}　資料版本 {result.dataVersion}（名單或設定改了，版本碼就會變）</div>;

  return (
    <section class="stack">
      <div class="card stephead"><div><h2>⑤ 排座與預覽</h2><p class="small muted">排座、看座位表與統計；名單或設定改了要重新排座。</p></div></div>
      <StatsBar items={[
        { label: '考生', value: examEntries(doc, exam).length },
        { label: '座位', value: seats },
        { label: '班級教室', value: `${classRooms.length} 間` },
        { label: '預備教室', value: `${rooms.length - classRooms.length} 間` },
        { label: '驗證', value: stale ? '需重新排座' : allPass ? '通過' : '不通過', bad: !stale && !allPass },
      ]} />
      {stale && (
        <div class="stale-banner" role="status">
          <Badge tone="warn">需重新排座</Badge>名單或設定在排座之後有修改，座位表是舊的；驗證與下載要等重新排座。
          <Button small kind="primary" onClick={run}>重新排座</Button>
        </div>
      )}
      {err && <SeatError errors={err} onStep={p.onStep} />}

      {room && model && (
        <div class="card stack">
          <div class="btnrow" style="justify-content:space-between">
            <div><h3>座位表預覽</h3><p class="small muted">班級底色；橫排（左右）與深位（前後），講臺在下方。{!stale && '點任一位考生可設定個別覆寫（只改指定考科的去處，不是換座位）。'}</p></div>
            <ConfirmButton kind="default" copy={confirmCopy.reseat(overrides.length)} onConfirm={run}>重新排座</ConfirmButton>
          </div>
          {classRooms.length > 1 && (
            <Seg label="教室" value={room.id} onChange={(v) => { setRoomId(v); setOnly(''); }} options={classRooms.map((r) => ({ value: r.id, label: `${r.name}${trackOf(r.track)}` }))} />
          )}
          {present.length > 1 && (
            <Seg label="檢視班級" value={only} onChange={setOnly} options={[{ value: '', label: '全部班級' }, ...present.map((c) => ({ value: String(c), label: `只看${classes.find((x) => x.no === c)?.name ?? c}` }))]} />
          )}
          <SeatChart
            model={model}
            title={`【${exam.name}】座位表`}
            sub={`${room.name}　考生 ${model.count} 人`}
            onlyClass={only ? Number(only) : undefined}
            onPick={stale ? undefined : (code, co) => setEditing({ code, co })}
          />
          <ChartLegend override={overrides.length > 0} />
          {vcode}
          <p class="small muted">不開放拖曳換座位：會破壞「同班編號沿座位遞增」的規則。「個別覆寫」不是換座位，只改指定考科的去處。</p>
          {stat && (
            <div>
              <div class="lab">座位表統計（這間教室）</div>
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
          <div><h3>驗證</h3><p class="small muted">全部通過後才能下載。</p></div>
          {checks ? <Badge tone={allPass ? 'ok' : 'danger'}>{pass}／{checks.length} 項通過</Badge> : <Badge tone="warn">待重新排座</Badge>}
        </div>
        {checks
          ? checks.map((c) => <Alert key={c.title} tone={c.ok ? 'ok' : 'danger'}><b>{c.title}</b>　{c.detail}</Alert>)
          : <Alert tone="warn">需要重新排座：名單或設定已變更，舊座位表不能下載，重新排座後才會驗證。</Alert>}
      </div>

      <div class="card stack">
        <div><h3>個別覆寫（單人特例）</h3><p class="small muted">保留原教室座位（不是換座位），只把這個人被標示的那幾節考科改到自填地點，不佔預備教室；改了會自動重排並再驗證。在上面的座位表點考生就能設定。</p></div>
        {overrides.length === 0
          ? <p class="small muted">目前沒有個別覆寫。</p>
          : overrides.map((o) => (
            <div class="blk-row" key={o.code}>
              <span><b>{o.code}</b>　{names.get(o.code) ?? ''}　→　{o.location}{notes.has(o.code) && <>　<Badge tone="warn">{notes.get(o.code)}</Badge></>}</span>
              <Button small onClick={() => p.onChange(afterOverrideChange(removeOverride(doc, exam, o.code), exam, new Date().toISOString()))}>移除此設定</Button>
            </div>
          ))}
      </div>

      {exam.division === 'senior' && (
        <div class="card stack">
          <div><h3>預備教室與抽離</h3><p class="small muted">標「X」的人這科不考，該節改到自習地點（只出名單）；標「＋」的人這科要考，該節改到預備教室。與座位表同一份資料。</p></div>
          {summary.length === 0
            ? <p class="small muted">這次沒有人要抽離。</p>
            : (
              <div class="scroll">
                <table class="t compact">
                  <thead><tr><th>科目</th><th>抽離考試</th><th>抽離自習</th><th>單人特例</th></tr></thead>
                  <tbody>{summary.map((s) => (
                    <tr key={s.subjectId}>
                      <td><b>{s.name}</b></td>
                      <td>{s.examRooms.length ? s.examRooms.map((r) => `${rooms.find((x) => x.id === r.roomId)?.name ?? r.roomId} ${r.count} 人`).join('、') : '—'}</td>
                      <td>{s.study ? `${s.study} 人` : '—'}</td><td>{s.special ? `${s.special} 人` : '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          {pull && pullRoom && pullModel && (
            <>
              {pulls.length > 1 && <Seg label="抽離考試座位表" value={pull.key} onChange={setPullKey} options={pulls.map((x) => ({ value: x.key, label: `${x.name}・${rooms.find((r) => r.id === x.roomId)?.name ?? x.roomId}` }))} />}
              <SeatChart
                model={pullModel}
                title={`【${exam.name}】抽離考試（＋${pull.name}）座位表`}
                sub={`${pullRoom.name}　考生 ${pullModel.count} 人`}
                pull
              />
            </>
          )}
        </div>
      )}

            {editing && <OverrideModal doc={doc} exam={exam} result={result} code={editing.code} co={editing.co} name={names.get(editing.code) ?? ''} onClose={() => setEditing(null)} onSave={(d) => { p.onChange(d); setEditing(null); }} />}
    </section>
  );
}

function OverrideModal(p: { doc: Doc; exam: ExamConfig; result: SeatingResult; code: string; co: string; name: string; onClose: () => void; onSave: (d: Doc) => void }) {
  const cur = examOverrides(p.doc, p.exam).find((o) => o.code === p.code);
  const [place, setPlace] = useState(cur?.location ?? '');
  const [err, setErr] = useState('');
  const subj = new Map(p.exam.subjects.map((s) => [s.id, s.name]));
  const marks = p.result.marks.filter((m) => m.code === p.code);
  const now = () => new Date().toISOString();
  const save = () => {
    const r = setOverride(p.doc, p.exam, { kind: 'single', code: p.code, location: place, purpose: marks.some((m) => m.mode === 'extra') ? 'exam' : 'study' });
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
        <Button kind="primary" disabled={marks.length === 0} onClick={save}>儲存</Button>
      </>}
    >
      <p class="small muted">原座位 {p.co} 不變，只改這個人被標示的那幾節考科要到哪裡。</p>
      {marks.length === 0
        ? <Alert tone="info">這位考生每科都在原教室考，沒有要抽離的科目，不需要覆寫。</Alert>
        : (
          <>
            <Alert tone="info">
              {marks.map((m) => `${m.mode === 'absent' ? `X${subj.get(m.subjectId)}：該節到他處自習` : `＋${subj.get(m.subjectId)}：該節到他處考試`}`).join('；')}
            </Alert>
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
    </Modal>
  );
}
