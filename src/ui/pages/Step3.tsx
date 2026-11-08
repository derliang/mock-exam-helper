import type { ExamConfig, Track } from '../../data';
import { Alert, Button, Seg } from '../components';
import { RoomList } from '../components/RoomList';
import { classCapacity, reserveCheck } from '../capacity';
import { roomsMissingTrack } from '../rooms';
import { examRooms } from '../seating';
import { setClassTrack, updateExam, type Doc } from '../store';

/** ③ 教室設定：標題卡、狀態檢核卡（理組／文組分列＋預備教室）、班級（文理組）卡、教室與座位卡（原型 v3） */
export function Step3(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void; onToRooms?: () => void }) {
  const { doc, exam } = p;
  const rooms = doc.settings.classrooms;
  const senior = exam.division === 'senior';
  const { lines } = classCapacity(doc, exam);
  const missing = roomsMissingTrack(examRooms(doc, exam), exam.division);
  const reserve = reserveCheck(doc, exam);
  const roster = doc.rosters[exam.division];
  const classes = doc.settings.classes.filter((c) => c.division === exam.division);
  const noTrack = roster.length === 0 ? 0 : classes.filter((c) => !c.track).length;
  const setRooms = (classrooms: typeof rooms) => p.onChange({ ...doc, settings: { ...doc.settings, classrooms } });
  const setIds = (ids: string[]) => { const r = updateExam(doc, exam.id, { classroomIds: ids }); if (r.ok) p.onChange(r.doc); };

  return (
    <section class="stack">
      <div class="card stephead"><div><h2>③ 教室設定</h2><p class="small muted">勾選本次使用的教室，確認座位夠用；高中部的班級要先分好理組、文組。</p></div></div>

      <div class="card stack">
        <div><h3>狀態檢核</h3><p class="small muted">座位只能多、不能少；多出來的空位留在最後，座位由前往後連續安排（D69）。{senior ? '高中部理組、文組各自計算，預備教室不納入。' : ''}</p></div>
        {lines.map((l) => <Alert key={l.label} tone={l.ok ? 'ok' : 'danger'}>{l.ok ? <><b>{l.label}：</b>{l.detail}</> : l.message}</Alert>)}
        {missing.length > 0 && <Alert tone="danger"><b>高中部排座要先指定教室的組別。</b>「{missing.map((r) => r.name).join('、')}」還沒選理組或文組，請在下面該列的「組別」按鈕選一個（預備教室不用選）。</Alert>}
        <Alert tone={reserve.tone}>{reserve.message}</Alert>
      </div>

      <div class="card stack">
        <div><h3>班級</h3><p class="small muted">{senior ? '文理由班級決定，預設 01～03 理組、04～06 文組（D9）。' : ''}</p></div>
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
            {classes.length === 0 && <p class="small muted">設定頁還沒有高中部的班級。</p>}
            {noTrack > 0 && <Alert tone="warn">有 {noTrack} 個班級還沒分理組、文組，排座會被擋下。</Alert>}
          </>
        ) : <Alert tone="info">會考不分文理組，所有班級打散到所有教室（D10、D30）。</Alert>}
      </div>

      <div class="card stack">
        <div class="row" style="justify-content:space-between"><div><h3>教室與座位</h3><p class="small muted">勾選本次使用的教室；預備教室座位另計，不計入班級教室合計。教室清單是全資料夾共用的（設定頁同一個畫面）。</p></div>{p.onToRooms && <Button onClick={p.onToRooms}>到設定頁看教室清單</Button>}</div>
        <RoomList classes={doc.settings.classes} rooms={rooms} paper={doc.settings.defaultLabelPaper} onChange={setRooms} selected={exam.classroomIds} onSelect={setIds} />
      </div>
    </section>
  );
}
