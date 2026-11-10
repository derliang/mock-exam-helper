/**
 * 輸出的中介版面模型：Word 與 PDF（列印 HTML）共用同一份，確保兩種格式內容一致。
 * 純函式、不碰畫面、不讀檔；輸入是 src/data 型別。
 * 統計（D40）暫由本檔 computeStats 計算；施工B 若提供正式統計，替換此函式即可。
 */
import {
  classroomSeats,
  labelNoteLines,
  seatLabel,
  studentCode,
  type ClassInfo,
  type Classroom,
  type ExamConfig,
  type ExamEntry,
  type LabelLayout,
  type LabelPaper,
  type NoteLine,
  type SeatingResult,
  type Settings,
  type Student,
} from '../data';
import { detachRoomCounts, roomStats, specialOf, type RoomStats } from '../core/stats';
import { examSubjectPeriods } from '../core/periods';
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
  /** 座位位置（排、深位，從 1 起）：標籤依它排在實際位置，不是依序一格接一格 */
  seat: { row: number; depth: number };
  code: string; // 考生編號
  classLabel: string; // 班級名稱
  name: string;
  colorBg: string;
  colorLine: string;
  colorFg: string;
  /** 個別考試標示（D39/D55）：文字加底色加粗框 */
  tags: { kind: 'absent' | 'extra'; text: string }[];
  /** 同一批標示拆成「小標＋科目」，列印頁把同小標的科目合併成一個標示（例：X 數B、社會） */
  marks: { kind: 'absent' | 'extra' | 'detach'; head: string; subject: string }[];
  /**
   * 預備教室合併標籤（D94-5）：每個座位一張，各節一行、同字級，印「節次＋科目＋班座號」，不印時間與姓名。
   * 有這個欄位的格子只印座標與這幾行。
   */
  periodLines?: { head: string; text: string }[];
}
export interface StatsModel {
  perClass: { className: string; count: number }[];
  total: number;
  perSubject: { subjectName: string; count: number }[];
  /** 統計表（列印頁用，D40）：欄＝班級，列＝本教室考生人數與各科考試人數 */
  table: { classes: string[]; rows: { label: string; per: number[]; total: number }[] };
}
export interface SeatPageModel {
  kind: 'seat';
  title: string;
  /** 抽離考試座位表（預備教室）用柔和單色（UI-23） */
  detachStyle: boolean;
  /** 標題拆開（列印頁版面：考試名稱、教室名稱分開放） */
  examName: string;
  roomName: string;
  /** 頁首小標籤：共幾人、不考／加考各科人數 */
  chips: string[];
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
  examName: string;
  roomName: string;
  layout: LabelLayout;
  /** 注意事項框的行（設定頁可改）；空陣列＝不印框 */
  notes: NoteLine[];
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
/** 通用表格頁（A4）：領卷清單等共用。widths 為各欄相對寬度；空字串的格子印成空白（供手寫勾選） */
export interface TablePageModel {
  kind: 'table';
  title: string;
  subtitle?: string;
  heads: string[];
  widths: number[];
  rows: string[][];
  /** 合計列（粗體，放最後） */
  totalRow?: string[];
}
export type PageModel = SeatPageModel | LabelPageModel | ListPageModel | TablePageModel;

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
const parseCode = (code: string) => ({ classNo: Number(code.slice(0, 2)), seatNo: Number(code.slice(2)) });

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
    seat: { row: seat.row, depth: seat.depth },
    code,
    classLabel: cls?.name ?? String(classNo),
    // 學生名單查無此人時退用考試名單的姓名，避免印出空白格（資料來源不同步的保險）
    name: st?.name ?? ctx.entries.get(code)?.name ?? '',
    colorBg: col.bg,
    colorLine: col.line,
    colorFg: col.fg,
    tags,
    marks: ctx.input.result.marks
      .filter((m) => m.code === code)
      .map((m) => ({ kind: m.mode, head: m.mode === 'absent' ? 'X' : '＋', subject: ctx.subjectName.get(m.subjectId) ?? '' })),
  };
}

/** 抽離考試格：標示只有「抽離考試 科目」一個（D55） */
function detachMark(c: CellModel, sname: string): void {
  c.tags = [{ kind: 'extra', text: `抽離考試 ${sname}` }];
  c.marks = [{ kind: 'detach', head: '抽離考試', subject: sname }];
}

function usableOf(c: Classroom): Set<string> {
  return new Set(classroomSeats(c).map((s) => `${s.row}-${s.depth}`));
}

