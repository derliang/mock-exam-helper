import { Alert, Button } from '../components';
import { APP_NAME, APP_VERSION, BUILD_DATE, copyrightText, formatVersion, preLabel } from '../version';

/**
 * 站內版權頁（頁尾「© 版權所有」連到這裡）。
 * 可確定的內容：程式名稱、版本、© 年份與名稱（來自 version.ts）。
 * 授權條款與字型 OFL 標示的正文必須由使用者確認後才寫，不自行編造（見 docs/dispatch/完工-K.md），目前只放「待確認」佔位。
 */
export function Copyright(p: { backLabel?: string; onBack: () => void }) {
  const pre = preLabel(APP_VERSION);
  return (
    <section class="stack">
      <div class="pagehead">
        <Button kind="ghost" onClick={p.onBack}>← {p.backLabel ? `回到 ${p.backLabel}` : '返回'}</Button>
      </div>
      <div>
        <h1 style="margin:0">版權資訊</h1>
        <p class="small muted">{APP_NAME}的名稱、版本與授權說明。</p>
      </div>
      <div class="card stack">
        <h3>程式</h3>
        <dl class="pf-about">
          <dt>程式名稱</dt><dd>{APP_NAME}</dd>
          <dt>版本</dt><dd>{formatVersion(APP_VERSION)}{pre ? `（${pre}，測試中）` : ''}</dd>
          <dt>建置日期</dt><dd>{BUILD_DATE || '—'}</dd>
          <dt>版權</dt><dd>{copyrightText()}</dd>
        </dl>
        <p class="small muted">學生資料只存在這台電腦的本機資料夾，不會上傳到任何伺服器。</p>
      </div>
      <div class="card stack" data-pending="license">
        <h3>程式授權條款</h3>
        <Alert tone="warn"><b>待確認：</b>授權條款正文尚未確認，確認前不在此頁顯示任何授權內容。</Alert>
      </div>
      <div class="card stack" data-pending="font-ofl">
        <h3>字型授權（SIL Open Font License）</h3>
        <Alert tone="warn"><b>待確認：</b>下載檔內嵌字型的 OFL 標示正文尚未確認，確認前不在此頁顯示。</Alert>
      </div>
    </section>
  );
}
