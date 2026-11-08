/**
 * 出缺席記錄表（H5，D77③）：A4，每間教室一頁（人多時自動接下一頁，表頭重複），照座位順序。
 * 每位考生列出「不考的科目」，並為每個考科留一格打勾欄（本教室要考才留空白給手寫打勾）：
 * - 這科不考：印「—」（不用點名）
 * - 抽離到預備教室考／單人特例到他處：印「→ 去處」（在那邊點名，不在本教室打勾）
 * 標題用「考試名稱」，不寫死「模擬考」，日後補考可沿用（D77③）。
 * 全科缺考者預設不排座（D79），所以不會出現；到他處考試者各科印去處，不佔本教室打勾格。
 */
import { specialOf } from '../core/stats';
import { seatLabel } from '../data';
import type { Classroom, SeatAssignment } from '../data';
import type { ExportInput, TablePageModel } from './model';

const BLANK = '';
const NOT_TAKEN = '—';

export function buildAttendancePages(input: ExportInput): TablePageModel[] {
  const { exam, settings, result, entries, students } = input;
  const rooms = exam.classroomIds
    .map((id) => settings.classrooms.find((c) => c.id === id))
    .filter((c): c is Classroom => !!c);
  const roomName = new Map(settings.classrooms.map((c) => [c.id, c.name]));
  const entryOf = new Map(entries.map((e) => [`${String(e.classNo).padStart(2, '0')}${String(e.seatNo).padStart(2, '0')}`, e]));
  const studentOf = new Map(students.map((s) => [`${String(s.classNo).padStart(2, '0')}${String(s.seatNo).padStart(2, '0')}`, s]));
  const className = new Map(settings.classes.filter((c) => c.division === exam.division).map((c) => [c.no, c.name]));
  const specials = new Map(specialOf(result).map((x) => [`${x.code}|${x.subjectId}`, x]));
  const detachOf = new Map(result.detaches.map((d) => [`${d.code}|${d.subjectId}`, d]));
  const subjects = exam.subjects;

  const heads = ['座位（排－深位）', '考生編號', '班級', '姓名', ...subjects.map((s) => s.name), '不考的科目'];
  const widths = [1.5, 1.4, 1.2, 1.6, ...subjects.map(() => 1.5), 2.2];

  const personCols = (code: string) => ({
    code,
    cls: className.get(Number(code.slice(0, 2))) ?? String(Number(code.slice(0, 2))),
    name: studentOf.get(code)?.name ?? entryOf.get(code)?.name ?? '',
    skipped: subjects.filter((s) => !entryOf.get(code)?.subjectIds.includes(s.id)).map((s) => s.name).join('、'),
  });

  /** 該生這科在「本教室」的格子；優先順序與領卷清單一致：單人特例（D80）→抽離（D27）→本教室打勾／不考 */
  const cell = (code: string, subjectId: string, roomId: string, kind: 'class' | 'reserve'): string => {
    // 預備教室：只有「抽離到這間考試」的那幾科要打勾，其餘都不在這間考
    if (kind === 'reserve') {
      const dd = detachOf.get(`${code}|${subjectId}`);
      return dd && dd.roomId === roomId && dd.purpose === 'exam' ? BLANK : NOT_TAKEN;
    }
    const sp = specials.get(`${code}|${subjectId}`);
    if (sp) return `→ ${sp.location || '他處'}${sp.purpose === 'study' ? '（自習）' : ''}`;
    const d = detachOf.get(`${code}|${subjectId}`);
    if (d) {
      if (d.roomId === roomId && d.purpose === 'exam') return BLANK;
      return `→ ${roomName.get(d.roomId) ?? d.roomId}${d.purpose === 'study' ? '（自習）' : ''}`;
    }
    return entryOf.get(code)?.subjectIds.includes(subjectId) ? BLANK : NOT_TAKEN;
  };

  const byOrder = (a: { row: number; depth: number }, b: { row: number; depth: number }) => a.row - b.row || a.depth - b.depth;

  return rooms.map((room): TablePageModel => {
    let list: { seat: string; code: string }[];
    if (room.kind === 'class') {
      list = result.assignments.filter((a: SeatAssignment) => a.classroomId === room.id).sort(byOrder).map((a) => ({ seat: seatLabel(a), code: a.code }));
    } else {
      // 預備教室：抽離來這裡考試的人，依座位順序；沒座位的排最後
      const here = result.detaches.filter((d) => d.roomId === room.id && d.purpose === 'exam' && d.seat);
      const seen = new Set<string>();
      list = here.slice().sort((a, b) => byOrder(a.seat!, b.seat!))
        .filter((d) => (seen.has(d.code) ? false : (seen.add(d.code), true)))
        .map((d) => ({ seat: seatLabel(d.seat!), code: d.code }));
    }
    const rows = list.map(({ seat, code }) => {
      const p = personCols(code);
      return [seat, p.code, p.cls, p.name, ...subjects.map((s) => cell(code, s.id, room.id, room.kind)), p.skipped];
    });
    return {
      kind: 'table',
      title: `${exam.name}　出缺席記錄表`,
      subtitle: `${room.name}（${room.kind === 'reserve' ? '預備教室：抽離考試' : '班級教室'}）　應到 ${rows.length} 人　請在各科格子內打勾`,
      heads,
      widths,
      rows,
    };
  });
}
