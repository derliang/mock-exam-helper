import { useState } from 'preact/hooks';
import type { ExamKind, Semester } from '../../data';
import { Alert, Button } from '../components';
import { checkExamName } from '../flow';
import { defaultSemester, newExam, previousExam, schoolYear, suggestExamName, type Doc } from '../store';

const TYPES: { kind: ExamKind; level: string; title: string; subj: string; soon?: boolean }[] = [
  { kind: 'gsat', level: '高中部', title: '學測模擬考', subj: '國、英、數（第 3 次起分數 A、數 B）、自然、社會' },
  { kind: 'ast', level: '高中部', title: '分科模擬考', subj: '數學甲、數學乙、物理、化學、生物、歷史、地理、公民與社會；每科都是選考，國英不加考' },
  { kind: 'bcct', level: '國中部', title: '會考模擬考', subj: '國文、英語閱讀、英語聽力、數學、社會、自然、寫作測驗（固定七科），沒有選考' },
];

/** 新增模擬考整頁三段式：1 選類型、2 基本資料、3 預設設定（沿用上一次同類型） */
export function NewExam(p: { doc: Doc; onCancel: () => void; onCreate: (d: Doc, examId: string) => void; now?: () => Date }) {
  const now = p.now ?? (() => new Date());
  const [kind, setKind] = useState<ExamKind>('gsat');
  const [name, setName] = useState(() => suggestExamName(p.doc, 'gsat', (p.now ?? (() => new Date()))()));
  // 使用者沒自己改過名稱時，換類型就跟著換建議名稱
  const [edited, setEdited] = useState(false);
  const [semester, setSemester] = useState<Semester>(defaultSemester('gsat'));
  // 使用者沒自己改過學期時，換類型就跟著換預設學期（D91）
  const [semEdited, setSemEdited] = useState(false);
  const [err, setErr] = useState('');
  const check = checkExamName(p.doc, name);
  const prev = previousExam(p.doc, kind);
  const isJ = kind === 'bcct';

  const pick = (k: ExamKind) => {
    setKind(k); setErr('');
    if (!edited) setName(suggestExamName(p.doc, k, now()));
    if (!semEdited) setSemester(defaultSemester(k));
  };
  const submit = () => {
    if (!check.ok) return;
    const t = now();
    const r = newExam(p.doc, kind, name, t, { semester, ...(prev ? { prev } : {}) });
    if (!r.ok) { setErr(r.error); return; }
    p.onCreate(r.doc, r.doc.exams[r.doc.exams.length - 1]!.id);
  };

  return (
    <section>
      <div class="pagehead"><Button kind="ghost" onClick={p.onCancel}>← 回模擬考列表</Button></div>
      <div class="stack" style="max-width:860px">
        <div><h1>新增模擬考</h1><p class="muted">先選類型，類型決定科目表、組別對照表和標示規則。</p></div>

        <div class="card stack"><div class="lab">1　選類型</div>
          <div class="typegrid">
            {TYPES.map((t) => {
              const on = !t.soon && kind === t.kind;
              return (
                <button type="button" key={t.kind} class="tcard" aria-pressed={on} disabled={t.soon} aria-disabled={t.soon} onClick={() => pick(t.kind)}>
                  <span class="lv">{t.level}</span><strong>{t.title}</strong><span class="subj">{t.subj}</span>
                  {t.soon ? <span class="tick badge b-soon">尚未開放</span> : on ? <span class="tick badge b-acc">已選</span> : null}
                </button>
              );
            })}
          </div>
          <p class="small muted">高中部：學測、分科；國中部：會考。</p>
        </div>

        <div class="card stack"><div class="lab">2　基本資料</div>
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))">
            <div class={`field${!check.ok ? ' err' : ''}`}><label for="exam-name">模擬考名稱</label>
              <input id="exam-name" class="input" value={name} aria-invalid={!check.ok} onInput={(e) => { setName(e.currentTarget.value); setEdited(true); }} />
              <span class={check.ok ? 'hint' : 'field-msg'}>{check.ok ? '資料夾名稱會用這個名稱' : check.message}</span></div>
            <div class="field"><label for="exam-term">學期</label>
              <select id="exam-term" class="input" value={semester} onChange={(e) => { setSemester(e.currentTarget.value as Semester); setSemEdited(true); }}>
                <option value="first">上學期</option><option value="second">下學期</option>
              </select>
              <span class="hint">學年度依今天的日期自動算：{schoolYear(now())} 學年</span></div>
            <div class="field"><span class="label">對象</span>
              <div class="input" style="display:flex;align-items:center">{isJ ? '國三' : '高三'}</div>
              <span class="hint">由類型決定</span></div>
          </div>
        </div>

        <div class="card stack"><div class="lab">3　預設設定</div>
          {prev
            ? <Alert tone="info"><b>會帶入「{prev.name}」的設定</b>：教室、{isJ ? '' : '標示與抽離規則、'}參加方式、標籤格式與自訂考科。每一步都能再改，改了不影響舊的模擬考。</Alert>
            : <Alert tone="warn">還沒有同類型的模擬考，所有步驟從空白開始。</Alert>}
          {isJ && <Alert tone="info">會考不需要標示與抽離，步驟④會顯示「不需要」。</Alert>}
        </div>

        {err && <Alert tone="danger">{err}</Alert>}
        <div class="btnrow" style="justify-content:flex-end">
          <Button onClick={p.onCancel}>取消</Button>
          <Button kind="primary" disabled={!check.ok} onClick={submit}>建立並開始</Button>
        </div>
      </div>
    </section>
  );
}
