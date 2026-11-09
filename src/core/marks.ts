/**
 * 標示規則（D5、D11、D12、D67）。輸出只有抽象標記（absent＝不考、extra＝加考），不含顏色（顏色屬畫面層）。
 * - 標少數（D11）：考的人少就標「加考」，不考的人少就標「不考」。
 * - 接近一半由使用者選、選完鎖定（D12），程式只提醒。
 * - 英聽人人都考，不參與標示與抽離（D67）。
 */
import type { ClassInfo, ExamEntry, Mark, MarkMode, MarkRule, Subject, Track } from '../data/types';
import { studentCode } from '../data/helpers';

/** 「接近一半」的門檻：少數一方占比 ≥ 此值就要使用者裁示（預設 0.4，待使用者確認） */
export const NEAR_HALF_RATIO = 0.4;

/** 英聽科目（D67）：名稱含「英聽」或「聽力」 */
export function isListeningSubject(s: Subject): boolean {
  return /英聽|聽力/.test(s.name);
}

export interface MarkSuggestion {
  track?: Track;
  subjectId: string;
  total: number;
  taking: number;
  suggested: MarkMode;
  /** 接近一半：程式提醒，由使用者選（D12） */
  needsDecision: boolean;
}

export function suggestMarkMode(
  taking: number,
  total: number,
  nearHalf = NEAR_HALF_RATIO,
): { suggested: MarkMode; needsDecision: boolean } {
  const notTaking = total - taking;
  if (total === 0 || taking === 0 || notTaking === 0) return { suggested: 'none', needsDecision: false };
  const minority = Math.min(taking, notTaking);
  return {
    suggested: taking < notTaking ? 'mark-extra' : 'mark-absent',
    needsDecision: taking === notTaking || minority / total >= nearHalf,
  };
}

function trackOf(entry: ExamEntry, classes: ReadonlyMap<number, ClassInfo>): Track | undefined {
  return entry.track ?? classes.get(entry.classNo)?.track;
}

/** 依實際考試人數，對每個組別（國中部為全體）每科提出標示建議 */
export function suggestMarks(
  entries: readonly ExamEntry[],
  classes: readonly ClassInfo[],
  subjects: readonly Subject[],
  nearHalf = NEAR_HALF_RATIO,
): MarkSuggestion[] {
  const byNo = new Map(classes.map((c) => [c.no, c]));
  const groups = new Map<Track | undefined, ExamEntry[]>();
  for (const e of entries) {
    const t = trackOf(e, byNo);
    const list = groups.get(t) ?? [];
    list.push(e);
    groups.set(t, list);
  }
  const out: MarkSuggestion[] = [];
  const order: (Track | undefined)[] = [undefined, 'science', 'liberal'];
  for (const track of order) {
    const list = groups.get(track);
    if (!list) continue;
    for (const s of subjects) {
      if (isListeningSubject(s)) continue;
      const taking = list.filter((e) => e.subjectIds.includes(s.id)).length;
      const r = suggestMarkMode(taking, list.length, nearHalf);
      out.push({ ...(track ? { track } : {}), subjectId: s.id, total: list.length, taking, ...r });
    }
  }
  return out;
}

/** 套用標示規則，產生每位考生每科的標記（標示即抽離，D5） */
export function applyMarks(
  entries: readonly ExamEntry[],
  classes: readonly ClassInfo[],
  subjects: readonly Subject[],
  rules: readonly MarkRule[],
): Mark[] {
  const byNo = new Map(classes.map((c) => [c.no, c]));
  const listening = new Set(subjects.filter(isListeningSubject).map((s) => s.id));
  const out: Mark[] = [];
  for (const e of entries) {
    const track = trackOf(e, byNo);
    for (const rule of rules) {
      if (rule.track !== track || listening.has(rule.subjectId)) continue;
      const takes = e.subjectIds.includes(rule.subjectId);
      const code = studentCode(e.classNo, e.seatNo);
      if (rule.mode === 'mark-absent' && !takes) out.push({ code, subjectId: rule.subjectId, mode: 'absent' });
      if (rule.mode === 'mark-extra' && takes) out.push({ code, subjectId: rule.subjectId, mode: 'extra' });
    }
  }
  return out;
}

/** 檢查規則：每組每科至多一條（避免重複標示） */
export function duplicateRules(rules: readonly MarkRule[]): string[] {
  const seen = new Set<string>();
  const dup: string[] = [];
  for (const r of rules) {
    const k = `${r.track ?? ''}/${r.subjectId}`;
    if (seen.has(k)) dup.push(k);
    seen.add(k);
  }
  return dup;
}
