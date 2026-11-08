import { useState } from 'preact/hooks';
import type { ExamConfig, Semester, Subject } from '../../data';
import { Alert, Badge, Button, ConfirmButton, Modal, Seg } from '../components';
import { carryMode, carryRows, carrySource, resumeCarry, stopCarry } from '../carry';
import { confirmCopy } from '../flow';
import { updateExam, KIND_LABEL, type Doc } from '../store';
import { defaultSubjects, isCustomized, mathSplit, removeSubject, saveSubject, subjectTags, subjectWho, WHO_LABEL, type SubjectWho } from '../subjects';

const CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** ① 考試設定：基本資料卡、考科表卡（含「誰要考」）、沿用上次設定卡（原型 v1；參加方式在 ② 的「誰會參加」卡） */
export function Step1(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { exam, doc } = p;
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const set = (patch: Partial<ExamConfig>) => {
    const r = updateExam(doc, exam.id, patch);
    if (r.ok) { setErr(''); p.onChange(r.doc); } else setErr(r.error);
  };
  const fixed = exam.kind === 'bcct';
  const gsat = exam.kind === 'gsat';
  const round = exam.round ?? 1;
  const setRound = (r: number) =>
    // 次別改變時，若考科表沒被自訂過就重新帶入預設（D52）；自訂過的保留
    set({ round: r, ...(isCustomized(exam.subjects) ? {} : { subjects: defaultSubjects(exam.kind, r) }) });
  // 次別沒有上限（使用者 2026-11-08 指示）：至少顯示 1～4，次別更大時多顯示到目前這一次，選中項才看得到
  const rounds = Array.from({ length: Math.max(4, round) }, (_, i) => i + 1);
  const custom = isCustomized(exam.subjects);
  const prev = carrySource(doc, exam);
  const mode = carryMode(doc, exam);

  return (
    <section class="stack">
      <div class="card stephead">
        <div><h2>① 考試設定</h2><p class="small muted">名稱、學期、次別與考科表；考科表決定 ② 名單比對的科目與 ⑥ 匯出的標題。</p></div>
      </div>

      <div class="card stack">
        <div><h3>基本資料</h3><p class="small muted">類型建立後不可更改。</p></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));align-items:start">
          <div class="field"><label for="x-name">模擬考名稱</label>
            <input id="x-name" class="input" value={exam.name} onChange={(e) => set({ name: e.currentTarget.value })} />
            <span class="hint">子資料夾名稱同步更換</span></div>
          <div class="field"><label for="x-term">學期</label>
            <select id="x-term" class="input" value={exam.semester} onChange={(e) => set({ semester: e.currentTarget.value as Semester })}>
              <option value="first">上學期</option><option value="second">下學期</option>
            </select>
            <span class="hint">學年度依建立日期自動算</span></div>
          <div class="field"><span class="label">類型與對象</span>
            <div class="input" style="display:flex;align-items:center;gap:8px;background:var(--surface)"><Badge>{KIND_LABEL[exam.kind].replace(/（.*）/, '')}</Badge>{exam.division === 'senior' ? '高三' : '國三'}</div>
            <span class="hint">建立後不可更改類型</span></div>
        </div>
        {gsat && (
          <div class="field"><span class="label">次別（學測模擬考第幾次）</span>
            <Seg<string> label="次別" value={String(round)} onChange={(v) => setRound(Number(v))}
              options={rounds.map((n) => ({ value: String(n), label: `第${CN[n] ?? n}次` }))} />
            <span class="hint">第 1、2 次數學是單一科，第 3 次起分為數學A、數學B</span></div>
        )}
        {err && <Alert tone="danger">{err}</Alert>}
      </div>

      <div class="card stack">
        <div class="row" style="justify-content:space-between">
          <div><h3>考科表</h3><p class="small muted">依類型與次別自動帶出，可以新增、編輯、刪除（D52）</p></div>
          {!fixed && (
            <div class="row">
              {custom && <ConfirmButton kind="default" copy={confirmCopy.resetSubjects()} onConfirm={() => set({ subjects: defaultSubjects(exam.kind, exam.round) })}>還原預設</ConfirmButton>}
              <Button onClick={() => setEditing({ id: null })}>新增考科</Button>
            </div>
          )}
        </div>
        {fixed && <Alert tone="info"><b>會考科目固定為七科</b>：國文、英語閱讀、英語聽力、數學、社會、自然、寫作測驗，不能新增、刪除或修改。</Alert>}
        {gsat && mathSplit(round) && <Alert tone="info"><b>第{CN[round] ?? round}次起數學分為數學A、數學B</b>；第 1、2 次數學只有一科，另有英聽。</Alert>}
        {custom && <Alert tone="warn">考科表已自訂，④ 的組別對照表要重新確認。</Alert>}
        <div class="scroll"><table class="t compact">
          <thead><tr><th>科目</th><th>誰要考</th><th /></tr></thead>
          <tbody>
            {exam.subjects.map((s) => (
              <tr key={s.id}>
                <td><b>{s.name}</b>{subjectTags(exam.kind, s).map((t) => <> <Badge key={t.text} {...(t.tone === 'warn' ? { tone: 'warn' as const } : {})}>{t.text}</Badge></>)}</td>
                <td>{WHO_LABEL[subjectWho(exam.kind, s)]}</td>
                <td>{fixed
                  ? <div class="row" style="justify-content:flex-end"><Badge>固定</Badge></div>
                  : <div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
                    <Button small onClick={() => setEditing({ id: s.id })}>編輯</Button>
                    <ConfirmButton small copy={confirmCopy.deleteSubject(s.name)} onConfirm={() => set({ subjects: removeSubject(exam.subjects, s.id) })}>刪除</ConfirmButton>
                  </div>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p class="small muted">{fixed ? '會考不分文理組，沒有選考，不需要標示與抽離（D30）。' : '「依組別代碼決定」的科目，在步驟④用組別對照表設定誰考、誰不考。'}</p>
      </div>

      <div class="card stack">
        <div><h3>沿用上次的設定</h3><p class="small muted">新增時自動帶入，不用手動複製（D34）</p></div>
        {mode === 'off' && (
          <Alert tone="warn" action={prev && <Button small onClick={() => p.onChange(resumeCarry(doc, exam))}>恢復沿用</Button>}>
            <b>已改為不沿用</b>：② 到 ④ 都從空白開始，需要重新匯入名單、設定教室與規則。
          </Alert>
        )}
        {mode === 'none' && <Alert tone="warn">還沒有更早的「{KIND_LABEL[exam.kind].replace(/（.*）/, '')}」可以沿用，② 到 ④ 從空白開始。</Alert>}
        {mode === 'on' && prev && (
          <>
            <Alert tone="info" action={<Button small onClick={() => p.onChange(stopCarry(doc, exam))}>不沿用，從空白開始</Button>}>
              已自動帶入「<b>{prev.name}</b>」的設定，每一步都能再改，改了不影響「{prev.name}」。
            </Alert>
            <div class="scroll"><table class="t compact">
              <thead><tr><th>步驟</th><th>狀態</th><th>內容</th></tr></thead>
              <tbody>
                {carryRows(doc, exam, prev).map((r) => (
                  <tr key={r.step}><td>{r.step}</td><td><Badge {...(r.tone === 'ok' || r.tone === 'warn' ? { tone: r.tone } : {})}>{r.badge}</Badge></td><td>{r.text}</td></tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}
      </div>

      {editing && <SubjectModal exam={exam} id={editing.id} onClose={() => setEditing(null)}
        onSave={(list) => { set({ subjects: list }); setEditing(null); }} />}
    </section>
  );
}

/** 新增／編輯一科：名稱＋誰要考（原型「編輯」開視窗） */
function SubjectModal(p: { exam: ExamConfig; id: string | null; onClose: () => void; onSave: (list: Subject[]) => void }) {
  const cur = p.id ? p.exam.subjects.find((s) => s.id === p.id) : undefined;
  const [name, setName] = useState(cur?.name ?? '');
  const [who, setWho] = useState<SubjectWho>(cur ? subjectWho(p.exam.kind, cur) : 'all');
  const [err, setErr] = useState('');
  const save = () => {
    const r = saveSubject(p.exam.kind, p.exam.subjects, p.id, name, who);
    if (r.ok) p.onSave(r.list); else setErr(r.error);
  };
  return (
    <Modal title={p.id ? '編輯考科' : '新增考科'} onClose={p.onClose}
      actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" onClick={save}>儲存</Button></>}>
      <div class="stack">
        <div class={`field${err ? ' err' : ''}`}><label for="sj-name">科目名稱</label>
          <input id="sj-name" class="input" value={name} onInput={(e) => { setName(e.currentTarget.value); setErr(''); }} />
          <span class={err ? 'field-msg' : 'hint'}>{err || '必填；改過的科目會標「已自訂」'}</span></div>
        <div class="field"><label for="sj-who">誰要考</label>
          <select id="sj-who" class="input" value={who} onChange={(e) => setWho(e.currentTarget.value as SubjectWho)}>
            <option value="all">{WHO_LABEL.all}</option><option value="group">{WHO_LABEL.group}</option>
          </select>
          <span class="hint">「依組別代碼決定」的科目，在步驟④設定誰考、誰不考</span></div>
      </div>
    </Modal>
  );
}
