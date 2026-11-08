/**
 * 往返一致：匯入 → 存檔 → 讀回 → 重排 → 輸出前資料（INV-19～INV-24）。
 * 只用虛構資料；記憶體檔案系統，不碰磁碟。
 */
import { describe, expect, it } from 'vitest';
import { runSeating, seatingVersion } from '../core';
import { createMemoryFS } from '../data/dirfs';
import { loadDoc, saveDoc } from '../data/folder';
import { studentCode } from '../data/helpers';
import type { ExamConfig, ExamEntry, Student } from '../data/types';
import { allResolved, applyDiffs, compareRosters, GROUP_TABLES, parseExamList, parseRoster, readXlsx, writeXlsx } from '../import';
import type { Doc } from '../ui/store';
import { genCase, makeRng } from './gen';

const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('存檔往返', () => {
  it('INV-19：saveDoc → loadDoc 位元級一致，讀回後重排得到完全相同的結果與版本碼（150 案例）', async () => {
    let n = 0;
    for (let seed = 1; seed <= 400 && n < 150; seed++) {
      const input = genCase(makeRng(seed));
      const r = runSeating(input);
      if (!r.ok) continue;
      n++;
      const students: Student[] = input.entries.map((e) => ({ classNo: e.classNo, seatNo: e.seatNo, name: e.name }));
      const exam: ExamConfig = {
        id: 'E1',
        name: '測試',
        kind: 'gsat',
        division: input.division,
        semester: 'first',
        participation: 'all',
        subjects: [...input.subjects],
        markRules: [...input.markRules],
        classroomIds: input.classrooms.map((c) => c.id),
        labelLayout: { paper: 'A3', cols: 7, rows: 7 },
        createdAt: '2026-11-08T00:00:00Z',
      };
      const doc: Doc = {
        settings: { schoolName: '測試', headerText: '模擬考', defaultLabelPaper: 'A3', classes: [...input.classes], classrooms: [...input.classrooms] },
        rosters: { senior: input.division === 'senior' ? students : [], junior: input.division === 'junior' ? students : [] },
        exams: [exam],
        examFiles: { E1: { entries: [...input.entries], diffs: [], overrides: [...input.overrides], result: r.result } },
      };
      const fs = createMemoryFS();
      await saveDoc(fs, doc);
      const back = await loadDoc(fs);
      expect(back.warning, `seed=${seed}`).toBeUndefined();
      expect(back.data, `seed=${seed}`).toEqual(json(doc));

      // 讀回的資料再排一次：與存檔時的結果完全相同，版本碼相同（沒有「過期」誤報）
      const f = back.data.examFiles!.E1!;
      const again = runSeating({
        ...input,
        entries: f.entries!,
        overrides: f.overrides!,
        classes: back.data.settings.classes,
        classrooms: back.data.settings.classrooms,
        subjects: back.data.exams[0]!.subjects,
        markRules: back.data.exams[0]!.markRules,
      });
      expect(again.ok).toBe(true);
      if (again.ok) {
        expect(again.result.assignments).toEqual(f.result!.assignments);
        expect(again.result.detaches).toEqual(f.result!.detaches);
        expect(again.result.marks).toEqual(f.result!.marks);
        expect(again.result.dataVersion).toBe(f.result!.dataVersion);
      }
      expect(seatingVersion({ ...input, entries: f.entries! })).toBe(f.result!.dataVersion);
    }
    expect(n).toBeGreaterThanOrEqual(100);
  });

  it('INV-20：寫入第二次（內容不變）不產生備份、改內容才產生備份；主檔被破壞改讀備份並警告', async () => {
    const doc: Doc = { settings: { schoolName: 'A', headerText: '', defaultLabelPaper: 'B4', classes: [], classrooms: [] }, rosters: { senior: [], junior: [] }, exams: [] };
    const fs = createMemoryFS();
    await saveDoc(fs, doc);
    await saveDoc(fs, doc);
    expect([...fs.files.keys()].some((k) => k.endsWith('.bak'))).toBe(false);
    await saveDoc(fs, { ...doc, settings: { ...doc.settings, schoolName: 'B' } });
    expect(fs.files.has('settings.json.bak')).toBe(true);
    fs.files.set('settings.json', fs.files.get('settings.json')!.replace('"B"', '"C"')); // 偽造竄改（校驗碼不符）
    const back = await loadDoc(fs);
    expect(back.warning).toContain('settings.json');
    expect(back.data.settings.schoolName).toBe('A');
  });
});

