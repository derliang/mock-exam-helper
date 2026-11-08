/**
 * 輸出的中介版面模型：Word 與 PDF（列印 HTML）共用同一份，確保兩種格式內容一致。
 * 純函式、不碰畫面、不讀檔；輸入是 src/data 型別。
 * 統計（D40）暫由本檔 computeStats 計算；施工B 若提供正式統計，替換此函式即可。
 */
import {
  seatLabel,
  studentCode,
  type ClassInfo,
  type Classroom,
  type ExamConfig,
  type ExamEntry,
  type LabelLayout,
  type LabelPaper,
  type SeatingResult,
  type Settings,
  type Student,
} from '../data';
import { detachRoomCounts, roomStats, type RoomStats } from '../core/stats';
import { classColor } from './colors';

export interface ExportInput {
  settings: Settings;
  exam: ExamConfig;
  /** 學生名單（姓名來源） */
  students: Student[];
  /** 考試名單（各人考哪些科，統計用） */
  entries: ExamEntry[];
  result: SeatingResult;
}

/** 一個格子上要印的內容 */
export interface CellModel {
  coord: string; // 排－深位
  code: string; // 考生編號
  classLabel: string; // 班級名稱
  name: string;
  colorBg: string;
  colorLine: string;
  colorFg: string;
  /** 個別考試標示（D39/D55）：文字加底色加粗框 */
  tags: { kind: 'absent' | 'extra'; text: string }[];
}
export interface StatsModel {
  perClass: { className: string; count: number }[];
  total: number;
  perSubject: { subjectName: string; count: number }[];
}
export interface SeatPageModel {
  kind: 'seat';
  title: string;
  /** 抽離考試座位表（預備教室）用柔和單色（UI-23） */
  detachStyle: boolean;
  rows: number; // 排數（橫向欄）
  depth: number; // 深位數（縱向列）
  /** key = 排-深位；沒有的是空位或沒排人 */
  cells: Map<string, CellModel>;
  /** 可用座位（空位只在最後，D72） */
  usable: Set<string>;
  stats: StatsModel;
}
export interface LabelPageModel {
  kind: 'label';
  title: string;
  layout: LabelLayout;
  /** 依座位順序，長度 ≤ cols*rows；其餘格空白 */
  cells: CellModel[];
}
export interface ListRow {
  subject: string;
  code: string;
  className: string;
  name: string;
  place: string;
  purpose: string;
}
export interface ListPageModel {
  kind: 'list';
  title: string;
  rows: ListRow[];
}
export type PageModel = SeatPageModel | LabelPageModel | ListPageModel;

/** 頁尾（D66）：台北時間產生時間＋資料版本碼 */
export function footerText(generatedAt: string, dataVersion: string): string {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date(generatedAt))
    .reduce<Record<string, string>>((a, x) => {
      a[x.type] = x.value;
      return a;
    }, {});
  return `產生時間：${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（台北）　資料版本碼：${dataVersion}`;
}

/** 紙張尺寸（mm）。座位表與名單固定 A4；標籤 B4 250×353、A3 297×420（DESIGN §六） */
export const PAPER_MM: Record<LabelPaper | 'A4', { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  B4: { w: 250, h: 353 },
  A3: { w: 297, h: 420 },
};
export const mmToTwip = (mm: number): number => Math.round((mm * 1440) / 25.4);

/** 標籤預設格數（D74）：A3 7×7（35mm 正方）、B4 6 欄×8 列 */
export function defaultLabelLayout(paper: LabelPaper): LabelLayout {
  return paper === 'A3' ? { paper, cols: 7, rows: 7 } : { paper, cols: 6, rows: 8 };
}

/** A3 的 7×7 是固定 35mm 正方（沿用舊標籤，D74）；其他格數由紙張扣邊界後均分。
 * 均分時高度多扣 3mm：Word 表格後一定要有一個段落，不預留會多出空白頁。 */
export function labelCellMm(layout: LabelLayout, marginMm: number): { w: number; h: number } {
  if (layout.paper === 'A3' && layout.cols === 7 && layout.rows === 7) return { w: 35, h: 35 };
  const p = PAPER_MM[layout.paper];
  return { w: (p.w - 2 * marginMm) / layout.cols, h: (p.h - 2 * marginMm - 3) / layout.rows };
}

interface Ctx {
  students: Map<string, Student>;
  classes: Map<number, ClassInfo>;
  subjectName: Map<string, string>;
  entries: Map<string, ExamEntry>;
  input: ExportInput;
}
function ctxOf(input: ExportInput): Ctx {
  return {
    students: new Map(input.students.map((s) => [studentCode(s.classNo, s.seatNo), s])),
    classes: new Map(input.settings.classes.map((c) => [c.no, c])),
    subjectName: new Map(input.exam.subjects.map((s) => [s.id, s.name])),
    entries: new Map(input.entries.map((e) => [studentCode(e.classNo, e.seatNo), e])),
    input,
  };
}

