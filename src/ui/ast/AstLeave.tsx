/** ③ 最下面：請假（AST-3；DESIGN 10.19、H-10、H-11）。只用來估算自習人數；容量檢核與排座仍用報名全數，定案後不自動改動。 */
import type { ExamConfig } from '../../data';
import { clampLeave, estimateStudy } from '../../core/astD99/release';
import { Alert, Seg } from '../components';
import { updateExam, type Doc } from '../store';
import { astCapacity, astPlan } from './model';

export function LeaveCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const plan = astPlan(doc, exam);
  const leave = exam.astLeave ?? { mode: 'estimate' as const, byClass: {} };
  const classes = doc.settings.classes.filter((c) => c.division === exam.division);
  const sizes = new Map<number, number>();
  for (const s of plan?.input.students ?? []) sizes.set(s.classNo, (sizes.get(s.classNo) ?? 0) + 1);
  const byClass = clampLeave(leave.byClass, sizes);
  const rows = plan && !plan.infeasible ? estimateStudy(plan.input, plan.out, byClass) : [];
  const maxAll = rows.reduce((m, r) => Math.max(m, r.enrolled), 0);
  const maxEst = rows.reduce((m, r) => Math.max(m, r.estimated), 0);
  const total = Object.values(byClass).reduce((a, b) => a + b, 0);
  const cap = astCapacity(doc, exam, plan).study.capacity;
  const patch = (x: Partial<NonNullable<ExamConfig['astLeave']>>): void => {
    const r = updateExam(doc, exam.id, { astLeave: { ...leave, ...x } });
    if (r.ok) p.onChange(r.doc);
  };
  const step = (no: number, d: number): void => {
    const n = Math.min(sizes.get(no) ?? 0, Math.max(0, (byClass[String(no)] ?? 0) + d));
    patch({ byClass: { ...byClass, [String(no)]: n } });
  };
  return (
    <div class="card stack">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap">
        <div><h3>請假（{leave.mode === 'estimate' ? '預估' : '實際'}）</h3><p class="small muted">定案前可以輸入預估或實際請假，<b>只用來估算自習人數</b>。排座與容量檢核仍以報名全數計算，<b>不會因為「應該有人請假」多排人進去</b>；定案後輸入請假也不自動改動已排好的座位與版本。</p></div>
        <Seg<'estimate' | 'actual'> label="請假資料種類" value={leave.mode} onChange={(v) => patch({ mode: v })} options={[{ value: 'estimate', label: '預估' }, { value: 'actual', label: '實際' }]} />
      </div>
      {!plan || plan.infeasible
        ? <Alert tone="info">還有名單或教室沒設好，先完成上面的設定；請假人數仍可先輸入。</Alert>
        : (
          <div class="stats">
            <div><small>請假合計</small><strong>{total} 人</strong></div>
            <div><small>最多一個時段自習（報名全數）</small><strong>{maxAll} 人</strong></div>
            <div><small>扣請假後估算</small><strong>{maxEst} 人</strong></div>
            <div class={maxAll > cap ? 'bad' : ''}><small>綜合教室自習容量</small><strong>{cap} 位</strong></div>
          </div>
        )}
      <div class="scroll">
        <table class="t compact">
          <thead><tr><th>班級</th><th>報名人數</th><th>請假人數</th></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.no}>
                <td><b>{c.name}班</b></td>
                <td class="n">{sizes.get(c.no) ?? 0}</td>
                <td>
                  <div class="stepper">
                    <button type="button" class="icon-btn" aria-label={`${c.name}班請假減一`} disabled={(byClass[String(c.no)] ?? 0) <= 0} onClick={() => step(c.no, -1)}>−</button>
                    <output>{byClass[String(c.no)] ?? 0}</output>
                    <button type="button" class="icon-btn" aria-label={`${c.name}班請假加一`} disabled={(byClass[String(c.no)] ?? 0) >= (sizes.get(c.no) ?? 0)} onClick={() => step(c.no, 1)}>＋</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details class="more"><summary>說明：估算怎麼算</summary><div>每班自習人數按「請假人數佔全班的比例」扣掉一部分（無條件進位，所以不會比報名全數多），只是讓你看到實際大概有幾個人在自習；容量檢核與替代方案提示仍用全數，所以不會讓座位或自習教室被少算。</div></details>
    </div>
  );
}
