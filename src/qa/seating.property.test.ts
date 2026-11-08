/**
 * 排座性質測試：固定種子產生大量隨機案例，逐一檢查不變式（INV-1～INV-12）。
 * 失敗訊息帶種子，用 makeRng(種子) + genCase 可原樣重現。
 */
import { describe, expect, it } from 'vitest';
import { classroomSeats, studentCode } from '../data/helpers';
import { runSeating, seatingVersion } from '../core';
import { genCase, makeRng } from './gen';
import { checkMainSeating, checkMarksAndDetach, seatableEntries } from './invariants';

const N = 600;

/** 獨立 oracle：座位夠不夠（主排座）。高中部分組，國中部全體 */
function mainCapacityShort(i: ReturnType<typeof genCase>): boolean {
  i = { ...i, entries: seatableEntries(i) }; // D79：全科缺考者不排座
  const rooms = i.classrooms.filter((c) => c.kind === 'class');
  const groups: [string | undefined, string[]][] =
    i.division === 'junior'
      ? [[undefined, i.entries.map((e) => studentCode(e.classNo, e.seatNo))]]
      : (['science', 'liberal'] as const).map((t) => [
          t,
          i.entries.filter((e) => i.classes.find((c) => c.no === e.classNo)?.track === t).map((e) => studentCode(e.classNo, e.seatNo)),
        ]);
  return groups.some(([t, codes]) => codes.length > 0 && rooms.filter((r) => (t ? r.track === t : true)).reduce((a, r) => a + classroomSeats(r).length, 0) < codes.length);
}

/** 獨立 oracle：預備教室夠不夠（每科：考試教室取最少前綴，自習再從下一間起取） */
function reserveShort(i: ReturnType<typeof genCase>): boolean {
  i = { ...i, entries: seatableEntries(i) };
  const reserve = i.classrooms.filter((c) => c.kind === 'reserve');
  const track = new Map(i.classes.map((c) => [c.no, c.track]));
  const ov = new Set(i.overrides.map((o) => o.code));
  const need = (exam: number): number => {
    let cap = 0;
    let k = 0;
    while (cap < exam && k < reserve.length) cap += reserve[k++]!.seatCount;
    return cap >= exam ? k : -1;
  };
  for (const s of i.subjects) {
    if (/英聽|聽力/.test(s.name)) continue;
    let exam = 0;
    let study = 0;
    for (const e of i.entries) {
      const code = studentCode(e.classNo, e.seatNo);
      if (ov.has(code)) continue;
      const rule = i.markRules.find((r) => r.track === track.get(e.classNo) && r.subjectId === s.id);
      const takes = e.subjectIds.includes(s.id);
      if (rule?.mode === 'mark-extra' && takes) exam++;
      if (rule?.mode === 'mark-absent' && !takes) study++;
    }
    if (!exam && !study) continue;
    const k = need(exam);
    if (k < 0) return true;
    if (study) {
      let cap = 0;
      let j = k;
      while (cap < study && j < reserve.length) cap += reserve[j++]!.seatCount;
      if (cap < study) return true;
    }
  }
  return false;
}

