/**
 * 輸出一致性：隨機排座結果 → 版面模型 → Word／列印 HTML，
 * 人數、座位、姓名、標示與排座結果（畫面資料）逐筆一致（INV-13～INV-18）。
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { roomStats, runSeating, specialOf } from '../core';
import { classroomSeats, seatLabel, studentCode } from '../data/helpers';
import type { ExamConfig, Settings } from '../data/types';
import { buildDetachList, buildLabelPages, buildSeatPages, renderDocx, renderPrintHtml, type ExportInput } from '../export';
import { genCase, makeRng } from './gen';

const fontDir = new URL('../export/fonts/', import.meta.url);
const fonts = {
  regular: new Uint8Array(readFileSync(new URL('NotoSansTC-Regular-big5.ttf', fontDir))),
  bold: new Uint8Array(readFileSync(new URL('NotoSansTC-Bold-core.ttf', fontDir))),
};
const meta = { generatedAt: '2026-11-08T08:30:00Z', dataVersion: 'AAAA-BBBB-CCCC' };

/** 把一個隨機案例的排座結果包成輸出輸入；排不出來回 null */
export function exportInputOf(seed: number): { input: ExportInput; cases: ReturnType<typeof genCase> } | null {
  const cases = genCase(makeRng(seed), { division: 'senior' });
  const r = runSeating(cases);
  if (!r.ok) return null;
  const settings: Settings = { schoolName: '測試學校', headerText: '模擬考', defaultLabelPaper: 'A3', classes: [...cases.classes], classrooms: [...cases.classrooms] };
  const exam: ExamConfig = {
    id: 'E1',
    name: '測試模擬考',
    kind: 'gsat',
    division: cases.division,
    semester: 'first',
    participation: 'all',
    subjects: [...cases.subjects],
    markRules: [...cases.markRules],
    classroomIds: cases.classrooms.map((c) => c.id),
    // 8×8 夠大，隨機案例最大教室 64 座
    labelLayout: { paper: 'A3', cols: 8, rows: 8 },
    createdAt: '2026-11-08T00:00:00Z',
  };
  const students = cases.entries.map((e) => ({ classNo: e.classNo, seatNo: e.seatNo, name: e.name }));
  return { input: { settings, exam, students, entries: [...cases.entries], result: r.result }, cases };
}

const count = (text: string, needle: string): number => text.split(needle).length - 1;
/** 取出 docx 所有文字節點，以換行連接（避免跨節點誤配） */
async function docxText(buf: Uint8Array): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  // 頁尾在 word/footer*.xml，與內文一起檢查
  const parts = Object.keys(z.files).filter((n) => /^word\/(document|footer\d*)\.xml$/.test(n));
  const xml = (await Promise.all(parts.map((n) => z.file(n)!.async('string')))).join('');
  return [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join('\n');
}
const htmlText = (html: string): string => html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n');

