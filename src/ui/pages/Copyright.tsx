import type { ComponentChildren } from 'preact';
import { Button } from '../components';
import { APP_NAME } from '../version';
import oflText from '../../export/fonts/OFL.txt?raw';

/** 使用者的公開作者識別與聯絡信箱（授權頁內容，使用者 2026-11-08 確認比照「老師隨手記」授權頁） */
export const LICENSE_MAIL = 'derliang@gmail.com';
export const LICENSE_DATE = '2026-11-08';
export const LICENSE_COPYRIGHT_LINE = `Copyright © 2026 黃德亮（公開作者識別：derliang）｜保留所有權利（All Rights Reserved）｜聲明日期：${LICENSE_DATE}`;
/** 第七節列出的實際內嵌字型（與 src/export/fonts 內的檔案一致）與執行期套件（與 package.json dependencies 一致） */
export const EMBEDDED_FONTS = ['Noto Sans TC Regular', 'Noto Sans TC Bold'] as const;
export const RUNTIME_PACKAGES = ['Preact', 'docx', 'JSZip'] as const;

const Mail = () => <a href={`mailto:${LICENSE_MAIL}`}>{LICENSE_MAIL}</a>;

type Section = { title: string; body: ComponentChildren };

const SECTIONS: Section[] = [
  { title: '一、授權範圍', body: <p>本文件適用於本儲存庫中由著作權人擁有或有權授權之原創程式碼及相關作品（含網頁版），不包含另有授權條款之第三方元件、素材、字型或程式碼。</p> },
  { title: '二、聖功女中師生使用', body: <p>臺南市天主教聖功女子高級中學之在校師生，得於非營利教育目的範圍內免費操作本程式。此許可不包含任意重製程式碼、修改、重新發布、散布、轉授權或商業利用之權利；若有前述需求，請先取得另行授權。</p> },
  { title: '三、其他學校、機構或個人', body: <p>其他學校及其師生、機構與個人如欲使用本程式，請先寄信至 <Mail />，說明使用單位、用途、對象、範圍及是否涉及部署或複製。須取得著作權人透過 Email 明確回覆同意，且僅能於核准範圍內使用。寄送申請信本身不代表已獲授權。無須另行簽署紙本或正式書面契約，除非雙方另有約定。</p> },
  { title: '四、所有使用者均須遵守非營利限制', body: <p>除著作權人另外明確授權外，所有使用者均不得將本程式用於營利活動，包括但不限於販售、收費授權、作為付費服務之核心、收費部署、付費託管、商業轉售或經重新包裝後牟利。即使取得免費使用許可，也不代表取得商業授權。</p> },
  { title: '五、保留權利', body: <p>未經著作權人另行授權，不得擅自重製、修改、改作、再散布、公開發布、轉授權本程式，或刪除／竄改原有著作權資訊、冒稱為原作者。本條不限制依法不得排除的使用權利，亦不變更第三方原有授權。</p> },
  { title: '六、公開網頁與原始碼之說明', body: <p>本程式的網頁版公開放在 GitHub Pages，任何人都能開啟；原始碼公開於 GitHub，僅代表可依平台條款被檢視及依本文件各條使用，不代表本程式採開放原始碼授權，亦不代表授權任何第三人自由利用、複製、修改、散布或販售。GitHub 平台條款明定之權利仍依平台條款處理。</p> },
  {
    title: '七、第三方素材與既有授權',
    body: (
      <>
        <p>第三方套件、素材、程式碼、字型及其他著作依其各自授權使用。本文件不主張超出著作權人實際擁有或可授權之權利，亦不溯及撤銷此前已有效授出的授權。</p>
        <p>本站目前內嵌的字型：<b data-k="fonts">{EMBEDDED_FONTS.join('、')}</b>（Noto Sans TC），依 SIL Open Font License 1.1 授權，全文見下方，亦同於本儲存庫 <code>src/export/fonts/OFL.txt</code>。</p>
        <details class="lic-ofl">
          <summary>展開 SIL Open Font License 1.1 全文</summary>
          <pre>{oflText}</pre>
        </details>
        <p>本站使用的執行期套件：<b data-k="pkgs">{RUNTIME_PACKAGES.join('、')}</b>，各依其自身授權使用，授權條款以各套件發布者所附者為準。</p>
      </>
    ),
  },
  { title: '八、不附保證', body: <p>本程式依現狀提供，不附任何明示或默示之保證；因使用本程式所生之任何損失，著作權人不負責任。</p> },
  { title: '九、學生與教師資料', body: <p>本程式處理的學生與教師資料屬各使用學校（或使用者）所有，不在本授權範圍內。資料只存放在使用者自己選擇的資料夾，本網站不會上傳；若該資料夾與雲端硬碟同步，檔案仍可能由同步軟體上傳。本站目前沒有獨立的隱私權政策頁，此段即為資料說明。</p> },
  { title: '十、聯絡', body: <p>授權、跨校使用、合作與其他詢問：<Mail /></p> },
  { title: '十一、生效與版本', body: <p>本版聲明日期：{LICENSE_DATE}。此日期為聲明版本日期，不應被表述為作品的首次創作日期。本儲存庫於 2026-11-07 建立，自第一個 commit 起即適用本文件，沒有先前以其他授權（例如 MIT）發布的版本。</p> },
];

/** 站內版權頁（頁尾「© 版權所有」連到這裡）。條文與 repo 根目錄 LICENSE.md 逐條一致，改一邊要改另一邊。 */
export function Copyright(p: { backLabel?: string; onBack: () => void; onPrivacy?: () => void }) {
  return (
    <section class="lic">
      <div class="pagehead">
        <Button kind="ghost" onClick={p.onBack}>← {p.backLabel ? `回到 ${p.backLabel}` : '返回'}</Button>
        <span class="small muted">使用授權｜{APP_NAME}</span>
      </div>
      <article class="stack lic-doc">
        <h1 style="margin:0">使用授權與著作權聲明</h1>
        <p class="small muted" data-k="copyline">{LICENSE_COPYRIGHT_LINE}</p>
        <p class="lic-lead">
          聖功女中師生可免費用於非營利教育用途；<b>所有使用者都限非營利使用</b>。其他學校或機構使用前，請寄信至 <Mail /> 申請，並以作者 Email 回覆同意為準。程式碼的重製、修改、散布、再發布及商業使用都須另行授權。本文件是「{APP_NAME}」的使用授權條款，不是開放原始碼授權。
        </p>
        {SECTIONS.map((s) => (
          <section key={s.title} class="lic-sec">
            <h2>{s.title}</h2>
            {s.body}
          </section>
        ))}
      </article>
      <footer class="lic-foot small muted">
        <Button kind="ghost" onClick={p.onBack}>{APP_NAME}・回到程式</Button>
        <span>© 2026 derliang｜保留所有權利｜限非營利使用{p.onPrivacy && <>｜<button type="button" class="lic-link" onClick={p.onPrivacy}>隱私權政策</button></>}</span>
      </footer>
    </section>
  );
}
