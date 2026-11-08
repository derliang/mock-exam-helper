# 完工記錄：施工A 骨架與資料層

## 第一個 PR：骨架＋共用型別（已完成）

- 骨架：Vite 5＋Preact＋TypeScript 嚴格模式＋Vitest；`npm run typecheck`、`npm test`、`npm run build`。
- 本機 CI：`.githooks/pre-push`（型別檢查＋測試）；`npm install` 的 `prepare` 會設定 `core.hooksPath`。
- 部署：`.github/workflows/pages.yml` 只做 Pages 部署（main 更新才觸發，D19），不跑測試。
- 共用型別：`src/data/types.ts`（學生、班級、教室與座位、考試、考試名單、名單差異、覆寫、排座結果、標示、抽離、版本碼、設定、檔案外殼）；`src/data/helpers.ts`（學生編號、座標「排－深位」、教室座位列舉）。
- 設計重點：教室以「排×深位＋可用座位數」建模，空位只在最後（D72）；標籤格數用 `LabelLayout` 參數，不寫死。

## 尚未做

存檔讀寫（資料夾授權、拖拉資料夾、JSON、損壞偵測）、復原、匯入解析、名單比對。
