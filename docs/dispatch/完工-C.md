# 完工記錄：施工C 畫面層

## PR1：殼＋元件庫（分支 build-c-ui）
- `src/styles/app.css`：自原型移植的元件樣式（無寫死色碼）；tokens 直接 import `docs/design/tokens.css`（不複製）。
- `src/ui/nav.ts`：路由與「回原頁」堆疊（DESIGN 10.1）；`undo.ts`：復原（上限 20）；`colors.ts`：12 色班級色與撞色提醒。
- `src/ui/components/`：Button、Seg、Badge、Alert、Stepper、StatsBar、ClassChip、Modal、StepNav、TopBar。
- `src/ui/repository.ts`：薄介面＋記憶體假實作（等施工A 存檔層換接）。
- `src/ui/App.tsx`：導覽殼，各頁暫為佔位。

## 未完成
各頁面（初始化拖拉、設定頁、六步驟、比對、覆寫、預備教室）；字型打包（DESIGN P13，目前用系統備援字型）；元件測試（目前只測純邏輯，未加 jsdom）。
