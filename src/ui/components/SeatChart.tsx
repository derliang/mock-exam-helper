/**
 * 座位表（DESIGN 五、六、10.1）：講臺在下方、0101 在左下角；左側只標深位數字，下方標「第N排」；
 * 每格右上角印座標「排-深位」。比容器寬時等比縮小（最小 0.4 倍），頁面不橫向捲動（UI-22）。
 * pull＝抽離考試的預備教室：整張柔和單色、不依班級上色（UI-23）。
 */
import { useLayoutEffect, useRef } from 'preact/hooks';
import { normColor } from '../colors';
import type { ChartCell, ChartModel } from '../seating';

export const MIN_CHART_SCALE = 0.4;

/** 容器寬 avail、圖寬 w：需要時縮小，最小 MIN_CHART_SCALE（再窄就在卡片內捲動） */
export const chartScale = (avail: number, w: number): number => (avail > 0 && w > avail ? Math.max(MIN_CHART_SCALE, (avail - 2) / w) : 1);

function Cell(p: { c: ChartCell; dim: boolean; onPick?: (code: string, co: string) => void }) {
  const { c } = p;
  if (c.kind !== 'student') return <div class="cell empty-seat" aria-label={c.kind === 'off' ? `${c.co} 沒有座位` : `${c.co} 空位`}><span class="co">{c.kind === 'free' ? c.co : ''}</span></div>;
  const cls = ['cell', c.markKind === 'x' ? 'mk-x' : c.markKind === 'add' ? 'mk-add' : '', p.dim ? 'dim' : ''].filter(Boolean).join(' ');
  const label = `${c.code} ${c.className} ${c.name}，座位 ${c.co}${c.marks.length ? `，${c.marks.join('、')}` : ''}`;
  const act = p.onPick ? { tabIndex: 0, role: 'button' as const, onClick: () => p.onPick!(c.code, c.co), onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onPick!(c.code, c.co); } } } : {};
  return (
    <div class={cls} data-c={normColor(c.colorIndex)} aria-label={label} title={p.onPick ? `${label}（點一下做個別覆寫）` : label} {...act}>
      <span class="co">{c.co}</span>
      <span class="no">{c.code}</span>
      <span class="meta"><span class="tg">{c.className}</span>{c.name}</span>
      {c.marks.length > 0 && <span class="mks">{c.marks.map((m) => <span class="mk" key={m}>{m}</span>)}</span>}
    </div>
  );
}

export function SeatChart(p: { model: ChartModel; title: string; sub: string; pull?: boolean; onlyClass?: number; onPick?: (code: string, co: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = host.current;
    const ch = chart.current;
    if (!h || !ch) return;
    const fit = () => {
      ch.style.zoom = '';
      const wrap = ch.firstElementChild as HTMLElement | null;
      if (!wrap) return;
      const z = chartScale(h.clientWidth, wrap.offsetWidth);
      if (z < 1) ch.style.zoom = String(z);
    };
    fit();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    ro?.observe(h);
    return () => ro?.disconnect();
  });
  const { model: m } = p;
  const rowsTpl = `repeat(${m.depth},var(--ch))`;
  const colsTpl = `repeat(${m.rows},var(--cw))`;
  return (
    <div class="scroll" ref={host}>
      <div class={`chart${p.pull ? ' pull' : ''}`} ref={chart}>
        <div class="chart-wrap">
          <div class="chart-title">{p.title}<small>{p.sub}</small></div>
          <div class="axis-y" style={{ gridTemplateRows: rowsTpl }} aria-hidden="true">
            {m.lines.map((_, i) => <span key={i}>{m.depth - i}</span>)}
          </div>
          <div>
            <div class="cg" style={{ gridTemplateColumns: colsTpl }}>
              {m.lines.flatMap((line) => line.map((c) => (
                <Cell key={c.co} c={c} dim={p.onlyClass !== undefined && c.kind === 'student' && c.classNo !== p.onlyClass} onPick={p.onPick} />
              )))}
            </div>
            <div class="axis-x" style={{ gridTemplateColumns: colsTpl, marginTop: '4px' }} aria-hidden="true">
              {Array.from({ length: m.rows }, (_, i) => <span key={i}>第{i + 1}排</span>)}
            </div>
          </div>
          <div class="podium-bar">講　台</div>
        </div>
      </div>
    </div>
  );
}

/** 圖例（標示式樣，D39） */
export function ChartLegend(p: { override?: boolean; marks?: boolean }) {
  return (
    <div class="legend">
      <span><b>圖例</b></span>
      {p.marks !== false && <>
        <span class="cell mk-x"><span class="mk">X 科目</span></span> 不考，該節改到自習地點
        <span class="cell mk-add"><span class="mk">＋ 科目</span></span> 加考，該節改到預備教室
      </>}
      {p.override && <><span class="cell mk-add"><span class="mk">→地點</span></span> 個別覆寫（不是換座位）：被標示的那幾節改去該地點</>}
      <span class="cell empty-seat" style="width:28px;height:16px" /> 空位（只在最後）
    </div>
  );
}
