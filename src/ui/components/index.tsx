/** 元件庫：只用 tokens 變數與 app.css 類別，不寫死色碼 */
import { createContext, type ComponentChildren, type JSX } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { classColorVars } from '../colors';
import { UNDO_HINT, type ConfirmCopy, type Flow, type NextAction } from '../flow';
import { STEP_NAMES } from '../nav';
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

/** 語氣名稱 → 樣式表類別：danger 的類別叫 err（.a-err／.b-err），其餘同名 */
export const toneClass = (t: 'ok' | 'warn' | 'danger' | 'info'): string => (t === 'danger' ? 'err' : t);

export function Badge(p: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ComponentChildren }) {
  return <span class={`badge${p.tone ? ` b-${toneClass(p.tone)}` : ''}`}>{p.children}</span>;
}

export function Alert(p: { tone?: 'ok' | 'warn' | 'danger' | 'info'; children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class={`alert${p.tone ? ` a-${toneClass(p.tone)}` : ''}`} role={p.tone === 'danger' ? 'alert' : 'status'}>
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

export type StepState = 'cur' | 'done' | 'stale' | 'todo' | 'skip';

/** 步驟導覽（四種狀態，可自由跳步，D47）：外包一張卡，上方「第 N／6 步　已完成 K 步」，每步兩行（名稱＋狀態・說明） */
export function StepNav(p: { steps: { no: number; name: string; state: StepState; note?: string }[]; onGo: (no: number) => void }) {
  const tag: Partial<Record<StepState, string>> = { done: '已完成', stale: '過期', skip: '不需要' };
  const icon = (s: { no: number; state: StepState }) => (s.state === 'done' ? '✓' : s.state === 'stale' ? '!' : s.no);
  const cur = p.steps.find((x) => x.state === 'cur');
  const need = p.steps.filter((x) => x.state !== 'skip').length; // 國中部沒有的步驟不算進總步數
  return (
    <div class="card" style="padding:10px">
      <div class="stepprog" aria-live="polite">{cur ? `第 ${cur.no}／${p.steps.length} 步` : `共 ${need} 步`}　已完成 {p.steps.filter((s) => s.state === 'done').length} 步</div>
      <ol class="steps" aria-label="步驟">
        {p.steps.map((s) => (
          <li key={s.no}>
            <button type="button" class={`step ${s.state}`} aria-current={s.state === 'cur' ? 'step' : undefined} onClick={() => p.onGo(s.no)}>
              <span class="no">{icon(s)}</span>
              <span><b>{s.name}</b><small>{tag[s.state] ? `${tag[s.state]}・` : ''}{s.note}</small></span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface UndoProps {
  undoLabel?: string; onUndo: () => void;
  /** 可回頭的步驟（最新在前）；index 交回 onUndoTo */
  steps?: { index: number; label: string }[]; onUndoTo?: (index: number) => void;
}

/** 「↶ 復原：<動作>」主鈕＋緊貼的「▾」歷史鈕（稿 v2.15）：沒有歷史時兩顆都停用但看得到；選單選一步回到那一步之前（DESIGN 10.1） */
export function UndoControl(p: UndoProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const has = !!p.undoLabel;
  const steps = p.steps ?? [];
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest('.undowrap')) setOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [open]);
  useEffect(() => { if (!has) setOpen(false); }, [has]);
  return (
    <span class="undowrap">
      <button type="button" class="btn undo-main" disabled={!has} onClick={p.onUndo} title="只退最近一步（Ctrl+Z）；最多可復原 20 步" aria-label={p.undoLabel ? `復原：${p.undoLabel}` : '復原'}>{p.undoLabel ? `↶ 復原：${p.undoLabel}` : '↶ 復原'}</button>
      <button type="button" class="btn undo-more" disabled={!has || !p.onUndoTo} aria-haspopup="menu" aria-expanded={open && has} aria-label="看可以回頭的步驟" title="看可以回頭的步驟" onClick={() => setOpen((o) => !o)}>▾</button>
      {open && has && (
        <div class="undomenu" role="menu" aria-label="可回頭的步驟">
          <div class="small muted">選一步，回到那一步之前；比它新的動作一併退掉。</div>
          {steps.map((st) => (
            <button type="button" role="menuitem" key={st.index} onClick={() => { setOpen(false); p.onUndoTo?.(st.index); }}>回到「{st.label}」之前</button>
          ))}
        </div>
      )}
    </span>
  );
}

/** 頁面最上面獨佔一行的「← 回到 …」（回原頁，DESIGN 10.1） */
export function PageBack(p: { label: string; onBack: () => void }) {
  return <div class="pagebar"><Button kind="ghost" onClick={p.onBack}>← {p.label}</Button></div>;
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

/**
 * 常駐摘要列（稿 v2.15，DESIGN 10.7）：上層四格（考生／座位／空位〔不足改「缺位」〕／待處理），
 * 下層逐項列出每一個待處理（步驟｜標題與小字｜需要・可用・缺少｜前往處理），整列可點跳到該步驟。
 * 有待處理時不固定在頂端（.has-iss），沒有時固定。真問題在前、「尚未完成」的步驟在後（排序在 flowOf）。
 */
export function SummaryBar(p: { flow: Flow; onGo: (step: StepNo) => void }) {
  const { summary: s, issues } = p.flow;
  const lack = s.spare < 0;
  const noStudents = s.students === 0;
  const stat = (label: string, v: number | string, cls = '') => <div class={`sc${cls ? ` ${cls}` : ''}`}><span class="sl">{label}</span><b>{v}</b></div>;
  return (
    <div class={`sumbar${issues.length ? ' has-iss' : ''}`} role="region" aria-label="本次考試摘要">
      <div class="sstats">
        {noStudents ? stat('考生', '尚未匯入考試名單', 'dim') : stat('考生', s.students)}
        {stat('座位', s.seats)}
        {s.seats === 0 || noStudents ? stat('空位', '—', 'dim') : lack ? stat('缺位', -s.spare, 'bad') : stat('空位', s.spare)}
        {issues.length
          ? <div class="sc warn"><span class="sl">待處理</span><b>{issues.length}</b></div>
          : <div class="sc okc"><span class="sl">待處理</span><b>0</b><em>✓ 沒有待處理的事</em></div>}
      </div>
      {issues.length > 0 && (
        <div class="slist">
          {issues.map((i, k) => (
            <button type="button" key={k} class={`si${i.todo ? ' todo' : ''}`} onClick={() => p.onGo(i.step)}>
              <span class="sstep">{'①②③④⑤⑥'[i.step - 1]} {STEP_NAMES[i.step - 1]}</span>
              <span class="sti">{i.title ?? i.text}{i.sub && <small>{i.sub}</small>}</span>
              {i.need != null && <span class="sn"><span>需要 <b>{i.need}</b></span><span>可用 <b>{i.have}</b></span><span class="bad">缺少 <b>{i.lack}</b></span></span>}
              <span class="sgo">{i.fix} ›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 步驟標題卡右側的「下一步」要用的資料：由工作區提供，標題卡自己讀（沒有提供時＝不顯示按鈕，單頁測試不受影響） */
export const StepNextContext = createContext<{ action: NextAction; onGo: (step: StepNo) => void } | null>(null);

/**
 * 步驟標題卡（稿 v2.15）：左 h2＋一句小字（步驟說明），右側主按鈕「完成此步，前往 ○ …」（D58）；最後一步改寫「最後一步」。
 * 按鈕永遠可以按；待處理只在上方的常駐摘要列列出，這裡不另外警示（D47）。
 */
export function StepHead(p: { title: string; children?: ComponentChildren }) {
  const ctx = useContext(StepNextContext);
  const a = ctx?.action;
  return (
    <div class="card stephead">
      <div><h2>{p.title}</h2>{p.children && <p class="small muted">{p.children}</p>}</div>
      {ctx && a && a.kind === 'go' && <Button kind="primary" onClick={() => ctx.onGo(a.to)}>{a.label}</Button>}
      {ctx && a && a.kind === 'none' && <span class="small muted">最後一步</span>}
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
