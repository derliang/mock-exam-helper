/**
 * 分科 ⑥ 輸出（AST-2；DESIGN 10.19、D99 三-7～9、D101）：整合標籤、班級公告、每節教室用途表、
 * 每科試務清冊、自習教室名單與布置標籤工作表。全部從同一份方案（AstPlan）產出頁面模型，
 * 交給既有的 Word／PDF 轉譯（TablePageModel、LabelPageModel）。純函式，不碰畫面。
 * 規則：標籤白底、不印鐘點；班座號＋姓名，名單有匯入「應試編號」才印；座位一律「排－深位」；
 * 考試時段列教室與座位，自習時段只列教室；不排監考人力、不列請假者。
 */
import type { ExamConfig, LabelPaper } from '../../data';
import { subjectShort } from '../../core/subjectShort';
import { dataVersion } from '../../core/version';
import { defaultLabelLayout, type LabelPageModel, type TablePageModel, type CellModel } from '../../export/model';
import { examEntries } from '../seating';
import type { Doc } from '../store';
import { astSlots, awayStudy, usageCell, type AstPlan, type AstSlot } from './model';
import { codeOf } from '../../core/astD99/contract';

export type AstOutputKey = 'label' | 'ann' | 'use' | 'reg' | 'study';

export interface AstOutputItem { key: AstOutputKey; title: string; sub: string }
export const AST_OUTPUT_ITEMS: AstOutputItem[] = [
  { key: 'label', title: '整合標籤（合併標籤）', sub: '每個座位一張、各時段一行；班座號＋姓名，名單有應試編號才印；每間考場一張紙' },
  { key: 'ann', title: '班級公告', sub: '依原班逐生、各時段各一欄；考試列教室與座位，自習只列教室' },
  { key: 'use', title: '每節教室用途表', sub: '哪間教室哪個時段是考場或自習，附方案指標' },
  { key: 'reg', title: '每科試務清冊', sub: '每科：考場總表，加每間考場一頁簽到名冊' },
  { key: 'study', title: '自習教室名單與布置標籤工作表', sub: '每時段一份自習名單，加一份布置工作表' },
];

export interface AstOutputs {
  label: LabelPageModel[];
  ann: TablePageModel[];
  use: TablePageModel[];
  reg: TablePageModel[];
  study: TablePageModel[];
  /** 版本碼：由方案內容算出，所有檔案頁尾相同 */
  version: string;
}

/** 「1天2」＝第 1 天時段二，標籤上的短標 */
export const slotShort = (s: AstSlot): string => `${s.day + 1}天${s.slot}`;

const seatText = (row: number, depth: number): string => `${row}－${depth}`;

interface Ctx {
  doc: Doc;
  exam: ExamConfig;
  plan: AstPlan;
  slots: AstSlot[];
  roomName: Map<string, string>;
  className: (n: number) => string;
  subjectName: Map<string, string>;
  nameOf: Map<string, string>;
  examNoOf: Map<string, string>;
  hasExamNo: boolean;
}

function ctxOf(doc: Doc, exam: ExamConfig, plan: AstPlan): Ctx {
  const slots = astSlots(doc, exam);
  const classes = new Map(doc.settings.classes.filter((c) => c.division === exam.division).map((c) => [c.no, c.name]));
  const entries = examEntries(doc, exam);
  const examNoOf = new Map<string, string>();
  for (const e of entries) if (e.examNo) examNoOf.set(codeOf(e), e.examNo);
  return {
    doc, exam, plan, slots,
    roomName: new Map(doc.settings.classrooms.map((r) => [r.id, r.name])),
    className: (n) => classes.get(n) ?? String(n).padStart(2, '0'),
    subjectName: new Map(exam.subjects.map((s) => [s.id, subjectShort(s.name)])),
    nameOf: new Map(plan.input.students.map((s) => [codeOf(s), s.name])),
    examNoOf,
    hasExamNo: examNoOf.size > 0,
  };
}

const rn = (c: Ctx, id: string): string => c.roomName.get(id) ?? id;
const sub = (c: Ctx, id: string): string => c.subjectName.get(id) ?? id;
const slotHead = (c: Ctx, s: AstSlot): string => `${s.label} ${s.subjectIds.map((i) => sub(c, i)).join('、')}`;

// ───── ① 整合標籤 ─────

