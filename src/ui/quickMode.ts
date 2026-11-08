/**
 * 會考快速模式的純邏輯（H7，D77⑤）：只用於會考（科目固定七科、無選考）。
 * 沿用上次且四項檢查全成立才進入；任一不成立退回一般六步驟並說明是哪一項。
 */
import type { ExamConfig, ExamEntry } from '../data';
import { compareRosters, type Sheet } from '../import';
import { parseExamWorkbook } from './step2';
import { examEntries, examRooms, hasImportedList } from './seating';
import { previousExam as storePrevious, type Doc } from './store';

export type QuickKey = 'rooms' | 'roster' | 'count' | 'subjects';

export interface QuickCheck {
  key: QuickKey;
  /** ok＝成立；fail＝不成立；pending＝要等貼上新名單才能判斷 */
  state: 'ok' | 'fail' | 'pending';
  text: string;
}

export interface QuickResult {
  /** unavailable＝退回一般六步驟；ready＝可貼上名單；passed＝四項全成立 */
  status: 'unavailable' | 'ready' | 'passed';
  checks: QuickCheck[];
  /** 沿用的上一次會考；沒有就是 undefined */
  previous?: ExamConfig;
}

/** 上一次會考：與新增考試的「上次」同一個定義（store.previousExam：同類型、最近修改），另要求不是自己且已有考試名單 */
export function previousExam(doc: Doc, exam: ExamConfig): ExamConfig | undefined {
  return storePrevious(doc, 'bcct', (e) => e.id !== exam.id && hasImportedList(doc, e));
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);

/** 新名單的匯入結果（科目是否都對得上）；只在貼上之後才有 */
export interface QuickInput { entries: ExamEntry[]; problems: number }

export function quickCheck(doc: Doc, exam: ExamConfig, input?: QuickInput): QuickResult {
  if (exam.kind !== 'bcct') {
    return { status: 'unavailable', checks: [{ key: 'rooms', state: 'fail', text: '快速模式只用於會考，這次不是會考。' }] };
  }
  const prev = previousExam(doc, exam);
  const checks: QuickCheck[] = [];
  if (!prev) {
    return { status: 'unavailable', checks: [{ key: 'rooms', state: 'fail', text: '沒有上一次會考可以沿用（要先完整做過一次）。' }] };
  }
  // ① 教室沒變
  const sameRooms = sameSet(exam.classroomIds, prev.classroomIds) && examRooms(doc, exam).some((r) => r.kind === 'class');
  checks.push({ key: 'rooms', state: sameRooms ? 'ok' : 'fail', text: sameRooms ? '教室與上次相同。' : '教室與上次不同（或這次還沒選教室）。' });
  // ② 學生名單沒變：現在的學生名單與上次考試名單比對沒有差異
  const roster = doc.rosters[exam.division];
  const d = compareRosters(roster, examEntries(doc, prev), prev.participation).diffs.length;
  checks.push({ key: 'roster', state: d === 0 ? 'ok' : 'fail', text: d === 0 ? '學生名單與上次相同。' : `學生名單與上次不同，有 ${d} 筆差異。` });
  // ③ 新名單人數相符、④ 科目都對得上：要貼上之後才知道
  if (!input) {
    checks.push({ key: 'count', state: 'pending', text: '貼上新名單後檢查人數是否等於考生數。' });
    checks.push({ key: 'subjects', state: 'pending', text: '貼上新名單後檢查科目標示是否都對得上。' });
  } else {
    const diff = compareRosters(roster, input.entries, exam.participation).diffs.length;
    const okCount = input.entries.length === roster.length && diff === 0;
    checks.push({ key: 'count', state: okCount ? 'ok' : 'fail', text: okCount ? `新名單 ${input.entries.length} 人，與考生數相符。` : `新名單 ${input.entries.length} 人，學生名單 ${roster.length} 人，另有 ${diff} 筆姓名或座號差異。` });
    checks.push({ key: 'subjects', state: input.problems === 0 ? 'ok' : 'fail', text: input.problems === 0 ? '科目標示都對得上。' : `有 ${input.problems} 處科目標示對不上考科表。` });
  }
  if (checks.some((c) => c.state === 'fail')) return { status: 'unavailable', checks, previous: prev };
  return { status: checks.some((c) => c.state === 'pending') ? 'ready' : 'passed', checks, previous: prev };
}

/** 貼上的文字（從 Excel 複製＝以 Tab 分欄）轉成工作表 */
export function sheetFromPaste(text: string): Sheet[] {
  const rows = text.split(/\r?\n/).map((l) => l.split(/\t|,/).map((c) => c.trim())).filter((r) => r.some((c) => c));
  return rows.length ? [{ name: '貼上的名單', rows }] : [];
}

/** 解析貼上的名單，回傳 entries 與「對不上的處數」（解析問題＋被略過科目的人） */
export function parsePasted(exam: ExamConfig, classNames: readonly string[], text: string): QuickInput | null {
  const sheets = sheetFromPaste(text);
  if (!sheets.length) return null;
  const r = parseExamWorkbook(sheets, exam, classNames);
  return { entries: r.entries, problems: r.issues.length + r.droppedSubjects };
}
