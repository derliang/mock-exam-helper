/**
 * 分科請假、階段、版本清單（AST-3，D99 三-3、D101②③、H-10～H-12）：純函式。
 * - 請假只用來「估算」自習人數；容量檢核與排座一律用報名全數（不因「應該有人請假」少排人），定案後不自動改動。
 * - 三階段：規劃中 → 確認定案（凍結）→ 已公告；公告後可「解除定案、修正」（理由必填，R4），重新發布寫進版本清單。
 * - 版本清單：公告時間、修改項目、受影響考生與教室、理由；座位快照可比對新舊版；可匯出匯入。
 */
import type { AstVersion, ExamConfig, PrevSeat } from '../../data/types';
import { homeRoomIds, type PlanInput, type PlanOutput } from './contract';

// ───── 請假 ─────

export interface LeaveRow { slotId: string; enrolled: number; estimated: number }

/** 每班請假人數限制在 0～班級人數的整數 */
export function clampLeave(byClass: Readonly<Record<string, number>>, sizes: ReadonlyMap<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(byClass)) {
    const size = sizes.get(Number(k)) ?? 0;
    const n = Math.min(size, Math.max(0, Math.floor(Number.isFinite(v) ? v : 0)));
    if (n > 0) out[k] = n;
  }
  return out;
}

/**
 * 每個時段離開原班去自習的人數：報名全數（enrolled，容量檢核用的數）與請假後的估計（estimated，只供參考）。
 * 估計＝每班離開原班的自習人數 × (1 − 該班請假比例)，無條件進位，所以不會超過報名全數；請假 0 人時兩者相同。
 */
export function estimateStudy(input: PlanInput, out: PlanOutput, byClass: Readonly<Record<string, number>>): LeaveRow[] {
  const home = homeRoomIds(input.rooms);
  const sizes = new Map<number, number>();
  for (const s of input.students) sizes.set(s.classNo, (sizes.get(s.classNo) ?? 0) + 1);
  const leave = clampLeave(byClass, sizes);
  return input.slots.map((slot) => {
    const away = new Map<number, number>();
    for (const s of out.study) {
      const cls = Number(s.code.slice(0, 2));
      if (s.slotId === slot.id && home.get(cls) !== s.roomId) away.set(cls, (away.get(cls) ?? 0) + 1);
    }
    for (const u of out.unplaced ?? []) if (u.slotId === slot.id) away.set(Number(u.code.slice(0, 2)), (away.get(Number(u.code.slice(0, 2))) ?? 0) + 1);
    let enrolled = 0;
    let estimated = 0;
    for (const [cls, n] of away) {
      const size = sizes.get(cls) ?? n;
      const f = Math.min(1, (leave[String(cls)] ?? 0) / Math.max(1, size));
      enrolled += n;
      estimated += Math.ceil(n * (1 - f) - 1e-9);
    }
    return { slotId: slot.id, enrolled, estimated };
  });
}

// ───── 版本快照與差異 ─────

export function snapOf(out: PlanOutput): AstVersion['snap'] {
  return {
    exams: out.exams.map((e) => `${e.slotId}|${e.code}|${e.roomId}|${e.row}-${e.depth}`).sort(),
    study: out.study.map((s) => `${s.slotId}|${s.code}|${s.roomId}`).sort(),
  };
}

export interface SnapDiff { changed: number; students: string[]; rooms: string[]; text: string }

/** 新舊兩版的差異：座位或教室不一樣的（時段、人）筆數、受影響考生與教室 */
export function diffSnap(a: AstVersion['snap'], b: AstVersion['snap']): SnapDiff {
  const at = (s: AstVersion['snap']): Map<string, string> => {
    const m = new Map<string, string>();
    for (const x of s.exams) { const [slot, code, ...rest] = x.split('|'); m.set(`${slot}|${code}`, `考 ${rest.join('|')}`); }
    for (const x of s.study) { const [slot, code, ...rest] = x.split('|'); m.set(`${slot}|${code}`, `自習 ${rest.join('|')}`); }
    return m;
  };
  const ma = at(a);
  const mb = at(b);
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  const students = new Set<string>();
  const rooms = new Set<string>();
  let changed = 0;
  for (const k of keys) {
    const va = ma.get(k);
    const vb = mb.get(k);
    if (va === vb) continue;
    changed++;
    students.add(k.split('|')[1]!);
    for (const v of [va, vb]) if (v) rooms.add(v.split(' ')[1]!.split('|')[0]!.split(':')[0]!);
  }
  const text = changed === 0 ? '座位與教室沒有變動' : `${students.size} 位考生、${changed} 個時段的教室或座位改變`;
  return { changed, students: [...students].sort(), rooms: [...rooms].sort(), text };
}