function labelPages(c: Ctx, paper: LabelPaper): LabelPageModel[] {
  const layout = defaultLabelLayout(paper);
  const slotIdx = new Map(c.slots.map((s, i) => [s.id, i]));
  const bySeat = new Map<string, Map<string, { slot: number; slotId: string; code: string; subjectId: string; row: number; depth: number }[]>>();
  for (const e of c.plan.out.exams) {
    const rm = bySeat.get(e.roomId) ?? new Map();
    const k = `${e.row}-${e.depth}`;
    rm.set(k, [...(rm.get(k) ?? []), { slot: slotIdx.get(e.slotId) ?? 0, slotId: e.slotId, code: e.code, subjectId: e.subjectId, row: e.row, depth: e.depth }]);
    bySeat.set(e.roomId, rm);
  }
  const order = c.plan.input.rooms.map((r) => r.id).filter((id) => bySeat.has(id));
  return order.map((id): LabelPageModel => {
    const seats = [...bySeat.get(id)!.values()].sort((a, b) => a[0]!.row - b[0]!.row || a[0]!.depth - b[0]!.depth);
    const cells: CellModel[] = seats.map((list) => {
      const first = list[0]!;
      return {
        coord: seatText(first.row, first.depth),
        seat: { row: first.row, depth: first.depth },
        code: '', classLabel: '', name: '',
        colorBg: 'FFFFFF', colorLine: '222222', colorFg: '22201B',
        tags: [], marks: [],
        periodLines: [...list].sort((a, b) => a.slot - b.slot).map((x) => ({
          head: slotShort(c.slots[x.slot]!),
          text: `${sub(c, x.subjectId)} ${x.code} ${c.nameOf.get(x.code) ?? ''}${c.examNoOf.get(x.code) ? ` ${c.examNoOf.get(x.code)}` : ''}`.trim(),
        })),
      };
    });
    return { kind: 'label', title: `${c.exam.name}　${rn(c, id)}　整合標籤`, examName: c.exam.name, heading: `${c.exam.name}　整合標籤（1天2＝第 1 天時段二）`, roomName: `${rn(c, id)}　整合標籤`, layout, notes: [], cells };
  });
}

// ───── ② 班級公告 ─────

function announcePages(c: Ctx): TablePageModel[] {
  const examAt = new Map(c.plan.out.exams.map((e) => [`${e.slotId}|${e.code}`, e]));
  const studyAt = new Map(c.plan.out.study.map((s) => [`${s.slotId}|${s.code}`, s]));
  const classes = [...new Set(c.plan.input.students.map((s) => s.classNo))].sort((a, b) => a - b);
  const heads = ['座號', '姓名', ...(c.hasExamNo ? ['應試編號'] : []), ...c.slots.map((s) => slotHead(c, s))];
  const widths = [0.9, 1.5, ...(c.hasExamNo ? [1.5] : []), ...c.slots.map(() => 1.8)];
  return classes.map((cl): TablePageModel => {
    const rows = c.plan.input.students.filter((s) => s.classNo === cl).sort((a, b) => a.seatNo - b.seatNo).map((s) => {
      const code = codeOf(s);
      return [String(s.seatNo), s.name, ...(c.hasExamNo ? [c.examNoOf.get(code) ?? ''] : []),
        ...c.slots.map((sl) => {
          const e = examAt.get(`${sl.id}|${code}`);
          if (e) return `考 ${rn(c, e.roomId)} ${seatText(e.row, e.depth)}`;
          const st = studyAt.get(`${sl.id}|${code}`);
          return st ? `自習 ${rn(c, st.roomId)}` : '—';
        })];
    });
    return { kind: 'table', title: `${c.exam.name}　班級公告`, subtitle: `${c.className(cl)}班（共 ${rows.length} 人）　座位為「排－深位」；自習只列教室`, heads, widths, rows };
  });
}

// ───── ③ 每節教室用途表（含方案指標） ─────

const CELL_TEXT: Record<string, string> = { exam: '考試', study: '自習', borrow: '借用自習', pending: '待核可', home: '原班', none: '—' };

