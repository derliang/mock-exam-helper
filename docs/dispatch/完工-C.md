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
