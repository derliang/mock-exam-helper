/**
 * 步驟③「預備教室排座與標籤」卡（稿 v2.22，校-56；D94-4、D94-5）：
 * 上半＝預備教室排座方式（① 同學優先〔預設〕、② 監考優先）；模式 ① 排出來同班沒有遞增時顯示警告（不擋下載）。
 * 下半＝合併標籤（範例）：每座位一張、每節一行、印節次＋科目＋班座號、不印時間。
 */
import type { ExamConfig } from '../../data';
import { detachPreview, reserveModeOf } from '../seating';
import { updateExam, type Doc } from '../store';

export function PrepCard(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const m = reserveModeOf(exam);
  const set = (v: 'peer' | 'proctor') => {
    const r = updateExam(doc, exam.id, { reserveSeatMode: v });
    if (r.ok) p.onChange(r.doc);
  };
  const preview = m === 'peer' ? detachPreview(doc, exam) : null;
  const warnings = preview?.ok ? preview.warnings ?? [] : [];
  return (
    <div class="card stack">
      <div><h3>預備教室排座與標籤</h3><p class="small muted">加考的同學去預備教室時，座位怎麼排，以及標籤長什麼樣子。</p></div>
      <div class="stack" style="gap:8px">
        <div><h4 class="sh">排座方式</h4><p class="small muted">兩種都可以選，預設「同學優先」。</p></div>
        <div class="pmode" role="group" aria-label="預備教室排座方式">
          <button type="button" class="opt" aria-pressed={m === 'peer'} onClick={() => set('peer')}>
            <b>① 同學優先（預設）</b>
            <span class="small muted">同一個人每一節盡量坐同一個座位；同班盡量照編號由前往後排、每排輪替，方便貼標籤。同班遞增是「盡量」，排不到時只警告、不擋下載。</span>
          </button>
          <button type="button" class="opt" aria-pressed={m === 'proctor'} onClick={() => set('proctor')}>
            <b>② 監考優先</b>
            <span class="small muted">盡量讓同班坐在一起，方便監考；同學不保證每節同一個座位。同班座號一定由小到大，不會有遞增警告。</span>
          </button>
        </div>
        {warnings.length > 0 && (
          <div class="alert a-warn" role="status">
            <span aria-hidden="true">⚠</span>
            <div>
              <b>同班座號沒有遞增（模式 ① 才會出現，學測）：</b>
              {warnings.slice(0, 3).map((w) => <span key={w}>{w}。</span>)}
              {warnings.length > 3 && <span class="small muted">…共 {warnings.length} 項。</span>}
              這是為了讓同一個人每個時段都坐同一格，不影響下載。<span class="small muted">想要同班座號一定遞增，請改用模式 ②（監考優先）；改了之後同一個人不保證每個時段坐同一格。</span>
            </div>
            <button type="button" class="btn btn-sm" onClick={() => set('proctor')}>改用模式 ②</button>
          </div>
        )}
      </div>
      <div class="psec">
        <div class="stack">
          <div><h4 class="sh">合併標籤（範例）</h4><p class="small muted">預備教室每個座位一張。同一個座位在不同節由不同人使用時，各節列在同一張，只貼一次；每節一行、同字級，印「節次＋科目＋班座號」，不印時間。抽離自習不排座位、不印標籤，只出名單。</p></div>
          <div class="plbls">
            <div class="plbl"><div class="plh"><span>備一</span><span>座位 1-1</span></div><div class="pl"><small>第二天 時段一</small><span>歷史　勤 07</span></div></div>
            <div class="plbl"><div class="plh"><span>備一</span><span>座位 1-2</span></div><div class="pl"><small>第一天 時段一</small><span>物理　勇 12</span></div><div class="pl"><small>第二天 時段三</small><span>數乙　勇 12</span></div></div>
            <div class="plbl"><div class="plh"><span>備一</span><span>座位 2-1</span></div><div class="pl"><small>第一天 時段二</small><span>化學　誠 03</span></div><div class="pl"><small>第二天 時段二</small><span>地理　勤 21</span></div></div>
          </div>
          <p class="small muted">第 2 張：同一個人（勇班 12 號）跨節坐同一格。第 3 張：兩個不同的人共用同一格。</p>
        </div>
      </div>
    </div>
  );
}
