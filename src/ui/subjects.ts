/** 考科表預設（D36、D52、D13）：依類型與次別自動帶入，改過標「已自訂」。純函式。 */
import type { ExamKind, Subject } from '../data';

const s = (id: string, name: string): Subject => ({ id, name });

/** 會考固定七科（DESIGN 10.4，不可改） */
export const BCCT_SUBJECTS: Subject[] = [
  s('chinese', '國文'), s('en-read', '英語閱讀'), s('en-listen', '英語聽力'), s('math', '數學'),
  s('social', '社會'), s('science', '自然'), s('writing', '寫作測驗'),
];

/** 分科測驗八科（大考中心；每科都是選考，國英不加考，採學測成績） */
export const AST_SUBJECTS: Subject[] = [
  s('math-jia', '數學甲'), s('math-yi', '數學乙'), s('physics', '物理'), s('chemistry', '化學'),
  s('biology', '生物'), s('history', '歷史'), s('geography', '地理'), s('civics', '公民與社會'),
];

/** 分科預設選考（使用者 2026-11-09 裁示）：理組＝自然科＋數甲；文組＝社會科＋數乙；皆可加考，國英不加考 */
export const AST_DEFAULT_BY_TRACK: Record<'science' | 'liberal', string[]> = {
  science: ['math-jia', 'physics', 'chemistry', 'biology'],
  liberal: ['math-yi', 'history', 'geography', 'civics'],
};

/**
 * 分科報名「組別」代碼表（大考中心五種組別；真實名單右側附表，114-2 學年名單確認）：
 * 組別格寫「2-自然組-理工類」，取開頭的號碼。沒有「5」：名單出現過「5-社會組」只有一筆，視為 4 社會組（AST_GROUP_ALIAS），匯入時留痕。
 */
export const AST_GROUP_TABLE: Record<string, string[]> = {
  '1': ['math-jia', 'physics', 'chemistry', 'biology'], // 自然組—醫學類
  '2': ['math-jia', 'physics', 'chemistry'], // 自然組—理工類
  '3': ['math-jia', 'chemistry', 'biology'], // 自然組—農學類
  '9': ['math-yi', 'history', 'geography', 'civics'], // 社會乙組
  '4': ['history', 'geography', 'civics'], // 社會組
};

/** 名單常見的非標準代碼：「5-社會組」（只出現過一筆）視為 4 社會組（使用者 2026-11-12 裁決 12），匯入時在處理紀錄留痕 */
export const AST_GROUP_ALIAS: Record<string, string> = { '5': '4' };

/** 分科考生的文理組：考任何自然科（數甲、物理、化學、生物）就是理組，否則文組；沒有科目回 undefined */
export function astTrackOfSubjects(subjectIds: readonly string[]): 'science' | 'liberal' | undefined {
  if (subjectIds.length === 0) return undefined;
  return subjectIds.some((x) => ['math-jia', 'physics', 'chemistry', 'biology'].includes(x)) ? 'science' : 'liberal';
}

/** 學測：第 1、2 次數學單一科且有英聽；第 3、4 次數學分 A、B，無英聽（D36/D52） */
export function defaultSubjects(kind: ExamKind, round = 1): Subject[] {
  if (kind === 'bcct') return BCCT_SUBJECTS.map((x) => ({ ...x }));
  if (kind === 'ast') return AST_SUBJECTS.map((x) => ({ ...x }));
  const early = round <= 2;
  return [
    s('chinese', '國文'), s('english', '英文'),
    ...(early ? [s('math', '數學')] : [s('math-a', '數學A'), s('math-b', '數學B')]),
    s('social', '社會'), s('science', '自然'),
    ...(early ? [s('en-listen', '英聽')] : []),
  ];
}

export const isCustomized = (subjects: Subject[]): boolean => subjects.some((x) => x.custom);

export function renameSubject(list: Subject[], id: string, name: string): Subject[] {
  return list.map((x) => (x.id === id ? { ...x, name: name.trim() || x.name, custom: true } : x));
}

export function removeSubject(list: Subject[], id: string): Subject[] {
  return list.filter((x) => x.id !== id);
}

export function addSubject(list: Subject[], name: string): Subject[] {
  const n = name.trim();
  if (!n || list.some((x) => x.name === n)) return list;
  let i = list.length + 1;
  while (list.some((x) => x.id === `custom-${i}`)) i++;
  return [...list, { id: `custom-${i}`, name: n, custom: true }];
}

/** 誰要考（原型步驟①「誰要考」欄）：預設只有數學A／B、自然、社會依組別，其餘每位考生都考；使用者可改 */
export type SubjectWho = 'all' | 'group';
const GROUP_IDS = new Set(['math-a', 'math-b', 'science', 'social']);
export function subjectWho(kind: ExamKind, s: Subject): SubjectWho {
  if (s.who) return s.who;
  if (kind === 'bcct') return 'all';
  if (kind === 'ast') return 'group'; // 分科每一科都是選考
  return GROUP_IDS.has(s.id) ? 'group' : 'all';
}
export const WHO_LABEL: Record<SubjectWho, string> = { all: '每位考生都考', group: '依組別代碼決定' };

/** 科目旁的說明標籤：依次別（數學隨次別變）、只有第 1、2 次（英聽）；「已自訂」另由 s.custom 決定 */
export function subjectTags(kind: ExamKind, s: Subject): { text: string; tone?: 'info' | 'warn' }[] {
  if (kind === 'bcct') return [];
  const tags: { text: string; tone?: 'info' | 'warn' }[] = [];
  if (!s.custom && (s.id === 'math' || s.id === 'math-a' || s.id === 'math-b')) tags.push({ text: '依次別', tone: 'info' });
  if (s.custom) tags.push({ text: '已自訂', tone: 'warn' });
  if (s.id === 'en-listen') tags.push({ text: '只有第 1、2 次' });
  return tags;
}

/** 數學是否分 A、B（第 3 次起） */
export const mathSplit = (round: number | undefined): boolean => (round ?? 1) >= 3;

/** 新增／編輯單一科目：名稱不可空白、不可與其他科目同名；回傳新的考科表或錯誤 */
export function saveSubject(kind: ExamKind, list: Subject[], id: string | null, name: string, who: SubjectWho): { ok: true; list: Subject[] } | { ok: false; error: string } {
  const n = name.trim();
  if (!n) return { ok: false, error: '科目名稱不能空白' };
  if (list.some((x) => x.id !== id && x.name === n)) return { ok: false, error: `已有「${n}」這一科` };
  if (id === null) {
    let i = list.length + 1;
    while (list.some((x) => x.id === `custom-${i}`)) i++;
    return { ok: true, list: [...list, { id: `custom-${i}`, name: n, custom: true, who }] };
  }
  // 什麼都沒改就不標「已自訂」
  const cur = list.find((x) => x.id === id);
  if (!cur || (cur.name === n && subjectWho(kind, cur) === who)) return { ok: true, list };
  return { ok: true, list: list.map((x) => (x.id === id ? { ...x, name: n, who, custom: true } : x)) };
}
