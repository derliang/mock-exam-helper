import type { ComponentChildren } from 'preact';
import { Button } from '../components';
import { APP_NAME } from '../version';

/** 隱私權政策是對外聲明：每一句都必須與程式實際行為一致（核對結果見 docs/archive/dispatch/完工-Q.md；test 會檢查原始碼沒有外部請求）。 */
export const PRIVACY_MAIL = 'derliang@gmail.com';
export const PRIVACY_UPDATED = '2026 年 11 月 8 日';
export const APP_URL = 'https://derliang.github.io/mock-exam-helper/';

const Mail = () => <a href={`mailto:${PRIVACY_MAIL}`}>{PRIVACY_MAIL}</a>;
type Section = { title: string; body: ComponentChildren };

const SECTIONS: Section[] = [
  {
    title: '一、我們會存取哪些資料',
    body: (
      <>
        <p>本程式只會處理你在程式裡輸入或匯入的資料：班級、學生名單（姓名、學號、座號、組別、特殊生需求）、考試名單、教室設定、排座結果與各項設定。</p>
        <p>這些資料只存在<b>你自己選擇的資料夾</b>（透過瀏覽器的檔案存取功能，需要你授權該資料夾的讀寫），開發者無法取得。本程式沒有登入、沒有帳號。</p>
      </>
    ),
  },
  { title: '二、資料如何使用', body: <p>資料只用來提供畫面上的功能：排座、檢核，以及產生 Word、PDF、Excel 檔。本程式沒有廣告，也沒有使用 Google Analytics 或任何其他追蹤分析工具。</p> },
  {
    title: '三、資料存放在哪裡',
    body: (
      <>
        <p>資料存在你選的資料夾裡：程式在該資料夾內寫入設定檔、學生名單檔，以及每次模擬考一個子資料夾（內含考試設定、考試名單、排座結果等檔案）；覆寫前會把舊檔留成 .bak 備份。資料夾可以在本機，也可以是雲端硬碟同步資料夾。<b>若該資料夾與雲端硬碟同步，檔案可能由同步軟體上傳，這由同步軟體與其服務條款處理，不是本程式上傳。</b></p>
        <p>瀏覽器另外會用 IndexedDB 記住「上次使用的資料夾」的存取控制代碼（不含檔案內容），讓你下次開啟時不必重選；除此之外，本程式沒有使用 Cookie、localStorage 或 sessionStorage 儲存資料。</p>
        <p>下載的 Word、PDF、Excel 由瀏覽器下載到你的電腦，不會經過任何伺服器。</p>
      </>
    ),
  },
  { title: '四、是否分享給第三方', body: <p>不轉移、不販售、不分享。為了讓程式運作，你的瀏覽器會連到 GitHub Pages 取得網頁檔案（程式、內嵌字型檔都由同一個網站提供）；本程式沒有載入 Google Fonts 或其他外部網站的資源，也沒有任何其他對外連線。GitHub 依其隱私權政策處理連線資料（例如 IP 位址）。</p> },
  { title: '五、你的權利', body: <p>刪除資料＝刪除你選的資料夾裡本程式建立的檔案與資料夾；清除瀏覽器中本網站的網站資料，即可移除「上次使用的資料夾」記憶；也可以在瀏覽器的網站設定撤銷本網站的資料夾存取權限。開發者沒有保存任何資料，所以不需要向開發者申請刪除。</p> },
  { title: '六、學生資料', body: <p>學生姓名、學號等屬個人資料，存在使用者自己的電腦或資料夾，由使用者及所屬學校依相關法令（例如個人資料保護法）管理；開發者無法存取。<b>本程式的原始碼公開在 GitHub，不含任何真實學生資料；請勿把真實學生資料放進公開的儲存庫，或在回報問題時附上。</b></p> },
  { title: '七、政策更新', body: <p>政策如有修改，會更新本頁與最後更新日期。</p> },
  { title: '八、聯絡方式', body: <p>有任何疑問，請來信：<Mail /></p> },
];

