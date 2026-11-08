/**
 * 領卷清單（H3，D77①）：每間教室一頁 A4，每科列出試卷、答案卡應有份數，
 * 領卷時照表點數核對（使用者 2026-11-08 裁示「對卷＝依教室核對份數」）。
 * 份數規則見 core/stats.ts 的 pickupCounts（含抽離、備用、缺考、單人特例）。
 * 標題用考試名稱，不寫死「模擬考」（D77③）。
 */
import { pickupCounts, specialOf } from '../core/stats';
import type { ExportInput, TablePageModel } from './model';

const HEADS = ['科目', '試卷（份）', '答案卡（份）', '核對（點數後打勾）', '備註'];
const WIDTHS = [2.2, 1.6, 1.6, 2.2, 3.6];

export function buildPickupPages(input: ExportInput): TablePageModel[] {
  const { exam, settings, result, entries } = input;
  const rooms = exam.classroomIds
    .map((id) => settings.classrooms.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c);
  const counts = pickupCounts({
    rooms, assignments: result.assignments, entries, subjects: exam.subjects, detaches: result.detaches, special: specialOf(result),
  });
  const nameOf = (id: string) => exam.subjects.find((s) => s.id === id)?.name ?? id;
  return counts.map((pr) => {
    const room = rooms.find((r) => r.id === pr.classroomId)!;
    const rows = pr.subjects.map((s) => {
      const notes: string[] = [];
      if (s.detachedOut) notes.push(`另有 ${s.detachedOut} 人抽離到預備教室考試，不計入`);
      if (s.elsewhere) notes.push(`${s.elsewhere} 人到他處考試${s.locations.length ? `（${s.locations.join('、')}）` : ''}，不計入`);
      return [nameOf(s.subjectId), String(s.count), String(s.count), '', notes.join('；')];
    });
    return {
      kind: 'table' as const,
      title: `${exam.name}　領卷清單`,
      subtitle: `${room.name}（${room.kind === 'reserve' ? '預備教室：抽離考試' : '班級教室'}）`,
      heads: HEADS,
      widths: WIDTHS,
      rows,
      totalRow: ['教室合計', String(pr.total), String(pr.total), '', ''],
    };
  });
}