describe('匯入往返', () => {
  it('INV-21：學生名單 → xlsx → 讀回 → parseRoster，班級、座號、姓名、學號逐筆相同（80 案例）', async () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = makeRng(seed);
      const students: Student[] = [];
      for (let c = 1; c <= rng.int(1, 6); c++) {
        for (let s = 1; s <= rng.int(1, 45); s++) {
          if (rng.chance(0.1)) continue;
          const st: Student = { classNo: c, seatNo: s, name: `甲生${String(c).padStart(2, '0')}${String(s).padStart(2, '0')}` };
          if (rng.chance(0.5)) st.schoolId = `9${String(c).padStart(2, '0')}${String(s).padStart(3, '0')}`;
          students.push(st);
        }
      }
      const rows = [['班級', '座號', '姓名', '學號'], ...students.map((s) => [String(s.classNo), String(s.seatNo), s.name, s.schoolId ?? ''])];
      const sheets = await readXlsx(await writeXlsx(rows));
      const res = parseRoster(sheets[0]!.rows as string[][]);
      expect(res.issues, `seed=${seed}`).toEqual([]);
      expect(res.students, `seed=${seed}`).toEqual(students);
    }
  });

  it('INV-22：考試名單（組別代碼）→ xlsx → 讀回 → parseExamList，科目由組別表決定、缺考與加考正確（80 案例）', async () => {
    for (let seed = 1; seed <= 80; seed++) {
      const rng = makeRng(seed);
      const round = rng.int(1, 4);
      const table = GROUP_TABLES[round >= 3 ? 'second' : 'first'];
      const keys = Object.keys(table);
      const want: ExamEntry[] = [];
      const rows: string[][] = [['班級', '座號', '姓名', '組別', '特殊生需求註明']];
      for (let c = 1; c <= rng.int(1, 6); c++) {
        for (let s = 1; s <= rng.int(1, 40); s++) {
          const g = rng.pick(keys);
          const subjects = [...table[g]!];
          const name = `甲生${String(c).padStart(2, '0')}${String(s).padStart(2, '0')}`;
          want.push({ classNo: c, seatNo: s, name, subjectIds: subjects, groupCode: g });
          rows.push([String(c), String(s), name, g, '']);
        }
      }
      const res = parseExamList((await readXlsx(await writeXlsx(rows)))[0]!.rows as string[][], { round });
      expect(res.issues, `seed=${seed}`).toEqual([]);
      expect(res.entries, `seed=${seed}`).toEqual(want);
    }
  });
});

describe('名單比對往返', () => {
  /** 隨機製造：兩份名單彼此有缺人、改名、換座號 */
  function scenario(seed: number) {
    const rng = makeRng(seed);
    const roster: Student[] = [];
    const entries: ExamEntry[] = [];
    for (let c = 1; c <= rng.int(1, 5); c++) {
      for (let s = 1; s <= rng.int(1, 30); s++) {
        const name = `甲生${String(c).padStart(2, '0')}${String(s).padStart(2, '0')}`;
        const kind = rng.pick(['same', 'same', 'same', 'rosterOnly', 'examOnly', 'rename', 'moved'] as const);
        if (kind !== 'examOnly') roster.push({ classNo: c, seatNo: s, name });
        if (kind === 'same' || kind === 'examOnly') entries.push({ classNo: c, seatNo: s, name, subjectIds: ['a'] });
        if (kind === 'rename') entries.push({ classNo: c, seatNo: s, name: name + '改', subjectIds: ['a'] });
        if (kind === 'moved') entries.push({ classNo: c, seatNo: s + 50, name, subjectIds: ['a'] });
      }
    }
    return { roster, entries, participation: rng.pick(['all', 'partial'] as const) };
  }

  it('INV-23：全部「以考試名單為準」或全部「以學生名單為準」處理後，兩份名單完全吻合（再比對零差異）、人數守恆（200 案例）', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { roster, entries, participation } = scenario(seed);
      const { diffs } = compareRosters(roster, entries, participation);
      for (const choice of ['use-exam', 'use-roster'] as const) {
        const decided = diffs.map((d) => ({ ...d, choice }));
        expect(allResolved(decided)).toBe(true);
        const out = applyDiffs(roster, entries, decided);
        // 結果內沒有重複的編號
        const sc = out.students.map((s) => studentCode(s.classNo, s.seatNo));
        const ec = out.entries.map((s) => studentCode(s.classNo, s.seatNo));
        expect(new Set(sc).size, `seed=${seed} ${choice} 學生名單重複`).toBe(sc.length);
        expect(new Set(ec).size, `seed=${seed} ${choice} 考試名單重複`).toBe(ec.length);
        // 再比對：全員參加時兩邊必須完全一致；部分參加時考試名單必須是學生名單的子集且姓名相同
        // 不經過 compareRosters，直接逐筆比：同編號的人，兩份名單的姓名必須相同
        const nameOf = new Map(out.students.map((x) => [studentCode(x.classNo, x.seatNo), x.name.trim()]));
        for (const e of out.entries) expect(nameOf.get(studentCode(e.classNo, e.seatNo)), `seed=${seed} ${choice} ${e.classNo}-${e.seatNo}`).toBe(e.name.trim());
        const again = compareRosters(out.students, out.entries, participation);
        expect(again.diffs, `seed=${seed} ${choice} ${participation}`).toEqual([]);
      }
    }
  });

  it('INV-24：沒有差異的人，處理後科目原封不動（考試名單的 subjectIds 不遺失）', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { roster, entries, participation } = scenario(seed);
      const { diffs } = compareRosters(roster, entries, participation);
      const touched = new Set(diffs.flatMap((d) => [d.code, ...(d.exam ? [studentCode(d.exam.classNo, d.exam.seatNo)] : [])]));
      const out = applyDiffs(roster, entries, diffs.map((d) => ({ ...d, choice: 'use-exam' as const })));
      for (const e of entries) {
        const code = studentCode(e.classNo, e.seatNo);
        if (touched.has(code)) continue;
        expect(out.entries.find((x) => studentCode(x.classNo, x.seatNo) === code)?.subjectIds, `seed=${seed} ${code}`).toEqual(e.subjectIds);
      }
    }
  });
});
