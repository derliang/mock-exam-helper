/**
 * 科目標示分群（E 包）：把整份考試名單裡「出現過的各種標示寫法」依相似度分組並計次，
 * 由使用者逐組對應到科目或「忽略」。程式只提供建議（suggestion），不自動採用。
 */
import { normalizeCell } from './columns';

export type MarkRole = 'absent' | 'extra' | 'taking';
export const IGNORE = 'ignore';

const ABSENT_PREFIX = /^(缺考|缺|不考|免考|X|×|✗|✘)(?=.)/;
const EXTRA_PREFIX = /^(加考|加|\+)(?=.)/;
/** 單字科目縮寫：可連寫（「缺國英」「國英數」） */
const INITIALS = '國英數自社理歷地公物化生';

export interface RawMark {
  /** 原文（去頭尾空白） */
  raw: string;
  /** 比對用核心：全半形、大小寫、去括號與前綴 */
  key: string;
  /** 前綴改變語意時的角色（缺／加）；沒有前綴為 null，沿用欄位角色 */
  prefixRole: MarkRole | null;
}

/** 單一標示字串 → 核心 key 與前綴角色 */
export function markCore(raw: string): { key: string; prefixRole: MarkRole | null } {
  let s = normalizeCell(raw).toUpperCase().replace(/[()（）「」『』[\]【】"'`]/g, '');
  let prefixRole: MarkRole | null = null;
  if (ABSENT_PREFIX.test(s)) { prefixRole = 'absent'; s = s.replace(ABSENT_PREFIX, ''); }
  else if (EXTRA_PREFIX.test(s)) { prefixRole = 'extra'; s = s.replace(EXTRA_PREFIX, ''); }
  return { key: s, prefixRole };
}

/**
 * 把一格文字切成標示：以頓號、逗號、分號、斜線、加號、空白切開；
 * 全是單字縮寫的連寫字串（「缺國英」）拆成單字。過長的句子（備註說明）不是標示，回傳在 prose。
 */
export function tokenizeMarks(cell: string): { marks: RawMark[]; prose: string[] } {
  const marks: RawMark[] = [];
  const prose: string[] = [];
  const parts = cell.split(/[、，,;；/／+＋\s]+/).map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    const { key, prefixRole } = markCore(p);
    if (!key) continue;
    if (key.length > 6) { prose.push(p); continue; }
    const chars = [...key];
    if (chars.length >= 2 && chars.every((c) => INITIALS.includes(c))) {
      for (const c of chars) marks.push({ raw: prefixRole ? `${p.slice(0, p.length - key.length)}${c}` : c, key: c, prefixRole });
    } else marks.push({ raw: p, key, prefixRole });
  }
  return { marks, prose };
}

export type MarkKind = 'subject' | 'symbol' | 'other';

const SYMBOL_CLASSES: [string, string][] = [
  ['✓✔☑√V', 'check'], ['○〇◯O◎●', 'circle'], ['×✗✘X', 'cross'], ['1', 'one'],
];
const symbolClass = (k: string): string | null => {
  if (k.length !== 1) return null;
  for (const [chars, cls] of SYMBOL_CLASSES) if (chars.includes(k)) return cls;
  return /[\p{P}\p{S}\d]/u.test(k) ? `sym:${k}` : null;
};

export function markKind(key: string): MarkKind {
  if (symbolClass(key)) return 'symbol';
  if (/^[一-鿿A-Z]+$/.test(key)) return 'subject';
  return 'other';
}

/** 結尾的甲乙／A／B 變體：數A 與 數 不可併成一組 */
const variantOf = (k: string): string => (k.match(/[AB甲乙]$/)?.[0] ?? '').replace('甲', 'A').replace('乙', 'B');
const baseOf = (k: string): string => k.replace(/[AB甲乙]$/, '').replace(/學$/, '');

function oneOff(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++d > 1) return false;
  return true;
}

const isSubseq = (a: string, b: string): boolean => {
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
};

/** 兩個核心是否屬於同一類寫法 */
export function similarMarks(a: string, b: string): boolean {
  if (a === b) return true;
  const sa = symbolClass(a);
  const sb = symbolClass(b);
  if (sa || sb) return sa !== null && sa === sb;
  if (variantOf(a) !== variantOf(b)) return false;
  const x = baseOf(a);
  const y = baseOf(b);
  if (!x || !y) return false;
  const ascii = /^[A-Z]+$/;
  if (ascii.test(x) !== ascii.test(y)) return false;
  if (x.includes(y) || y.includes(x)) return true; // 國 ⊂ 國文、CH ⊂ CHINESE
  if (!ascii.test(x) && (isSubseq(x, y) || isSubseq(y, x))) return true; // 國文 ⊂ 國語文
  return Math.min(x.length, y.length) >= 3 && oneOff(x, y);
}

