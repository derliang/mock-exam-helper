import { useState } from 'preact/hooks';
import { Alert, Badge, Button, EmptyState } from '../components';
import { hitLabel, lookupExaminee, searchExaminees } from '../lookup';
import { examResult, isStale } from '../seating';
import type { Doc } from '../store';
import type { StepNo } from '../seating';

/** 考生查詢（選用功能 student-lookup，H4）：輸入編號、座號、學號或姓名，看他每一科在哪間教室、哪個座位 */
export function Lookup(p: { doc: Doc; examId?: string; onGoStep: (examId: string, step: StepNo) => void; onExams: () => void }) {
  const { doc } = p;
  const withResult = doc.exams.filter((e) => examResult(doc, e));
  const [examId, setExamId] = useState(p.examId ?? withResult[withResult.length - 1]?.id ?? doc.exams[doc.exams.length - 1]?.id ?? '');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState('');
  const exam = doc.exams.find((e) => e.id === examId);

  if (!exam) {
    return (
      <section><h2>考生查詢</h2>
        <EmptyState title="還沒有模擬考" action={<Button kind="primary" onClick={p.onExams}>前往模擬考列表</Button>}>先建立模擬考並完成排座，才能查詢考生在哪個座位。</EmptyState>
      </section>
    );
  }
  const result = examResult(doc, exam);
  const header = (
    <>
      <h2>考生查詢</h2>
      {doc.exams.length > 1 && (
        <div class="field" style="max-width:360px;margin:8px 0"><label for="lk-exam">哪一次考試</label>
          <select id="lk-exam" class="input" value={examId} onChange={(e) => { setExamId(e.currentTarget.value); setPick(''); }}>
            {doc.exams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
      )}
    </>
  );

  if (!result) {
    return (
      <section>{header}
        <EmptyState title={`「${exam.name}」還沒有排座結果`} action={<Button kind="primary" onClick={() => p.onGoStep(exam.id, 5)}>先到 ⑤ 排座</Button>}>
          查詢要依排好的座位表，請先完成這次考試的排座。
        </EmptyState>
      </section>
    );
  }

  const out = searchExaminees(doc, exam, q);
  const entries = out.kind === 'found' ? out.entries : [];
  const chosen = entries.length === 1 ? entries[0] : entries.find((e) => `${e.classNo}-${e.seatNo}` === pick);
  const hit = chosen ? lookupExaminee(doc, exam, result, chosen) : null;

  return (
    <section class="stack">{header}
      {isStale(doc, exam) && <Alert tone="warn" action={<Button small onClick={() => p.onGoStep(exam.id, 5)}>到 ⑤ 重新排座</Button>}>名單或設定在排座後改過，下面的座位可能不是最新的，請到 ⑤ 重新排座。</Alert>}
      <div class="field" style="max-width:480px"><label for="lk-q">輸入考生編號、座號、學號或姓名</label>
        <input id="lk-q" class="input" type="search" autofocus value={q} placeholder="例如 0305、3 5、王小明" onInput={(e) => { setQ(e.currentTarget.value); setPick(''); }} />
        <span class="hint">考生編號 4 碼（班級＋座號）；也可打「班級 座號」或姓名的一部分。</span>
      </div>

      {out.kind === 'empty' && <EmptyState title="輸入後馬上顯示結果">例如 <b>0305</b>（3 班 5 號）、<b>3 5</b>，或姓名的一部分。</EmptyState>}
      {out.kind === 'none' && <Alert tone="warn"><b>找不到這位考生。</b>{out.hint}</Alert>}
      {entries.length > 1 && (
        <div class="card stack"><b>找到 {entries.length} 位，請選一位：</b>
          <div class="btnrow">{entries.map((e) => {
            const k = `${e.classNo}-${e.seatNo}`;
            return <Button key={k} kind={pick === k ? 'primary' : 'default'} onClick={() => setPick(k)}>{hitLabel(e, doc, exam)}</Button>;
          })}</div>
        </div>
      )}
      {hit && (
        <div class="card stack">
          <h3>{hit.className}班 {hit.seatNo} 號　{hit.name}　<Badge>{hit.code}</Badge></h3>
          {hit.allAbsent
            ? <Alert tone="info"><b>全科缺考，未排座。</b>這位考生在考試名單裡沒有任何考科，所以不佔座位。</Alert>
            : (
              <div class="scroll"><table class="t compact">
                <thead><tr><th>科目</th><th>教室／地點</th><th>座位（排－深位）</th><th>說明</th></tr></thead>
                <tbody>{hit.rows.map((r) => (
                  <tr key={r.subjectId}>
                    <td><b>{r.subject}</b></td>
                    <td>{r.place || '—'}</td>
                    <td class="num">{r.seat ?? '—'}</td>
                    <td>{r.kind === 'class' ? <span class="muted">{r.note}</span> : r.kind === 'not-taking' ? <span class="muted">{r.note}</span> : <Badge tone={r.kind.startsWith('override') ? 'info' : 'warn'}>{r.note}</Badge>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
        </div>
      )}
    </section>
  );
}
