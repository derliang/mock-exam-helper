# 完工回報：施工Q（版權頁正文）

分支 `build/q-copyright`（基於 origin/main 68e1316），A 軌：交 PR，不自己併 main。截圖：`docs/dispatch/完工-Q-截圖/版權頁-1280.jpg`、`版權頁-375.jpg`（深色；375 寬無橫向捲動，scrollWidth＝375）。

## 做了什麼（對照使用者原話「版權頁請比照這頁」）
- `src/ui/pages/Copyright.tsx` 重寫：頁頂（← 返回＋「使用授權｜模擬考小幫手」）、H1「使用授權與著作權聲明」、版權行、重點段（粗體「所有使用者都限非營利使用」）、一到十一小節、頁尾（回到程式、「© 2026 derliang｜保留所有權利｜限非營利使用」）。原「待確認」佔位與版本／建置日期卡已移除（版本仍在全站頁尾與「關於」視窗）。
- 條文以 `LICENSE.md` 為來源，頁面與它逐條一致（測試比對十一個小節標題）。
- 第七節：字型列「Noto Sans TC Regular、Noto Sans TC Bold」（核對 `src/export/fonts/` 實際 ttf），OFL 全文用 `OFL.txt?raw` 在頁面摺疊顯示；執行期套件列「Preact、docx、JSZip」（核對 `package.json` dependencies），只寫名稱，「各依其自身授權」，沒有編任何授權文字。
- 第九節照規格寫資料說明。
- `src/styles/app.css` 加 `.lic*` 樣式（單欄 max 760px，用既有 token）。
- `LICENSE.md` 依規格改寫：聲明日期 2026-10-24→2026-11-08；加重點段；第一節加「含網頁版」「字型」；第六節改為公開網頁與原始碼；第七節加字型與套件；新增「八、不附保證」「九、學生與教師資料」；聯絡改十、生效改十一。

## 驗證
- `npx tsc --noEmit` 無錯誤；`npx vitest run` 41 檔 346 測試全過；`npm run build` 成功。
- 新測試（`Copyright.test.tsx`）：11 個 `<h2>` 且順序正確、版權行、頁尾版權行、mailto、第七節字型與 `src/export/fonts/*.ttf` 一致、套件與 `package.json` dependencies 一致、OFL 全文、第九節、與 LICENSE.md 小節標題一致。

## 我替你決定的事
1. **LICENSE.md 與規格衝突**（規格說 LICENSE.md「十一小節」，實際只有十節且日期是 2026-10-24）：依指示以規格為準，LICENSE.md 已改齊（上列）。
2. **原 LICENSE.md「十、本專案的授權歷史」**（2026-11-07 建立、沒有 MIT 先前版本）規格沒有對應小節：我併入「十一、生效與版本」最後一句，事實不變、不增減權利義務。若不想公開這句，刪掉即可。
3. 第六節把原句「本儲存庫若公開於 GitHub」改成規格的「網頁版公開放在 GitHub Pages…」，並保留 GitHub 平台條款那句；第三節保留原有「無須另行簽署紙本」句。
4. 版權頁不再顯示版本／建置日期（避免與全站頁尾重複）。

## 需調度員／使用者確認（不確定處）
- 規格頁尾版權行寫「© 2026 derliang」，而 `version.ts` 的 `COPYRIGHT_HOLDER` 仍是「模擬考小幫手」（全站頁尾只寫「© 版權所有」，未受影響）。是否把 `COPYRIGHT_HOLDER` 也改成個人？本包沒動。
- 第九節「教師資料」：規格寫「學生與教師資料」，我照寫；LICENSE.md 同步。
- OFL.txt 的版權行是 Adobe「Source」字型（Noto Sans CJK 系列沿用），頁面原樣顯示該檔全文，不改。

## 未動
全站頁尾、其他頁面、`version.ts`。

---

# 追加：站內「隱私權政策」頁（調度員追加，使用者：「隱私權參考這頁」）

同一個 PR（#50）。規格：`docs/dispatch/隱私權頁內容規格.md`。截圖：`隱私權頁-375.jpg`、`隱私權頁-1280.jpg`、`全站頁尾-375.jpg`（頁尾加「隱私權」後手機換行不破版）。

## 做了什麼
- 新頁 `src/ui/pages/Privacy.tsx`：頁首、H1「隱私權政策」、更新日期（2026 年 11 月 8 日）、English version 錨點（`#en`，點了捲動）、開頭段、一到八小節、English 摘要段（內容與中文一致）、頁尾連結列與版權行。不含 Google 登入、雲端硬碟同步、Apps Script、相片、日曆、請假、有限使用等老師隨手記專屬內容；「七之一」略去。
- 路由 `privacy`（`nav.ts`、`App.tsx`，返回鈕行為同版權頁，`pageName`：版權頁改稱「使用授權」、隱私權頁「隱私權政策」）。
- 全站頁尾加「隱私權」按鈕，與「© 版權所有」並列（`Footer.tsx` `onPrivacy`）；版權頁頁尾加「隱私權政策」連結，隱私權頁連回「使用授權」「授權說明」。
- 樣式：`.lic` 加 `overflow-wrap:anywhere`（長網址在手機被裁切）、`.lic-link`、`h3`。

## 隱私承諾核對（實際查過）
| 項目 | 查法 | 結果 |
|---|---|---|
| Google Fonts／analytics／追蹤 | grep `src`、`index.html` 與 `dist`（googleapis、gstatic、google-analytics、googletagmanager、gtag、sendBeacon、XMLHttpRequest、WebSocket、外部 `<link>`／`<script>`） | 程式碼無；`dist` 內的 http 字串只在套件註解（jszip、pako、adobe、sil.org 等），沒有實際請求 |
| `fetch(` | grep | 只有 `src/export/fontLoader.ts`，載入 `?url` 內嵌字型檔（與網站同源，由 GitHub Pages 提供，匯出時才下載） |
| 瀏覽器儲存 | grep | 只有 IndexedDB：資料庫 `mock-exam-helper`、store `handles`、key `root`，存資料夾控制代碼（`src/data/fsRepository.ts`）；沒有 localStorage、sessionStorage、cookie、Service Worker |
| 寫入資料夾的檔案 | `src/data/folder.ts` 註解與程式 | settings.json、roster-senior／junior.json、`exams/<id>/` 下 exam／entries／diffs／overrides／result.json；覆寫前留 `.bak` |

上述核對寫成測試（`Privacy.test.tsx`「隱私承諾與實際程式一致」）：日後有人加外部資源、fetch、localStorage 等，測試會紅燈提醒同步改政策。

## 驗證
`npx tsc --noEmit` 無錯；`npx vitest run` 42 檔 354 測試全過；`npm run build` 成功。

## 不確定、交調度員（沒用肯定句帶過）
1. **深淺色設定沒有儲存**：程式裡沒找到持久化（重開頁面會回「系統」），所以政策沒提；若之後加了偏好儲存就必須更新政策與測試。
2. **GitHub Pages 的連線資料**：政策寫「GitHub 依其隱私權政策處理連線資料（例如 IP 位址）」，是依規格寫的一般性說法，我沒有查 GitHub 的政策原文。
3. **瀏覽器自身行為**（例如瀏覽器的檔案存取授權記錄、瀏覽器同步）不在本程式控制內，政策沒逐項寫。
4. 政策網址 `https://derliang.github.io/mock-exam-helper/` 取自規格，我沒有實際連線確認部署位置。
5. 英文段是中文的簡短對照，非法律用語審校。
