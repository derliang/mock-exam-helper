/**
 * 分科座位新模型（D99）的規劃介面與驗證器。
 * 引擎尚未重寫：這裡只定「輸入／輸出長什麼樣」與「輸出合不合規則」，供 d99.test.ts 驗收引擎用。
 * 全部假資料；不碰學測、會考。規格出處：docs/decisions.md D99、docs/ast-spec.md。
 */
import type { SeatPos } from '../../data/types';

export type PlanMode = 'fewest-rooms' | 'least-movement';

export interface PlanRoom {
  id: string;
  /** class＝原班教室（classNo 為所屬班）、reserve＝綜合（預備）教室 */
  kind: 'class' | 'reserve';
  classNo?: number;
  /** 實際可用座位（可不規則、可缺位） */
  seats: readonly SeatPos[];
  /** 自習容量；D99 預設等於座位數，不得自行調大 */
  studyCapacity: number;
}

export interface PlanStudent {
  classNo: number;
  seatNo: number;
  name: string;
  /** 各節考的科目 id（slotId → subjectId）；沒寫＝該節不考 */
  takes: Readonly<Record<string, string>>;
}

export interface PlanSlot {
  id: string;
  /** 本節同時進行的科目 id */
  subjectIds: readonly string[];
}

export interface PlanInput {
  mode: PlanMode;
  rooms: readonly PlanRoom[];
  slots: readonly PlanSlot[];
  students: readonly PlanStudent[];
  /** 管理者是否允許自習者去其他未徵用的原班教室（預設 false） */
  allowOtherClassStudy?: boolean;
}

export interface ExamPlacement { slotId: string; code: string; subjectId: string; roomId: string; row: number; depth: number }
export interface StudyPlacement { slotId: string; code: string; roomId: string }
export interface Proposal { kind: 'use-class-room'; slotId: string; roomId: string; status: 'pending' | 'approved'; reason: string }

export interface PlanOutput {
  /** slotId → roomId → 當節用途 */
  usage: Readonly<Record<string, Readonly<Record<string, 'exam' | 'study'>>>>;
  exams: readonly ExamPlacement[];
  /** 自習只有教室、沒有座位 */
  study: readonly StudyPlacement[];
  /** 同排混科的排（要在輸出標警示） */
  mixedRows: readonly { slotId: string; roomId: string; row: number }[];
  /** 需管理者核可的替代方案；未核可不得生效 */
  proposals: readonly Proposal[];
}

export type Planner = (input: PlanInput) => PlanOutput;

export const codeOf = (s: { classNo: number; seatNo: number }): string =>
  `${String(s.classNo).padStart(2, '0')}${String(s.seatNo).padStart(2, '0')}`;

const key = (p: { roomId: string; row: number; depth: number }): string => `${p.roomId}:${p.row}-${p.depth}`;

/** 全量硬性檢查（規格 13.1）；回傳違規說明，空陣列＝合規 */
export function checkPlan(input: PlanInput, out: PlanOutput): string[] {
  const v: string[] = [];
  const room = new Map(input.rooms.map((r) => [r.id, r]));
  const seatSet = new Map(input.rooms.map((r) => [r.id, new Set(r.seats.map((s) => `${s.row}-${s.depth}`))]));
  for (const slot of input.slots) {
    const usage = out.usage[slot.id] ?? {};
    const exams = out.exams.filter((e) => e.slotId === slot.id);
    const study = out.study.filter((e) => e.slotId === slot.id);
    // H-02／H-05：每人每節只出現一次（考試或自習擇一）
    const seen = new Set<string>();
    for (const c of [...exams.map((e) => e.code), ...study.map((s) => s.code)]) {
      if (seen.has(c)) v.push(`${slot.id}：${c} 同節重複安排`);
      seen.add(c);
    }
    // H-05：同節座位不重複
    const used = new Set<string>();
    for (const e of exams) {
      if (used.has(key(e))) v.push(`${slot.id}：座位 ${key(e)} 重複`);
      used.add(key(e));
      // H-04：必須是實際存在的座位
      if (!seatSet.get(e.roomId)?.has(`${e.row}-${e.depth}`)) v.push(`${slot.id}：${key(e)} 不是可用座位`);
      // H-07：考場須標記為 exam
      if (usage[e.roomId] !== 'exam') v.push(`${slot.id}：${e.roomId} 有人考試但用途不是考場`);
    }
    for (const s of study) {
      if (!room.has(s.roomId)) v.push(`${slot.id}：自習教室 ${s.roomId} 不存在`);
      // H-07：同節同教室不可考試又自習
      if (usage[s.roomId] !== 'study') v.push(`${slot.id}：${s.roomId} 有人自習但用途不是自習（考試／自習混用）`);
    }
    // H-06：自習容量
    const count = new Map<string, number>();
    for (const s of study) count.set(s.roomId, (count.get(s.roomId) ?? 0) + 1);
    for (const [id, n] of count) if (n > (room.get(id)?.studyCapacity ?? 0)) v.push(`${slot.id}：${id} 自習 ${n} 人超過容量`);
    // 每筆選考恰好一個座位、其他人都有自習教室（13.1）
    for (const st of input.students) {
      const c = codeOf(st);
      const sub = st.takes[slot.id];
      const e = exams.filter((x) => x.code === c);
      if (sub) {
        if (e.length !== 1) v.push(`${slot.id}：${c} 選考 ${sub} 應有 1 個座位，實際 ${e.length}`);
        else if (e[0]!.subjectId !== sub) v.push(`${slot.id}：${c} 科目不符`);
      } else if (e.length || study.filter((x) => x.code === c).length !== 1) v.push(`${slot.id}：${c} 不考卻沒有恰好 1 間自習教室`);
    }
  }
  return v;
}

/** 整合標籤：同一座位跨節的所有考生（規格 8.1）；一座位一張 */
export function labelsOf(out: PlanOutput): Map<string, { slotId: string; code: string; subjectId: string }[]> {
  const m = new Map<string, { slotId: string; code: string; subjectId: string }[]>();
  for (const e of out.exams) {
    const k = key(e);
    m.set(k, [...(m.get(k) ?? []), { slotId: e.slotId, code: e.code, subjectId: e.subjectId }]);
  }
  return m;
}
