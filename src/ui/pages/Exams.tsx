import { useState } from 'preact/hooks';
import type { ExamKind } from '../../data';
import { Alert, Badge, Button, EmptyState, Modal, Seg } from '../components';
import { checkExamName } from '../flow';
import { KIND_LABEL, newExam, type Doc } from '../store';

export function Exams(p: { doc: Doc; onChange: (d: Doc) => void; onOpen: (examId: string) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section>
      <div class="btnrow" style="justify-content:space-between">
        <h2>模擬考列表</h2>
        <Button kind="primary" onClick={() => setAdding(true)}>新增模擬考</Button>
      </div>
      {p.doc.exams.length === 0 && (
        <div style="margin-top:12px"><EmptyState title="還沒有模擬考" action={<Button kind="primary" onClick={() => setAdding(true)}>建立第一次模擬考</Button>}>
          建議流程：先到上方「設定」確認班級、學生名單與教室，再回來新增模擬考，依序做完六個步驟。以後新增時會帶入上一次的設定。
        </EmptyState></div>
      )}
      <div class="exam-list" style="margin-top:12px">
        {p.doc.exams.map((e) => (
          <article class="exam" key={e.id}>
            <div>
              <h3>{e.name}</h3>
              <div class="meta"><Badge>{KIND_LABEL[e.kind]}</Badge><span>{e.division === 'senior' ? '高中部' : '國中部'}</span></div>
            </div>
            <span />
            <Button kind="primary" onClick={() => p.onOpen(e.id)}>開啟</Button>
          </article>
        ))}
      </div>
      {adding && <NewExam doc={p.doc} onClose={() => setAdding(false)} onCreate={(d) => { p.onChange(d); setAdding(false); }} />}
    </section>
  );
}

function NewExam(p: { doc: Doc; onClose: () => void; onCreate: (d: Doc) => void }) {
  const [kind, setKind] = useState<ExamKind>('gsat');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [touched, setTouched] = useState(false);
  const check = checkExamName(p.doc, name);
  const submit = () => {
    setTouched(true);
    if (!check.ok) return;
    const r = newExam(p.doc, kind, name, new Date());
    if (r.ok) p.onCreate(r.doc); else setErr(r.error);
  };
  return (
    <Modal title="新增模擬考" onClose={p.onClose} actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" disabled={touched && !check.ok} onClick={submit}>建立</Button></>}>
      <div class="field"><span class="label">類型</span>
        <Seg<ExamKind> label="考試類型" value={kind} onChange={(k) => { setKind(k); setErr(''); }}
          options={[{ value: 'gsat', label: '學測（高中部）' }, { value: 'ast', label: '分科（即將推出）', disabled: true }, { value: 'bcct', label: '會考（國中部）' }]} />
      </div>
      <div class="field" style="margin-top:12px"><label for="exam-name">名稱</label>
        <input id="exam-name" class={`input${touched && !check.ok ? ' err' : ''}`} value={name} placeholder="例如：學測第三次" aria-invalid={touched && !check.ok} aria-describedby="exam-name-msg" onInput={(e) => { setName(e.currentTarget.value); setTouched(true); }} />
        <span id="exam-name-msg" class={touched && !check.ok ? 'field-msg' : 'hint'}>{touched && !check.ok ? check.message : '用來區分每一次考試，之後可在列表看到。'}</span>
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}
    </Modal>
  );
}