function fromRoomStats(rs: RoomStats, ctx: Ctx): StatsModel {
  return {
    total: rs.total,
    perClass: rs.perClass.map((c) => ({ className: ctx.classes.get(c.classNo)?.name ?? String(c.classNo), count: c.count })),
    perSubject: rs.perSubject.map((c) => ({ subjectName: ctx.subjectName.get(c.subjectId) ?? c.subjectId, count: c.inRoom })),
    table: (() => {
      const nos = rs.perClass.map((c) => c.classNo);
      const pick = (l: { classNo: number; count: number }[]) => nos.map((n) => l.find((x) => x.classNo === n)?.count ?? 0);
      return {
        classes: nos.map((n) => ctx.classes.get(n)?.name ?? String(n)),
        rows: [
          { label: '本教室考生人數', per: pick(rs.perClass), total: rs.total },
          ...rs.perSubject.map((s) => ({ label: ctx.subjectName.get(s.subjectId) ?? s.subjectId, per: pick(s.inRoomPerClass), total: s.inRoom })),
        ],
      };
    })(),
  };
}

/** 頁首小標籤：共幾人、各科不考、各科加考的人數（依考試科目順序） */
function chipsOf(total: number, cells: Iterable<CellModel>, subjects: { name: string }[]): string[] {
  const n = { absent: new Map<string, number>(), extra: new Map<string, number>() };
  for (const c of cells) for (const m of c.marks) if (m.kind !== 'detach') n[m.kind].set(m.subject, (n[m.kind].get(m.subject) ?? 0) + 1);
  const order = subjects.map((s) => s.name);
  const list = (k: 'absent' | 'extra', head: string) =>
    [...n[k].entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([s, c]) => `${head}${s} ${c} 人`);
  return [`共 ${total} 人`, ...list('absent', '不考'), ...list('extra', '加考')];
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
      examName: input.exam.name,
      roomName: room.name,
      chips: [],
      detachStyle: false,
      rows: room.rows,
      depth: room.depth,
      cells,
      usable: usableOf(room),
      stats: fromRoomStats(roomStats(id, input.result.assignments, input.entries, input.exam.subjects, input.result.detaches, specialOf(input.result)), ctx),
    });
    const pg = pages[pages.length - 1]!;
    pg.chips = chipsOf(pg.stats.total, cells.values(), input.exam.subjects);
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
      detachMark(c, sname);
      cells.set(`${d.seat!.row}-${d.seat!.depth}`, c);
    }
    pages.push({
      kind: 'seat',
      title: `${input.exam.name}　${room.name}　抽離考試（${sname}）`,
      examName: input.exam.name,
      roomName: `${room.name}　抽離考試（${sname}）`,
      chips: [`共 ${ds.length} 人`],
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
          table: {
            classes: dc.perClass.map((c) => ctx.classes.get(c.classNo)?.name ?? String(c.classNo)),
            rows: [
              { label: '本教室考生人數', per: dc.perClass.map((c) => c.count), total: dc.total },
              { label: sname, per: dc.perClass.map((c) => c.count), total: dc.total },
            ],
          },
        };
      })(),
    });
  }
  return pages;
}

/**
 * 標籤依實際座位位置排（與座位表同一張圖，只是沒有講臺與統計）：欄＝排（左→右），列＝深位（最大深位在上、1 在下，0101 在左下角）。
 * 沒有座位的位置留空白格。超出標籤格數時丟錯，不默默截斷。
 */
function checkLabelBounds(roomName: string, seats: { row: number; depth: number }[], layout: { cols: number; rows: number }): void {
  const maxRow = Math.max(0, ...seats.map((s) => s.row));
  const maxDepth = Math.max(0, ...seats.map((s) => s.depth));
  if (maxRow > layout.cols || maxDepth > layout.rows) {
    throw new Error(`教室「${roomName}」的座位排到第 ${maxRow} 排、深位 ${maxDepth}，超過標籤每張 ${layout.cols} 排×${layout.rows} 深位（${layout.cols}×${layout.rows}）`);
  }
}

/** 標籤頁的格子陣列（由左到右、由上到下，長度 cols×rows）：依座位位置放，沒人的位置是 undefined */
export function labelGrid(p: LabelPageModel): (CellModel | undefined)[] {
  const { cols, rows } = p.layout;
  const g: (CellModel | undefined)[] = Array.from({ length: cols * rows }, () => undefined);
  for (const c of p.cells) {
    const col = c.seat.row - 1;
    const rowIdx = rows - c.seat.depth;
    if (col >= 0 && col < cols && rowIdx >= 0 && rowIdx < rows) g[rowIdx * cols + col] = c;
  }
  return g;
}