export interface MarkMember {
  raw: string;
  key: string;
  count: number;
}
export interface MarkGroup {
  /** 群組代號＝最常見成員的 key（相同次數取較短者），可當對應的鍵 */
  id: string;
  kind: MarkKind;
  members: MarkMember[];
  total: number;
  /** 建議的科目 id（只是提示；沒有把握就沒有） */
  suggestion?: string;
}

/** 對一批標示（可重複）分群，依總次數由多到少 */
export function groupMarks(marks: readonly RawMark[], subjects: readonly { id: string; name: string }[] = []): MarkGroup[] {
  const byKey = new Map<string, MarkMember[]>();
  const rawCount = new Map<string, number>();
  for (const m of marks) rawCount.set(`${m.key}\u0000${m.raw}`, (rawCount.get(`${m.key}\u0000${m.raw}`) ?? 0) + 1);
  for (const [k, count] of rawCount) {
    const [key, raw] = k.split('\u0000') as [string, string];
    byKey.set(key, [...(byKey.get(key) ?? []), { raw, key, count }]);
  }
  const keys = [...byKey.keys()];
  const parent = new Map(keys.map((k) => [k, k]));
  const find = (k: string): string => { let r = k; while (parent.get(r) !== r) r = parent.get(r) as string; return r; };
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++)
      if (similarMarks(keys[i] as string, keys[j] as string)) parent.set(find(keys[i] as string), find(keys[j] as string));
  const clusters = new Map<string, MarkMember[]>();
  for (const k of keys) clusters.set(find(k), [...(clusters.get(find(k)) ?? []), ...(byKey.get(k) ?? [])]);
  const groups: MarkGroup[] = [];
  for (const members of clusters.values()) {
    members.sort((a, b) => b.count - a.count || a.key.length - b.key.length || a.raw.localeCompare(b.raw));
    const total = members.reduce((n, m) => n + m.count, 0);
    const lead = members[0] as MarkMember;
    const g: MarkGroup = { id: lead.key, kind: markKind(lead.key), members, total };
    const s = g.kind === 'subject' ? suggestSubject(members.map((m) => m.key), subjects) : undefined;
    if (s) g.suggestion = s;
    groups.push(g);
  }
  return groups.sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

/** 常見別名（以科目「名稱」的特徵字辨識） */
const ALIASES: [RegExp, string[]][] = [
  [/國/, ['國', 'CH', 'CHI', 'CHINESE', 'C']],
  [/英(?!聽)/, ['英', 'ENG', 'EN', 'ENGLISH', 'E']],
  [/數.*A|數甲/, ['數A', '數甲', 'MA', 'MATHA']],
  [/數.*B|數乙/, ['數B', '數乙', 'MB', 'MATHB']],
  [/^數學?$/, ['數', 'MATH', 'M']],
  [/自/, ['自', '自然', 'SCI', 'SCIENCE', 'S']],
  [/社/, ['社', '社會', 'SOC', 'SOCIAL']],
];

/** 群組成員 → 建議科目 id；多個科目都符合（或都不符合）就不建議 */
export function suggestSubject(keys: readonly string[], subjects: readonly { id: string; name: string }[]): string | undefined {
  const hits = new Set<string>();
  for (const s of subjects) {
    const name = normalizeCell(s.name).toUpperCase();
    for (const k of keys) {
      const direct = k === name || (k.length >= 1 && name.startsWith(k) && variantOf(k) === variantOf(name) && !/^[A-Z]$/.test(k));
      const alias = ALIASES.some(([re, list]) => re.test(name) && list.includes(k));
      if (direct || alias) hits.add(s.id);
    }
  }
  return hits.size === 1 ? [...hits][0] : undefined;
}

/** 可存、可重用的對應：標示核心 key → 科目 id 或 "ignore" */
export type SavedMarkMap = Record<string, string>;

/** 把使用者在這份檔案的選擇記進對應庫（只記有選的組） */
export function rememberMapping(groups: readonly MarkGroup[], choice: Readonly<Record<string, string>>, saved: SavedMarkMap = {}): SavedMarkMap {
  const out = { ...saved };
  for (const g of groups) {
    const c = choice[g.id];
    if (c) for (const m of g.members) out[m.key] = c;
  }
  return out;
}

/** 用對應庫預先填入：組內已記錄的成員全部一致才套用，有衝突的組留給使用者 */
export function prefillMapping(groups: readonly MarkGroup[], saved: SavedMarkMap, validTargets: readonly string[]): Record<string, string> {
  const ok = new Set([...validTargets, IGNORE]);
  const out: Record<string, string> = {};
  for (const g of groups) {
    const vals = new Set(g.members.map((m) => saved[m.key]).filter((v): v is string => v !== undefined));
    if (vals.size === 1) {
      const v = [...vals][0] as string;
      if (ok.has(v)) out[g.id] = v;
    }
  }
  return out;
}
