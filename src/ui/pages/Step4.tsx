import type { ExamConfig, MarkMode, Track } from '../../data';
import { Alert, Badge, Button, More, Seg, StepHead } from '../components';
import { detachPreview, examEntries, examRooms, groupTable, markRows, needsMarks, setMarkChoice, type MarkRow, type StepNo } from '../seating';
import { subjectShort } from '../../core/subjectShort';
import { updateExam, type Doc } from '../store';

const TRACK: Record<Track, string> = { science: '理組', liberal: '文組' };

/** 考科名稱不拆字，只在「、」後換行（DESIGN 10.4） */
const NoBreakList = (p: { items: string[] }) => (
  <>{p.items.map((x, i) => <span key={x}>{i > 0 && <>、<wbr /></>}<span class="nb">{x}</span></span>)}</>
);

function markText(r: MarkRow): string {
  if (r.mode === 'mark-absent') return `X${subjectShort(r.subjectName)}（不考的 ${r.notTaking} 人）`;
  if (r.mode === 'mark-extra') return `＋${subjectShort(r.subjectName)}（考的 ${r.taking} 人）`;
  return r.state === 'undecided' ? '待選擇' : '不用標';
}

/** 狀態徽章三種（稿 v2.31，裁決顏色分工）：已採用系統建議（可改）綠／已鎖定中性（藍是操作色）／接近一半琥珀 */
function StateBadge(p: { r: MarkRow }) {
  if (p.r.state === 'undecided') return <Badge tone="warn">接近一半</Badge>;
  if (p.r.state === 'locked') return <Badge>已鎖定</Badge>;
  return <Badge tone="ok">已採用系統建議（可改）</Badge>;
}

