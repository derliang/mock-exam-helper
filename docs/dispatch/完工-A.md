# 完工記錄：施工A 骨架與資料層

## 已完成

- **骨架**：Vite 5＋Preact＋TypeScript 嚴格＋Vitest；`npm run typecheck`／`npm test`／`npm run build`；`.githooks/pre-push`；`.github/workflows/pages.yml`（只部署）。
- **共用型別**：`src/data/types.ts`、`helpers.ts`。教室＝排×深位＋可用座位數，空位只在最後（D72）；標籤格數用 `LabelLayout` 參數。
- **存檔讀寫**：`src/data/`
  - `envelope.ts`：JSON 外殼＋FNV-1a 驗證碼＋版本；偵測壞 JSON、被手改、格式不符、較新版本。
  - `dirfs.ts`：`DirFS` 抽象（記憶體實作供測試、File System Access 實作供瀏覽器）。
  - `folder.ts`：`settings.json`、`roster-senior|junior.json`、`exams/<id>/{exam,entries,diffs,overrides,result}.json`；覆寫前留 `.bak`，主檔損壞自動改讀備份並警告，都壞則 `StorageError`；考試 id 防路徑跳脫。
  - `fsRepository.ts`：`createFsRepository()` 符合 `src/ui/repository.ts`；資料夾 handle 存 IndexedDB（`restore()`），拖拉資料夾用 `getAsFileSystemHandle`。
- **匯入解析**：`src/import/`
  - `xlsx.ts`：最小 .xlsx 讀取器（jszip，無 DOM 依賴）。
  - `columns.ts`：欄位智慧對應（同義詞、全半形、空白）、班級與座號正規化。
  - `examList.ts`：大考中心格式；組別代碼表（第 1、2 次與第 3、4 次）、缺考科目寬鬆解析、加考欄、略過說明區、重複列與未知組別警告。科目 id：chi/eng/math/mathA/mathB/sci/soc。
  - `roster.ts`：直式、六班並排橫向寬表、區塊標題版式（`blocks`，依位置取學號／座號／姓名，帳號不讀；類組文字推 `classTracks`，不寫進 Student）。
- **名單比對**：`src/import/compare.ts`——差異四類、全員／部分參加（D64）、逐筆三選一（D54）、`allResolved`、`applyDiffs`。
- 復原（UI-05）：施工C 已在 `src/ui/undo.ts` 做完，不重複。

## 沒做到／限制

- **真實檔煙霧測試**（調度員代跑，PR #16）：考生資料名單與兩份學生名單人數與點算一致、問題 0。
- **類組**：高三只有前三班有「工程群／生醫群」，`classTracks` 只推得 1～3 班為理組；4～6 班該欄空白或「復學生」，由使用者在設定頁班級資料自行設定。
- **註欄值得留意（未處理）**：學生名單「註」欄出現「補號」「轉入」「復學生」，可能與 D41／D42 名單比對有關，目前不解析，留待後續決定。
- 畫面接線（把 `createMemoryRepository` 換成 `createFsRepository`、匯入 UI）屬施工C。
- 英聽不處理（D67）；會考無組別欄時用 `defaultSubjectIds`。
- `applyDiffs` 的「只在學生名單、選以學生名單為準」會補一筆 `subjectIds: []` 的考試名單，需另行設定科目。

## 測試

`npm test`（含 src/data、src/import 單元測試）。

## 加開：② 考試名單頁＋設定頁匯入／匯出／範本（分支 build/a-ui-roster）

- `src/ui/pages/Step2.tsx`：匯入大考中心格式 .xlsx → 欄位對應確認表 → 確認後存 `entries.json` 並比對 → 差異逐筆三選一＋手動編輯（D54）→ 全部處理完才能「套用處理結果」（更新學生名單，走 onChange 可復原）。全員／部分參加（D64）；「到設定頁看學生名單」帶回原頁。
- `src/ui/pages/RosterIO.tsx`（設定頁學生名單）：下載 Excel 範本（班級、座號、姓名、學號（選填））、匯入（含並排區塊版式、預覽確認、取代整份名單、可勾選依類組欄設文理組）、匯出。
- 純邏輯：`src/ui/step2.ts`（科目 id 對應、挑工作表）、`src/ui/rosterIO.ts`；`src/import/xlsxWrite.ts`（xlsx 寫出）；`Repository` 新增 `loadExamFile`／`saveExamFile`。
- 沒驗到：兩頁未在 Chrome 目視、未實際上傳檔案操作（只有單元測試與 build）；復原只還原學生名單，不還原已存的 entries/diffs 檔。
