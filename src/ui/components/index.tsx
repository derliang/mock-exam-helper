/** 元件庫：只用 tokens 變數與 app.css 類別，不寫死色碼 */
import { createContext, type ComponentChildren, type JSX } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { classColorVars } from '../colors';
import { UNDO_HINT, type ConfirmCopy, type Flow, type NextAction } from '../flow';
import type { StepNo } from '../seating';

type BtnKind = 'primary' | 'danger' | 'ghost' | 'default';

export function Button(p: {
  kind?: BtnKind; small?: boolean; disabled?: boolean; onClick?: () => void; children: ComponentChildren; title?: string;
}) {
  const cls = ['btn', p.kind && p.kind !== 'default' ? `btn-${p.kind}` : '', p.small ? 'btn-sm' : ''].filter(Boolean).join(' ');
  return <button type="button" class={cls} disabled={p.disabled} onClick={p.onClick} title={p.title}>{p.children}</button>;
}

/** 分段按鈕（與一般按鈕同高 40px，UI-11） */
export function Seg<T extends string>(p: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div class="seg" role="group" aria-label={p.label}>
      {p.options.map((o) => (
        <button type="button" key={o.value} aria-pressed={o.value === p.value} disabled={o.disabled} onClick={() => p.onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function Badge(p: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ComponentChildren }) {
  return <span class={`badge${p.tone ? ` b-${p.tone}` : ''}`}>{p.children}</span>;
}

export function Alert(p: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class={`alert${p.tone ? ` a-${p.tone}` : ''}`} role={p.tone === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">{p.tone === 'danger' ? '⛔' : p.tone === 'warn' ? '⚠' : p.tone === 'ok' ? '✓' : 'ℹ'}</span>
      <div>{p.children}</div>
      {p.action}
    </div>
  );
}

/** 步進器（橫排、深位用） */
export function Stepper(p: { value: number; min?: number; max?: number; onChange: (n: number) => void; label: string }) {
  const { value, min = 1, max = 99 } = p;
  return (
    <span class="stepper" role="group" aria-label={p.label}>
      <button type="button" class="btn btn-sm" aria-label={`${p.label}減一`} disabled={value <= min} onClick={() => p.onChange(value - 1)}>−</button>
      <output>{value}</output>
      <button type="button" class="btn btn-sm" aria-label={`${p.label}加一`} disabled={value >= max} onClick={() => p.onChange(value + 1)}>＋</button>
    </span>
  );
}

/** 統計列：數字 32px 粗體 */
export function StatsBar(p: { items: { label: string; value: number | string; bad?: boolean }[] }) {
  return (
    <div class="stats">
      {p.items.map((i) => (
        <div key={i.label} class={i.bad ? 'bad' : ''}><small>{i.label}</small><strong>{i.value}</strong></div>
      ))}
    </div>
  );
}

/** 班級標籤：淡底＋班級字（不只靠顏色） */
export function ClassChip(p: { colorIndex: number; children: ComponentChildren }) {
  return <span class="badge" style={classColorVars(p.colorIndex)}>{p.children}</span>;
}

export function Modal(p: { title: string; onClose: () => void; children: ComponentChildren; actions?: ComponentChildren }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [p.onClose]);
  return (
    <div class="mfade" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={p.title}>
        <h3>{p.title}</h3>
        <div class="t">{p.children}</div>
        {p.actions && <div class="acts">{p.actions}</div>}
      </div>
    </div>
  );
}

export type StepState = 'cur' | 'done' | 'stale' | 'todo';

/** 步驟導覽（四種狀態，可自由跳步，D47） */
export function StepNav(p: { steps: { no: number; name: string; state: StepState; note?: string }[]; onGo: (no: number) => void }) {
  const mark: Record<StepState, string> = { cur: '目前', done: '已完成', stale: '過期', todo: '未完成' };
  const cur = p.steps.find((x) => x.state === 'cur');
  return (
    <>
    <p class="stepcount" aria-live="polite">{cur ? `第 ${cur.no}／${p.steps.length} 步` : `共 ${p.steps.length} 步`}　已完成 {p.steps.filter((s) => s.state === 'done').length} 步</p>
    <ol class="steps" aria-label="步驟">
      {p.steps.map((s) => (
        <li key={s.no}>
          <button type="button" class={`step ${s.state}`} aria-current={s.state === 'cur' ? 'step' : undefined} onClick={() => p.onGo(s.no)}>
            <span class="no">{s.no}</span>
            <span>{s.name}{s.note && <small>{s.note}</small>}</span>
            <small>{mark[s.state]}</small>
          </button>
        </li>
      ))}
    </ol>
    </>
  );
}

/** 頂端「← 回到 …」與「↶ 復原：<動作>」列（DESIGN 10.1）；▾ 可直接回到任一步之前，不顯示累計數字 */
export function TopBar(p: {
  backLabel?: string; onBack?: () => void;
  undoLabel?: string; onUndo: () => void;
  /** 可回頭的步驟（最新在前）；index 交回 onUndoTo */
  steps?: { index: number; label: string }[]; onUndoTo?: (index: number) => void;
}): JSX.Element {
  const steps = p.steps ?? [];
  return (
    <div class="btnrow topbar">
      {p.backLabel && p.onBack && <Button kind="ghost" onClick={p.onBack}>← 回到 {p.backLabel}</Button>}
      <span style="flex:1" />
      <Button disabled={!p.undoLabel} onClick={p.onUndo} title="Ctrl+Z" aria-label={p.undoLabel ? `復原：${p.undoLabel}` : '復原'}>{p.undoLabel ? `↶ 復原：${p.undoLabel}` : '↶ 復原'}</Button>
      {steps.length > 1 && p.onUndoTo && (
        <details class="undo-menu" style="position:relative">
          <summary class="btn" aria-label="回到更早的步驟" title="回到更早的步驟">▾</summary>
          <ol style="position:absolute;right:0;z-index:20;margin:4px 0 0;padding:8px 12px 8px 28px;background:var(--surface,#fff);border:1px solid var(--border,#ccc);border-radius:8px;min-width:240px;list-style:decimal">
            {steps.map((st, i) => (
              <li key={st.index}>
                <button type="button" class="btn btn-ghost" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); p.onUndoTo?.(st.index); }}>回到「{st.label}」之前</button>
                {i > 0 && <span class="small muted"> 後面 {i} 步會標為過期</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

/** 破壞性動作的二次確認：說明會失去什麼，並提示可用「↶ 復原」找回（DESIGN 10.7） */
export function ConfirmModal(p: { copy: ConfirmCopy; onConfirm: () => void; onClose: () => void; undoable?: boolean }) {
  return (
    <Modal title={p.copy.title} onClose={p.onClose} actions={<><Button onClick={p.onClose}>取消</Button><Button kind="danger" onClick={() => { p.onClose(); p.onConfirm(); }}>{p.copy.confirm}</Button></>}>
      <p>{p.copy.body}</p>
      {p.undoable !== false && <p class="small muted" style="margin-top:8px">{UNDO_HINT}</p>}
    </Modal>
  );
}

/** 點了才確認的按鈕：用在刪除、還原預設、重新匯入等 */
export function ConfirmButton(p: { copy: ConfirmCopy; onConfirm: () => void; kind?: BtnKind; small?: boolean; children: ComponentChildren; undoable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button kind={p.kind ?? 'danger'} small={p.small} onClick={() => setOpen(true)}>{p.children}</Button>
      {open && <ConfirmModal copy={p.copy} undoable={p.undoable} onConfirm={p.onConfirm} onClose={() => setOpen(false)} />}
    </>
  );
}

/** 空狀態：告訴使用者「這裡還沒有東西、為什麼、下一步按哪裡」 */
export function EmptyState(p: { title: string; children?: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <strong>{p.title}</strong>
      {p.children && <p class="muted">{p.children}</p>}
      {p.action && <div class="btnrow">{p.action}</div>}
    </div>
  );
}

/** 常駐摘要列（不可關）：考生／座位／空位／待處理；待處理只當標記（完整原因只在頁面上方的一則警示講，DESIGN 10.7 規則 4），可點，一鍵跳到第一個問題 */
export function SummaryBar(p: { flow: Flow; onGo: (step: StepNo) => void }) {
  const { summary: s, issues } = p.flow;
  const lack = s.spare < 0;
  return (
    <div class="sumbar" role="region" aria-label="本次考試摘要">
      {s.students === 0 ? <span>考生 <b>尚未匯入考試名單</b></span> : <span>考生 <b>{s.students}</b></span>}
      <span>座位 <b>{s.seats}</b></span>
      <span class={lack && s.students > 0 ? 'bad' : ''}>{s.seats === 0 || s.students === 0 ? '空位' : lack ? '缺位' : '空位'} <b>{s.seats === 0 || s.students === 0 ? '—' : lack ? -s.spare : s.spare}</b></span>
      {issues.length === 0
        ? <span class="ok">待處理 <b>0</b>　✓ 沒有待處理的事</span>
        : (
          <button type="button" class="warnbtn" onClick={() => p.onGo(issues[0]!.step)} title={issues.map((i) => i.text).join('；')}>
            ⚠ 待處理 <b>{issues.length}</b>　<u>去處理</u>
          </button>
        )}
    </div>
  );
}

/** 步驟標題卡右側的「下一步」要用的資料：由工作區提供，標題卡自己讀（沒有提供時＝不顯示按鈕，單頁測試不受影響） */
export const StepNextContext = createContext<{ action: NextAction; onGo: (step: StepNo) => void } | null>(null);

/**
 * 步驟標題卡（DESIGN 10.9、方案 A）：左 h2＋一句說明，右側放「下一步」主按鈕（D58）。
 * 按鈕永遠可以按；前面還有沒做完的事，只在頁面上方用琥珀提示標示原因並給一鍵跳轉，不禁止（D47）。
 */
export function StepHead(p: { title: string; children?: ComponentChildren }) {
  const ctx = useContext(StepNextContext);
  const a = ctx?.action;
  return (
    <div class="card stephead">
      <div><h2>{p.title}</h2>{p.children && <p class="small muted">{p.children}</p>}</div>
      {ctx && a && a.kind === 'go' && <Button kind="primary" onClick={() => ctx.onGo(a.to)}>{a.label} →</Button>}
    </div>
  );
}

/** 前面還有沒做完的事：只標示原因並給一鍵跳轉，不禁止往下（D47）。顯示在步驟標題卡上方 */
export function StepPending(p: { action: NextAction; onGo: (step: StepNo) => void }) {
  const a = p.action;
  if (a.kind === 'none' || !a.pending) return null;
  return (
    <div class="stepnext">
      <Alert tone="warn" action={<Button small onClick={() => p.onGo(a.pending!.fixStep)}>{a.pending.fix}</Button>}>
        <b>前面還有事沒做完：</b>{a.pending.reason}。你可以先往下看，之後再回來處理。
      </Alert>
    </div>
  );
}

/** （保留給既有測試與舊呼叫）上方的「下一步」整條：警示＋按鈕 */
export function StepNextBar(p: { action: NextAction; onGo: (step: StepNo) => void }) {
  const a = p.action;
  if (a.kind === 'none') return null;
  return (
    <div class="stepnext">
      <StepPending action={a} onGo={p.onGo} />
      <div class="btnrow" style="justify-content:flex-end">
        <Button kind="primary" onClick={() => p.onGo(a.to)}>{a.label} →</Button>
      </div>
    </div>
  );
}

/** 開關（DESIGN 10.9）：某物「納入／不納入」，切換立刻生效。標示在上，右側用文字寫狀態（不只靠顏色） */
export function Switch(p: { label: string; ariaLabel: string; checked: boolean; onChange: (v: boolean) => void; onText?: string; offText?: string }) {
  return (
    <div class="swf" onClick={(e) => e.stopPropagation()}>
      <span class="cap" aria-hidden="true">{p.label}</span>
      <label class="sw">
        <input type="checkbox" role="switch" aria-label={p.ariaLabel} checked={p.checked} onChange={(e) => p.onChange(e.currentTarget.checked)} />
        <span class="trk" />
        <span class="st">{p.checked ? (p.onText ?? '已列入') : (p.offText ?? '未列入')}</span>
      </label>
    </div>
  );
}

export type FormatKind = 'word' | 'pdf' | 'xls';
const FMT_CLASS: Record<FormatKind, string> = { word: 'w', pdf: 'p', xls: 'x' };
const FMT_LABEL: Record<FormatKind, string> = { word: 'Word', pdf: 'PDF', xls: 'Excel' };

/** 自繪摺角文件圖示（不用商標原圖）：底色用 --fmt-* tokens，字母／符號白色 */
export function FormatIcon(p: { kind: FormatKind }) {
  const c = FMT_CLASS[p.kind];
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path class={`ic-bg-${c}`} d="M5 2h11l6 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
      <path d="M16 2v4a2 2 0 0 0 2 2h4z" fill="#fff" opacity=".4" />
      {p.kind === 'word' && <path d="M6.5 11l2 7 2.2-5.5L12.9 18l2-7" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />}
      {p.kind === 'pdf' && <text x="12.5" y="19" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff" font-family="Noto Sans TC,sans-serif">PDF</text>}
      {p.kind === 'xls' && <path d="M8 11.5l9 7M17 11.5l-9 7" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" />}
    </svg>
  );
}

/** 下載格式單選鈕組（Word／PDF）：標籤只寫格式名；選中與未選中都看得出各自顏色 */
export function FormatPick<T extends 'word' | 'pdf'>(p: { value: T; onChange: (v: T) => void; label: string; options: T[] }) {
  return (
    <div class="fmts" role="radiogroup" aria-label={p.label}>
      {p.options.map((k) => (
        <label key={k} class={`fmt ${FMT_CLASS[k]}`}>
          <input type="radio" name={`fmt-${p.label}`} checked={p.value === k} onChange={() => p.onChange(k)} />
          <span><FormatIcon kind={k} />{FMT_LABEL[k]}</span>
        </label>
      ))}
    </div>
  );
}

/** 動作型格式鈕（Excel 下載） */
export function FormatButton(p: { kind: FormatKind; onClick: () => void; children: ComponentChildren }) {
  return <button type="button" class={`btn btn-fmt ${FMT_CLASS[p.kind]}`} onClick={p.onClick}><FormatIcon kind={p.kind} />{p.children}</button>;
}