/** ④ 標示與抽離規則（DESIGN 10.4、原型 v4）：組別對照表 → 各科標示（接近一半由使用者選並鎖定，D12）→ 抽離人數 */
export function Step4(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onStep: (n: StepNo) => void }) {
  const { doc, exam } = p;

  if (!needsMarks(exam)) {
    return (
      <section class="stack">
        <StepHead title="④ 標示與抽離規則" />
        <Alert tone="info"><b>會考不需要這一步。</b>國中部每科都考，沒有選考，所以沒有標示，也沒有抽離。直接前往排座。</Alert>
      </section>
    );
  }
  if (examEntries(doc, exam).length === 0) {
    return (
      <section class="stack">
        <StepHead title="④ 標示與抽離規則" />
        <Alert tone="info" action={<Button onClick={() => p.onStep(2)}>前往 ② 考試名單</Button>}>
          <b>還沒有考試名單。</b>這一步要依考試名單算出每組每科考與不考的人數，請先到 ② 匯入大考中心的考生名單。
        </Alert>
      </section>
    );
  }

  const groups = groupTable(doc, exam);
  const subjName = new Map(exam.subjects.map((s) => [s.id, s.name]));
  const rows = markRows(doc, exam);
  const shown = rows.filter((r) => r.state !== 'none');
  const allSame = rows.length - shown.length;
  const undecided = rows.filter((r) => r.state === 'undecided').length;
  const choose = (r: MarkRow, mode: MarkMode | undefined) => {
    const res = updateExam(doc, exam.id, { markRules: setMarkChoice(exam, r.track, r.subjectId, mode) });
    if (res.ok) p.onChange(res.doc);
  };
  const preview = detachPreview(doc, exam);
  const reserve = examRooms(doc, exam).filter((r) => r.kind === 'reserve');
  const roomName = new Map(reserve.map((r) => [r.id, r.name]));

  return (
    <section class="stack">
      <StepHead title="④ 標示與抽離規則" />
      {undecided
        ? <Alert tone="warn"><b>有 {undecided} 項接近一半的科目要你選。</b>選完才能排座；程式不替你決定要標哪一邊。</Alert>
        : (
          <Alert tone="ok">
            {rows.some((r) => r.state === 'auto')
              ? <><b>已採用系統建議（可改）。</b>沒有接近一半的科目；下表標「系統建議」的 {rows.filter((r) => r.state === 'auto').length} 項是程式依「標少數」自動採用的，不用逐項確認就能排座，想換標法可直接在表中改選。</>
              : <>沒有需要標示的科目，可以前往排座。</>}
          </Alert>
        )}

      {/* 稿 v2.31：學測三張卡合成一張卡三區（對照表／各科標示／抽離人數），X、＋說明收合 */}
      <div class="card stack">
        <div><h3>組別對照表</h3><p class="small muted">組別代碼對應考科；第 {(exam.round ?? 1) >= 3 ? '3、4' : '1、2'} 次的對照（跟 ① 的次別連動）。</p></div>
        <div class="scroll">
          <table class="t compact">
            <thead><tr><th>組別代碼</th><th>考科</th><th>理組人數</th><th>文組人數</th></tr></thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.code}><td><b>{g.code}</b></td><td><NoBreakList items={g.subjectIds.map((id) => subjName.get(id) ?? id)} />{g.differing > 0 && <><br /><Badge tone="warn">{g.differing} 人考科不同</Badge> <span class="small muted">（上列為人數最多的組合）</span></>}</td><td class="n">{g.science}</td><td class="n">{g.liberal}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

      <div class="psec">
        <div>
          <h3>各科標示（標少數）</h3>
          <p class="small muted">標示只由組別決定。{allSame > 0 && `全組都考或都不考的 ${allSame} 項不用標示，未列出。`}</p>
          <More title="說明：X 與 ＋ 的意思">與特殊生需求無關；被標「X」的人抽離自習，被標「＋」的人抽離考試。英聽不標示。</More>
        </div>
        {shown.length === 0
          ? <Alert tone="ok">每一組每一科都是全考或全不考，不用標示，也沒有人要抽離。</Alert>
          : (
            <div class="scroll">
              <table class="t compact">
                <thead><tr><th>組</th><th>科目</th><th>考</th><th>不考</th><th>座位表標示</th><th>狀態</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={`${r.track}/${r.subjectId}`}>
                      <td>{r.track ? TRACK[r.track] : '全部'}</td><td><b>{r.subjectName}</b></td>
                      <td class="n">{r.taking}</td><td class="n">{r.notTaking}</td><td>{markText(r)}</td><td><StateBadge r={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        {rows.filter((r) => r.nearHalf).map((r) => (
          <div class="stack" style="gap:8px" key={`near-${r.track}/${r.subjectId}`}>
            <Alert tone={r.state === 'undecided' ? 'warn' : 'info'}>
              <b>{r.track ? TRACK[r.track] : ''}「{r.subjectName}」：</b>考 {r.taking} 人、不考 {r.notTaking} 人，接近一半。請選要標哪一邊，選完會鎖定，不由程式替你決定。{r.state === 'locked' && r.mode && <><br />已鎖定：標「{r.mode === 'mark-absent' ? 'X' : '＋'}{subjectShort(r.subjectName)}」。</>}
            </Alert>
            <div class="btnrow">
              <Seg<MarkMode | ''>
                label={`${r.track ? TRACK[r.track] : ''}${r.subjectName}要標哪一邊`}
                value={r.state === 'locked' && r.mode ? r.mode : ''}
                onChange={(v) => choose(r, v || undefined)}
                options={[
                  { value: 'mark-absent', label: `標「X${subjectShort(r.subjectName)}」不考的 ${r.notTaking} 人` },
                  { value: 'mark-extra', label: `標「＋${subjectShort(r.subjectName)}」考的 ${r.taking} 人` },
                ]}
              />
              {r.state === 'locked' && <Button kind="ghost" small onClick={() => choose(r, undefined)}>解除鎖定</Button>}
            </div>
          </div>
        ))}
      </div>

      <div class="psec">
        <div><h3>抽離人數</h3><p class="small muted">標示一變，這裡立即重算。抽離考試的人依序排進 ③ 勾選的預備教室；抽離自習只出名單。</p></div>
        {!preview.ok
          ? (
            <Alert tone="danger" action={<Button onClick={() => p.onStep(3)}>前往 ③ 教室設定</Button>}>
              <b>抽離排不下：</b>{preview.errors.join('；')}。<br />請到 ③ 多勾一間預備教室、加大預備教室的座位，或回上面改標示的方式。
            </Alert>
          )
          : (
            <div class="scroll">
              <table class="t compact">
                <thead><tr><th>科目</th><th>抽離考試</th><th>抽離自習</th>{preview.special.length > 0 && <th>單人特例</th>}</tr></thead>
                <tbody>
                  {exam.subjects.map((s) => {
                    const ex = preview.detaches.filter((d) => d.subjectId === s.id && d.purpose === 'exam');
                    const st = preview.detaches.filter((d) => d.subjectId === s.id && d.purpose === 'study').length;
                    const sp = preview.special.filter((d) => d.subjectId === s.id).length;
                    const where = [...new Set(ex.map((d) => roomName.get(d.roomId) ?? d.roomId))];
                    return (
                      <tr key={s.id}>
                        <td><b>{s.name}</b></td>
                        <td>{ex.length} 人{where.length > 0 && <span class="muted small">（{where.join('、')}）</span>}</td>
                        <td>{st} 人</td>{preview.special.length > 0 && <td>{sp ? `${sp} 人` : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        {exam.kind === 'gsat' && <p class="small muted">國文標示整個一起：國綜、國寫兩節一起抽離（節次見共用設定「節次與時長」）。</p>}
        <div class="row"><Button onClick={() => p.onStep(5)}>查看預備教室與抽離</Button></div>
      </div>
      </div>
    </section>
  );
}
