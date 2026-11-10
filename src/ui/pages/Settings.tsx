import { syncDiffs } from '../store';
import { useState } from 'preact/hooks';
import type { Division, LabelPaper, Student, Track } from '../../data';
import { DEFAULT_LABEL_NOTES, LABEL_NOTE_MAX_CHARS, LABEL_NOTE_MAX_LINES, noteLineLength, studentCode } from '../../data';
import { Alert, Badge, Button, ClassChip, ConfirmButton, EmptyState, Modal, Seg, Switch } from '../components';
import { confirmCopy } from '../flow';
import { RoomList } from '../components/RoomList';
import { CLASS_COLOR_COUNT, CLASS_COLOR_NAMES, colorConflicts } from '../colors';
import { RosterIO } from './RosterIO';
import { allFeatures, withFeature } from '../features';
import { addClass, addStudent, nextClassNo, validateClassName, classUsage, removeClass, removeStudent, renameClass, searchStudents, setClassColor, setClassTrack, updateStudent, type Doc } from '../store';

type Tab = 'roster' | 'classes' | 'school' | 'rooms' | 'features';
const TABS: { value: Tab; label: string }[] = [
  { value: 'roster', label: '學生名單' }, { value: 'classes', label: '班級資料' },
  { value: 'school', label: '學校與表頭' }, { value: 'rooms', label: '教室清單' }, { value: 'features', label: '選用功能' },
];

/** 設定頁（D61）：部別切換（UI-07/08）；改動都走 onChange，由 App 記入復原 */
export function Settings(p: { doc: Doc; onChange: (d: Doc) => void; tab?: Tab; division?: Division }) {
  const [tab, setTab] = useState<Tab>(p.tab ?? 'roster');
  const [division, setDivision] = useState<Division>(p.division ?? 'senior');
  return (
    <section>
      <div class="utabs" role="group" aria-label="設定項目" style="margin:12px 0">
        {TABS.map((t) => <button type="button" key={t.value} aria-pressed={tab === t.value} onClick={() => setTab(t.value)}>{t.label}</button>)}
      </div>
      {tab !== 'school' && tab !== 'rooms' && tab !== 'features' && (
        <div class="row" style="margin-bottom:12px">
          <span class="label" style="margin:0">部別</span>
          <div class="seg seg-soft" role="group" aria-label="部別">
            {([['senior', '高中部'], ['junior', '國中部']] as const).map(([v, l]) => <button type="button" key={v} aria-pressed={division === v} onClick={() => setDivision(v)}>{l}</button>)}
          </div>
          <span class="small muted">{division === 'junior' ? '國中部：會考科目固定七科' : '高中部：每個班級分理組或文組'}</span>
        </div>
      )}
      {tab === 'roster' && <Roster {...p} onChange={(d) => p.onChange(syncDiffs(d))} division={division} />}
      {tab === 'classes' && <Classes {...p} division={division} />}
      {tab === 'school' && <School {...p} />}
      {tab === 'features' && <Features doc={p.doc} onChange={p.onChange} />}
      {tab === 'rooms' && <div class="card stack"><div><h3>教室清單</h3><p class="small muted">維護常用的班級教室與預備教室；每次模擬考從這裡選用，座位表在這裡也能編輯。</p></div><RoomList classes={p.doc.settings.classes} inUse={(id) => p.doc.exams.some((e) => e.classroomIds.includes(id))} rooms={p.doc.settings.classrooms} paper={p.doc.settings.defaultLabelPaper} onChange={(classrooms) => p.onChange({ ...p.doc, settings: { ...p.doc.settings, classrooms } })} /></div>}
    </section>
  );
}

type Props = { doc: Doc; onChange: (d: Doc) => void; division: Division };