/** 標籤：每間教室一張紙，位置同座位表（見 labelGrid）。超出格數丟錯 */
export function buildLabelPages(input: ExportInput, scope: Scope = 'all'): LabelPageModel[] {
  const ctx = ctxOf(input);
  const layout = input.exam.labelLayout;
  const pages: LabelPageModel[] = [];
  for (const id of scope === 'reserve' ? [] : input.exam.classroomIds) {
    const room = input.settings.classrooms.find((c) => c.id === id);
    if (!room) continue;
    const mine = input.result.assignments
      .filter((a) => a.classroomId === id)
      .sort((a, b) => a.row - b.row || a.depth - b.depth);
    if (mine.length === 0) continue;
    checkLabelBounds(room.name, mine.map((a) => a), layout);
    pages.push({
      kind: 'label',
      title: `${input.exam.name}　${room.name}`,
      examName: input.exam.name,
      roomName: room.name,
      layout,
      notes: labelNoteLines(input.settings.labelNotes),
      cells: mine.map((a) => makeCell(a.code, a, ctx)),
    });
  }
  if (scope !== 'class') {
    // 預備教室合併標籤（D94-5）：每間預備教室一張紙、每個座位一張標籤；同一座位各節的使用者列在同一張，每節一行
    const periods = examSubjectPeriods(input.exam, input.settings);
    type MergedCell = { seat: { row: number; depth: number }; lines: { period: number; head: string; text: string }[] };
    const byRoom = new Map<string, Map<string, MergedCell>>();
    for (const d of input.result.detaches) {
      if (d.purpose !== 'exam' || !d.seat) continue;
      const seats = byRoom.get(d.roomId) ?? new Map<string, MergedCell>();
      byRoom.set(d.roomId, seats);
      const k = seatLabel(d.seat);
      const cell: MergedCell = seats.get(k) ?? { seat: d.seat, lines: [] };
      seats.set(k, cell);
      const p = parseCode(d.code);
      const who = `${ctx.classes.get(p.classNo)?.name ?? p.classNo} ${String(p.seatNo).padStart(2, '0')}`;
      for (const sp of periods.get(d.subjectId) ?? [{ period: 0, label: ctx.subjectName.get(d.subjectId) ?? d.subjectId }]) {
        if (cell.lines.some((l) => l.period === sp.period && l.text.endsWith(who))) continue;
        cell.lines.push({ period: sp.period, head: sp.period ? `第 ${sp.period} 節` : '', text: `${sp.label}　${who}` });
      }
    }
    const order = [...input.exam.classroomIds, ...byRoom.keys()];
    for (const roomId of [...new Set(order)]) {
      const seats = byRoom.get(roomId);
      const room = input.settings.classrooms.find((c) => c.id === roomId);
      if (!seats || !room) continue;
      const list = [...seats.values()].sort((a, b) => a.seat.row - b.seat.row || a.seat.depth - b.seat.depth);
      checkLabelBounds(room.name, list.map((x) => x.seat), layout);
      pages.push({
        kind: 'label',
        title: `${input.exam.name}　${room.name}　抽離考試`,
        examName: input.exam.name,
        roomName: `${room.name}　抽離考試`,
        layout,
        notes: labelNoteLines(input.settings.labelNotes),
        cells: list.map((x) => ({
          coord: seatLabel(x.seat),
          seat: { row: x.seat.row, depth: x.seat.depth },
          code: '',
          classLabel: '',
          name: '',
          colorBg: 'FFFFFF',
          colorLine: '222222',
          colorFg: '22201B',
          tags: [],
          marks: [],
          periodLines: x.lines.sort((a, b) => a.period - b.period).map(({ head, text }) => ({ head, text })),
        })),
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
      name: ctx.students.get(d.code)?.name ?? ctx.entries.get(d.code)?.name ?? '',
      place,
      purpose: d.purpose === 'exam' ? '抽離考試' : '抽離自習',
    };
  });
  const sps = specialOf(input.result);
  for (const o of input.result.overrides) {
    // 一人一列；各科用途不同時逐科寫明（#66），不讓單一用途蓋掉全部標示科目
    const mine = sps.filter((x) => x.code === o.code);
    const kinds = new Set(mine.map((x) => x.purpose));
    const purpose = kinds.size > 1
      ? mine.map((x) => `${ctx.subjectName.get(x.subjectId) ?? x.subjectId}${x.purpose === 'exam' ? '考試' : '自習'}`).join('、')
      : (mine.length ? mine[0]!.purpose : o.purpose) === 'exam' ? '單人考試' : '單人自習';
    rows.push({
      subject: '（全科）',
      code: o.code,
      className: ctx.classes.get(Number(o.code.slice(0, 2)))?.name ?? '',
      name: ctx.students.get(o.code)?.name ?? ctx.entries.get(o.code)?.name ?? '',
      place: o.location,
      purpose,
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

/* ---------- 座位表與標籤的版面尺寸（列印頁與 Word 共用，照設計系統稿件 #paper） ---------- */

/** 同小標的科目合併成一個標示（例：X 數B、社會），格子才不擠 */
export function groupMarks(c: CellModel): { kind: 'x' | 'add'; text: string }[] {
  const g = new Map<string, { kind: 'x' | 'add'; subs: string[] }>();
  for (const m of c.marks) {
    const e = g.get(m.head) ?? { kind: m.kind === 'absent' ? 'x' : 'add', subs: [] };
    e.subs.push(m.subject);
    g.set(m.head, e);
  }
  return [...g.entries()].map(([h, e]) => ({ kind: e.kind, text: `${h} ${e.subs.join('、')}` }));
}

/** 統計表的列：各科人數與每班完全相同的科目合併成一列（例：考國文、英文） */
export function statRows(p: SeatPageModel): { label: string; per: number[]; total: number }[] {
  const out: { label: string; per: number[]; total: number; subs: string[] }[] = [];
  const [first, ...rest] = p.stats.table.rows;
  if (first) out.push({ ...first, subs: [] });
  for (const r of rest) {
    const same = out.find((x) => x.subs.length > 0 && x.total === r.total && x.per.join() === r.per.join());
    if (same) same.subs.push(r.label);
    else out.push({ ...r, subs: [r.label] });
  }
  return out.map((x) => ({ label: x.subs.length ? `考${x.subs.join('、')}` : x.label, per: x.per, total: x.total }));
}

export const SEAT_PAGE = { w: 210, h: 297, padX: 15, padY: 12 };

/** 座位表的格子尺寸（mm）與統計列。統計表列數隨科目變：先扣掉標題、小標籤、講臺、統計表、頁尾，剩下的才給座位格 */
export function seatGeometry(p: SeatPageModel): { cw: number; ch: number; st: ReturnType<typeof statRows> } {
  const innerW = SEAT_PAGE.w - 2 * SEAT_PAGE.padX;
  const cw = Math.min(25, +((innerW - 6.5) / p.rows).toFixed(2));
  const st = statRows(p);
  const fixed = 22 + 12 + 4 + 5 + 11 + (5 + 8 * (st.length + 1)) + 16;
  const ch = Math.min(23, +((SEAT_PAGE.h - 2 * SEAT_PAGE.padY - fixed) / p.depth).toFixed(2));
  return { cw, ch, st };
}

/** 標籤頁格子以外要留的高度（mm）：抬頭、注意事項框、頁尾。B4 的注意事項字較小 */
function labelReserveMm(paper: LabelPaper, noteLines: number): number {
  const header = 15;
  const note = noteLines === 0 ? 0 : paper === 'B4' ? 5 + 6 + 8.6 + 1 + noteLines * 8 : 8 + 10 + 13.6 + 2 + noteLines * 12.35;
  const footer = 14;
  return header + note + footer;
}

/** 標籤格尺寸：格高最多 35mm，而且要讓下方的注意事項與頁尾放得下（B4 排 8 列時會比 35mm 矮）；左右邊界讓整排置中 */
export function labelBoxMm(layout: LabelLayout, margin: number, noteLines = 3): { w: number; h: number; padX: number } {
  const paper = PAPER_MM[layout.paper];
  const base = labelCellMm(layout, margin);
  const w = base.w;
  const fit = Math.floor(((paper.h - margin - labelReserveMm(layout.paper, noteLines)) / layout.rows) * 10) / 10;
  const h = Math.min(35, base.h, fit);
  return { w, h, padX: Math.max(margin, +((paper.w - layout.cols * w) / 2).toFixed(2)) };
}

/** 估字寬（em）：中日韓全形 1、其他 0.55 */
const emWidth = (t: string): number => [...t].reduce((w, ch) => w + (/[\u2E80-\uFFFF]/.test(ch) ? 1 : 0.55), 0);

/**
 * 合併標籤每一行的字級（pt）：同一張標籤所有行同字級（D94-5），依格子高度與最長一行的寬度取能放下的最大值。
 * 節次小標用 0.7 倍字級。cellW、cellH 為格子內可用的寬高（mm）。
 */
export function periodLineFontPt(lines: readonly { head: string; text: string }[], cellW: number, cellH: number): number {
  if (!lines.length) return 12;
  const PT = 0.3528;
  const byH = cellH / lines.length / 1.35 / PT;
  const widest = Math.max(...lines.map((l) => emWidth(l.head) * 0.7 + 0.6 + emWidth(l.text)));
  const byW = cellW / widest / PT;
  return Math.max(6, Math.min(26, Math.floor(Math.min(byH, byW) * 2) / 2));
}