// ───── 階段與版本 ─────

export type PhaseResult = { ok: true; patch: Partial<ExamConfig> } | { ok: false; error: string };

export const phaseOf = (exam: Pick<ExamConfig, 'astPhase'>): NonNullable<ExamConfig['astPhase']> => exam.astPhase ?? 'planning';
/** 定案或公告後，③④⑤ 的控制項要停用（只讀） */
export const isFrozen = (exam: Pick<ExamConfig, 'astPhase'>): boolean => phaseOf(exam) !== 'planning';

/** 確認定案：存下定案座位（跨次沿用的來源）；擋下的原因由呼叫端先算（待核可、排不進、衝突、時程未核准…） */
export function finalize(exam: ExamConfig, blockers: readonly string[], seats: readonly PrevSeat[]): PhaseResult {
  if (phaseOf(exam) !== 'planning') return { ok: false, error: '目前已經不是「規劃中」。' };
  if (blockers.length > 0) return { ok: false, error: `還不能定案：${blockers.join('；')}` };
  return { ok: true, patch: { astPhase: 'final', astFinalSeats: [...seats] } };
}

/** 解除定案、回到規劃中。已公告的要理由（R4：只加理由必填，不做權限）；理由留到下次公告寫進版本清單 */
export function unfinalize(exam: ExamConfig, reason: string): PhaseResult {
  const p = phaseOf(exam);
  if (p === 'planning') return { ok: false, error: '目前就是規劃中。' };
  const r = reason.trim();
  if (p === 'announced' && !r) return { ok: false, error: '已公告的方案要解除定案，請填理由。' };
  return { ok: true, patch: { astPhase: 'planning', ...(r ? { astReopenReason: r } : {}) } };
}

/** 公告（發布一版）：必須先定案；重新發布要理由。版本資料帶座位快照與同一個版本碼，標籤與班級公告永遠同一版 */
export function publish(exam: ExamConfig, out: PlanOutput, code: string, now: Date, reason = ''): PhaseResult {
  if (phaseOf(exam) !== 'final') return { ok: false, error: '要先「確認定案」才能公告。' };
  const versions = exam.astVersions ?? [];
  const why = (reason.trim() || exam.astReopenReason || '').trim();
  if (versions.length > 0 && !why) return { ok: false, error: '重新發布要填理由。' };
  const snap = snapOf(out);
  const last = versions[versions.length - 1];
  const d = last ? diffSnap(last.snap, snap) : undefined;
  const v: AstVersion = {
    n: versions.length + 1,
    at: now.toISOString(),
    changes: d ? d.text : '首次公告',
    affected: d ? { students: d.students.length, rooms: d.rooms } : { students: out.exams.length ? new Set(out.exams.map((e) => e.code)).size : 0, rooms: [...new Set(out.exams.map((e) => e.roomId))].sort() },
    reason: why || '首次公告',
    snap,
    code,
  };
  return { ok: true, patch: { astPhase: 'announced', astVersions: [...versions, v], astReopenReason: undefined } };
}

// ───── 匯出匯入（存本機、可匯出入；與上次定案座位一併保存） ─────

export function exportVersions(exam: ExamConfig): string {
  return JSON.stringify({ kind: 'mock-exam-ast-versions', v: 1, versions: exam.astVersions ?? [], finalSeats: exam.astFinalSeats ?? [] });
}

export function parseVersions(text: string): { ok: true; versions: AstVersion[]; seats: PrevSeat[] } | { ok: false; error: string } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, error: '不是有效的檔案（不是 JSON）。' }; }
  const o = j as { kind?: unknown; versions?: unknown; finalSeats?: unknown };
  if (!o || o.kind !== 'mock-exam-ast-versions' || !Array.isArray(o.versions) || !Array.isArray(o.finalSeats)) return { ok: false, error: '這不是本系統匯出的分科版本檔。' };
  const okV = (x: unknown): x is AstVersion => {
    const v = x as AstVersion;
    return !!v && typeof v.n === 'number' && typeof v.at === 'string' && typeof v.reason === 'string' && typeof v.code === 'string' && Array.isArray(v.snap?.exams) && Array.isArray(v.snap?.study);
  };
  const okS = (x: unknown): x is PrevSeat => {
    const s = x as PrevSeat;
    return !!s && typeof s.code === 'string' && typeof s.roomId === 'string' && typeof s.row === 'number' && typeof s.depth === 'number';
  };
  if (!o.versions.every(okV) || !o.finalSeats.every(okS)) return { ok: false, error: '版本檔內容不完整或格式不對。' };
  return { ok: true, versions: o.versions as AstVersion[], seats: o.finalSeats as PrevSeat[] };
}
