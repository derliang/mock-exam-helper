/** 考科表預設（D36、D52、D13）：依類型與次別自動帶入，改過標「已自訂」。純函式。 */
import type { ExamKind, Subject } from '../data';

const s = (id: string, name: string): Subject => ({ id, name });

/** 會考固定七科（DESIGN 10.4，不可改） */
export const BCCT_SUBJECTS: Subject[] = [
  s('chinese', '國文'), s('en-read', '英語閱讀'), s('en-listen', '英語聽力'), s('math', '數學'),
  s('social', '社會'), s('science', '自然'), s('writing', '寫作測驗'),
];

/** 學測：第 1、2 次數學單一科且有英聽；第 3、4 次數學分 A、B，無英聽（D36/D52） */
export function defaultSubjects(kind: ExamKind, round = 1): Subject[] {
  if (kind === 'bcct') return BCCT_SUBJECTS.map((x) => ({ ...x }));
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