function Roster({ doc, onChange, division }: Props) {
  const [q, setQ] = useState('');
  const [cf, setCf] = useState<number | 'all'>('all'); // 班級篩選
  const [editing, setEditing] = useState<Student | 'new' | { classNo: number; seatNo: number } | null>(null);
  const isJ = division === 'junior';
  const classes = doc.settings.classes.filter((c) => c.division === division);
  const all = doc.rosters[division];
  const activeCf = cf !== 'all' && classes.some((c) => c.no === cf) ? cf : 'all';
  const found = searchStudents(all, q);
  const list = activeCf === 'all' ? found : found.filter((s) => s.classNo === activeCf);
  const cls = (no: number) => classes.find((c) => c.no === no);
  // 選定單一班級且沒搜尋時，缺的座號顯示空號列（D41：刪除後座號保留，不自動補號）
  const showGaps = activeCf !== 'all' && !q.trim();
  type Row = { kind: 'stu'; s: Student } | { kind: 'gap'; no: number };
  const rows: Row[] = [];
  if (showGaps) {
    const have = new Map(list.map((s) => [s.seatNo, s]));
    const max = list.reduce((m, s) => Math.max(m, s.seatNo), 0);
    for (let n = 1; n <= max; n++) { const s = have.get(n); rows.push(s ? { kind: 'stu', s } : { kind: 'gap', no: n }); }
  } else for (const s of list) rows.push({ kind: 'stu', s });
  const cols = isJ ? 7 : 8;
  return (
    <div class="card stack">
      <div>
        <h3>學生名單（{isJ ? '國中部' : '高中部'}）</h3>
        <p class="small muted">一年一份，只存班級、座號、姓名，另有選填的學號；考科來自每次的考試名單。轉學生、復學生直接新增並自己輸入座號。共 {all.length} 人；刪除學生不會更動其他人的考生編號。</p>
      </div>
      <div class="row">
        <div class="seg" role="group" aria-label="班級篩選">
          <button type="button" aria-pressed={activeCf === 'all'} onClick={() => setCf('all')}>全部</button>
          {classes.map((c) => <button type="button" key={c.no} aria-pressed={activeCf === c.no} onClick={() => setCf(c.no)}>{c.name}</button>)}
        </div>
        <input class="input" style="max-width:240px" type="search" aria-label="搜尋姓名、考生編號、學號" placeholder="搜尋姓名、考生編號或學號" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
      </div>
      <div class="btnrow">
        <Button kind="primary" onClick={() => setEditing('new')}>新增學生</Button>
        <RosterIO doc={doc} division={division} onChange={onChange} />
      </div>
      <div class="scroll" style="max-height:520px;overflow-y:auto">
        <table class="t compact nw">
          <thead><tr><th>班級</th><th>座號</th><th>考生編號</th><th>姓名</th><th>學號</th>{!isJ && <th>組別</th>}<th>特殊生需求</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'gap') {
                const c = cls(activeCf as number);
                return (
                  <tr class="gap" key={`gap-${r.no}`}>
                    <td>{c ? c.name : activeCf}</td><td class="num">{r.no}</td><td class="num">——</td><td>空號（保留，不自動補號）</td><td />{!isJ && <td />}<td />
                    <td><Button small onClick={() => setEditing({ classNo: activeCf as number, seatNo: r.no })}>填入學生</Button></td>
                  </tr>
                );
              }
              const s = r.s;
              return (
                <tr key={`${s.classNo}-${s.seatNo}`}>
                  <td>{cls(s.classNo) ? <ClassChip colorIndex={cls(s.classNo)!.colorIndex}>{cls(s.classNo)!.name}</ClassChip> : s.classNo}</td>
                  <td class="num">{s.seatNo}</td><td class="num">{studentCode(s.classNo, s.seatNo)}</td><td>{s.name}</td>
                  <td class="muted">{s.schoolId ?? '（空白）'}</td>
                  {!isJ && <td>{s.groupCode ?? '—'}</td>}
                  <td class="small muted">{s.special ?? '—'}</td>
                  <td><div class="btnrow" style="flex-wrap:nowrap"><Button small onClick={() => setEditing(s)}>編輯</Button><ConfirmButton small copy={confirmCopy.deleteStudent(s.name, studentCode(s.classNo, s.seatNo))} onConfirm={() => onChange(removeStudent(doc, division, s))}>刪除</ConfirmButton></div></td>
                </tr>
              );
            })}
            {rows.length === 0 && all.length > 0 && <tr><td colSpan={cols} class="muted">{q.trim() ? `沒有符合「${q}」的學生，請換個關鍵字（姓名、考生編號或學號）。` : '這個班級還沒有學生。'}</td></tr>}
          </tbody>
        </table>
      </div>
      {all.length === 0 && (
        <EmptyState title="這個部別還沒有學生" action={<Button kind="primary" onClick={() => setEditing('new')}>新增第一位學生</Button>}>可以一位一位新增，或用上方「下載名單範本」填好後「匯入學生名單」。名單是之後考試名單比對的依據。</EmptyState>
      )}
      <p class="small muted">斜紋底的列是目前沒有學生的座號：刪除學生後座號會空著，不會自動遞補。座號由你輸入。學號沒匯入就留空，不影響排座與考生編號。</p>
      {editing && (
        <StudentForm doc={doc} division={division} {...(editing === 'new' ? {} : 'name' in editing ? { student: editing } : { prefill: editing })} onClose={() => setEditing(null)}
          onSave={(d) => { onChange(d); setEditing(null); }} />
      )}
    </div>
  );
}

