import type { ExamConfig, Track } from '../../data';
import { Alert, Badge, Button, Seg, StepHead } from '../components';
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
      <StepHead title="③ 教室設定" />

      <div class="card stack">
        <div><h3>狀態檢核</h3><p class="small muted">座位只能多、不能少；多出來的空位留在最後，座位由前往後連續安排。{senior ? '高中部理組、文組各自計算，預備教室不納入；預備教室座位另計（目前 ' + reserveSeats + '）。' : ''}</p></div>
        {/* 沒有考生人數時不顯示 0（D82），但座位合計仍要看得到 */}
        {noList && (bcct
          ? <Alert tone="info">共用學生名單是空的，沒有考生可檢核；教室座位合計 {seats}。</Alert>
          : <Alert tone="info"><b>尚未匯入考試名單：</b>教室座位合計 {seats}。匯入考試名單後檢核夠不夠。</Alert>)}
        {/* 稿 v2.22（校-31）：一項一格，上名稱、中大數字（座位數）、下狀態徽章；不足整格淡紅底，格下有說明 */}
        {lines.length > 0 && (
          <div class="stats chkgrid">
            {lines.map((l) => {
              const extra = l.seats - l.students;
              return (
                <div key={l.label} class={`chk${l.ok ? (extra > 0 && hasList ? ' warnc' : '') : ' bad'}`}>
                  <small>{l.label}座位</small><strong>{l.seats}</strong>
                  {hasList && <span class="sub">考生 {l.students}</span>}
                  {hasList && <Badge tone={l.ok ? (extra > 0 ? 'warn' : 'ok') : 'danger'}>{l.ok ? (extra > 0 ? `多 ${extra}` : '剛好') : `不足 ${l.students - l.seats}`}</Badge>}
                </div>
              );
            })}
          </div>
        )}
        <div class="stack" style="gap:6px">
          {lines.map((l) => <p key={l.label} class={`small${l.ok ? ' muted' : ' errnote'}`}>{l.ok ? <><b>{l.label}：</b>{l.detail}</> : l.message}</p>)}
        </div>
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


      {senior && (
        <div class="card stack">
          <div><h3>預備教室排座與標籤</h3><p class="small muted">加考的同學去預備教室時，座位怎麼排，以及標籤長什麼樣子。</p></div>
          <div class="stack" style="gap:8px">
            <div><h4 class="sh">排座方式</h4><p class="small muted">兩種都可以選，預設「同學優先」。</p></div>
            <div class="pmode" role="group" aria-label="預備教室排座方式">
              {([['student', '① 同學優先（預設）', '同一個人每一節盡量坐同一個座位，方便貼標籤；同班照編號由前往後排。預備教室放不下時，才讓不同節的人共用座位（退回監考優先的排法）。'],
                ['invigilator', '② 監考優先', '每一節各自排，同班坐在一起、座號一定由小到大，方便監考；同學不保證每節同一個座位。']] as const).map(([v, t, d]) => (
                <button type="button" class="opt" key={v} aria-pressed={(exam.reserveMode ?? 'student') === v}
                  onClick={() => { const r = updateExam(doc, exam.id, { reserveMode: v }); if (r.ok) p.onChange(r.doc); }}>
                  <b>{t}</b><span class="small muted">{d}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="psec">
            <div><h4 class="sh">合併標籤（範例）</h4><p class="small muted">預備教室每個座位一張。同一個座位在不同節由不同人使用時，各節列在同一張，只貼一次；每節一行，印「節次＋科目」，不印時間。抽離自習不排座位、不印標籤，只出名單。節次依共用設定「節次與時長」。同一節各科的抽離人數會加總，再和預備教室座位比。</p></div>
            <div class="plbls">
              <div class="plbl"><div class="plh"><span>備一</span><span>座位 1-1</span></div><div class="pl"><small>第 5 節</small><span>歷史</span></div></div>
              <div class="plbl"><div class="plh"><span>備一</span><span>座位 1-2</span></div><div class="pl"><small>第 1 節</small><span>物理</span></div><div class="pl"><small>第 7 節</small><span>數乙</span></div></div>
              <div class="plbl"><div class="plh"><span>備一</span><span>座位 2-1</span></div><div class="pl"><small>第 2 節</small><span>化學</span></div><div class="pl"><small>第 6 節</small><span>地理（另一位同學）</span></div></div>
            </div>
            <p class="small muted">第 2 張：同一個人跨節坐同一格。第 3 張：兩個不同的人共用同一格。</p>
          </div>
        </div>
      )}

      <div class="card stack">
        <div class="row" style="justify-content:space-between"><div><h3>教室與座位</h3><p class="small muted">打開開關就列入本次考試；{senior ? '預備教室座位另計，不計入班級教室合計。' : ''}教室清單是所有模擬考共用的：修改教室會影響其他使用這間教室的模擬考。</p></div>{p.onToRooms && <Button onClick={p.onToRooms}>到共用設定看教室清單</Button>}</div>
        <RoomList junior={!senior} division={exam.division} exams={doc.exams} classes={doc.settings.classes} rooms={rooms} paper={doc.settings.defaultLabelPaper} onChange={setRooms} selected={exam.classroomIds} onSelect={setIds} />
      </div>
    </section>
  );
}
