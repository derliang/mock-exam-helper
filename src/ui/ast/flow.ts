/**
 * 分科 ③④⑤ 的流程狀態（摘要列、步驟欄）：由新引擎（D99）判斷，不走學測的標示與抽離。
 * - ③：有勾班級教室、各組座位夠最多一個時段的考生；綜合教室自習容量放不下的時段在 ⑤ 處理（有替代方案）或回 ③（沒有）。
 * - ④：只要 ② ③ 完成就算完成（模式有預設）。
 * - ⑤：方案有待核可、排不進、或硬性限制不通過就擋下。
 */
import type { ExamConfig } from '../../data';
import type { FlowIssue } from '../flow';
import type { Doc } from '../store';
import { astCapacity, astPlan, astSlots } from './model';

export interface AstFlow { issues: FlowIssue[]; s3: boolean; s4: boolean; s5: 'todo' | 'done' | 'stale'; /** 座位減「最多一個時段的考生」 */ spare: number }

export function astFlow(doc: Doc, exam: ExamConfig, s2: boolean, classSeats: number, students: number): AstFlow {
  const issues: FlowIssue[] = [];
  const plan = astPlan(doc, exam);
  const cap = astCapacity(doc, exam, plan);
  const slots = astSlots(doc, exam);
  const rooms = doc.settings.classrooms.filter((r) => exam.classroomIds.includes(r.id) && r.kind === 'class');
  const spare = students > 0 ? classSeats - Math.max(cap.science.need, cap.liberal.need) : classSeats;
  let s3 = rooms.length > 0;
  if (rooms.length === 0) issues.push({ step: 3, text: '③ 還沒有選班級教室', fix: '去 ③ 勾選教室', level: 'block' });
  for (const [label, c] of [['理組', cap.science], ['文組', cap.liberal]] as const) {
    if (cap.hasList && c.seats < c.need) {
      s3 = false;
      issues.push({ step: 3, text: `③ ${label}考場座位 ${c.seats} 少於最多一個時段的考生 ${c.need}，還差 ${c.need - c.seats} 個`, fix: '去 ③ 增加座位', level: 'block', need: c.need, have: c.seats, lack: c.need - c.seats });
    }
  }
  const s4 = s2 && s3;
  let s5: AstFlow['s5'] = 'todo';
  if (!plan) {
    if (s2 && rooms.length > 0) issues.push({ step: 5, text: '⑤ 還沒有可排的方案', fix: '去 ⑤ 看方案', level: 'block', todo: true });
    else issues.push({ step: 5, text: '⑤ 還沒有排座結果', fix: '去 ⑤ 看方案', level: 'block', todo: true });
  } else if (!plan.infeasible) {
    for (const pr of plan.pending) issues.push({ step: 5, text: `⑤ ${slots.find((s) => s.id === pr.slotId)?.label ?? pr.slotId}自習容量不足，替代方案待核可`, fix: '去 ⑤ 核可', level: 'block' });
    if (plan.unplaced > 0 && plan.pending.length === 0) issues.push({ step: 3, text: `③ 有 ${plan.unplaced} 人排不進自習空間，也沒有可用的替代教室`, fix: '去 ③ 調整自習空間', level: 'block' });
    if (plan.conflicts.length > 0) issues.push({ step: 5, text: `⑤ 鎖定有 ${plan.conflicts.length} 項衝突`, fix: '去 ⑤ 處理鎖定', level: 'block' });
    if (plan.errors.length > 0 && plan.pending.length === 0 && plan.unplaced === 0) issues.push({ step: 5, text: `⑤ 驗證有 ${plan.errors.length} 項不通過`, fix: '去 ⑤ 看驗證', level: 'block' });
    if (plan.pending.length === 0 && plan.unplaced === 0 && plan.errors.length === 0 && plan.conflicts.length === 0) s5 = 'done';
  }
  return { issues, s3, s4, s5, spare };
}
