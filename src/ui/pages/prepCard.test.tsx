import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { ExamConfig } from '../../data';
import { demoDoc } from '../repository';
import { newExam, updateExam } from '../store';
import { reserveModeOf } from '../seating';
import { Step3 } from './Step3';

const noop = () => undefined;
const make = (kind: 'gsat' | 'bcct') => {
  const r = newExam(demoDoc(), kind, '測試', new Date('2026-09-01T02:00:00Z'));
  if (!r.ok) throw new Error(r.error);
  return { doc: r.doc, exam: r.doc.exams[r.doc.exams.length - 1] as ExamConfig };
};

describe('步驟③「預備教室排座與標籤」卡（稿 v2.22 校-56）', () => {
  it('高中部：排座方式兩個選項、預設同學優先；下半合併標籤範例', () => {
    const { doc, exam } = make('gsat');
    expect(reserveModeOf(exam)).toBe('peer');
    const html = renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />);
    for (const s of ['預備教室排座與標籤', '排座方式', '① 同學優先（預設）', '② 監考優先', '合併標籤（範例）', '抽離自習不排座位、不印標籤，只出名單']) expect(html).toContain(s);
    expect(html).toMatch(/aria-pressed="true"[^>]*><b>① 同學優先/);
    const r = updateExam(doc, exam.id, { reserveSeatMode: 'proctor' });
    if (!r.ok) throw new Error();
    expect(renderToString(<Step3 doc={r.doc} exam={r.doc.exams.find((e) => e.id === exam.id)!} onChange={noop} />)).toMatch(/aria-pressed="true"[^>]*><b>② 監考優先/);
  });
  it('會考（國中部）沒有這張卡', () => {
    const { doc, exam } = make('bcct');
    expect(renderToString(<Step3 doc={doc} exam={exam} onChange={noop} />)).not.toContain('預備教室排座與標籤');
  });
});
