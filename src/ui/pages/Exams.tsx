import { useState } from 'preact/hooks';
import type { ExamKind } from '../../data';
import { Alert, Badge, Button, Modal, Seg } from '../components';
import { KIND_LABEL, newExam, type Doc } from '../store';

export function Exams(p: { doc: Doc; onChange: (d: Doc) => void; onOpen: (examId: string) => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <section>
      <div class="btnrow" style="justify-content:space-between">
        <h2>模擬考列表</h2>
        <Button kind="primary" onClick={() => setAdding(true)}>新增模擬考</Button>
      </div>
      {p.doc.exams.length === 0 && <p class="muted" style="margin-top:12px">還沒有模擬考。按「新增模擬考」開始；新增時會自動帶入上一次的設定。</p>}
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
  const submit = () => {
    const r = newExam(p.doc, kind, name, new Date());
    if (r.ok) p.onCreate(r.doc); else setErr(r.error);
  };
  return (
    <Modal title="新增模擬考" onClose={p.onClose} actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" onClick={submit}>建立</Button></>}>
      <div class="field"><span class="label">類型</span>
        <Seg<ExamKind> label="考試類型" value={kind} onChange={(k) => { setKind(k); setErr(''); }}
          options={[{ value: 'gsat', label: '學測（高中部）' }, { value: 'ast', label: '分科（即將推出）', disabled: true }, { value: 'bcct', label: '會考（國中部）' }]} />
      </div>
      <div class="field" style="margin-top:12px"><label for="exam-name">名稱</label>
        <input id="exam-name" class="input" value={name} placeholder="例如：學測第三次" onInput={(e) => setName(e.currentTarget.value)} />
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}
    </Modal>
  );
}