function makeCell(code: string, seat: { row: number; depth: number }, ctx: Ctx): CellModel {
  const st = ctx.students.get(code);
  const classNo = Number(code.slice(0, 2));
  const cls = ctx.classes.get(classNo);
  const col = classColor(cls?.colorIndex ?? classNo);
  const tags = ctx.input.result.marks
    .filter((m) => m.code === code)
    .map((m) => ({
      kind: m.mode,
      text: `${m.mode === 'absent' ? 'X 不考' : '＋ 加考'}${ctx.subjectName.get(m.subjectId) ?? ''}`,
    }));
  return {
    coord: seatLabel(seat),
    code,
    classLabel: cls?.name ?? String(classNo),
    name: st?.name ?? '',
    colorBg: col.bg,
    colorLine: col.line,
    colorFg: col.fg,
    tags,
  };
}

function usableOf(c: Classroom): Set<string> {
  const s = new Set<string>();
  let n = 0;
  for (let r = 1; r <= c.rows; r++) for (let d = 1; d <= c.depth; d++) if (n++ < c.seatCount) s.add(`${r}-${d}`);
  return s;
}

function fromRoomStats(rs: RoomStats, ctx: Ctx): StatsModel {
  return {
    total: rs.total,
    perClass: rs.perClass.map((c) => ({ className: ctx.classes.get(c.classNo)?.name ?? String(c.classNo), count: c.count })),
    perSubject: rs.perSubject.map((c) => ({ subjectName: ctx.subjectName.get(c.subjectId) ?? c.subjectId, count: c.inRoom })),
  };
}

/** 座位表：每間教室一頁；每間預備教室的每個抽離考試科目一頁（柔和單色） */
export type Scope = 'all' | 'class' | 'reserve';

