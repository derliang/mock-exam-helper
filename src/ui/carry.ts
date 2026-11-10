/** 步驟①「沿用上次的設定」（D34）的純邏輯：找沿用對象、列出各步驟沿用狀態、切換「不沿用，從空白開始」 */
import type { ExamConfig } from '../data';
import { defaultLabelLayout } from '../export/model';
import { mathSplit } from './subjects';
import { rosterName, updateExam, type Doc } from './store';

/** 沿用對象：同類型、比這次早建立的最近一次（不含自己） */
export function carrySource(doc: Doc, exam: ExamConfig): ExamConfig | undefined {
  return doc.exams
    .filter((e) => e.kind === exam.kind && e.id !== exam.id && e.createdAt < exam.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export type CarryMode = 'on' | 'off' | 'none';
/** on＝沿用中；off＝使用者按了不沿用；none＝沒有更早的同類型可沿用 */
export const carryMode = (doc: Doc, exam: ExamConfig): CarryMode => (exam.carry === false ? 'off' : carrySource(doc, exam) ? 'on' : 'none');

export interface CarryRow { step: string; badge: '沿用' | '需確認' | '不需要' | '不沿用'; tone?: 'ok' | 'warn' | 'info'; text: string }

export function carryRows(doc: Doc, exam: ExamConfig, prev: ExamConfig): CarryRow[] {
  const rooms = doc.settings.classrooms.filter((r) => prev.classroomIds.includes(r.id));
  const cls = rooms.filter((r) => r.kind === 'class').length;
  const reserve = rooms.filter((r) => r.kind === 'reserve').length;
  const bcct = exam.kind === 'bcct';
  const warn4 = !bcct && mathSplit(exam.round) !== mathSplit(prev.round);
  return [
    { step: '② 考試名單', badge: '沿用', tone: 'ok', text: `${rosterName(exam.division)} ${doc.rosters[exam.division].length} 人；匯入本次考試名單時逐筆比對差異` },
    { step: '③ 教室設定', badge: '沿用', tone: 'ok', text: `班級教室 ${cls} 間、預備教室 ${reserve} 間` },
    bcct
      ? { step: '④ 標示與抽離規則', badge: '不需要', text: '會考每科都考，沒有標示與抽離' }
      : warn4
        ? { step: '④ 標示與抽離規則', badge: '需確認', tone: 'warn', text: '數學由單一科改為數學A、數學B，組別對照表要重新確認' }
        : { step: '④ 標示與抽離規則', badge: '沿用', tone: 'ok', text: '組別對照表與上次相同，依本次人數重新建議標示' },
    { step: '⑤ 排座、⑥ 下載', badge: '不沿用', text: '每次都重新排座與下載' },
  ];
}

/** 不沿用：③ 教室、④ 規則、參加方式、標籤格式回到空白預設（一次改動，可復原） */
export function stopCarry(doc: Doc, exam: ExamConfig): Doc {
  const r = updateExam(doc, exam.id, {
    carry: false, classroomIds: [], markRules: [], participation: 'all', labelLayout: defaultLabelLayout(doc.settings.defaultLabelPaper),
  });
  return r.ok ? r.doc : doc;
}

/** 恢復沿用：重新從沿用對象帶入（內容複製一份，不連動） */
export function resumeCarry(doc: Doc, exam: ExamConfig): Doc {
  const prev = carrySource(doc, exam);
  if (!prev) return doc;
  const r = updateExam(doc, exam.id, {
    carry: true, classroomIds: [...prev.classroomIds], markRules: structuredClone(prev.markRules), participation: prev.participation, labelLayout: structuredClone(prev.labelLayout),
  });
  return r.ok ? r.doc : doc;
}
