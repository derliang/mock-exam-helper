import { useState } from 'preact/hooks';
import { Alert, Badge, Button } from '../components';
import type { Repository } from '../repository';

/** 初始化：選資料夾 ＋ 拖拉資料夾（UI-03）。標題列不借用進度條樣式（UI-01/02） */
export function Init(p: { repo: Repository; fsSupported: boolean; onRestore?: () => Promise<boolean>; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');

  const run = async (f: () => Promise<boolean | void>) => {
    setBusy(true); setErr('');
    try {
      const r = await f();
      // 使用者按了取消或沒授權寫入：資料夾沒有生效
      if (r === false || !p.repo.hasFolder()) setErr('沒有取得資料夾的讀寫授權（或拖進來的不是資料夾），請再試一次，或改用選擇資料夾。');
      else p.onDone();
    } catch (e) {
      // 使用者取消選擇視窗不算錯誤
      if (!(e instanceof DOMException && e.name === 'AbortError')) setErr('無法使用這個資料夾，請改選別的資料夾，或用拖拉的方式。');
    } finally { setBusy(false); }
  };

  return (
    <section class="init">
      <h1>模擬考小幫手 <Badge>beta 測試版</Badge></h1>
      <p class="muted">第一次使用：選一個放資料的資料夾。名單與座位表只存在你的電腦，不會上傳。</p>
      <div class="btnrow" style="margin-top:16px">
        <Button kind="primary" disabled={busy || !p.fsSupported} onClick={() => run(() => p.repo.chooseFolder())}>選擇資料夾</Button>
        {p.onRestore && <Button disabled={busy} onClick={() => run(() => p.onRestore!())}>繼續使用上次的資料夾</Button>}
      </div>
      <div
        class={`dropzone${over ? ' over' : ''}`} style="margin-top:16px" tabIndex={0} role="button"
        aria-label="把資料夾拖到這裡，或按一下選擇資料夾"
        onClick={() => !busy && run(() => p.repo.chooseFolder())}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && run(() => p.repo.chooseFolder())}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer && !busy) { const items = e.dataTransfer.items; run(() => p.repo.adoptDropped(items)); } }}
      >
        <strong>把資料夾拖到這裡</strong>
        <span class="muted small">Chrome 的選擇視窗有問題時，可以改用拖拉</span>
      </div>
      {err && <div style="margin-top:12px"><Alert tone="danger">{err}</Alert></div>}
      <div style="margin-top:12px">{p.fsSupported ? <Alert tone="info">請使用 Chrome 開啟本頁。</Alert> : <Alert tone="danger">這個瀏覽器不支援資料夾授權，無法存檔。請改用 Chrome。</Alert>}</div>
    </section>
  );
}