describe('排座性質測試（固定種子）', () => {
  it(`座位夠時：${N} 個隨機案例，所有不變式成立，且不會莫名失敗`, () => {
    let okCount = 0;
    let failCount = 0;
    for (let seed = 1; seed <= N; seed++) {
      const input = genCase(makeRng(seed));
      const r = runSeating(input);
      const short = mainCapacityShort(input);
      if (!r.ok) {
        // 失敗只允許兩個原因：主座位不足、預備教室不足；其餘都是缺陷
        const expectedFail = short || reserveShort(input);
        expect(expectedFail, `seed=${seed} 不該失敗：${r.errors.join('；')}`).toBe(true);
        failCount++;
        continue;
      }
      expect(short, `seed=${seed} 座位不足卻成功`).toBe(false);
      expect(reserveShort(input), `seed=${seed} 預備教室不足卻成功`).toBe(false);
      const main = checkMainSeating(input, r.result);
      expect(main, `seed=${seed}`).toEqual([]);
      const det = checkMarksAndDetach(input, r.result, r.special);
      expect(det, `seed=${seed}`).toEqual([]);
      okCount++;
    }
    // 守門：兩種路徑都真的有跑到，避免產生器退化成只測一邊
    expect(okCount).toBeGreaterThan(N * 0.5);
    expect(failCount).toBeGreaterThan(0);
  });

  it('座位刻意不夠：一定擋下並說明，絕不輸出部分結果（D25）', () => {
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = genCase(makeRng(seed * 7919), { enough: false });
      if (!mainCapacityShort(input)) continue;
      const r = runSeating(input);
      expect(r.ok, `seed=${seed * 7919}`).toBe(false);
      if (!r.ok) {
        expect(r.errors.length).toBeGreaterThan(0);
        // 錯誤訊息只含考生編號、不含姓名（公開 repo、log 安全）
        expect(r.errors.join(''), `seed=${seed * 7919}`).not.toContain('甲生');
      }
      n++;
    }
    expect(n).toBeGreaterThan(50);
  });

  it('同樣輸入永遠同樣輸出（決定性），且產生時間不影響資料版本碼', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = genCase(makeRng(seed));
      const a = runSeating(input);
      const b = runSeating({ ...input, now: '2030-01-01T00:00:00Z' });
      expect(a.ok).toBe(b.ok);
      if (a.ok && b.ok) {
        expect(a.result.assignments).toEqual(b.result.assignments);
        expect(a.result.detaches).toEqual(b.result.detaches);
        expect(a.result.dataVersion).toBe(b.result.dataVersion);
        expect(a.result.dataVersion).toBe(seatingVersion(input));
      }
    }
  });

  it('改名單或設定，資料版本碼一定改變（過期偵測 D22/D66）', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const input = genCase(makeRng(seed), { division: 'junior' });
      if (input.entries.length === 0) continue;
      const base = seatingVersion(input);
      const e0 = input.entries[0]!;
      const renamed = { ...input, entries: [{ ...e0, name: e0.name + '改' }, ...input.entries.slice(1)] };
      const fewer = { ...input, entries: input.entries.slice(1) };
      const rule = { ...input, markRules: [...input.markRules, { subjectId: 'zzz', mode: 'mark-extra' as const }] };
      const room = { ...input, classrooms: input.classrooms.map((c, i) => (i === 0 ? { ...c, seatCount: Math.max(1, c.seatCount - 1) } : c)) };
      for (const changed of [renamed, fewer, rule]) expect(seatingVersion(changed), `seed=${seed}`).not.toBe(base);
      if (input.classrooms[0]!.seatCount > 1) expect(seatingVersion(room)).not.toBe(base);
    }
  });
});

describe('邊界案例', () => {
  // 邊界案例的考生沒有填科目，用 seatFullyAbsent 讓他們照排（全科缺考的行為另見 core/d79d80.test.ts）
  const base = { ...genCase(makeRng(1), { division: 'junior' }), seatFullyAbsent: true };
  const room = (id: string, rows: number, depth: number, seatCount = rows * depth) => ({ id, name: id, kind: 'class' as const, rows, depth, seatCount });

  it('單一考生', () => {
    const r = runSeating({
      ...base,
      classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }],
      classrooms: [room('A', 3, 3)],
      entries: [{ classNo: 1, seatNo: 1, name: '甲生0101', subjectIds: [] }],
      markRules: [],
      overrides: [],
    });
    expect(r.ok && r.result.assignments).toEqual([{ classroomId: 'A', row: 1, depth: 1, code: '0101' }]);
  });

  it('零名考生：ok 且沒有座位', () => {
    const r = runSeating({ ...base, entries: [], overrides: [], markRules: [] });
    expect(r.ok && r.result.assignments.length).toBe(0);
  });

  it('座位剛好等於人數：恰好坐滿，不多不少', () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ classNo: 1, seatNo: i + 1, name: `甲生01${i}`, subjectIds: [] }));
    const r = runSeating({ ...base, classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }], classrooms: [room('A', 2, 3)], entries, markRules: [], overrides: [] });
    expect(r.ok && r.result.assignments.length).toBe(6);
  });

  it('少一個座位：擋下', () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({ classNo: 1, seatNo: i + 1, name: `甲生01${i}`, subjectIds: [] }));
    const r = runSeating({ ...base, classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }], classrooms: [room('A', 2, 3)], entries, markRules: [], overrides: [] });
    expect(r.ok).toBe(false);
  });

  it('單人特例：保留原座位、不佔預備教室、地點原樣', () => {
    const entries = [1, 2, 3].map((n) => ({ classNo: 1, seatNo: n, name: `甲生010${n}`, subjectIds: n === 2 ? ['x'] : [] }));
    const r = runSeating({
      ...base,
      classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }],
      classrooms: [room('A', 1, 3), { id: 'P', name: 'P', kind: 'reserve', rows: 1, depth: 2, seatCount: 2 }],
      entries,
      subjects: [{ id: 'x', name: '自然' }],
      markRules: [{ subjectId: 'x', mode: 'mark-extra' }],
      overrides: [{ kind: 'single', code: '0102', location: '教務處', purpose: 'exam' }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.result.assignments.map((a) => a.code)).toEqual(['0101', '0102', '0103']);
      expect(r.result.detaches).toEqual([]);
      expect(r.special).toEqual([{ code: '0102', subjectId: 'x', purpose: 'exam', location: '教務處' }]);
    }
  });

  it('國中部與高中部都不接受重複座號', () => {
    const e = { classNo: 1, seatNo: 1, name: '甲生0101', subjectIds: [] };
    const r = runSeating({ ...base, classes: [{ no: 1, name: 'A', division: 'junior', colorIndex: 0 }], classrooms: [room('A', 2, 2)], entries: [e, { ...e }], markRules: [], overrides: [] });
    expect(r.ok).toBe(false);
  });
});

