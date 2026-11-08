import type { ExamConfig, Track } from '../../data';
import { Alert, Button, Seg, StatsBar, StepHead } from '../components';
import { RoomList } from '../components/RoomList';
import { classCapacity, reserveCheck } from '../capacity';
import { newClassRoomIds, roomsMissingTrack } from '../rooms';
import { examEntries, examRooms, seatableEntries } from '../seating';
import { setClassTrack, updateExam, type Doc } from '../store';

/** ③ 教室設定：標題卡、狀態檢核卡（理組／文組分列＋預備教室）、班級（文理組）卡、教室與座位卡（原型 v3） */
export function Step3(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onToRooms?: () => void }) {
  const { doc, exam } = p;
  const rooms = doc.settings.classrooms;
  const senior = exam.division === 'senior';
  const { lines, noList, seats } = classCapacity(doc, exam);
  const students = seatableEntries(doc, exam).length;
  const bcct = exam.kind === 'bcct';
  const allRooms = examRooms(doc, exam);
  const reserveSeats = allRooms.filter((r) => r.kind === 'reserve').reduce((n, r) => n + r.seatCount, 0);
  const hasList = examEntries(doc, exam).length > 0;
  const missing = roomsMissingTrack(examRooms(doc, exam), exam.division);
  const reserve = reserveCheck(doc, exam);
  const roster = doc.rosters[exam.division];
  const classes = doc.settings.classes.filter((c) => c.division === exam.division);
  const noTrack = roster.length === 0 ? 0 : classes.filter((c) => !c.track).length;
  /** 新增的班級教室直接列入本次考試（TODO-15），預備教室預設不列入；其他變更不動選用狀態 */
  const setRooms = (classrooms: typeof rooms) => {
    const added = newClassRoomIds(rooms, classrooms);
    const next = { ...doc, settings: { ...doc.settings, classrooms } };
    if (!added.length) return p.onChange(next);
    const r = updateExam(next, exam.id, { classroomIds: [...exam.classroomIds, ...added] });
    p.onChange(r.ok ? r.doc : next);
  };
  const setIds = (ids: string[]) => { const r = updateExam(doc, exam.id, { classroomIds: ids }); if (r.ok) p.onChange(r.doc); };

  return (
    <section class="stack">
      <StepHead title="③ 教室設定">用開關選出本次考試的教室，確認座位夠用{senior ? '；高中部的班級要先分好理組、文組' : ''}。</StepHead>

      {/* D56：狀態檢核放頁面上方、隨時看得到；統計列照設計系統「頂部統計列」（D82 修訂） */}
      <StatsBar items={[
        { label: '考生', value: hasList ? students : '—' },
        { label: '座位', value: seats },
        { label: hasList && seats < students ? '缺位' : '空位', value: hasList ? Math.abs(seats - students) : '—', bad: hasList && seats < students },
        { label: '班級教室', value: `${allRooms.filter((r) => r.kind === 'class').length} 間` },
        { label: '預備教室', value: bcct ? '不需要' : `${allRooms.filter((r) => r.kind === 'reserve').length} 間` },
      ]} />

      <div class="card stack">
        <div><h3>狀態檢核</h3><p class="small muted">座位只能多、不能少；多出來的空位留在最後，座位由前往後連續安排。{senior ? '高中部理組、文組各自計算，預備教室不納入；預備教室座位另計（目前 ' + reserveSeats + '）。' : ''}</p></div>
        {/* 沒有考生人數時不顯示 0（D82），但座位合計仍要看得到 */}
        {noList && (bcct
          ? <Alert tone="info">共用學生名單是空的，沒有考生可檢核；教室座位合計 {seats}。</Alert>
          : <Alert tone="info"><b>尚未匯入考試名單：</b>教室座位合計 {seats}。匯入考試名單後檢核夠不夠。</Alert>)}
        {lines.map((l) => <Alert key={l.label} tone={l.ok ? 'ok' : 'danger'}>{l.ok ? <><b>{l.label}：</b>{l.detail}</> : l.message}</Alert>)}
        {missing.length > 0 && <Alert tone="danger"><b>高中部排座要先指定教室的組別。</b>「{missing.map((r) => r.name).join('、')}」還沒選理組或文組，請在下面該列的「組別」按鈕選一個（預備教室不用選）。</Alert>}
        <Alert tone={reserve.tone}>{reserve.message}</Alert>
      </div>

      <div class="card stack">
        <div><h3>班級</h3><p class="small muted">{senior ? '文理由班級決定，預設 01～03 理組、04～06 文組。' : ''}</p></div>
        {senior ? (
          <>
            <div class="cls-pal">
              {classes.map((c) => (
                <div class="cp" data-c={c.colorIndex} key={c.no}>
                  <strong>{c.name}</strong>
                  <span>{String(c.no).padStart(2, '0')} 班・{roster.filter((s) => s.classNo === c.no).length} 人</span>
                  <Seg<Track> label={`${c.name}班文理組`} value={(c.track ?? '') as Track} onChange={(t) => p.onChange(setClassTrack(doc, exam.division, c.no, t))}
                    options={[{ value: 'science', label: '理組' }, { value: 'liberal', label: '文組' }]} />
                </div>
              ))}
            </div>
            {classes.length === 0 && <p class="small muted">共用設定還沒有高中部的班級。</p>}
            {noTrack > 0 && <Alert tone="warn">有 {noTrack} 個班級還沒分理組、文組，排座會被擋下。</Alert>}
          </>
        ) : <Alert tone="info">會考不分文理組，所有班級打散到所有教室。</Alert>}
      </div>

      <div class="card stack">
        <div class="row" style="justify-content:space-between"><div><h3>教室與座位</h3><p class="small muted">打開開關就列入本次考試；{senior ? '預備教室座位另計，不計入班級教室合計。' : ''}教室清單是所有模擬考共用的：修改教室會影響其他使用這間教室的模擬考。</p></div>{p.onToRooms && <Button onClick={p.onToRooms}>到共用設定看教室清單</Button>}</div>
        <RoomList junior={!senior} classes={doc.settings.classes} rooms={rooms} paper={doc.settings.defaultLabelPaper} onChange={setRooms} selected={exam.classroomIds} onSelect={setIds} />
      </div>
    </section>
  );
}
