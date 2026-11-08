/**
 * 全站導覽（DESIGN 10.1「回原頁」）：路由＋回原頁堆疊。純邏輯，不碰 DOM。
 * 從 A 頁「前往處理」到 B 頁時 push 一筆 {route, label}；B 頁頂端顯示「← 回到 label」。
 */
export type Route =
  | { page: 'init' }
  | { page: 'exams' }
  | { page: 'new' }
  | { page: 'copyright' }
  | { page: 'lookup'; examId?: string }
  | { page: 'settings'; tab?: 'roster' | 'classes' | 'school' | 'rooms' | 'features'; division?: 'senior' | 'junior' }
  | { page: 'step'; examId: string; step: 1 | 2 | 3 | 4 | 5 | 6 }
  | { page: 'reconcile'; examId: string }
  | { page: 'override'; examId: string }
  | { page: 'reserve'; examId: string };

export interface BackEntry {
  route: Route;
  /** 例：「學測第三次」② 考試名單 */
  label: string;
}

export interface NavState {
  route: Route;
  back: BackEntry[];
}

export const initialNav = (route: Route = { page: 'init' }): NavState => ({ route, back: [] });

/** 跳到另一頁並記住原位置（用於「前往處理」類連結） */
export function pushTo(s: NavState, to: Route, from: BackEntry): NavState {
  return { route: to, back: [...s.back, from] };
}

/** 一般導覽（側欄、步驟切換）：不記回原頁，並清空堆疊 */
export function goTo(s: NavState, to: Route): NavState {
  return { route: to, back: [] };
}

/** 回到上一個位置；堆疊空時不動 */
export function goBack(s: NavState): NavState {
  const last = s.back[s.back.length - 1];
  if (!last) return s;
  return { route: last.route, back: s.back.slice(0, -1) };
}

export const backLabel = (s: NavState): string | undefined => s.back[s.back.length - 1]?.label;

export const STEP_NAMES = ['考試設定', '考試名單', '教室設定', '標示與抽離規則', '排座與預覽', '下載'] as const;
export const stepTitle = (step: number): string => `${'①②③④⑤⑥'[step - 1] ?? ''} ${STEP_NAMES[step - 1] ?? ''}`;

/** 路由防護（驗收 D-4）：已關閉的選用功能頁不可顯示，也不可出現在「← 回到」堆疊；目前頁被擋就回模擬考列表 */
export function guardNav(s: NavState, allowed: (r: Route) => boolean): NavState {
  const back = s.back.filter((b) => allowed(b.route));
  const route: Route = allowed(s.route) ? s.route : { page: 'exams' };
  return route === s.route && back.length === s.back.length ? s : { route, back: route === s.route ? back : [] };
}
