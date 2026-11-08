import { useState } from 'preact/hooks';
import type { Division, LabelPaper, Student, Track } from '../../data';
import { studentCode } from '../../data';
import { Alert, Button, ClassChip, ConfirmButton, EmptyState, Modal, Seg } from '../components';
import { confirmCopy } from '../flow';
import { RoomList } from '../components/RoomList';
import { CLASS_COLOR_COUNT, CLASS_COLOR_NAMES, colorConflicts } from '../colors';
import { RosterIO } from './RosterIO';
import { allFeatures, withFeature } from '../features';
import { addStudent, removeStudent, searchStudents, setClassColor, setClassTrack, updateStudent, type Doc } from '../store';

type Tab = 'roster' | 'classes' | 'school' | 'rooms' | 'features';
const TABS: { value: Tab; label: string }[] = [
  { value: 'roster', label: '學生名單' }, { value: 'classes', label: '班級資料' },
  { value: 'school', label: '學校與表頭' }, { value: 'rooms', label: '教室清單' }, { value: 'features', label: '選用功能' },
];

/** 設定頁（D61）：部別切換（UI-07/08）；改動都走 onChange，由 App 記入復原 */
export function Settings(p: { doc: Doc; onChange: (d: Doc) => void; tab?: Tab }) {
  const [tab, setTab] = useState<Tab>(p.tab ?? 'roster');
  const [division, setDivision] = useState<Division>('senior');
  return (
    <section>
      <h2>設定</h2>
      <div class="utabs" role="group" aria-label="設定項目" style="margin:12px 0">
        {TABS.map((t) => <button type="button" key={t.value} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>{t.label}</button>)}
      </div>
      {tab !== 'school' && tab !== 'rooms' && (
        <div class="row" style="margin-bottom:12px">
          <span class="label" style="margin:0">部別</span>
          <div class="seg seg-soft" role="group" aria-label="部別">
            {([['senior', '高中部'], ['junior', '國中部']] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={division === v} onClick={() => setDivision(v)}>{l}</button>)}
          </div>
          <span class="small muted">{division === 'junior' ? '國中部：不分文理組，會考科目固定七科' : '高中部：每個班級分理組或文組'}</span>
        </div>
      )}
      {tab === 'roster' && <Roster {...p} division={division} />}
      {tab === 'classes' && <Classes {...p} division={division} />}
      {tab === 'school' && <School {...p} />}
      {tab === 'features' && <Features doc={p.doc} onChange={p.onChange} />}
      {tab === 'rooms' && <RoomList classes={p.doc.settings.classes} inUse={(id) => p.doc.exams.some((e) => e.classroomIds.includes(id))} rooms={p.doc.settings.classrooms} paper={p.doc.settings.defaultLabelPaper} onChange={(classrooms) => p.onChange({ ...p.doc, settings: { ...p.doc.settings, classrooms } })} />}
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
        <RosterIO doc={doc} division={division} onChange={onChange} />
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
                <td><div class="btnrow"><Button small onClick={() => setEditing(s)}>編輯</Button><ConfirmButton small copy={confirmCopy.deleteStudent(s.name, studentCode(s.classNo, s.seatNo))} onConfirm={() => onChange(removeStudent(doc, division, s))}>刪除</ConfirmButton></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && (doc.rosters[division].length === 0
        ? <EmptyState title="這個部別還沒有學生" action={<Button kind="primary" onClick={() => setEditing('new')}>新增第一位學生</Button>}>可以一位一位新增，或用上方「下載 Excel 範本」填好後「匯入 Excel」。名單是之後考試名單比對的依據。</EmptyState>
        : <p class="muted">沒有符合「{q}」的學生，請換個關鍵字（姓名、考生編號或學號）。</p>)}
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
  const isJ = division === 'junior';
  return (
    <div class="card stack">
      <div>
        <h3>班級資料（{isJ ? '國中部' : '高中部'}）</h3>
        <p class="small muted">班級名稱、{isJ ? '班級色' : '文理組、班級色'}，所有模擬考共用。</p>
      </div>
      <div class="scroll">
        <table class="t compact nw">
          <thead><tr><th>班級</th><th>名稱</th>{!isJ && <th>文理組</th>}<th>班級色（{CLASS_COLOR_COUNT} 色）</th></tr></thead>
          <tbody>
            {list.map((c) => {
              const clash = colorConflicts(list, c.no, c.colorIndex);
              return (
                <tr key={c.no}>
                  <td><ClassChip colorIndex={c.colorIndex}>{String(c.no).padStart(2, '0')} {c.name}</ClassChip></td>
                  <td><input class="input" style="min-width:90px;max-width:120px" value={c.name} aria-label={`第${c.no}班名稱`} disabled /></td>
                  {!isJ && <td><Seg<Track> label={`${c.name}班文理組`} value={c.track ?? 'science'} options={trackOpts} onChange={(tr) => onChange(setClassTrack(doc, division, c.no, tr))} /></td>}
                  <td>
                    <div class="swatches" role="group" aria-label={`${c.name}班班級色`}>
                      {Array.from({ length: CLASS_COLOR_COUNT }, (_, i) => (
                        <button type="button" key={i} aria-pressed={c.colorIndex === i + 1} aria-label={`改成第 ${i + 1} 色 ${CLASS_COLOR_NAMES[i]}`} title={`${i + 1} ${CLASS_COLOR_NAMES[i]}`}
                          style={`background:var(--c${i + 1}-bg);border-color:var(--c${i + 1}-line)`}
                          onClick={() => onChange(setClassColor(doc, division, c.no, i + 1))} />
                      ))}
                    </div>
                    {clash.length > 0 && <div class="hint">⚠ 與 {clash.map((n) => String(n).padStart(2, '0')).join('、')} 班同色，黑白列印請靠班級字分辨</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small muted">共 {CLASS_COLOR_COUNT} 種班級色，改色會套用到座位表與標籤。每格都另印班級字，黑白列印也分得出班；班級名稱（溫良恭儉勤誠）固定。</p>
    </div>
  );
}

function School({ doc, onChange }: Pick<Props, 'doc' | 'onChange'>) {
  const s = doc.settings;
  const set = (patch: Partial<typeof s>) => onChange({ ...doc, settings: { ...s, ...patch } });
  return (
    <div class="card stack">
      <div>
        <h3>學校與表頭資訊</h3>
        <p class="small muted">座位表與標籤的固定表頭文字、預設紙張。</p>
      </div>
      <div class="field"><label for="s-name">學校名稱</label><input id="s-name" class="input" value={s.schoolName} onChange={(e) => set({ schoolName: e.currentTarget.value })} /><span class="hint">印在座位表與標籤表頭</span></div>
      <div class="field"><label for="s-head">表頭文字</label><input id="s-head" class="input" value={s.headerText} onChange={(e) => set({ headerText: e.currentTarget.value })} /><span class="hint">座位表與標籤共用的固定表頭</span></div>
      <div class="field"><span class="label">預設紙張</span>
        <div class="row">
          <span>座位表與名單：A4（固定）</span>
          <div class="seg fmtseg" role="group" aria-label="標籤預設紙張">
            {([['B4', '標籤 B4（一般）'], ['A3', '標籤 A3（大尺寸）']] as const).map(([v, l]) => (
              <button type="button" key={v} aria-pressed={s.defaultLabelPaper === v} onClick={() => set({ defaultLabelPaper: v as LabelPaper })}>{l}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


/** 選用功能（D75）：逐項勾選；預設全關，關掉的功能在導覽、匯出頁與步驟中完全不出現 */
function Features({ doc, onChange }: Pick<Props, 'doc' | 'onChange'>) {
  const list = allFeatures();
  return (
    <div class="stack">
      <p class="muted">以下功能不一定每個學校都需要，用得到的再打開。關掉的功能不會出現在畫面上，也不影響排座、標籤、座位表與匯出這些基本功能。</p>
      {list.map((f) => {
        const on = doc.settings.features?.[f.id] === true;
        return (
          <label key={f.id} class="check" style="align-items:flex-start">
            <input type="checkbox" checked={on} onChange={(e) => onChange({ ...doc, settings: withFeature(doc.settings, f.id, e.currentTarget.checked) })} />
            <span>
              <b>{f.name}</b>{f.scope === 'bcct' && <> <span class="small muted">（只用於會考）</span></>}<br />
              <span class="small muted">{f.desc}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