export function Privacy(p: { backLabel?: string; onBack: () => void; onCopyright?: () => void }) {
  const toEn = () => document.getElementById('en')?.scrollIntoView({ behavior: 'smooth' });
  return (
    <section class="lic">
      <div class="pagehead">
        <Button kind="ghost" onClick={p.onBack}>← {p.backLabel ? `回到 ${p.backLabel}` : '返回'}</Button>
        <span class="small muted">隱私權政策｜{APP_NAME}</span>
      </div>
      <article class="stack lic-doc">
        <h1 style="margin:0">隱私權政策</h1>
        <p class="small muted" data-k="updated">{APP_NAME}（以下稱「本程式」）｜最後更新日期：{PRIVACY_UPDATED}｜<button type="button" class="lic-link" onClick={toEn}>English version</button></p>
        <p class="lic-lead">
          本程式是給學校行政人員安排模擬考座位的網頁工具（網址 {APP_URL}），是在你的瀏覽器裡執行的靜態網頁。<b>開發者沒有自己的伺服器或資料庫</b>，不蒐集、不儲存、不販售你的資料，也不會分享給第三方。
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title} class="lic-sec">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
        <section class="lic-sec lic-en" id="en" lang="en">
          <h2>Privacy Policy (English version)</h2>
          <p>Mock Exam Helper ("the App") — Last updated: November 8, 2026. This English text summarizes the Chinese policy above and states the same facts.</p>
          <p>The App is a web tool for school staff to arrange mock-exam seating. It runs as a static web page in your browser. The developer has no server or database, and does not collect, store, sell or share your data.</p>
          <h3>Data handled</h3>
          <p>Only the data you enter or import: classes, student rosters (name, student ID, seat number, group, special needs), exam lists, room settings, seating results and settings. It is stored only in the folder you choose (via the browser's file access, with your permission) and is not accessible to the developer. There is no login or account.</p>
          <h3>Use</h3>
          <p>The data is used only to provide the on-screen features: seating, checks, and generating Word, PDF and Excel files. There are no ads, no Google Analytics and no other tracking tools.</p>
          <h3>Where data is stored</h3>
          <p>In your chosen folder, which may be local or a cloud-synced folder; if it is synced, the sync software (not the App) may upload the files under its own terms. The browser also keeps a handle to the last-used folder in IndexedDB (no file contents). The App does not use cookies, localStorage or sessionStorage. Exported files are downloaded by your browser to your computer.</p>
          <h3>Third parties</h3>
          <p>Nothing is transferred, sold or shared. Your browser connects to GitHub Pages to load the App (including the embedded font files); GitHub handles connection data such as IP addresses under its own privacy policy. The App loads no Google Fonts or other external resources.</p>
          <h3>Your rights</h3>
          <p>Delete the files and folders the App created in your chosen folder; clear this site's data in your browser to remove the last-folder memory; or revoke the folder permission in your browser's site settings. The developer holds no data, so no deletion request to the developer is needed.</p>
          <h3>Student data</h3>
          <p>Student names and IDs are personal data kept on your own computer or folder and managed by you and your school under applicable law. The App's source code is public on GitHub and contains no real student data; please never put real student data in the public repository or attach it to issue reports.</p>
          <h3>Updates and contact</h3>
          <p>Changes will be reflected on this page with a new date. Contact: <Mail /></p>
        </section>
      </article>
      <footer class="lic-foot small muted">
        <span>
          <Button kind="ghost" onClick={p.onBack}>{APP_NAME}・回到程式</Button>
          {p.onCopyright && <>・<button type="button" class="lic-link" onClick={p.onCopyright}>使用授權</button></>}
        </span>
        <span>© 2026 derliang｜保留所有權利｜限非營利使用{p.onCopyright && <>｜<button type="button" class="lic-link" onClick={p.onCopyright}>授權說明</button></>}</span>
      </footer>
    </section>
  );
}
