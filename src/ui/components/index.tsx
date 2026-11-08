/** 元件庫：只用 tokens 變數與 app.css 類別，不寫死色碼 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
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

/** 頂端「← 回到 …」與「↶ 復原（N）」列（DESIGN 10.1） */
export function TopBar(p: { backLabel?: string; onBack?: () => void; undoCount: number; onUndo: () => void }): JSX.Element {
  return (
    <div class="btnrow topbar">
      {p.backLabel && p.onBack && <Button kind="ghost" onClick={p.onBack}>← 回到 {p.backLabel}</Button>}
      <span style="flex:1" />
      <Button disabled={p.undoCount === 0} onClick={p.onUndo} title="Ctrl+Z">↶ 復原（{p.undoCount}）</Button>
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

/** 常駐摘要列（不可關）：考生／座位／空位／警告；警告可點，一鍵跳到第一個問題 */
export function SummaryBar(p: { flow: Flow; onGo: (step: StepNo) => void }) {
  const { summary: s, issues } = p.flow;
  const lack = s.spare < 0;
  return (
    <div class="sumbar" role="region" aria-label="本次考試摘要">
      <span>考生 <b>{s.students}</b></span>
      <span>座位 <b>{s.seats}</b></span>
      <span class={lack ? 'bad' : ''}>{lack ? '缺位' : '空位'} <b>{lack ? -s.spare : s.spare}</b></span>
      {issues.length === 0
        ? <span class="ok">警告 <b>0</b>　✓ 沒有待處理的事</span>
        : (
          <button type="button" class="warnbtn" onClick={() => p.onGo(issues[0]!.step)} title={issues.map((i) => i.text).join('；')}>
            ⚠ 警告 <b>{issues.length}</b>　{issues[0]!.text}　<u>{issues[0]!.fix}</u>
          </button>
        )}
    </div>
  );
}

/** 每個步驟頁底部的「下一步」：前置沒過就停用，說明缺什麼，並給一鍵跳轉 */
export function StepFooter(p: { action: NextAction; onGo: (step: StepNo) => void }) {
  const a = p.action;
  if (a.kind === 'none') return null;
  return (
    <div class="stepfoot">
      {a.kind === 'blocked' && (
        <Alert tone="warn" action={<Button small kind="primary" onClick={() => p.onGo(a.fixStep)}>{a.fix}</Button>}>
          <b>還不能進下一步：</b>{a.reason}
        </Alert>
      )}
      <div class="btnrow" style="justify-content:flex-end">
        <Button kind="primary" disabled={a.kind === 'blocked'} onClick={() => a.kind === 'go' && p.onGo(a.to)}>{a.label} →</Button>
      </div>
    </div>
  );
}
