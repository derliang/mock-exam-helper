import { Badge, Button, EmptyState, More, PageHead } from '../components';
import { examHeadcount, examLevel, examProgress, formatModified, sortExams } from '../examList';
import { examLabel, lastModified, schoolYear, type Doc } from '../store';

/** 模擬考列表（DESIGN 10.x）：頁首 h1＋資料夾 chip，每列有六格進度條、學年與人數、最後修改；依最後修改由新到舊 */
export function Exams(p: {
  doc: Doc; folder?: string; onOpen: (examId: string) => void; onNew: () => void; onSettings: () => void; onChangeFolder: () => void;
}) {
  const exams = sortExams(p.doc.exams);
  return (
    <section>
      <PageHead title="模擬考" badge={p.folder && <span class="folder-chip" title="目前使用的資料夾">{p.folder}</span>}>
        <Button onClick={p.onChangeFolder}>更換資料夾</Button>
        <Button onClick={p.onSettings}>共用設定</Button>
        <Button kind="primary" onClick={p.onNew}>新增模擬考</Button>
      </PageHead>
      {exams.length === 0 ? (
        <EmptyState title="還沒有模擬考" action={<Button kind="primary" onClick={p.onNew}>新增模擬考</Button>}>按「新增模擬考」開始。</EmptyState>
      ) : (
        <div class="exam-list">
          {exams.map((e) => {
            const pr = examProgress(p.doc, e);
            return (
              <article class="exam" key={e.id}>
                <div>
                  <h3>{e.name}</h3>
                  <div class="meta">
                    <Badge>{examLabel(e)}</Badge>
                    <span>{schoolYear(new Date(e.createdAt))} 學年・{examLevel(e)}・{examHeadcount(p.doc, e)} 人</span>
                  </div>
                </div>
                <div>
                  <div class="dots" aria-hidden="true">{pr.cells.map((c, i) => <i key={i} class={c} />)}</div>
                  <div class="prog">{pr.headline}<span class={pr.tone}>・{pr.detail}</span></div>
                  <div class="small muted" style="margin-top:4px">最後修改 {formatModified(lastModified(e))}</div>
                </div>
                <div class="row"><Button kind="primary" onClick={() => p.onOpen(e.id)}>查看／安排</Button></div>
              </article>
            );
          })}
        </div>
      )}
      <div style="margin-top:14px">
        <More title="說明：進度條怎麼看">
          <div class="plegend" aria-label="進度條圖例">
            六格＝六個步驟
            <span><i class="d" />完成</span><span><i class="s" />過期</span><span><i class="c" />目前</span><span><i class="n" />不需要</span><span><i />未開始</span>
          </div>
        </More>
      </div>
    </section>
  );
}
