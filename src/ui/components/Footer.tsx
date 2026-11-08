import { useState } from 'preact/hooks';
import { Button, Modal } from './index';
import { APP_NAME, APP_VERSION, BUILD_DATE, copyrightText, formatVersion, preLabel } from '../version';

/** 全站頁尾：程式名稱、版本（可點開「關於」）、版權。不進匯出檔；列印時隱藏 */
export function Footer(p: { version?: string; buildDate?: string }) {
  const version = p.version ?? APP_VERSION;
  const buildDate = p.buildDate ?? BUILD_DATE;
  const [open, setOpen] = useState(false);
  const pre = preLabel(version);
  return (
    <footer class="pfoot">
      <span class="pf-name">{APP_NAME}</span>
      <button type="button" class="pf-ver" onClick={() => setOpen(true)} aria-haspopup="dialog" title="關於本程式">
        {formatVersion(version)}{pre && <span class="pf-pre">{pre}</span>}
      </button>
      <span class="pf-copy">{copyrightText()}</span>
      {open && (
        <Modal title={`關於${APP_NAME}`} onClose={() => setOpen(false)} actions={<Button kind="primary" onClick={() => setOpen(false)}>知道了</Button>}>
          <dl class="pf-about">
            <dt>版本</dt><dd>{formatVersion(version)}{pre ? `（${pre}，測試中）` : ''}</dd>
            <dt>建置日期</dt><dd>{buildDate || '—'}</dd>
            <dt>版權</dt><dd>{copyrightText()}</dd>
          </dl>
          <p class="muted small">學生資料只存在這台電腦的本機資料夾，不會上傳到任何伺服器。</p>
        </Modal>
      )}
    </footer>
  );
}
