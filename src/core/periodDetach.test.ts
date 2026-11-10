/**
 * 節次功能 PR2（D94）：依節次抽離、預備教室兩種排座模式、合併標籤、同節衝突。全部假資料。
 * 覆蓋 docs/todo.md「測試」一項：同一人跨節加考同座位；共用座位合併標籤；模式 1 遞增警告、模式 2 硬規則；
 * 同節加總容量不足；國文整個一起標；舊資料預設。
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ClassInfo, Classroom, Mark, Subject } from '../data/types';
import { buildLabelPages, renderDocx, renderPrintHtml } from '../export';
import { makeFixture } from '../export/fixtures';
import { allocateDetaches, periodGroups, type ReserveMode } from './detach';
import { defaultSchedule, subjectPeriods, type SubjectPeriod } from './periods';
import { runSeating, seatingVersion, type RunSeatingInput } from './run';
import { genCase, makeRng } from '../qa/gen';

const cls: ClassInfo[] = [1, 2, 3].map((no) => ({ no, name: ['溫', '良', '恭'][no - 1]!, division: 'senior', track: no === 2 ? 'liberal' : 'science', colorIndex: no }));
const room = (id: string, depth: number, rows = 1): Classroom => ({ id, name: `備${id}`, kind: 'reserve', rows, depth, seatCount: rows * depth });
const subjects: Subject[] = [{ id: 'A', name: '物理' }, { id: 'B', name: '歷史' }];
const per = (o: Record<string, number[]>, label = (id: string) => id): Map<string, SubjectPeriod[]> =>
  new Map(Object.entries(o).map(([id, ps]) => [id, ps.map((period) => ({ period, label: label(id) }))]));
const ex = (subjectId: string, ...codes: string[]): Mark[] => codes.map((code) => ({ code, subjectId, mode: 'extra' as const }));
const run = (marks: Mark[], rooms: Classroom[], mode: ReserveMode, periods = per({ A: [1], B: [2] })) =>
  allocateDetaches({ subjects, marks, overrides: [], reserveRooms: rooms, classes: cls, periods, mode });
const seatOf = (r: ReturnType<typeof allocateDetaches>, code: string, subjectId: string) => {
  if (!r.ok) throw new Error(r.errors.join('；'));
  const d = r.detaches.find((x) => x.code === code && x.subjectId === subjectId)!;
  return `${d.roomId}:${d.seat!.row}-${d.seat!.depth}`;
};

describe('預備教室排座：模式 1 同學優先', () => {
  it('座位夠：同一人跨節加考坐同一格、每人一格（不共用）', () => {
    const r = run([...ex('A', '0101', '0102'), ...ex('B', '0101', '0201')], [room('1', 5)], 'peer');
    expect(seatOf(r, '0101', 'A')).toBe(seatOf(r, '0101', 'B'));
    const seats = ['0101/A', '0102/A', '0201/B'].map((k) => seatOf(r, k.split('/')[0]!, k.split('/')[1]!));
    expect(new Set(seats).size).toBe(3);
    expect(r.ok && r.warnings).toBeUndefined();
  });
  it('座位不夠才共用：不同節的人共用同一格；同班排不到遞增時只警告、不擋', () => {
    // 3 個座位、5 個人：物理 0102～0104，歷史 0101、0105
    const r = run([...ex('A', '0102', '0103', '0104'), ...ex('B', '0101', '0105')], [room('1', 3)], 'peer');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(seatOf(r, '0104', 'A')).toBe(seatOf(r, '0101', 'B')); // 共用 1-1
    expect(seatOf(r, '0105', 'B')).toBe(seatOf(r, '0102', 'A')); // 共用 1-2
    expect(r.warnings).toEqual(['預備教室「備1」第 1 排的「溫班」座號沒有照由小到大排（04 號在 02 號前面）']);
  });
  it('同一節的人絕不共用座位；每一節各自看座位數', () => {
    const r = run([...ex('A', '0102', '0103', '0104'), ...ex('B', '0101', '0105')], [room('1', 3)], 'peer');
    if (!r.ok) throw new Error();
    for (const s of ['A', 'B']) {
      const seats = r.detaches.filter((d) => d.subjectId === s).map((d) => `${d.roomId}:${d.seat!.row}-${d.seat!.depth}`);
      expect(new Set(seats).size).toBe(seats.length);
    }
  });
});

describe('預備教室排座：模式 2 監考優先', () => {
  it('每一節各自由第一間排起，守 D3 硬規則、沒有遞增警告', () => {
    const r = run([...ex('A', '0102', '0103', '0104'), ...ex('B', '0101', '0105')], [room('1', 3)], 'proctor');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toBeUndefined();
    expect(['0102', '0103', '0104'].map((c) => seatOf(r, c, 'A'))).toEqual(['1:1-1', '1:1-2', '1:1-3']);
    expect(['0101', '0105'].map((c) => seatOf(r, c, 'B'))).toEqual(['1:1-1', '1:1-2']);
  });
  it('同一人跨節不保證同一格', () => {
    const r = run([...ex('A', '0101', '0102'), ...ex('B', '0102')], [room('1', 5)], 'proctor');
    expect(seatOf(r, '0102', 'A')).not.toBe(seatOf(r, '0102', 'B'));
  });
});

describe('依節次分組（D94-3、D27）', () => {
  const same = per({ A: [1], B: [1] });
  it('同一節各科抽離人數加總再比容量：不夠就擋下（兩種模式都一樣）', () => {
    const marks = [...ex('A', '0101', '0102', '0103'), ...ex('B', '0201', '0202', '0203')];
    for (const mode of ['peer', 'proctor'] as const) {
      expect(run(marks, [room('1', 5)], mode, same)).toEqual({ ok: false, errors: ['第 1 節（物理、歷史）：預備教室座位不足以容納抽離考試 6 人'] });
      expect(run(marks, [room('1', 5)], mode).ok).toBe(true); // 不同節：重用同一間
    }
  });
  it('同一節的抽離考試與抽離自習用不同教室', () => {
    const marks: Mark[] = [...ex('A', '0101'), { code: '0201', subjectId: 'B', mode: 'absent' }];
    for (const mode of ['peer', 'proctor'] as const) {
      const r = run(marks, [room('1', 2), room('2', 2)], mode, same);
      expect(r.ok && r.detaches.map((d) => `${d.subjectId}:${d.purpose}@${d.roomId}`)).toEqual(['A:exam@1', 'B:study@2']);
      const apart = run(marks, [room('1', 2), room('2', 2)], mode);
      expect(apart.ok && apart.detaches.map((d) => `${d.subjectId}:${d.purpose}@${d.roomId}`)).toEqual(['A:exam@1', 'B:study@1']);
    }
  });
  it('同一人同一節被標到兩科：報錯', () => {
    const r = run([...ex('A', '0101'), { code: '0101', subjectId: 'B', mode: 'absent' }], [room('1', 5)], 'peer', same);
    expect(r).toEqual({ ok: false, errors: ['同一人同一節被標到兩科：0101 第 1 節（物理、歷史）'] });
  });
  it('單人特例（D26）不佔預備教室、不受節次影響', () => {
    const r = allocateDetaches({ subjects, marks: ex('A', '0101'), overrides: [{ kind: 'single', code: '0101', location: '教務處', purpose: 'exam' }], reserveRooms: [room('1', 2)], classes: cls, periods: same, mode: 'peer' });
    expect(r).toEqual({ ok: true, detaches: [], special: [{ code: '0101', subjectId: 'A', purpose: 'exam', location: '教務處' }] });
  });
  it('國文一科兩節：兩節併成一組；沒給節次＝每科一組（舊行為）', () => {
    const subs: Subject[] = [{ id: 'chinese', name: '國文' }, { id: 'english', name: '英文' }, { id: 'social', name: '社會' }];
    const m = subjectPeriods(subs, defaultSchedule('g12'));
    expect(periodGroups(subs, m)).toEqual([{ periods: [1], subjectIds: ['english'] }, { periods: [3, 7], subjectIds: ['chinese'] }, { periods: [6], subjectIds: ['social'] }]);
    expect(periodGroups(subs).map((g) => g.subjectIds)).toEqual([['chinese'], ['english'], ['social']]);
  });
});

describe('runSeating 與版本碼（舊資料預設）', () => {
  const base: RunSeatingInput = {
    examId: 'e', division: 'senior', classes: cls,
    classrooms: [
      { id: 'S', name: '理', kind: 'class', rows: 2, depth: 2, seatCount: 4, track: 'science' },
      { id: 'L', name: '文', kind: 'class', rows: 2, depth: 2, seatCount: 4, track: 'liberal' },
      room('P', 4),
    ],
    entries: [
      { classNo: 1, seatNo: 1, name: '甲生0101', subjectIds: ['A'] },
      { classNo: 1, seatNo: 2, name: '甲生0102', subjectIds: ['A', 'B'] },
      { classNo: 2, seatNo: 1, name: '甲生0201', subjectIds: ['A', 'B'] },
    ],
    subjects,
    markRules: [{ track: 'science', subjectId: 'B', mode: 'mark-extra' }, { track: 'liberal', subjectId: 'A', mode: 'mark-extra' }],
    overrides: [],
    now: '2026-11-10T00:00:00Z',
  };
  it('預設節次（一科一節）與同學優先不改版本碼；勾同節或選監考優先才改', () => {
    const v0 = seatingVersion(base);
    expect(seatingVersion({ ...base, periods: per({ A: [1], B: [2] }), reserveMode: 'peer' })).toBe(v0);
    expect(seatingVersion({ ...base, periods: per({ A: [1], B: [1] }) })).not.toBe(v0);
    expect(seatingVersion({ ...base, reserveMode: 'proctor' })).not.toBe(v0);
  });
  it('runSeating 傳入節次與同學優先：依座位順序輸出抽離考試', () => {
    const r = runSeating({ ...base, periods: per({ A: [1], B: [2] }), reserveMode: 'peer' });
    expect(r.ok && r.result.detaches.map((d) => `${d.code}/${d.subjectId}@${d.seat?.row}-${d.seat?.depth}`)).toEqual(['0201/A@1-2', '0102/B@1-1']);
  });
});

describe('預備教室合併標籤（D94-5）', () => {
  const fontDir = new URL('../export/fonts/', import.meta.url);
  const fonts = { regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fontDir))), bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fontDir))) };
  const meta = { generatedAt: '2026-11-08T08:30:00Z', dataVersion: 'A1B2C3D4' };
  const fixture = () => {
    const f = makeFixture();
    f.exam.subjects = [{ id: 'chinese', name: '國文' }, { id: 'english', name: '英文' }, { id: 'math', name: '數學' }];
    f.result.detaches = [
      { code: '0105', subjectId: 'chinese', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 1 } },
      { code: '0206', subjectId: 'english', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 1 } },
      { code: '0107', subjectId: 'english', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 2 } },
      { code: '0107', subjectId: 'math', purpose: 'exam', roomId: 'rv', seat: { row: 1, depth: 2 } },
      { code: '0201', subjectId: 'chinese', purpose: 'study', roomId: 'rv' },
    ];
    return f;
  };
  it('每間預備教室一張紙、每座位一張；每節一行印節次＋科目＋班座號；國文印國綜、國寫兩行；自習不印', () => {
    const pages = buildLabelPages(fixture(), 'reserve');
    expect(pages.map((p) => p.roomName)).toEqual(['預備教室　抽離考試']);
    expect(pages[0]!.cells.map((c) => [c.coord, c.periodLines!.map((l) => `${l.head} ${l.text}`)])).toEqual([
      ['1-1', ['第 1 節 英文　良 06', '第 3 節 國綜　溫 05', '第 7 節 國寫　溫 05']],
      ['1-2', ['第 1 節 英文　溫 07', '第 5 節 數學　溫 07']],
    ]);
  });
  it('列印與 Word 都印出各行，不印時間與姓名', async () => {
    const pages = buildLabelPages(fixture(), 'reserve');
    const html = renderPrintHtml({ label: pages }, meta);
    for (const s of ['第 3 節', '國綜　溫 05', '國寫　溫 05', '數學　溫 07']) expect(html).toContain(s);
    expect(html).not.toContain('甲生');
    const z = await JSZip.loadAsync(await renderDocx({ label: pages }, { fonts, ...meta }));
    const xml = await z.file('word/document.xml')!.async('string');
    for (const s of ['第 3 節', '國綜　溫 05', '數學　溫 07']) expect(xml).toContain(s);
    expect(xml).not.toContain('甲生');
  });
});

describe('同學優先的性質（隨機假資料 200 例）', () => {
  it('監考優先排得下，同學優先就排得下；同一人各節同一格；同一節不共用座位', () => {
    let peerRuns = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const input = genCase(makeRng(seed));
      const periods = new Map(input.subjects.map((x, i) => [x.id, [{ period: i + 1, label: x.name }]]));
      const proctor = runSeating({ ...input, periods, reserveMode: 'proctor' });
      const peer = runSeating({ ...input, periods, reserveMode: 'peer' });
      if (!proctor.ok) continue;
      expect(peer.ok, `seed=${seed}`).toBe(true);
      if (!peer.ok) continue;
      const exam = peer.result.detaches.filter((d) => d.purpose === 'exam');
      if (exam.length) peerRuns++;
      const shared = peer.warnings.some((w) => w.includes('監考優先'));
      const byCode = new Map<string, Set<string>>();
      const bySubject = new Map<string, Set<string>>();
      for (const d of exam) {
        const k = `${d.roomId}:${d.seat!.row}-${d.seat!.depth}`;
        byCode.set(d.code, (byCode.get(d.code) ?? new Set<string>()).add(k));
        const seen = bySubject.get(d.subjectId) ?? new Set<string>();
        expect(seen.has(k), `seed=${seed} 同一節共用座位`).toBe(false);
        bySubject.set(d.subjectId, seen.add(k));
      }
      if (!shared) for (const [code, seats] of byCode) expect(seats.size, `seed=${seed} ${code} 各節不同格`).toBe(1);
    }
    expect(peerRuns).toBeGreaterThan(20);
  });
});
