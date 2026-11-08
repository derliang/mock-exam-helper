import { useState } from 'preact/hooks';
import type { ExamConfig, Participation, Semester } from '../../data';
import { Alert, Badge, Button, ConfirmButton, Seg } from '../components';
import { confirmCopy } from '../flow';
import { updateExam, KIND_LABEL, type Doc } from '../store';
import { addSubject, defaultSubjects, isCustomized, removeSubject, renameSubject } from '../subjects';

/** ① 考試設定：名稱、學期、次別、參加方式、考科表（會考固定七科不可改，DESIGN 10.4） */
export function Step1(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { exam } = p;
  const [err, setErr] = useState('');
  const [newName, setNewName] = useState('');
  const set = (patch: Partial<ExamConfig>) => {
    const r = updateExam(p.doc, exam.id, patch);
    if (r.ok) { setErr(''); p.onChange(r.doc); } else setErr(r.error);
  };
  const fixed = exam.kind === 'bcct';
  const setRound = (round: number) =>
    // 次別改變時，若考科表沒被自訂過就重新帶入預設（D52）；自訂過的保留
    set({ round, ...(isCustomized(exam.subjects) ? {} : { subjects: defaultSubjects(exam.kind, round) }) });

  return (
    <section>
      <h2>① 考試設定</h2>
      <div class="formgrid" style="margin-top:12px">
        <div class="field"><label for="x-name">名稱</label>
          <input id="x-name" class="input" value={exam.name} onChange={(e) => set({ name: e.currentTarget.value })} /><span class="hint">{KIND_LABEL[exam.kind]}</span></div>
        <div class="field"><span class="label">學期</span>
          <Seg<Semester> label="學期" value={exam.semester} onChange={(v) => set({ semester: v })} options={[{ value: 'first', label: '上學期' }, { value: 'second', label: '下學期' }]} /></div>
        {exam.kind === 'gsat' && (
          <div class="field"><span class="label">次別</span>
            <Seg<string> label="次別" value={String(exam.round ?? 1)} onChange={(v) => setRound(Number(v))}
              options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `第 ${n} 次` }))} />
            <span class="hint">第 1、2 次數學為單一科並考英聽；第 3、4 次數學分 A、B</span></div>
        )}
        <div class="field"><span class="label">參加方式</span>
          <Seg<Participation> label="參加方式" value={exam.participation} onChange={(v) => set({ participation: v })} options={[{ value: 'all', label: '全員參加' }, { value: 'partial', label: '部分參加' }]} /></div>
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}

      <h3 style="margin-top:20px">考科表 {isCustomized(exam.subjects) && <Badge tone="warn">已自訂</Badge>}</h3>
      {fixed && <p class="muted small">會考固定七科，不可新增、編輯、刪除。</p>}
      <div style="overflow-x:auto"><table class="t">
        <thead><tr><th>科目</th>{!fixed && <th />}</tr></thead>
        <tbody>
          {exam.subjects.map((s) => (
            <tr key={s.id}>
              <td>{fixed ? s.name : <input class="input" aria-label="科目名稱" value={s.name} onChange={(e) => set({ subjects: renameSubject(exam.subjects, s.id, e.currentTarget.value) })} />}</td>
              {!fixed && <td><ConfirmButton small copy={confirmCopy.deleteSubject(s.name)} onConfirm={() => set({ subjects: removeSubject(exam.subjects, s.id) })}>刪除</ConfirmButton></td>}
            </tr>
          ))}
        </tbody>
      </table></div>
      {!fixed && (
        <div class="btnrow" style="margin-top:12px">
          <input class="input" style="max-width:240px" aria-label="新科目名稱" placeholder="新增科目" value={newName} onInput={(e) => setNewName(e.currentTarget.value)} />
          <Button onClick={() => { set({ subjects: addSubject(exam.subjects, newName) }); setNewName(''); }}>新增科目</Button>
          <ConfirmButton kind="default" copy={confirmCopy.resetSubjects()} onConfirm={() => set({ subjects: defaultSubjects(exam.kind, exam.round) })}>還原預設</ConfirmButton>
        </div>
      )}
    </section>
  );
}
