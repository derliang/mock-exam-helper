import { renderToString } from 'preact-render-to-string';
import { describe, expect, it } from 'vitest';
import type { Classroom, ExamConfig } from '../data';
import { RoomList, RoomTable } from './components/RoomList';
import { Settings } from './pages/Settings';
import { Step3 } from './pages/Step3';
import { addRoom, roomsOfDivision } from './rooms';
import { demoDoc } from './repository';
import { newExam, type Doc } from './store';

const noop = () => undefined;
const r = (id: string, division: 'senior' | 'junior', kind: Classroom['kind'] = 'class'): Classroom => ({
  id, name: id, kind, rows: 5, depth: 6, seatCount: 30, division, ...(division === 'senior' && kind === 'class' ? { track: 'science' as const } : {}),
});
const rooms = [r('高一教室', 'senior'), r('備一', 'senior', 'reserve'), r('國一教室', 'junior'), r('國二教室', 'junior')];

describe('步驟③依部別列教室（校-33）', () => {
  it('會考只列國中教室、學測只列高中教室', () => {
    const j = renderToString(<RoomList division="junior" rooms={rooms} paper="B4" onChange={noop} selected={[]} onSelect={noop} />);
    expect(j).toContain('國一教室'); expect(j).toContain('國二教室');
    expect(j).not.toContain('高一教室'); expect(j).not.toContain('備一');
    const s = renderToString(<RoomList division="senior" rooms={rooms} paper="B4" onChange={noop} selected={[]} onSelect={noop} />);
    expect(s).toContain('高一教室'); expect(s).toContain('備一');
    expect(s).not.toContain('國一教室');
  });
  it('「新增預備教室」鈕在清單上方（標題下方）；國中部沒有預備教室鈕', () => {
    const s = renderToString(<RoomList division="senior" rooms={rooms} paper="B4" onChange={noop} selected={[]} onSelect={noop} />);
    expect(s.indexOf('新增預備教室')).toBeGreaterThan(-1);
    expect(s.indexOf('新增預備教室')).toBeLessThan(s.indexOf('高一教室'));
    expect(renderToString(<RoomList division="junior" rooms={rooms} paper="B4" onChange={noop} selected={[]} onSelect={noop} />)).not.toContain('新增預備教室');
  });
  it('已被本次考試勾選、卻屬於另一部別的舊資料仍列出（才關得掉，不藏著影響排座）', () => {
    const j = renderToString(<RoomList division="junior" rooms={rooms} paper="B4" onChange={noop} selected={['高一教室']} onSelect={noop} />);
    expect(j).toContain('高一教室');
  });
  it('新增教室標上部別；國中部新增預備教室＝不動作', () => {
    expect(addRoom([], 'class', 'junior')[0]).toMatchObject({ division: 'junior', name: '試場1' });
    expect(addRoom(rooms, 'class', 'junior').at(-1)).toMatchObject({ division: 'junior', name: '試場3' });
    expect(addRoom(rooms, 'reserve', 'junior')).toBe(rooms);
    expect(roomsOfDivision(addRoom(rooms, 'reserve', 'senior'), 'senior').map((x) => x.name)).toEqual(['高一教室', '備一', '預備教室2']);
  });
  it('沒標部別的舊教室：依考試選用推斷，列在對的部別', () => {
    const legacy: Classroom[] = [{ id: 'jr', name: '舊國中教室', kind: 'class', rows: 5, depth: 6, seatCount: 30 }];
    const exams = [{ division: 'junior' as const, classroomIds: ['jr'] }];
    const j = renderToString(<RoomList division="junior" exams={exams} rooms={legacy} paper="B4" onChange={noop} />);
    const s = renderToString(<RoomList division="senior" exams={exams} rooms={legacy} paper="B4" onChange={noop} />);
    expect(j).toContain('舊國中教室');
    expect(s).not.toContain('舊國中教室');
  });
  it('整頁③：會考不出現高中教室，學測不出現國中教室、也沒有「還沒指定」警告', () => {
    const d = demoDoc();
    const doc: Doc = { ...d, settings: { ...d.settings, classrooms: [...d.settings.classrooms, r('國一教室', 'junior')] } };
    const hk = newExam(doc, 'bcct', '會考', new Date('2026-11-01T02:00:00Z'));
    const gs = newExam(doc, 'gsat', '學測', new Date('2026-11-01T03:00:00Z'));
    if (!hk.ok || !gs.ok) throw new Error('newExam');
    const he = hk.doc.exams[0] as ExamConfig;
    const se = gs.doc.exams[0] as ExamConfig;
    const hh = renderToString(<Step3 doc={hk.doc} exam={he} onChange={noop} />);
    expect(hh).toContain('國一教室'); expect(hh).not.toContain('第一試場');
    const ss = renderToString(<Step3 doc={gs.doc} exam={se} onChange={noop} />);
    expect(ss).toContain('第一試場'); expect(ss).not.toContain('國一教室'); expect(ss).not.toContain('還沒指定');
  });
});

describe('共用設定「教室清單」（校-43、校-50）', () => {
  it('表格：名稱／類型／橫排×深位／可排座位；預備教室才有刪除；整列可點展開', () => {
    const html = renderToString(<RoomTable division="senior" rooms={rooms} paper="B4" onChange={noop} />);
    for (const h of ['>名稱<', '>類型<', '>橫排×深位<', '>可排座位<']) expect(html).toContain(h);
    expect(html).toContain('5×6');
    expect(html).toContain('rowtap');
    expect(html.match(/>編輯座位</g)).toHaveLength(2); // 高中部 2 間
    expect(html.match(/>刪除</g)).toHaveLength(1); // 只有預備教室
    expect(html).not.toContain('國一教室');
  });
  it('國中部：只有國中教室、沒有預備教室也沒有「新增預備教室」、沒有刪除', () => {
    const html = renderToString(<RoomTable division="junior" rooms={rooms} paper="B4" onChange={noop} />);
    expect(html).toContain('國一教室'); expect(html).not.toContain('高一教室');
    expect(html).not.toContain('新增預備教室'); expect(html).not.toContain('>刪除<');
    expect(html).toContain('新增班級教室');
  });
  const doc = (): Doc => ({ ...demoDoc(), settings: { ...demoDoc().settings, classrooms: rooms } });
  it('部別切換：教室清單、學生名單、班級資料顯示；學校與表頭、選用功能不顯示', () => {
    const show = (tab: 'rooms' | 'roster' | 'classes' | 'school' | 'features') => renderToString(<Settings doc={doc()} onChange={noop} tab={tab} />).includes('aria-label="部別"');
    expect([show('rooms'), show('roster'), show('classes')]).toEqual([true, true, true]);
    expect([show('school'), show('features')]).toEqual([false, false]);
  });
  it('教室清單依部別：預設高中部，帶 junior 進來就是國中部', () => {
    const hs = renderToString(<Settings doc={doc()} onChange={noop} tab="rooms" />);
    expect(hs).toContain('教室清單（高中部）'); expect(hs).toContain('高一教室'); expect(hs).not.toContain('國一教室');
    const jh = renderToString(<Settings doc={doc()} onChange={noop} tab="rooms" division="junior" />);
    expect(jh).toContain('教室清單（國中部）'); expect(jh).toContain('國一教室'); expect(jh).not.toContain('高一教室');
  });
});