describe('輸出版面模型與排座結果逐筆一致', () => {
  it('INV-13～16：座位表／標籤／抽離名單的人數、座標、姓名、標示（200 案例）', () => {
    let checked = 0;
    for (let seed = 1; seed <= 400 && checked < 200; seed++) {
      const x = exportInputOf(seed);
      if (!x) continue;
      checked++;
      const { input } = x;
      const nameOf = new Map(input.students.map((s) => [studentCode(s.classNo, s.seatNo), s.name]));
      const seatPages = buildSeatPages(input);
      const mainPages = seatPages.filter((p) => !p.detachStyle);

      // INV-13 每間有人的班級教室一頁；頁上格子＝該教室的 assignments，座標、編號、姓名逐筆相同；總數＝考生數
      let cellTotal = 0;
      for (const room of input.settings.classrooms.filter((c) => c.kind === 'class')) {
        const mine = input.result.assignments.filter((a) => a.classroomId === room.id);
        const page = mainPages.find((p) => p.title.includes(room.name + '　'));
        expect(page, `seed=${seed} 教室 ${room.name} 缺頁`).toBeTruthy();
        expect(page!.cells.size, `seed=${seed} ${room.name}`).toBe(mine.length);
        for (const a of mine) {
          const cell = page!.cells.get(`${a.row}-${a.depth}`);
          expect(cell?.code, `seed=${seed} ${room.name} ${seatLabel(a)}`).toBe(a.code);
          expect(cell?.coord).toBe(seatLabel(a));
          expect(cell?.name).toBe(nameOf.get(a.code));
        }
        // 可用座位集合＝教室座位（空位只在最後）
        expect([...page!.usable].sort()).toEqual(classroomSeats(room).map(seatLabel).sort());
        // 統計：總數、各班加總一致
        expect(page!.stats.total).toBe(mine.length);
        expect(page!.stats.perClass.reduce((a, c) => a + c.count, 0)).toBe(mine.length);
        cellTotal += page!.cells.size;
      }
      expect(cellTotal, `seed=${seed}`).toBe(input.result.assignments.length);

      // INV-14 標示：每格的標示文字數＝結果裡該考生的標示數
      for (const p of mainPages)
        for (const c of p.cells.values()) {
          const n = input.result.marks.filter((m) => m.code === c.code).length;
          expect(c.tags.length, `seed=${seed} ${c.code}`).toBe(n);
        }

      // INV-15 抽離考試頁：每個（教室，科目）一頁，格子＝結果裡的抽離考試座位
      const examDetach = input.result.detaches.filter((d) => d.purpose === 'exam');
      const detachPages = seatPages.filter((p) => p.detachStyle);
      expect(detachPages.reduce((a, p) => a + p.cells.size, 0), `seed=${seed}`).toBe(examDetach.length);
      for (const d of examDetach) {
        const hit = detachPages.some((p) => p.cells.get(seatLabel(d.seat!))?.code === d.code && p.title.includes(input.settings.classrooms.find((c) => c.id === d.roomId)!.name));
        expect(hit, `seed=${seed} 抽離 ${d.code}`).toBe(true);
      }

      // INV-16 標籤：每間有人的教室一張，順序與座位表一致，格數不超過
      const labels = buildLabelPages(input, 'class');
      expect(labels.reduce((a, p) => a + p.cells.length, 0), `seed=${seed}`).toBe(input.result.assignments.length);
      for (const p of labels) {
        const coords = p.cells.map((c) => c.coord);
        const sorted = [...coords].sort((a, b) => {
          const [ar, ad] = a.split('-').map(Number) as [number, number];
          const [br, bd] = b.split('-').map(Number) as [number, number];
          return ar - br || ad - bd;
        });
        expect(coords, `seed=${seed}`).toEqual(sorted);
      }

      // 抽離名單：抽離列＋單人特例列，沒有多也沒有少
      const list = buildDetachList(input);
      expect(list.rows.length, `seed=${seed}`).toBe(input.result.detaches.length + input.result.overrides.length);
    }
    expect(checked).toBeGreaterThanOrEqual(150);
  });

  it('INV-17：Word 與列印 HTML 的姓名出現次數＝版面模型（25 案例，兩種格式互相印證）', async () => {
    let checked = 0;
    for (let seed = 1; seed <= 200 && checked < 25; seed++) {
      const x = exportInputOf(seed);
      if (!x || x.input.result.assignments.length === 0) continue;
      checked++;
      const { input } = x;
      const seat = buildSeatPages(input);
      const label = buildLabelPages(input);
      const list = buildDetachList(input);
      const expected = new Map<string, number>();
      const bump = (n: string) => n && expected.set(n, (expected.get(n) ?? 0) + 1);
      for (const p of seat) for (const c of p.cells.values()) bump(c.name);
      for (const p of label) for (const c of p.cells) { bump(c.name); for (const m of c.marks) { const w = /（\d{4} (.+)）/.exec(m.subject); if (w) bump(w[1]!); } } // 合併標籤共用座位：後面節次的人印在標示行
      for (const r of list.rows) bump(r.name);

      const docx = await docxText(await renderDocx({ seat, label, list }, { fonts, ...meta }));
      const html = htmlText(renderPrintHtml({ seat, label, list }, meta));
      for (const [name, n] of expected) {
        expect(count(docx, name), `seed=${seed} docx ${name}`).toBe(n);
        expect(count(html, name), `seed=${seed} html ${name}`).toBe(n);
      }
      // 沒有模型以外的姓名（沒有多印）
      const all = new Set(x.input.students.map((s) => s.name));
      for (const m of docx.matchAll(/甲生\d{4}/g)) expect(all.has(m[0]), `seed=${seed} docx 多印 ${m[0]}`).toBe(true);
      for (const m of html.matchAll(/甲生\d{4}/g)) expect(all.has(m[0]), `seed=${seed} html 多印 ${m[0]}`).toBe(true);
      // 頁尾版本碼每個座位／標籤頁都有
      expect(count(docx, meta.dataVersion)).toBeGreaterThanOrEqual(seat.length + label.length);
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  }, 300_000);
});

describe('姓名來源不同步的保險（缺陷 F-1 回歸）', () => {
  it('學生名單查無此人時，座位表、標籤、抽離名單都退用考試名單的姓名，不印空白', () => {
    const x = exportInputOf(3)!;
    expect(x).toBeTruthy();
    const input = { ...x.input, students: [] };
    for (const p of buildSeatPages(input)) for (const c of p.cells.values()) expect(c.name, c.code).not.toBe('');
    for (const p of buildLabelPages(input)) for (const c of p.cells) expect(c.name, c.code).not.toBe('');
    for (const r of buildDetachList(input).rows) expect(r.name, r.code).not.toBe('');
  });
});

describe('匯出統計＝畫面統計（含單人特例，缺陷 F-5 回歸）', () => {
  it('每間教室每科人數與 roomStats(…, specialOf(result)) 的 inRoom 相同，且至少有案例受特例影響', () => {
    let checked = 0;
    let affected = 0;
    for (let seed = 1; seed <= 400 && checked < 150; seed++) {
      const x = exportInputOf(seed);
      if (!x) continue;
      checked++;
      const { input } = x;
      const sp = specialOf(input.result);
      for (const p of buildSeatPages(input).filter((q) => !q.detachStyle)) {
        const room = input.settings.classrooms.find((c) => p.title.includes(c.name + '　'))!;
        const screen = roomStats(room.id, input.result.assignments, input.entries, input.exam.subjects, input.result.detaches, sp);
        const without = roomStats(room.id, input.result.assignments, input.entries, input.exam.subjects, input.result.detaches);
        expect(p.stats.perSubject.map((s) => s.count), `seed=${seed} ${room.name}`).toEqual(screen.perSubject.map((s) => s.inRoom));
        if (screen.perSubject.some((s, i) => s.inRoom !== without.perSubject[i]!.inRoom)) affected++;
      }
    }
    expect(affected).toBeGreaterThan(0);
  });
});
