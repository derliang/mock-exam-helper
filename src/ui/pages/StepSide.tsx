import { subjectShort } from '../../core/subjectShort';
import type { ExamConfig } from '../../data';
import { Alert } from '../components';
import { examClasses, markRows, seatableEntries } from '../seating';
import { examLabel, schoolYear, type Doc } from '../store';
import { mathSplit } from '../subjects';

/** 右側欄（原型 v1side／v4side）：只有 ① 與 ④ 有，其餘步驟沒有右側欄（原型 stepView） */
export function hasSide(step: number, kind?: string): boolean { return step === 1 || (step === 4 && kind !== 'ast'); }

export function StepSide(p: { step: number; doc: Doc; exam: ExamConfig }) {
  return p.step === 1 ? <Side1 {...p} /> : p.step === 4 ? <Side4 {...p} /> : null;
}

/** ① 本次摘要、這一步會影響 */
function Side1(p: { exam: ExamConfig }) {
  const { exam } = p;
  const term = exam.semester === 'second' ? '下' : '上';
  const stale = exam.kind === 'gsat' && exam.subjects.some((x) => x.id === 'math') === mathSplit(exam.round);
  return (
    <>
      <div class="card stack">
        <div class="lab">本次摘要</div>
        <div class="stats side-stats">
          <div><small>考科</small><strong>{exam.subjects.length}</strong></div>
          <div><small>學期</small><strong>{term}學期</strong></div>
        </div>
        <p class="small muted">{examLabel(exam)}・{schoolYear(new Date(exam.createdAt))} 學年・{exam.division === 'senior' ? '高三' : '國三'}</p>
      </div>
      <div class="card stack">
        <div class="lab">這一步會影響</div>
        <p class="small muted">② 考試名單比對的科目欄<br />④ 組別對照表的科目<br />⑥ 下載檔案的標題與科目</p>
        {stale && <Alert tone="warn">次別改了，④ 已標為過期。</Alert>}
      </div>
    </>
  );
}

/** ④ 待處理、範例標示（B4 小標籤與 A3 大標籤，依實際尺寸等比例） */
function Side4(p: { doc: Doc; exam: ExamConfig }) {
  const { doc, exam } = p;
  if (exam.kind === 'bcct') {
    return <div class="card stack"><div class="lab">說明</div><p class="small muted">會考沒有選考，這一步顯示「不需要」。</p></div>;
  }
  const rows = markRows(doc, exam);
  const undecided = rows.filter((r) => r.state === 'undecided').length;
  const sample = rows.find((r) => r.mode === 'mark-absent' || r.mode === 'mark-extra');
  // A-9：範例挑一位真的被這個標示標到的考生（X＝這科不考的人、＋＝加考這科的人）；挑不到才用第一位，標示字樣仍保留
  const all = seatableEntries(doc, exam);
  const marked = sample && all.find((e) => (sample.mode === 'mark-absent') !== e.subjectIds.includes(sample.subjectId) && (!sample.track || e.track === sample.track));
  const stu = marked ?? all[0];
  const cls = stu && examClasses(doc, exam).find((c) => c.no === stu.classNo);
  const mark = sample ? `${sample.mode === 'mark-absent' ? 'X' : '＋'}${subjectShort(sample.subjectName)}` : '';
  const code = stu ? `${String(stu.classNo).padStart(2, '0')}${String(stu.seatNo).padStart(2, '0')}` : '';
  const papers = [{ p: 'B4', kind: '小標籤', w: 250, h: 353 }, { p: 'A3', kind: '大標籤', w: 297, h: 420 }];
  const sheetW = (w: number) => (w / 6) * 2.4;
  return (
    <>
      <div class="card stack">
        <div class="lab">待處理</div>
        {undecided
          ? <Alert tone="warn">有 {undecided} 項接近一半的科目要選。</Alert>
          : <Alert tone="ok">沒有要選的項目。</Alert>}
      </div>
      <div class="card stack">
        <div class="lab">範例標示</div>
        <div class="lprev">
          {papers.map((x) => (
            <figure key={x.p}>
              <div class="lprev-box" style={`width:${sheetW(x.w).toFixed(1)}px;height:${((x.h / 8) * 2.4).toFixed(1)}px`}>
                <div class="lsheet-one" style={`width:${(x.w * 2.4).toFixed(1)}px;height:${(x.h * 2.4).toFixed(1)}px`}>
                  <div class="lprev-cell" style={`width:${sheetW(x.w).toFixed(1)}px;height:${((x.h / 8) * 2.4).toFixed(1)}px`}>
                    {stu && cls && (
                      <div class={`lcell${mark ? (mark.startsWith('X') ? ' mk-x sp' : ' mk-add sp') : ''}`}>
                        <span class="co">1-1</span>
                        <span class="no">{code}</span>
                        <span class="nm"><span class="tag-c">{cls.name[0]}</span>{stu.name}</span>
                        {mark && <span class="mks"><span class="mk">{mark}</span></span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <figcaption><b>{x.p}</b>（{x.kind}）<br />{(x.w / 6).toFixed(1)}×{(x.h / 8).toFixed(1)} mm</figcaption>
            </figure>
          ))}
        </div>
        <p class="small muted">標籤上的樣子（用文字加粗框）。兩張依實際尺寸等比例並排：A3 的格子比 B4 大約寬 19%、高 19%。座位表另外使用班級底色，其餘相同，只是不分紙張。</p>
      </div>
    </>
  );
}
