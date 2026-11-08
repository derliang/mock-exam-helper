import { useState } from 'preact/hooks';
import type { Division, LabelPaper, Student, Track } from '../../data';
import { studentCode } from '../../data';
import { Alert, Button, ClassChip, Modal, Seg } from '../components';
import { RoomList } from '../components/RoomList';
import { CLASS_COLOR_COUNT, CLASS_COLOR_NAMES, colorConflicts } from '../colors';
import { addStudent, removeStudent, searchStudents, setClassColor, setClassTrack, updateStudent, type Doc } from '../store';

type Tab = 'roster' | 'classes' | 'school' | 'rooms';
const TABS: { value: Tab; label: string }[] = [
  { value: 'roster', label: '學生名單' }, { value: 'classes', label: '班級資料' },
  { value: 'school', label: '學校與表頭' }, { value: 'rooms', label: '教室清單' },
];

/** 設定頁（D61）：部別切換（UI-07/08）；改動都走 onChange，由 App 記入復原 */
export function Settings(p: { doc: Doc; onChange: (d: Doc) => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(p.tab ?? 'roster');
  const [division, setDivision] = useState<Division>('senior');
  return (
    <section>
      <h2>設定</h2>
      <div class="btnrow" style="margin:12px 0">
        <Seg<Division> label="部別" value={division} onChange={setDivision} options={[{ value: 'senior', label: '高中部' }, { value: 'junior', label: '國中部' }]} />
        <Seg<Tab> label="設定分頁" value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'roster' && <Roster {...p} division={division} />}
      {tab === 'classes' && <Classes {...p} division={division} />}
      {tab === 'school' && <School {...p} />}
      {tab === 'rooms' && <RoomList rooms={p.doc.settings.classrooms} paper={p.doc.settings.defaultLabelPaper} onChange={(classrooms) => p.onChange({ ...p.doc, settings: { ...p.doc.settings, classrooms } })} />}
    </section>
  );
}

type Props = { doc: Doc; onChange: (d: Doc) => void; division: Division };

function Roster({ doc, onChange, division }: Props) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const list = searchStudents(doc.rosters[division], q);
  const cls = (no: number) => doc.settings.classes.find((c) => c.no === no && c.division === division);
  return (
    <div>
      <div class="btnrow">
        <input class="input" style="max-width:360px" type="search" aria-label="搜尋姓名、考生編號、學號" placeholder="搜尋姓名、考生編號、學號" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <Button kind="primary" onClick={() => setEditing('new')}>新增學生</Button>
      </div>
      <p class="muted small" style="margin:8px 0">共 {doc.rosters[division].length} 人。刪除後空號保留。</p>
      <div style="overflow-x:auto">
        <table class="t">
          <thead><tr><th>班級</th><th>座號</th><th>考生編號</th><th>姓名</th><th>學號</th><th /></tr></thead>
          <tbody>
            {list.map((s) => (
              <tr key={`${s.classNo}-${s.seatNo}`}>
                <td>{cls(s.classNo) ? <ClassChip colorIndex={cls(s.classNo)!.colorIndex}>{cls(s.classNo)!.name}</ClassChip> : s.classNo}</td>
                <td>{s.seatNo}</td><td class="num">{studentCode(s.classNo, s.seatNo)}</td><td>{s.name}</td>
                <td class="muted">{s.schoolId ?? '（空白）'}</td>
                <td><div class="btnrow"><Button small onClick={() => setEditing(s)}>編輯</Button><Button small kind="danger" onClick={() => onChange(removeStudent(doc, division, s))}>刪除</Button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p class="muted">沒有符合的學生。</p>}
      {editing && (
        <StudentForm doc={doc} division={division} student={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)}
          onSave={(d) => { onChange(d); setEditing(null); }} />
      )}
    </div>
  );
}

