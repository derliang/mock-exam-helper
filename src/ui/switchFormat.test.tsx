import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import { FormatButton, FormatPick, Switch } from './components';
import { RoomList } from './components/RoomList';
import { addRoom, newClassRoomIds, roomCapacity } from './rooms';
import { demoDoc } from './repository';
import { examRooms } from './seating';
import { newExam } from './store';

const noop = () => undefined;

describe('教室開關（施工R，DESIGN 10.9）', () => {
  it('班級教室標示「列為考場」、預備教室標示「列為預備」，開關右側寫已列入／未列入', () => {
    const rooms = addRoom(addRoom([], 'class'), 'reserve');
    const html = renderToString(<RoomList rooms={rooms} paper="B4" onChange={noop} selected={[rooms[0]!.id]} onSelect={noop} />);
    expect(html).toContain('>列為考場<');
    expect(html).toContain('>列為預備<');
    expect(html).toContain('>已列入<');
    expect(html).toContain('>未列入<');
    expect(html).toContain('role="switch"');
    expect(html).not.toContain('aria-label="使用');
  });
  it('未列入的教室整列變淡（off），列入的是 on', () => {
    const rooms = addRoom(addRoom([], 'class'), 'reserve');
    const html = renderToString(<RoomList rooms={rooms} paper="B4" onChange={noop} selected={[rooms[0]!.id]} onSelect={noop} />);
    expect(html).toMatch(/roomrow on/);
    expect(html).toMatch(/roomrow off/);
  });
  it('新增班級教室預設列入、預備教室預設不列入', () => {
    const base = addRoom([], 'class');
    expect(newClassRoomIds(base, addRoom(base, 'class'))).toEqual(['room-2']);
    expect(newClassRoomIds(base, addRoom(base, 'reserve'))).toEqual([]);
  });
  it('關掉的教室不計入考場座位（examRooms 只含列入者）', () => {
    const d = demoDoc();
    const r = newExam(d, 'gsat', '學測', new Date('2026-10-01T02:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    const exam = r.doc.exams[0]!;
    const doc = { ...r.doc, settings: { ...r.doc.settings, classrooms: addRoom(addRoom(r.doc.settings.classrooms, 'class'), 'class') } };
    const cls = doc.settings.classrooms.filter((c) => c.kind === 'class');
    expect(cls.length).toBeGreaterThan(1);
    const all = { ...exam, classroomIds: cls.map((c) => c.id) };
    const one = { ...exam, classroomIds: [cls[0]!.id] };
    const sum = (e: typeof exam) => examRooms(doc, e).reduce((n, c) => n + roomCapacity(c), 0);
    expect(sum(one)).toBe(roomCapacity(cls[0]!));
    expect(sum(all)).toBeGreaterThan(sum(one));
  });
  it('Switch 文字隨狀態切換', () => {
    expect(renderToString(<Switch label="列為考場" ariaLabel="x" checked onChange={noop} />)).toContain('已列入');
    expect(renderToString(<Switch label="列為考場" ariaLabel="x" checked={false} onChange={noop} />)).toContain('未列入');
  });
});

describe('下載格式鈕（施工R）', () => {
  it('只寫 Word、PDF，沒有「主要／輔助」，各配 SVG 圖示與各自配色類別', () => {
    const html = renderToString(<FormatPick label="格式" value="word" onChange={noop} options={['word', 'pdf']} />);
    expect(html).toContain('Word</span>');
    expect(html).toContain('PDF</span>');
    expect(html).not.toMatch(/主要|輔助/);
    expect(html).toContain('fmt w');
    expect(html).toContain('fmt p');
    expect((html.match(/<svg/g) ?? []).length).toBe(2);
    expect(html).toContain('ic-bg-w');
    expect(html).toContain('ic-bg-p');
  });
  it('Excel 鈕用 xls 配色與圖示', () => {
    const html = renderToString(<FormatButton kind="xls" onClick={noop}>下載學生名單</FormatButton>);
    expect(html).toContain('btn-fmt x');
    expect(html).toContain('ic-bg-x');
  });
});