function StudentForm(p: { doc: Doc; division: Division; student?: Student; prefill?: { classNo: number; seatNo: number }; onClose: () => void; onSave: (d: Doc) => void }) {
  const s0 = p.student;
  const isJ = p.division === 'junior';
  const firstClass = p.doc.settings.classes.find((c) => c.division === p.division)?.no ?? 1;
  const [classNo, setClassNo] = useState(String(s0?.classNo ?? p.prefill?.classNo ?? firstClass));
  const [seatNo, setSeatNo] = useState(String(s0?.seatNo ?? p.prefill?.seatNo ?? ''));
  const [name, setName] = useState(s0?.name ?? '');
  const [schoolId, setSchoolId] = useState(s0?.schoolId ?? '');
  const [groupCode, setGroupCode] = useState(s0?.groupCode ?? '');
  const [special, setSpecial] = useState(s0?.special ?? '');
  const [err, setErr] = useState('');
  const save = () => {
    const next: Student = { classNo: Number(classNo), seatNo: Number(seatNo), name, schoolId, special, ...(isJ ? {} : { groupCode }) };
    const r = s0 ? updateStudent(p.doc, p.division, s0, next) : addStudent(p.doc, p.division, next);
    if (r.ok) p.onSave(r.doc); else setErr(r.error);
  };
  return (
    <Modal title={s0 ? '編輯學生' : '新增學生'} onClose={p.onClose} actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" onClick={save}>儲存</Button></>}>
      <div class="formgrid">
        <div class="field"><label for="f-class">班級</label>
          <select id="f-class" class="input" value={classNo} onChange={(e) => setClassNo(e.currentTarget.value)}>
            {p.doc.settings.classes.filter((c) => c.division === p.division).map((c) => <option key={c.no} value={c.no}>{c.name}（{String(c.no).padStart(2, '0')}）</option>)}
          </select><span class="hint">考生編號＝班級＋座號（例：0207）</span></div>
        <div class={`field${err ? ' err' : ''}`}><label for="f-seat">座號</label>
          <input id="f-seat" class="input" inputMode="numeric" value={seatNo} onInput={(e) => setSeatNo(e.currentTarget.value)} aria-invalid={err ? 'true' : undefined} />
          <span class="hint" role={err ? 'alert' : undefined}>{err || '轉學生、復學生的座號自己輸入'}</span></div>
        <div class="field"><label for="f-name">姓名</label>
          <input id="f-name" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} /><span class="hint">必填</span></div>
        <div class="field"><label for="f-sid">學號（選填）</label>
          <input id="f-sid" class="input" value={schoolId} onInput={(e) => setSchoolId(e.currentTarget.value)} /><span class="hint">沒有就留空</span></div>
        {!isJ && <div class="field"><label for="f-group">組別（考哪些科）</label>
            <input id="f-group" class="input" value={groupCode} onInput={(e) => setGroupCode(e.currentTarget.value)} placeholder="例如：D" /><span class="hint">只作紀錄；每次考試以考試名單的組別為準</span></div>}
        <div class="field"><label for="f-special">特殊生需求註明</label>
          <input id="f-special" class="input" value={special} onInput={(e) => setSpecial(e.currentTarget.value)} {...(isJ ? {} : { placeholder: '例如：x數A' })} /><span class="hint">只作紀錄，不影響標示</span></div>
      </div>
    </Modal>
  );
}