describe('有 disabled 教室（使用者任意指定不排的座位）', () => {
  /** 把每間教室多餘的格子（rows×depth − seatCount）隨機標成不排；座位數不變，只是位置不同 */
  function withDisabled(input: ReturnType<typeof genCase>, seed: number): ReturnType<typeof genCase> {
    const rng = makeRng(seed ^ 0x5eed);
    return {
      ...input,
      classrooms: input.classrooms.map((c) => {
        const spare = c.rows * c.depth - c.seatCount;
        const k = spare > 0 ? rng.int(0, spare) : 0;
        const cells: string[] = [];
        for (let r = 1; r <= c.rows; r++) for (let d = 1; d <= c.depth; d++) cells.push(`${r}-${d}`);
        const off = new Set<string>();
        while (off.size < k) off.add(rng.pick(cells));
        return k > 0 ? { ...c, disabled: [...off] } : c;
      }),
    };
  }

  it(`${300} 個隨機案例：不變式成立，且沒有人坐在不排的座位上`, () => {
    let withOff = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = withDisabled(genCase(makeRng(seed)), seed);
      const hasOff = input.classrooms.some((c) => (c.disabled?.length ?? 0) > 0);
      const r = runSeating(input);
      if (!r.ok) {
        expect(mainCapacityShort(input) || reserveShort(input), `seed=${seed} 不該失敗：${r.errors.join('；')}`).toBe(true);
        continue;
      }
      expect(mainCapacityShort(input), `seed=${seed} 座位不足卻成功`).toBe(false);
      expect(checkMainSeating(input, r.result), `seed=${seed}`).toEqual([]);
      expect(checkMarksAndDetach(input, r.result, r.special), `seed=${seed}`).toEqual([]);
      const off = new Set(input.classrooms.flatMap((c) => (c.disabled ?? []).map((k) => `${c.id}/${k}`)));
      const seats = [
        ...r.result.assignments.map((a) => ({ room: a.classroomId, row: a.row, depth: a.depth })),
        ...r.result.detaches.flatMap((d) => (d.seat ? [{ room: d.roomId, row: d.seat.row, depth: d.seat.depth }] : [])),
      ];
      for (const x of seats) expect(off.has(`${x.room}/${x.row}-${x.depth}`), `seed=${seed} 坐到不排的座位`).toBe(false);
      if (hasOff) withOff++;
    }
    expect(withOff).toBeGreaterThan(30); // 守門：真的有跑到含 disabled 的案例
  });

  it('座位數：不排的座位不算座位（用 disabled 把 2×3 教室壓到只剩 4 個，5 人就擋下）', () => {
    const base = { ...genCase(makeRng(1), { division: 'junior' }), seatFullyAbsent: true };
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ classNo: 1, seatNo: i + 1, name: `甲生01${i}`, subjectIds: [] as string[] }));
    const room = { id: 'A', name: 'A', kind: 'class' as const, rows: 2, depth: 3, seatCount: 4, disabled: ['1-2', '2-2'] };
    const common = { ...base, classes: [{ no: 1, name: 'A', division: 'junior' as const, colorIndex: 0 }], classrooms: [room], markRules: [], overrides: [] };
    const ok = runSeating({ ...common, entries: mk(4) });
    expect(ok.ok && ok.result.assignments.map((a) => `${a.row}-${a.depth}`)).toEqual(['1-1', '1-3', '2-1', '2-3']);
    expect(runSeating({ ...common, entries: mk(5) }).ok).toBe(false);
  });
});