export function buildSeatPages(input: ExportInput, scope: Scope = 'all'): SeatPageModel[] {
  const ctx = ctxOf(input);
  const rooms = new Map(input.settings.classrooms.map((c) => [c.id, c]));
  const pages: SeatPageModel[] = [];
  for (const id of scope === 'reserve' ? [] : input.exam.classroomIds) {
    const room = rooms.get(id);
    if (!room) continue;
    const mine = input.result.assignments.filter((a) => a.classroomId === id);
    if (mine.length === 0 && room.kind === 'reserve') continue;
    const cells = new Map<string, CellModel>();
    for (const a of mine) cells.set(`${a.row}-${a.depth}`, makeCell(a.code, a, ctx));
    pages.push({
      kind: 'seat',
      title: `${input.exam.name}　${room.name}　座位表`,
      detachStyle: false,
      rows: room.rows,
      depth: room.depth,
      cells,
      usable: usableOf(room),
      stats: fromRoomStats(roomStats(id, input.result.assignments, input.entries, input.exam.subjects, input.result.detaches), ctx),
    });
  }
  const groups = new Map<string, typeof input.result.detaches>();
  for (const d of scope === 'class' ? [] : input.result.detaches) {
    if (d.purpose !== 'exam' || !d.seat) continue;
    const k = `${d.roomId}|${d.subjectId}`;
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  for (const [k, ds] of groups) {
    const [roomId, subjectId] = k.split('|') as [string, string];
    const room = rooms.get(roomId);
    if (!room) continue;
    const sname = ctx.subjectName.get(subjectId) ?? subjectId;
    const cells = new Map<string, CellModel>();
    for (const d of ds) {
      const c = makeCell(d.code, d.seat!, ctx);
      c.tags = [{ kind: 'extra', text: `抽離考試 ${sname}` }];
      cells.set(`${d.seat!.row}-${d.seat!.depth}`, c);
    }
    pages.push({
      kind: 'seat',
      title: `${input.exam.name}　${room.name}　抽離考試（${sname}）`,
      detachStyle: true,
      rows: room.rows,
      depth: room.depth,
      cells,
      usable: usableOf(room),
      stats: (() => {
        const dc = detachRoomCounts(input.result.detaches, subjectId, roomId);
        return {
          total: dc.total,
          perClass: dc.perClass.map((c) => ({ className: ctx.classes.get(c.classNo)?.name ?? String(c.classNo), count: c.count })),
          perSubject: [{ subjectName: sname, count: dc.total }],
        };
      })(),
    });
  }
  return pages;
}

/** 標籤：每間教室一張紙，順序同座位表（排 1 深位 1→depth，再排 2…）。超出格數丟錯，不默默截斷 */
export function buildLabelPages(input: ExportInput, scope: Scope = 'all'): LabelPageModel[] {
  const ctx = ctxOf(input);
  const layout = input.exam.labelLayout;
  const cap = layout.cols * layout.rows;
  const pages: LabelPageModel[] = [];
  for (const id of scope === 'reserve' ? [] : input.exam.classroomIds) {
    const room = input.settings.classrooms.find((c) => c.id === id);
    if (!room) continue;
    const mine = input.result.assignments
      .filter((a) => a.classroomId === id)
      .sort((a, b) => a.row - b.row || a.depth - b.depth);
    if (mine.length === 0) continue;
    if (mine.length > cap) {
      throw new Error(`教室「${room.name}」有 ${mine.length} 個座位，超過標籤每張 ${cap} 格（${layout.cols}×${layout.rows}）`);
    }
    pages.push({
      kind: 'label',
      title: `${input.exam.name}　${room.name}`,
      layout,
      cells: mine.map((a) => makeCell(a.code, a, ctx)),
    });
  }
  if (scope !== 'class') {
    // 預備教室標籤：抽離考試，每間每科一張紙（座位順序同預備教室座位表）
    const groups = new Map<string, typeof input.result.detaches>();
    for (const d of input.result.detaches) {
      if (d.purpose !== 'exam' || !d.seat) continue;
      const k = `${d.roomId}|${d.subjectId}`;
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    for (const [k, ds] of groups) {
      const [roomId, subjectId] = k.split('|') as [string, string];
      const room = input.settings.classrooms.find((c) => c.id === roomId);
      if (!room) continue;
      if (ds.length > cap) throw new Error(`教室「${room.name}」有 ${ds.length} 個座位，超過標籤每張 ${cap} 格（${layout.cols}×${layout.rows}）`);
      const sname = ctx.subjectName.get(subjectId) ?? subjectId;
      const sorted = [...ds].sort((a, b) => a.seat!.row - b.seat!.row || a.seat!.depth - b.seat!.depth);
      pages.push({
        kind: 'label',
        title: `${input.exam.name}　${room.name}　抽離考試（${sname}）`,
        layout,
        cells: sorted.map((d) => {
          const c = makeCell(d.code, d.seat!, ctx);
          c.tags = [{ kind: 'extra', text: `抽離考試 ${sname}` }];
          return c;
        }),
      });
    }
  }
  return pages;
}

/** 抽離自習名單（D7）：每科一頁，只有名單與人數，不出座位表與標籤 */
export function buildStudyLists(input: ExportInput): ListPageModel[] {
  const ctx = ctxOf(input);
  const bySubject = new Map<string, ListRow[]>();
  const rooms = new Map(input.settings.classrooms.map((c) => [c.id, c]));
  for (const d of input.result.detaches) {
    if (d.purpose !== 'study') continue;
    const rows = bySubject.get(d.subjectId) ?? [];
    rows.push({
      subject: ctx.subjectName.get(d.subjectId) ?? d.subjectId,
      code: d.code,
      className: ctx.classes.get(Number(d.code.slice(0, 2)))?.name ?? '',
      name: ctx.students.get(d.code)?.name ?? '',
      place: rooms.get(d.roomId)?.name ?? d.roomId,
      purpose: '抽離自習',
    });
    bySubject.set(d.subjectId, rows);
  }
  return input.exam.subjects
    .filter((sub) => bySubject.has(sub.id))
    .map((sub) => ({
      kind: 'list' as const,
      title: `${input.exam.name}　抽離自習名單（${sub.name}，共 ${bySubject.get(sub.id)!.length} 人）`,
      rows: bySubject.get(sub.id)!.sort((a, b) => a.code.localeCompare(b.code)),
    }));
}

/** 抽離名單（A4）：抽離考試與抽離自習都列，單人特例列自填地點（D7/D26/D27） */
export function buildDetachList(input: ExportInput): ListPageModel {
  const ctx = ctxOf(input);
  const rooms = new Map(input.settings.classrooms.map((c) => [c.id, c]));
  const rows: ListRow[] = input.result.detaches.map((d) => {
    const room = rooms.get(d.roomId);
    const place = d.purpose === 'exam' && d.seat ? `${room?.name ?? d.roomId} ${seatLabel(d.seat)}` : (room?.name ?? d.roomId);
    return {
      subject: ctx.subjectName.get(d.subjectId) ?? d.subjectId,
      code: d.code,
      className: ctx.classes.get(Number(d.code.slice(0, 2)))?.name ?? '',
      name: ctx.students.get(d.code)?.name ?? '',
      place,
      purpose: d.purpose === 'exam' ? '抽離考試' : '抽離自習',
    };
  });
  for (const o of input.result.overrides) {
    rows.push({
      subject: '（全科）',
      code: o.code,
      className: ctx.classes.get(Number(o.code.slice(0, 2)))?.name ?? '',
      name: ctx.students.get(o.code)?.name ?? '',
      place: o.location,
      purpose: o.purpose === 'exam' ? '單人考試' : '單人自習',
    });
  }
  rows.sort((a, b) => a.subject.localeCompare(b.subject, 'zh-TW') || a.code.localeCompare(b.code));
  return { kind: 'list', title: `${input.exam.name}　抽離名單`, rows };
}

/** 輸出前掃描字型字集外的字（D44）。只回傳班級＋座號＋字元，不含姓名，可安全寫 log */
export function findMissingChars(input: ExportInput, has: (ch: string) => boolean): { classNo: number; seatNo: number; ch: string }[] {
  const out: { classNo: number; seatNo: number; ch: string }[] = [];
  for (const s of input.students) for (const ch of new Set(s.name)) if (!has(ch)) out.push({ classNo: s.classNo, seatNo: s.seatNo, ch });
  return out;
}
