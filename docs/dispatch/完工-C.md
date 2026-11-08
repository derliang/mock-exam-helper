# 完工記錄：施工C 畫面層

## PR1：殼＋元件庫（分支 build-c-ui）
- `src/styles/app.css`：自原型移植的元件樣式（無寫死色碼）；tokens 直接 import `docs/design/tokens.css`（不複製）。
- `src/ui/nav.ts`：路由與「回原頁」堆疊（DESIGN 10.1）；`undo.ts`：復原（上限 20）；`colors.ts`：12 色班級色與撞色提醒。
- `src/ui/components/`：Button、Seg、Badge、Alert、Stepper、StatsBar、ClassChip、Modal、StepNav、TopBar。
- `src/ui/repository.ts`：薄介面＋記憶體假實作（等施工A 存檔層換接）。
- `src/ui/App.tsx`：導覽殼，各頁暫為佔位。

## 未完成
各頁面（初始化拖拉、設定頁、六步驟、比對、覆寫、預備教室）；字型打包（DESIGN P13，目前用系統備援字型）；元件測試（目前只測純邏輯，未加 jsdom）。

## PR2：初始化、模擬考清單、設定頁
- `src/ui/store.ts`：文件狀態與純函式變更（學生新增／編輯／刪除含驗證、搜尋、班級色與文理組、新增考試），有單元測試。
- `src/ui/pages/Init.tsx`（選資料夾＋拖拉資料夾 UI-03）、`Exams.tsx`（清單、新增模擬考，分科灰階）、`Settings.tsx`（部別切換、學生名單、班級資料 12 色含撞色提醒、學校與表頭、教室清單唯讀）。
- App 以整份文件快照做復原（Ctrl+Z 在輸入框內不攔截）、設定頁改動都入復原；「回到」文字帶頁名。
- 未做：Excel 範本下載／匯入匯出（等施工A 匯入層）、教室座位表編輯（隨步驟③）、真正的資料夾授權（等 A 的存檔層換接 repository）、jsdom 元件測試。

## PR3：接上真實存檔層（#14，已併）／PR4：① 考試設定
- PR4：`src/ui/subjects.ts`（考科表預設：學測第1、2次數學單一科＋英聽、第3、4次數學A/B；會考固定七科；改名／新增／刪除標已自訂）、`pages/Step1.tsx`（名稱、學期、次別、參加方式、考科表）、`store.updateExam`；新增考試時自動帶入預設考科。
- 沒驗到：Step1 未用瀏覽器目視；真實資料夾選取／拖拉／重開還原（需 Chrome 實機）。

## 交接：進度與下一步（給接手的對話）
已完成：殼與元件庫、初始化、清單、設定頁（除 Excel 範本／匯入匯出）、真實存檔、① 考試設定。
下一步依序（每步小 PR，乾淨 clone 重跑 `npm ci && npm run typecheck && npm test && npm run build`）：
1. ② 考試名單：接 `src/import`（parseRoster、parseExamList、compareRosters、applyDiffs）、名單比對 UI（逐筆三選一含手動編輯 D54，全部處理完才繼續）、Excel 範本下載；設定頁學生名單補匯入／匯出／下載範本。
2. ③ 教室設定：座位表編輯（步進器、點座位「它與之後都不排」D72、展開可收合、座位上限依 LabelLayout，現行 A3 7×7／B4 6×8 見 PR #12）；設定頁教室清單改成同一畫面。
3. ⑤ 排座與預覽：接 `src/core`（runSeating／seatExam、驗證器、過期標示 D22）、座位表預覽縮放不橫捲。④ 標示與抽離規則（接 core/marks、detach，D12 接近一半鎖定）。⑥ 匯出：接 `src/export`。
4. 其他：個別覆寫、預備教室與抽離顯示、名單比對頁、元件測試（jsdom）、字型打包（P13）。
注意：repository 已是 createFsRepository；dev server 開著會讓 `npm ci` 失敗（檔案被占用），先關。LF/CRLF 警告無害。
