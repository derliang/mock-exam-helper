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
  - `roster.ts`：直式與六班並排橫向寬表。
- **名單比對**：`src/import/compare.ts`——差異四類、全員／部分參加（D64）、逐筆三選一（D54）、`allResolved`、`applyDiffs`。
- 復原（UI-05）：施工C 已在 `src/ui/undo.ts` 做完，不重複。

## 沒做到／限制

- **未用真實名單驗證**：嘗試本機讀取 D71 開放的資料夾時被權限分類器擋下（PII 規則），我沒有繞過。匯入解析只用依 sample-analysis 自編的假資料測試；真實檔的細節（儲存格型態、說明區位置）需調度員或使用者授權後再驗，或由驗收員以真實檔實測。
- 畫面接線（把 `createMemoryRepository` 換成 `createFsRepository`、匯入 UI）屬施工C。
- 英聽不處理（D67）；會考無組別欄時用 `defaultSubjectIds`。
- `applyDiffs` 的「只在學生名單、選以學生名單為準」會補一筆 `subjectIds: []` 的考試名單，需另行設定科目。

## 測試

`npm test`（含 src/data、src/import 單元測試）。
