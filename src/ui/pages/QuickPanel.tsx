import { useState } from 'preact/hooks';
import type { ExamConfig } from '../../data';
import { Alert, Badge, Button } from '../components';
import { flowOf } from '../flow';
import { parsePasted, quickCheck, type QuickCheck } from '../quickMode';
import { reseat } from '../seating';
import type { Doc } from '../store';

const MARK = { ok: '✓', fail: '✗', pending: '…' } as const;
const Checks = (p: { checks: QuickCheck[] }) => (
  <ul class="nextlist" aria-label="快速模式檢查">{p.checks.map((c) => <li key={c.key}>{MARK[c.state]} {c.text}</li>)}</ul>
);

/** ② 考試名單頁下方的「會考快速模式」（選用功能 bcct-quick-mode，H7）：沿用上次、貼上名單、看檢核、下載 */
export function QuickPanel(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep?: (n: 1 | 2 | 3 | 4 | 5 | 6) => void }) {
  const { doc, exam } = p;
  const [text, setText] = useState('');
  const [tried, setTried] = useState<ReturnType<typeof quickCheck> | null>(null);
  const [applied, setApplied] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const base = quickCheck(doc, exam);

  const run = () => {
    const input = parsePasted(exam, doc.settings.classes.filter((c) => c.division === exam.division).map((c) => c.name), text);
    if (!input) { setErrs(['請先貼上考試名單（從 Excel 複製整張表，含表頭）。']); return; }
    const res = quickCheck(doc, exam, input);
    setTried(res);
    setErrs([]);
    if (res.status !== 'passed') return;
    const files = doc.examFiles?.[exam.id] ?? {};
    const next: Doc = { ...doc, examFiles: { ...doc.examFiles, [exam.id]: { ...files, entries: input.entries, diffs: [] } } };
    const r = reseat(next, exam, new Date().toISOString());
    if (r.ok) p.onChange(r.doc); else { p.onChange(next); setErrs(r.errors ?? [r.error]); }
    setApplied(true);
  };

  const flow = flowOf(doc, exam, 2);
  return (
    <section class="card stack" aria-label="會考快速模式">
      <h3>會考快速模式 <Badge tone="info">選用</Badge></h3>
      {base.status === 'unavailable' ? (
        <Alert tone="info"><b>這次不能用快速模式，請照一般六步驟做。</b>原因：<Checks checks={base.checks.filter((c) => c.state === 'fail')} /></Alert>
      ) : (
        <>
          <p class="small muted">沿用「{base.previous?.name}」的設定。貼上這次的考試名單，四項檢查都過，就會直接用它取代本次的考試名單並自動排座；請看過檢核結果再下載。</p>
          <Checks checks={(tried ?? base).checks} />
          {tried?.status === 'unavailable' && (
            <Alert tone="warn"><b>退回一般六步驟：</b>{tried.checks.filter((c) => c.state === 'fail').map((c) => c.text).join('　')}請改用上面的「匯入本次考試名單」，逐步處理。</Alert>
          )}
          {!applied && (
            <>
              <div class="field"><label for="qm-paste">貼上考試名單</label>
                <textarea id="qm-paste" class="input" rows={6} value={text} placeholder="從 Excel 複製整張表（含表頭）後貼在這裡" onInput={(e) => setText(e.currentTarget.value)} />
              </div>
              <div class="btnrow"><Button kind="primary" onClick={run}>檢查，並更新名單與排座</Button></div>
            </>
          )}
          {errs.length > 0 && <Alert tone="danger"><ul>{errs.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
          {applied && (
            <div class="stack">
              <p class="small">其餘步驟：① 考試設定、③ 教室、④ 標示、⑤ 排座　<Badge>沿用上次</Badge></p>
              {flow.issues.length === 0
                ? <Alert tone="ok" action={<Button small kind="primary" onClick={() => p.onStep?.(6)}>前往 ⑥ 下載</Button>}><b>檢核全部通過。</b>考生 {flow.summary.students}、座位 {flow.summary.seats}，可以前往下載。</Alert>
                : flow.issues.map((i) => (
                  <Alert key={i.text} tone="warn" action={<Button small onClick={() => p.onStep?.(i.step)}>{i.fix}</Button>}>{i.text}</Alert>
                ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