function usagePages(c: Ctx): TablePageModel[] {
  const rooms = c.plan.input.rooms;
  const rows = rooms.map((r) => [rn(c, r.id), r.kind === 'class' ? '班級教室' : '綜合教室', ...c.slots.map((s) => {
    const u = usageCell(c.plan, s, r);
    return u.count > 0 ? `${CELL_TEXT[u.kind]} ${u.count} 人` : (CELL_TEXT[u.kind] ?? '—');
  })]);
  const pages: TablePageModel[] = [{
    kind: 'table', title: `${c.exam.name}　每節教室用途表`,
    subtitle: '考試＝這節是考場；自習＝接收離開原班的自習者；借用自習＝經核可借他班原班教室；原班＝同學留在原班；—＝沒用到',
    heads: ['教室', '類型', ...c.slots.map((s) => slotHead(c, s))], widths: [1.6, 1.1, ...c.slots.map(() => 1.5)], rows,
  }];
  const m = c.plan.out.metrics;
  if (m) {
    pages.push({
      kind: 'table', title: `${c.exam.name}　方案指標`, subtitle: '這一版方案的代價與試務複雜度（供存檔核對；不參與排座）',
      heads: ['指標', '數值'], widths: [3, 1],
      rows: [
        ['用到的教室總數', String(m.roomsTotal)], ['考場教室數／自習教室數', `${m.examRooms}／${m.studyRooms}`],
        ['被抽離的原班非應考者人次', String(m.displaced)], ['離開原班人次', String(m.leaveHome)],
        ['跨節換教室次數', String(m.roomChanges)], ['跨科換座位次數', String(m.seatChanges)], ['需跨教室學生數', String(m.crossRoomStudents)],
        ['各考場人數最大落差', String(m.balanceGap)], ['混科教室數／同排混科排數', `${m.mixedRooms}／${m.mixedRows}`],
        ['標籤張數', String(m.labels)], ['同一座位最多幾個人用過', String(m.maxSeatUsers)], ['發卷區段數', String(m.dispatchSegments)],
      ],
    });
  }
  return pages;
}

// ───── ④ 每科試務清冊 ─────

function registerPages(c: Ctx): TablePageModel[] {
  const out: TablePageModel[] = [];
  const seatsOf = new Map(c.plan.input.rooms.map((r) => [r.id, r.seats.length]));
  for (const s of c.slots) {
    for (const subjectId of s.subjectIds) {
      const here = c.plan.out.exams.filter((e) => e.slotId === s.id && e.subjectId === subjectId);
      if (here.length === 0) continue;
      const rooms = [...new Set(here.map((e) => e.roomId))];
      const head = `${c.exam.name}　${sub(c, subjectId)}　試務清冊`;
      const where = `${s.label}`;
      const mixedIn = (roomId: string) => c.plan.out.mixedRows.filter((m) => m.slotId === s.id && m.roomId === roomId).length;
      out.push({
        kind: 'table', title: head, subtitle: `${where}　考場總表　應考 ${here.length} 人`,
        heads: ['考場', '座位數', '應考人數', '來自班級', '簽到名冊頁數', '備註'], widths: [1.6, 0.9, 1, 2.4, 1.1, 1.8],
        rows: rooms.map((id) => {
          const list = here.filter((e) => e.roomId === id);
          const from = new Map<number, number>();
          for (const e of list) from.set(Number(e.code.slice(0, 2)), (from.get(Number(e.code.slice(0, 2))) ?? 0) + 1);
          const mx = mixedIn(id);
          return [rn(c, id), String(seatsOf.get(id) ?? ''), String(list.length), [...from].sort((a, b) => a[0] - b[0]).map(([cl, n]) => `${c.className(cl)} ${n} 人`).join('、'), '1', mx > 0 ? `同排混科 ${mx} 排，依座位分區發卷` : ''];
        }),
      });
      for (const id of rooms) {
        const list = here.filter((e) => e.roomId === id).sort((a, b) => a.row - b.row || a.depth - b.depth);
        out.push({
          kind: 'table', title: head, subtitle: `${where}　${rn(c, id)}　簽到名冊　應考 ${list.length} 人${mixedIn(id) > 0 ? '　注意：同排混科，依座位分區發卷' : ''}`,
          heads: ['座位（排－深位）', '班座號', '姓名', ...(c.hasExamNo ? ['應試編號'] : []), '到考', '缺考'], widths: [1.4, 1.1, 1.6, ...(c.hasExamNo ? [1.5] : []), 0.8, 0.8],
          rows: list.map((e) => [seatText(e.row, e.depth), e.code, c.nameOf.get(e.code) ?? '', ...(c.hasExamNo ? [c.examNoOf.get(e.code) ?? ''] : []), '□', '□']),
        });
      }
    }
  }
  return out;
}

