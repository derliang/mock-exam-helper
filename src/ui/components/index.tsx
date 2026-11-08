/** 元件庫：只用 tokens 變數與 app.css 類別，不寫死色碼 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { classColorVars } from '../colors';

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
    <div class="modal-frame" onClick={(e) => e.target === e.currentTarget && p.onClose()}>
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
  return (
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