function StudentForm(p: { doc: Doc; division: Division; student?: Student; onClose: () => void; onSave: (d: Doc) => void }) {
  const s0 = p.student;
  const firstClass = p.doc.settings.classes.find((c) => c.division === p.division)?.no ?? 1;
  const [classNo, setClassNo] = useState(String(s0?.classNo ?? firstClass));
  const [seatNo, setSeatNo] = useState(String(s0?.seatNo ?? ''));
  const [name, setName] = useState(s0?.name ?? '');
  const [schoolId, setSchoolId] = useState(s0?.schoolId ?? '');
  const [err, setErr] = useState('');
  const save = () => {
    const next: Student = { classNo: Number(classNo), seatNo: Number(seatNo), name, schoolId };
    const r = s0 ? updateStudent(p.doc, p.division, s0, next) : addStudent(p.doc, p.division, next);
    if (r.ok) p.onSave(r.doc); else setErr(r.error);
  };
  return (
    <Modal title={s0 ? '編輯學生' : '新增學生'} onClose={p.onClose} actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" onClick={save}>儲存</Button></>}>
      <div class="formgrid">
        <div class="field"><label for="f-class">班級</label>
          <select id="f-class" class="input" value={classNo} onChange={(e) => setClassNo(e.currentTarget.value)}>
            {p.doc.settings.classes.filter((c) => c.division === p.division).map((c) => <option key={c.no} value={c.no}>{String(c.no).padStart(2, '0')} {c.name}</option>)}
          </select><span class="hint">選已建立的班級</span></div>
        <div class="field"><label for="f-seat">座號</label>
          <input id="f-seat" class="input" inputMode="numeric" value={seatNo} onInput={(e) => setSeatNo(e.currentTarget.value)} /><span class="hint">1～99，同班不可重複</span></div>
        <div class="field"><label for="f-name">姓名</label>
          <input id="f-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} /><span class="hint">必填</span></div>
        <div class="field"><label for="f-sid">學號（選填）</label>
          <input id="f-sid" class="input" value={schoolId} onInput={(e) => setSchoolId(e.currentTarget.value)} /><span class="hint">沒有就留空</span></div>
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}
    </Modal>
  );
}

function Classes({ doc, onChange, division }: Props) {
  const list = doc.settings.classes.filter((c) => c.division === division);
  const trackOpts: { value: Track; label: string }[] = [{ value: 'science', label: '理組' }, { value: 'liberal', label: '文組' }];
  return (
    <div style="overflow-x:auto">
      {division === 'junior' && <Alert tone="info">國中部不分理組、文組。</Alert>}
      <table class="t">
        <thead><tr><th>班級</th><th>班級色</th>{division === 'senior' && <th>組別</th>}</tr></thead>
        <tbody>
          {list.map((c) => {
            const clash = colorConflicts(list, c.no, c.colorIndex);
            return (
              <tr key={c.no}>
                <td><ClassChip colorIndex={c.colorIndex}>{String(c.no).padStart(2, '0')} {c.name}</ClassChip></td>
                <td>
                  <select class="input" aria-label={`${c.name}班級色`} value={c.colorIndex} onChange={(e) => onChange(setClassColor(doc, division, c.no, Number(e.currentTarget.value)))}>
                    {Array.from({ length: CLASS_COLOR_COUNT }, (_, i) => <option key={i} value={i + 1}>{i + 1} {CLASS_COLOR_NAMES[i]}</option>)}
                  </select>
                  {clash.length > 0 && <div class="hint">⚠ 與 {clash.map((n) => String(n).padStart(2, '0')).join('、')} 班同色，黑白列印請靠班級字分辨</div>}
                </td>
                {division === 'senior' && (
                  <td><Seg<Track> label={`${c.name}組別`} value={c.track ?? 'science'} options={trackOpts} onChange={(t) => onChange(setClassTrack(doc, division, c.no, t))} /></td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function School({ doc, onChange }: Pick<Props, 'doc' | 'onChange'>) {
  const s = doc.settings;
  const set = (patch: Partial<typeof s>) => onChange({ ...doc, settings: { ...s, ...patch } });
  return (
    <div class="formgrid">
      <div class="field"><label for="s-name">學校名稱</label><input id="s-name" class="input" value={s.schoolName} onChange={(e) => set({ schoolName: e.currentTarget.value })} /><span class="hint">印在座位表與標籤表頭</span></div>
      <div class="field"><label for="s-head">表頭文字</label><input id="s-head" class="input" value={s.headerText} onChange={(e) => set({ headerText: e.currentTarget.value })} /><span class="hint">固定表頭</span></div>
      <div class="field"><span class="label">座位表與名單</span><span>A4（固定）</span><span class="hint">不可改</span></div>
      <div class="field"><span class="label">標籤紙張</span>
        <Seg<LabelPaper> label="標籤紙張" value={s.defaultLabelPaper} onChange={(v) => set({ defaultLabelPaper: v })} options={[{ value: 'B4', label: 'B4（一般）' }, { value: 'A3', label: 'A3（大尺寸）' }]} />
      </div>
    </div>
  );
}