function Classes({ doc, onChange, division }: Props) {
  const list = doc.settings.classes.filter((c) => c.division === division);
  const trackOpts: { value: Track; label: string }[] = [{ value: 'science', label: '理組' }, { value: 'liberal', label: '文組' }];
  const isJ = division === 'junior';
  const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false);
  const run = (r: ReturnType<typeof addClass>) => { if (r.ok) { setErr(''); onChange(r.doc); } else setErr(r.error); };
  return (
    <div class="card stack">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div>
          <h3>班級資料（{isJ ? '國中部' : '高中部'}）</h3>
          <p class="small muted">班級名稱、{isJ ? '班級色' : '文理組、班級色'}，所有模擬考共用。</p>
        </div>
        <Button small onClick={() => setAdding(true)}>＋ 新增班級</Button>
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
      {adding && <AddClassModal doc={doc} division={division} onClose={() => setAdding(false)} onAdd={(r) => { run(r); if (r.ok) setAdding(false); }} />}
      <div class="scroll">
        <table class="t compact nw">
          <thead><tr><th>班級</th><th>名稱</th>{!isJ && <th>文理組</th>}<th>班級色（{CLASS_COLOR_COUNT} 色）</th><th></th></tr></thead>
          <tbody>
            {list.map((c) => {
              const clash = colorConflicts(list, c.no, c.colorIndex);
              return (
                <tr key={c.no}>
                  <td><ClassChip colorIndex={c.colorIndex}>{String(c.no).padStart(2, '0')} {c.name}</ClassChip></td>
                  <td><input class="input" style="min-width:90px;max-width:120px" value={c.name} aria-label={`第${c.no}班名稱`}
                    onChange={(e) => run(renameClass(doc, division, c.no, e.currentTarget.value))} /></td>
                  {!isJ && <td><Seg<Track> label={`${c.name}班文理組`} value={c.track ?? 'science'} options={trackOpts} onChange={(tr) => onChange(setClassTrack(doc, division, c.no, tr))} /></td>}
                  <td>
                    <div class="swatches" role="group" aria-label={`${c.name}班班級色`}>
                      {Array.from({ length: CLASS_COLOR_COUNT }, (_, i) => (
                        <button type="button" key={i} aria-pressed={c.colorIndex === i + 1} aria-label={`改成第 ${i + 1} 色 ${CLASS_COLOR_NAMES[i]}`} title={`${i + 1} ${CLASS_COLOR_NAMES[i]}`}
                          style={`background:var(--c${i + 1}-bg);border-color:var(--c${i + 1}-line)`}
                          onClick={() => onChange(setClassColor(doc, division, c.no, i + 1))} />
                      ))}
                    </div>
                    {clash.length > 0 && <div class="hint">⚠ 與 {clash.map((n) => String(n).padStart(2, '0')).join('、')} 班同色；黑白列印時請核對班級字</div>}
                  </td>
                  <td>{(() => {
                    const u = classUsage(doc, division, c.no);
                    return u.roster + u.examEntries > 0
                      ? <span class="hint">班上有 {u.roster || u.examEntries} 人，不能刪除</span>
                      : <ConfirmButton small copy={confirmCopy.deleteClass(c.name)} onConfirm={() => run(removeClass(doc, division, c.no))}>刪除</ConfirmButton>;
                  })()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p class="small muted">共 {CLASS_COLOR_COUNT} 種班級色，色相盡量拉開；每一格都另印班級字，黑白列印也分得出班。改色會套用到座位表與標籤；班級名稱可改，同一部別不可重名。</p>
    </div>
  );
}

function AddClassModal(p: { doc: Doc; division: Division; onClose: () => void; onAdd: (r: ReturnType<typeof addClass>) => void }) {
  const [name, setName] = useState('');
  const [track, setTrack] = useState<Track>('science');
  const isJ = p.division === 'junior';
  const bad = name.trim() ? validateClassName(p.doc, p.division, name) : null;
  return (
    <Modal title={`新增班級（${isJ ? '國中部' : '高中部'}）`} onClose={p.onClose}
      actions={<><Button onClick={p.onClose}>取消</Button><Button kind="primary" disabled={!!bad} onClick={() => p.onAdd(addClass(p.doc, p.division, { name, track }))}>新增</Button></>}>
      <div class="stack">
        <div class={`field${bad ? ' err' : ''}`}><label for="f-cname">班級名稱</label>
          <input id="f-cname" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="例如：溫" />
          <span class="hint" role={bad ? 'alert' : undefined}>{bad || `不填就用「第${String(nextClassNo(p.doc, p.division)).padStart(2, '0')}班」；班級序號自動接在最後`}</span></div>
        {!isJ && <div class="field"><span class="label">文理組</span>
          <Seg<Track> label="新班級文理組" value={track} options={[{ value: 'science', label: '理組' }, { value: 'liberal', label: '文組' }]} onChange={setTrack} /></div>}
        <p class="small muted">班級色會自動挑目前最少人用的一色，之後可以改。</p>
      </div>
    </Modal>
  );
}

/** 標籤下方「注意事項」框：每行一句，用 **粗體** 標粗體；清空＝標籤不印這個框；可還原預設 */
function LabelNotesField(p: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const text = p.value ?? DEFAULT_LABEL_NOTES;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const tooMany = lines.length > LABEL_NOTE_MAX_LINES;
  const tooLong = lines.filter((l) => noteLineLength(l.trim()) > LABEL_NOTE_MAX_CHARS).length;
  const isDefault = p.value === undefined || p.value === DEFAULT_LABEL_NOTES;
  return (
    <div class={`field${tooMany || tooLong ? ' err' : ''}`}>
      <label for="s-notes">標籤注意事項</label>
      <textarea id="s-notes" class="input" rows={5} value={text} onChange={(e) => p.onChange(e.currentTarget.value)} />
      <span class="hint" role={tooMany || tooLong ? 'alert' : undefined}>
        {tooMany ? `最多 ${LABEL_NOTE_MAX_LINES} 行，多的行不會印。` : tooLong ? `有 ${tooLong} 行超過 ${LABEL_NOTE_MAX_CHARS} 字，超過的字不會印。` : `印在標籤下方的框內，每行一句（最多 ${LABEL_NOTE_MAX_LINES} 行、每行 ${LABEL_NOTE_MAX_CHARS} 字），用 **粗體** 標粗體；全部清空就不印這個框。`}
      </span>
      <div><Button disabled={isDefault} onClick={() => p.onChange(undefined)}>還原預設</Button></div>
    </div>
  );
}

/** 稿 v2.22（校-54）表頭範本預設值 */
export const DEFAULT_SEAT_HEADER = '【{學年}學年第{次別}次{類型}模擬考】座位表';
export const DEFAULT_LABEL_HEADER = '{學年}學年第{次別}次{類型}模擬考';

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
      <div class="field"><label for="s-seat-head">座位表表頭</label><input id="s-seat-head" class="input" value={s.seatHeader ?? DEFAULT_SEAT_HEADER} onChange={(e) => set({ seatHeader: e.currentTarget.value })} /><span class="hint">{'{學年}、{次別}、{類型} 會自動換成這次模擬考的內容'}</span></div>
      <div class="field"><label for="s-label-head">標籤表頭</label><input id="s-label-head" class="input" value={s.labelHeader ?? DEFAULT_LABEL_HEADER} onChange={(e) => set({ labelHeader: e.currentTarget.value })} /></div>
      <LabelNotesField value={s.labelNotes} onChange={(v) => set({ labelNotes: v })} />
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


/** 選用功能（D75）：逐項勾選；預設全關，關掉的功能在導覽、下載頁與步驟中完全不出現 */
function Features({ doc, onChange }: Pick<Props, 'doc' | 'onChange'>) {
  const list = allFeatures();
  return (
    <div class="card stack">
      <div><h3>選用功能</h3><p class="small muted">每所學校需要的不一樣，勾選要用的功能。沒開的功能會從導覽、下載頁與步驟中完全消失，不留灰色入口。</p></div>
      {list.map((f) => {
        const on = doc.settings.features?.[f.id] === true;
        return (
          <div key={f.id} class={`featrow${on ? ' on' : ''}`}>
            <div class="fi">
              <div class="row" style="gap:8px"><b>{f.name}</b>{f.scope === 'bcct' && <Badge tone="info">會考專用</Badge>}<Badge>預設：關</Badge></div>
              <p class="small muted">{f.desc}</p>
            </div>
            <Switch label="啟用" ariaLabel={`啟用${f.name}`} checked={on} onText="已開啟" offText="未開啟" onChange={(v) => onChange({ ...doc, settings: withFeature(doc.settings, f.id, v) })} />
          </div>
        );
      })}
      <Alert tone="info"><b>核心功能永遠開啟，不在這裡：</b>排座、標籤、座位表、抽離、下載與防呆提示。設定只存在這台電腦的設定檔，不上傳。</Alert>
    </div>
  );
}
