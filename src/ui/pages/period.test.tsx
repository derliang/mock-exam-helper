import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { demoDoc } from '../repository';
import { newExam } from '../store';
import { SchedulePanel } from './SchedulePanel';
import { Step3 } from './Step3';
import { Step6 } from './Step6';

const noop = () => undefined;

describe('節次與預備教室排座（校-55、56、64）', () => {
  it('設定「節次與時長」：列出預設表、節次編號依順序、可還原', () => {
    const html = renderToString(<SchedulePanel doc={demoDoc()} onChange={noop} />);
    for (const t of ['節次與時長', '第 1 節', '英文', '英聽', '與上一科同節', '學測 第 1、2 次', '國文：整個一起標']) expect(html).toContain(t);
  });
  it('③ 有「預備教室排座與標籤」卡，兩種排座方式，預設同學優先', () => {
    const r = newExam(demoDoc(), 'gsat', '學測第一次', new Date('2026-09-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    const html = renderToString(<Step3 doc={r.doc} exam={r.doc.exams[0]!} onChange={noop} />);
    expect(html).toContain('預備教室排座與標籤');
    expect(html).toContain('① 同學優先（預設）');
    expect(html).toContain('② 監考優先');
    expect(html).toMatch(/aria-pressed="true"[^>]*><b>① 同學優先/);
  });
  it('⑥ 排座過期：琥珀橫幅、下載鈕停用', () => {
    const r = newExam(demoDoc(), 'gsat', '學測第一次', new Date('2026-09-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    const html = renderToString(<Step6 doc={r.doc} exam={r.doc.exams[0]!} stale onGoStep={noop} />);
    expect(html).toContain('排座結果過期，下載已停用');
    expect(html).toContain('排座過期，先重新排座');
  });
});
