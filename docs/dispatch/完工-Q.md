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
