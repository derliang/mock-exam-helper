import { useEffect, useState } from 'preact/hooks';
import { Alert, Seg, StepNav, TopBar, type StepState } from './components';
import { backLabel, goBack, goTo, initialNav, pushTo, stepTitle, STEP_NAMES, type NavState, type Route } from './nav';
import { Exams } from './pages/Exams';
import { Init } from './pages/Init';
import { Settings } from './pages/Settings';
import { Step1 } from './pages/Step1';
import { Step2 } from './pages/Step2';
import { createFsRepository, isFsAccessSupported } from '../data';
import { createMemoryRepository, emptyDoc, withDefaults, type Repository } from './repository';
import type { Doc } from './store';
import { canUndo, commit, newHistory, undo, type History } from './undo';

type Theme = 'system' | 'light' | 'dark';
// 支援資料夾授權的瀏覽器用真實存檔；不支援（非 Chrome）時用記憶體實作，並在初始化頁提示
const fsSupported = isFsAccessSupported();
const fsRepo = fsSupported ? createFsRepository() : null;
const repo: Repository = fsRepo ?? createMemoryRepository();

function useTheme(): [Theme, (t: Theme) => void] {
  const [t, setT] = useState<Theme>('system');
  useEffect(() => {
    const el = document.documentElement;
    if (t === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', t);
  }, [t]);
  return [t, setT];
}

export function App() {
  const [nav, setNav] = useState<NavState>(initialNav());
  const [theme, setTheme] = useTheme();
  const [hist, setHist] = useState<History<Doc>>(() => newHistory(emptyDoc()));
  const [warning, setWarning] = useState<string | undefined>();
  // 重開頁面：能靜默還原上次資料夾就直接進列表（瀏覽器要求重新授權時留在初始化頁，由使用者按鈕）
  useEffect(() => {
    void (async () => { if (fsRepo && (await fsRepo.restore())) { await load(); go({ page: 'exams' }); } })();
  }, []);

  // 資料夾授權後載入；每次變更存檔
  const load = async () => {
    const raw = await repo.load();
    const d = withDefaults(raw);
    setHist(newHistory(d));
    setWarning(fsRepo?.lastWarning());
    if (d !== raw) void repo.save(d); // 全新資料夾：把預設班級存下來
  };
  const edit = (d: Doc) => { setHist((h) => commit(h, d)); void repo.save(d); };
  const onUndo = () => setHist((h) => { const n = undo(h); void repo.save(n.present); return n; });
  const undoCount = hist.past.length;

  const go = (r: Route) => setNav((s) => goTo(s, r));
  const go2 = (r: Route, from: { route: Route; label: string }) => setNav((s) => pushTo(s, r, from));
  const back = () => setNav(goBack);
  const r = nav.route;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && canUndo(hist)) { e.preventDefault(); onUndo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <>
      <header class="pbar">
        <span class="brand">模擬考小幫手</span>
        {r.page !== 'init' && (
          <nav class="nav" aria-label="主要導覽">
            <button type="button" onClick={() => go({ page: 'exams' })} aria-current={r.page === 'exams'}>模擬考列表</button>
            <button type="button" onClick={() => go2({ page: 'settings' }, { route: r, label: pageName(r, hist.present) })} aria-current={r.page === 'settings'}>設定</button>
          </nav>
        )}
        <span style="flex:1" />
        <Seg<Theme> label="深淺色" value={theme} onChange={setTheme} options={[{ value: 'system', label: '系統' }, { value: 'light', label: '淺' }, { value: 'dark', label: '深' }]} />
      </header>
      <main class="wrap">
        {r.page !== 'init' && <TopBar backLabel={backLabel(nav)} onBack={back} undoCount={undoCount} onUndo={onUndo} />}
        {r.page === 'init' && <Init repo={repo} fsSupported={fsSupported} onRestore={fsRepo ? () => fsRepo.restore() : undefined} onDone={async () => { await load(); go({ page: 'exams' }); }} />}
        {warning && r.page !== 'init' && <div style="margin-bottom:12px"><Alert tone="warn">{warning}</Alert></div>}
        {r.page === 'exams' && <Exams doc={hist.present} onChange={edit} onOpen={(examId) => go({ page: 'step', examId, step: 1 })} />}
        {r.page === 'settings' && <Settings doc={hist.present} onChange={edit} tab={r.tab} />}
        {r.page === 'step' && <Workspace route={r} doc={hist.present} repo={repo} onToRoster={() => go2({ page: 'settings', tab: 'roster' }, { route: r, label: pageName(r, hist.present) })} onChange={edit} onStep={(step) => go({ page: 'step', examId: r.examId, step })} />}
        {(r.page === 'reconcile' || r.page === 'override' || r.page === 'reserve') && <section><h2>{r.page}</h2><p class="muted">施工中</p></section>}
      </main>
    </>
  );
}

/** 「← 回到 …」要寫清楚是哪一頁（DESIGN 10.1） */
export function pageName(r: Route, doc: Doc): string {
  switch (r.page) {
    case 'exams': return '模擬考列表';
    case 'settings': return '設定';
    case 'step': return `「${doc.exams.find((e) => e.id === r.examId)?.name ?? '模擬考'}」${stepTitle(r.step)}`;
    default: return '上一頁';
  }
}

function Workspace(p: { route: Extract<Route, { page: 'step' }>; doc: Doc; repo: Repository; onToRoster: () => void; onChange: (d: Doc) => void; onStep: (n: 1 | 2 | 3 | 4 | 5 | 6) => void }) {
  const exam = p.doc.exams.find((e) => e.id === p.route.examId);
  const steps = STEP_NAMES.map((name, i) => ({ no: i + 1, name, state: (i + 1 === p.route.step ? 'cur' : 'todo') as StepState }));
  return (
    <div class="ws wide">
      <aside class="side"><StepNav steps={steps} onGo={(n) => p.onStep(n as 1 | 2 | 3 | 4 | 5 | 6)} /></aside>
      {exam && p.route.step === 1 ? <Step1 doc={p.doc} exam={exam} onChange={p.onChange} /> : exam && p.route.step === 2 ? <Step2 doc={p.doc} exam={exam} repo={p.repo} onChange={p.onChange} onToRoster={p.onToRoster} /> : <section><h2>{stepTitle(p.route.step)}</h2><p class="muted">{exam ? '施工中' : '找不到這個模擬考'}</p></section>}
    </div>
  );
}