// ───── ⑤ 自習教室名單與布置標籤工作表 ─────

function studyPages(c: Ctx): TablePageModel[] {
  const out: TablePageModel[] = [];
  const work: string[][] = [];
  const cap = new Map(c.plan.input.rooms.map((r) => [r.id, r.studyCapacity]));
  for (const s of c.slots) {
    const away = awayStudy(c.plan, s.id);
    if (away.length === 0) continue;
    const rooms = [...new Set(away.map((a) => a.roomId))];
    out.push({
      kind: 'table', title: `${c.exam.name}　自習教室名單`, subtitle: `${s.label}${s.subjectIds.map((i) => sub(c, i)).join('、')}　自習 ${away.length} 人、${rooms.length} 間教室`,
      heads: ['自習教室', '班座號', '原班', '姓名', ...(c.hasExamNo ? ['應試編號'] : [])], widths: [1.8, 1.1, 1.1, 1.6, ...(c.hasExamNo ? [1.4] : [])],
      rows: [...away].sort((a, b) => rooms.indexOf(a.roomId) - rooms.indexOf(b.roomId) || a.code.localeCompare(b.code)).map((a) => [rn(c, a.roomId), a.code, c.className(Number(a.code.slice(0, 2))), c.nameOf.get(a.code) ?? '', ...(c.hasExamNo ? [c.examNoOf.get(a.code) ?? ''] : [])]),
    });
    for (const id of rooms) work.push([`${slotShort(s)} ${s.subjectIds.map((i) => sub(c, i)).join('、')}`, rn(c, id), `${away.filter((a) => a.roomId === id).length}／${cap.get(id) ?? 0}`, '□ 已貼', '□ 已布置', '']);
  }
  if (work.length > 0) {
    out.push({
      kind: 'table', title: `${c.exam.name}　自習教室布置標籤工作表`, subtitle: '給總務與導師前一天布置；人數／容量＝當節自習人數／教室自習容量',
      heads: ['時段', '教室', '人數／容量', '門口標籤', '座位布置', '負責人'], widths: [1.8, 1.6, 1.1, 1, 1, 1.2], rows: work,
    });
  }
  return out;
}

/** 由同一份方案產出所有輸出頁面（標籤紙張可選；B4 6×8、A3 7×7，座位超過格數時 labelPages 會丟例外，由畫面接住） */
export function astOutputs(doc: Doc, exam: ExamConfig, plan: AstPlan, paper: LabelPaper = 'B4'): AstOutputs {
  const c = ctxOf(doc, exam, plan);
  return {
    label: labelPages(c, paper), ann: announcePages(c), use: usagePages(c), reg: registerPages(c), study: studyPages(c),
    version: dataVersion({ i: plan.input, o: plan.out, n: [...c.examNoOf] }),
  };
}

/** 能不能出檔：方案要有、可行、沒有待核可／排不進／驗證不通過。回傳擋下的原因與要回哪一步 */
export function astOutputBlockers(plan: AstPlan | undefined, hasList: boolean): { text: string; step: 2 | 3 | 5 }[] {
  if (!hasList) return [{ text: '還沒有考試名單，請先到 ② 匯入。', step: 2 }];
  if (!plan) return [{ text: '還沒有可排的方案：請先到 ③ 勾選班級教室。', step: 3 }];
  if (plan.infeasible) return [{ text: '座位不夠，排不出方案：請先到 ③ 補座位。', step: 3 }];
  const b: { text: string; step: 2 | 3 | 5 }[] = [];
  if (plan.pending.length > 0) b.push({ text: `還有 ${plan.pending.length} 個時段的替代方案待核可，請先到 ⑤ 核可。`, step: 5 });
  if (plan.unplaced > 0 && plan.pending.length === 0) b.push({ text: `有 ${plan.unplaced} 人排不進自習空間：請到 ③ 調整自習空間。`, step: 3 });
  if (plan.conflicts.length > 0) b.push({ text: `鎖定有 ${plan.conflicts.length} 項衝突，請到 ⑤ 處理（程式不會自己解除鎖定）。`, step: 5 });
  if (plan.errors.length > 0 && plan.pending.length === 0 && plan.unplaced === 0) b.push({ text: `硬性限制驗證有 ${plan.errors.length} 項不通過，請到 ⑤ 看詳情。`, step: 5 });
  return b;
}
