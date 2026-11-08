import { useEffect, useState } from 'preact/hooks';
import './featureRegister/pickup';
import './featureRegister/lookup';
import './featureRegister/attendance';
import './featureRegister/alignment';
import './featureRegister/quick';
import { Footer } from './components/Footer';
import { Alert, Badge, Button, EmptyState, Seg, StepFooter, StepNav, SummaryBar, TopBar } from './components';
import { enabledNav, enabledStepPanels, FeatureContext } from './features';
import { flowOf, nextAction } from './flow';
import { backLabel, goBack, guardNav, goTo, initialNav, pushTo, stepTitle, STEP_NAMES, type NavState, type Route } from './nav';
import { Exams } from './pages/Exams';
import { NewExam } from './pages/NewExam';
import { Init } from './pages/Init';
import { Copyright } from './pages/Copyright';
import { Lookup } from './pages/Lookup';
import { Settings } from './pages/Settings';
import { Step1 } from './pages/Step1';
import { Step2 } from './pages/Step2';
import { Step3 } from './pages/Step3';
import { Step4 } from './pages/Step4';
import { Step5 } from './pages/Step5';
import { Step6 } from './pages/Step6';
import { createFsRepository, isFsAccessSupported } from '../data';
import { createMemoryRepository, emptyDoc, withDefaults, type Repository } from './repository';
import { examLabel, stampModified, type Doc } from './store';
import { APP_VERSION, formatVersion } from './version';
import { describeChange } from './describeChange';
import { canUndo, commit, newHistory, nextUndoLabel, undo, undoSteps, undoTo, type History } from './undo';

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
  const edit = (d0: Doc) => {
    const d = stampModified(hist.present, d0, new Date());
    setHist((h) => commit(h, d, describeChange(h.present, d))); setStaleNote(undefined); void repo.save(d);
  };
  // 更換資料夾：重新選一個，成功才載入；使用者取消視窗不算錯誤
  const changeFolder = async () => {
    try { await repo.chooseFolder(); await load(); } catch (e) { if (!(e instanceof DOMException && e.name === 'AbortError')) setWarning('無法使用這個資料夾，請改選別的資料夾。'); }
  };
  const onUndo = () => setHist((h) => { const n = undo(h); void repo.save(n.present); return n; });
  const [staleNote, setStaleNote] = useState<string | undefined>();
  const onUndoTo = (index: number) => {
    const r = undoTo(hist, index);
    setHist(r.history); void repo.save(r.history.present);
    // 比選中那步更新的動作一併退掉，標為過期（D47），讓使用者知道要重做哪些
    setStaleNote(r.dropped.length > 1 ? `已回到「${r.dropped[r.dropped.length - 1]}」之前。後面 ${r.dropped.length - 1} 步已過期，需要時請重做：${r.dropped.slice(0, -1).reverse().join('、')}。` : undefined);
  };

  const go = (r: Route) => setNav((s) => goTo(s, r));
  const go2 = (r: Route, from: { route: Route; label: string }) => setNav((s) => pushTo(s, r, from));
  const lookupOn = enabledNav({ settings: hist.present.settings }).some((n) => n.route.page === 'lookup');
  const allowed = (rt: Route) => rt.page !== 'lookup' || lookupOn;
  const gnav = guardNav(nav, allowed);
  const back = () => setNav(goBack(gnav));
  const r = gnav.route;
  // 記住最近開啟的模擬考，導覽列才能在任何頁面一鍵跳到它的步驟
  const [lastExamId, setLastExamId] = useState<string | undefined>();
  useEffect(() => { if (r.page === 'step') setLastExamId(r.examId); }, [r]);
  const lastExam = hist.present.exams.find((e) => e.id === lastExamId);
  const hasFolder = r.page !== 'init' || repo.hasFolder();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && canUndo(hist)) { e.preventDefault(); onUndo(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  return (
    <FeatureContext.Provider value={hist.present.settings}>
      <header class="pbar">
        <div class="pbar-in">
          <span class="brand">模擬考小幫手 <Badge>beta 測試版</Badge> <span class="ver" title="目前版本">{formatVersion(APP_VERSION)}</span></span>
          <nav class="nav" aria-label="主要導覽">
            <button type="button" onClick={() => go({ page: 'init' })} aria-current={r.page === 'init'}>初始化</button>
            <button type="button" disabled={!hasFolder} onClick={() => go({ page: 'exams' })} aria-current={r.page === 'exams'}>模擬考列表</button>
            {hasFolder && enabledNav({ settings: hist.present.settings }).map((n) => (
              <button key={n.id} type="button" onClick={() => go2(n.route, { route: r, label: pageName(r, hist.present) })} aria-current={r.page === n.route.page}>{n.label}</button>
            ))}
            <button type="button" disabled={!hasFolder} onClick={() => go2({ page: 'settings', ...(lastExam && r.page === 'step' ? { division: lastExam.division } : {}) }, { route: r, label: pageName(r, hist.present) })} aria-current={r.page === 'settings'}>設定</button>
          </nav>
          <span class="spacer" />
          <Seg<Theme> label="深淺色" value={theme} onChange={setTheme} options={[{ value: 'system', label: '系統' }, { value: 'light', label: '淺' }, { value: 'dark', label: '深' }]} />
        </div>
        {hasFolder && lastExam && (
          <div class="pbar-in pbar-sub">
            <span class="cur-exam" title={lastExam.name}>{lastExam.name}</span>
            <Badge>{examLabel(lastExam)}</Badge>
            <nav class="nav" aria-label="目前模擬考的步驟">
              {STEP_NAMES.map((name, i) => (
                <button type="button" key={name} onClick={() => go({ page: 'step', examId: lastExam.id, step: (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 })} aria-current={r.page === 'step' && r.examId === lastExam.id && r.step === i + 1}>{`${'①②③④⑤⑥'[i]} ${name}`}</button>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main class="wrap">
        {r.page !== 'init' && r.page !== 'copyright' && <TopBar backLabel={backLabel(gnav)} onBack={back} undoLabel={nextUndoLabel(hist)} onUndo={() => { setStaleNote(undefined); onUndo(); }} steps={undoSteps(hist)} onUndoTo={onUndoTo} />}
        {staleNote && r.page !== 'init' && <div style="margin-bottom:12px"><Alert tone="warn">{staleNote}</Alert></div>}
        {r.page === 'copyright' && <Copyright {...(backLabel(gnav) ? { backLabel: backLabel(gnav)! } : {})} onBack={() => (gnav.back.length ? back() : go({ page: hasFolder ? 'exams' : 'init' }))} />}
        {r.page === 'init' && <Init repo={repo} fsSupported={fsSupported} onRestore={fsRepo ? () => fsRepo.restore() : undefined} onDone={async () => { await load(); go({ page: 'exams' }); }} />}
        {warning && r.page !== 'init' && <div style="margin-bottom:12px"><Alert tone="warn">{warning}</Alert></div>}
        {r.page === 'exams' && <Exams doc={hist.present} folder={repo.folderName?.()} onOpen={(examId) => go({ page: 'step', examId, step: 1 })} onNew={() => go({ page: 'new' })} onSettings={() => go2({ page: 'settings' }, { route: r, label: pageName(r, hist.present) })} onChangeFolder={() => void changeFolder()} />}
        {r.page === 'new' && <NewExam doc={hist.present} onCancel={() => go({ page: 'exams' })} onCreate={(d, examId) => { edit(d); go({ page: 'step', examId, step: 1 }); }} />}
        {r.page === 'lookup' && <Lookup doc={hist.present} examId={r.examId} onGoStep={(examId, step) => go({ page: 'step', examId, step })} onExams={() => go({ page: 'exams' })} />}
        {r.page === 'settings' && <Settings doc={hist.present} onChange={edit} tab={r.tab} {...(r.division ? { division: r.division } : {})} />}
        {r.page === 'step' && <Workspace route={r} doc={hist.present} onToRooms={(division) => go2({ page: 'settings', tab: 'rooms', division }, { route: r, label: pageName(r, hist.present) })} onToRoster={(division) => go2({ page: 'settings', tab: 'roster', division }, { route: r, label: pageName(r, hist.present) })} onChange={edit} onStep={(step) => go({ page: 'step', examId: r.examId, step })} onExams={() => go({ page: 'exams' })} />}
        {(r.page === 'reconcile' || r.page === 'override' || r.page === 'reserve') && <section><h2>{r.page}</h2><p class="muted">施工中</p></section>}
      </main>
      <Footer onCopyright={() => r.page !== 'copyright' && go2({ page: 'copyright' }, { route: r, label: pageName(r, hist.present) })} />
    </FeatureContext.Provider>
  );
}

/** 「← 回到 …」要寫清楚是哪一頁（DESIGN 10.1） */
export function pageName(r: Route, doc: Doc): string {
  switch (r.page) {
    case 'exams': return '模擬考列表';
    case 'new': return '新增模擬考';
    case 'settings': return '設定';
    case 'lookup': return '考生查詢';
    case 'copyright': return '版權資訊';
    case 'step': return `「${doc.exams.find((e) => e.id === r.examId)?.name ?? '模擬考'}」${stepTitle(r.step)}`;
    default: return '上一頁';
  }
}

function Workspace(p: { route: Extract<Route, { page: 'step' }>; doc: Doc; onToRoster: (division: 'senior' | 'junior') => void; onToRooms: (division: 'senior' | 'junior') => void; onChange: (d: Doc) => void; onStep: (n: 1 | 2 | 3 | 4 | 5 | 6) => void; onExams: () => void }) {
  const exam = p.doc.exams.find((e) => e.id === p.route.examId);
  if (!exam) {
    return <section><h2>{stepTitle(p.route.step)}</h2><EmptyState title="找不到這個模擬考" action={<Button kind="primary" onClick={p.onExams}>回模擬考列表</Button>}>它可能已被刪除，或資料夾換了。</EmptyState></section>;
  }
  const flow = flowOf(p.doc, exam, p.route.step);
  const step = p.route.step;
  return (
    <div class="ws wide">
      <aside class="side"><StepNav steps={flow.steps} onGo={(n) => p.onStep(n as 1 | 2 | 3 | 4 | 5 | 6)} /></aside>
      <div class="stack" style="min-width:0">
        <SummaryBar flow={flow} onGo={p.onStep} />
        {step === 1 ? <Step1 doc={p.doc} exam={exam} onChange={p.onChange} />
          : step === 2 ? <Step2 doc={p.doc} exam={exam} onChange={p.onChange} onToRoster={() => p.onToRoster(exam.division)} />
          : step === 3 ? <Step3 doc={p.doc} exam={exam} onChange={p.onChange} onToRooms={() => p.onToRooms(exam.division)} />
          : step === 4 ? <Step4 doc={p.doc} exam={exam} onChange={p.onChange} onStep={p.onStep} />
          : step === 5 ? <Step5 doc={p.doc} exam={exam} onChange={p.onChange} onStep={p.onStep} />
          : <Step6 doc={p.doc} exam={exam} onGoStep={(n) => p.onStep(n)} onExams={p.onExams} />}
        {enabledStepPanels({ settings: p.doc.settings, examKind: exam.kind }, step).map((s) => <div key={s.featureId}>{s.render({ doc: p.doc, exam, onChange: p.onChange, onStep: p.onStep })}</div>)}
        <StepFooter action={nextAction(flow, step)} onGo={p.onStep} />
      </div>
    </div>
  );
}
