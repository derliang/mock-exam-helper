import { useEffect, useState } from 'preact/hooks';
import { Alert, Button, Seg, StepNav, TopBar, type StepState } from './components';
import { backLabel, goBack, goTo, initialNav, pushTo, stepTitle, STEP_NAMES, type NavState, type Route } from './nav';
import { createMemoryRepository, type Repository } from './repository';

type Theme = 'system' | 'light' | 'dark';
const repo: Repository = createMemoryRepository();

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
  const go = (r: Route) => setNav((s) => goTo(s, r));
  const go2 = (r: Route, from: { route: Route; label: string }) => setNav((s) => pushTo(s, r, from));
  const back = () => setNav(goBack);
  const r = nav.route;
  // 復原（Ctrl+Z）：頁面資料層接上後由各頁的 History 處理，這裡先留殼
  const undoCount = 0;
  const onUndo = () => {};
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); onUndo(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <>
      <header class="pbar">
        <span class="brand">模擬考小幫手</span>
        <nav class="nav" aria-label="主要導覽">
          <Button kind="ghost" small onClick={() => go({ page: 'exams' })}>模擬考列表</Button>
          <Button kind="ghost" small onClick={() => go2({ page: 'settings' }, { route: r, label: '上一頁' })}>設定</Button>
        </nav>
        <Seg<Theme> label="深淺色" value={theme} onChange={setTheme} options={[{ value: 'system', label: '系統' }, { value: 'light', label: '淺' }, { value: 'dark', label: '深' }]} />
      </header>
      <main class="wrap">
        {r.page !== 'init' && <TopBar backLabel={backLabel(nav)} onBack={back} undoCount={undoCount} onUndo={onUndo} />}
        {r.page === 'init' && <Init onDone={() => go({ page: 'exams' })} />}
        {r.page === 'exams' && <Exams onOpen={() => go({ page: 'step', examId: 'demo', step: 1 })} />}
        {r.page === 'settings' && <Placeholder title="設定頁" />}
        {r.page === 'step' && <Workspace route={r} onStep={(step) => go({ page: 'step', examId: r.examId, step })} />}
        {(r.page === 'reconcile' || r.page === 'override' || r.page === 'reserve') && <Placeholder title={r.page} />}
      </main>
    </>
  );
}

const Placeholder = (p: { title: string }) => <section><h2>{p.title}</h2><p class="muted">施工中</p></section>;

function Init(p: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const choose = async () => { setBusy(true); await repo.chooseFolder(); p.onDone(); };
  return (
    <section>
      <h1>模擬考小幫手</h1>
      <p class="muted">第一次使用：選一個放資料的資料夾。資料只存在你的電腦。</p>
      <div class="btnrow" style="margin-top:16px">
        <Button kind="primary" disabled={busy} onClick={choose}>選擇資料夾</Button>
      </div>
      <Alert tone="info">請使用 Chrome。也可以把資料夾拖到這裡（施工中）。</Alert>
    </section>
  );
}

function Exams(p: { onOpen: () => void }) {
  return (
    <section>
      <h2>模擬考列表</h2>
      <p class="muted">尚無模擬考（假資料示意）。</p>
      <Button kind="primary" onClick={p.onOpen}>開啟示範</Button>
    </section>
  );
}

function Workspace(p: { route: Extract<Route, { page: 'step' }>; onStep: (n: 1 | 2 | 3 | 4 | 5 | 6) => void }) {
  const steps = STEP_NAMES.map((name, i) => ({
    no: i + 1, name, state: (i + 1 === p.route.step ? 'cur' : 'todo') as StepState,
  }));
  return (
    <div class="ws wide">
      <aside class="side"><StepNav steps={steps} onGo={(n) => p.onStep(n as 1 | 2 | 3 | 4 | 5 | 6)} /></aside>
      <section><h2>{stepTitle(p.route.step)}</h2><p class="muted">施工中</p></section>
    </div>
  );
}
