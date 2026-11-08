import type { ExamConfig } from '../../data';
import { Alert, StatsBar } from '../components';
import { RoomList } from '../components/RoomList';
import { checkSeats, roomsMissingTrack, seatTotals } from '../rooms';
import { updateExam, type Doc } from '../store';

/** ③ 教室設定：狀態檢核在最上面，下面是每間教室一列（DESIGN 10.4） */
export function Step3(p: { doc: Doc; exam: ExamConfig; onChange: (d: Doc) => void }) {
  const { doc, exam } = p;
  const rooms = doc.settings.classrooms;
  const chosen = rooms.filter((r) => exam.classroomIds.includes(r.id));
  const { classSeats, reserveSeats } = seatTotals(chosen);
  const missing = roomsMissingTrack(chosen, exam.division);
  const students = doc.rosters[exam.division].length;
  const check = checkSeats(classSeats, students);
  const setRooms = (classrooms: typeof rooms) => p.onChange({ ...doc, settings: { ...doc.settings, classrooms } });
  const setIds = (ids: string[]) => { const r = updateExam(doc, exam.id, { classroomIds: ids }); if (r.ok) p.onChange(r.doc); };
  return (
    <section>
      <h2>③ 教室設定</h2>
      {missing.length > 0 && <div style="margin:12px 0"><Alert tone="danger"><b>高中部排座要先指定教室的組別。</b>「{missing.map((r) => r.name).join('、')}」還沒選理組或文組，請在下面該列的「組別」按鈕選一個（預備教室不用選）。</Alert></div>}
      <div style="margin:12px 0"><Alert tone={check.level === 'block' ? 'danger' : check.level === 'warn' ? 'warn' : 'ok'}>{check.message}</Alert></div>
      <StatsBar items={[{ label: '班級教室座位', value: classSeats, bad: check.level === 'block' }, { label: '考生', value: students }, { label: '預備教室座位（另計）', value: reserveSeats }]} />
      <p class="muted small" style="margin:12px 0">勾選本次使用的教室；預備教室座位另計，不計入班級教室合計。教室清單是全資料夾共用的（設定頁同一個畫面）。</p>
      <RoomList classes={doc.settings.classes} rooms={rooms} paper={doc.settings.defaultLabelPaper} onChange={setRooms} selected={exam.classroomIds} onSelect={setIds} />
    </section>
  );
}
