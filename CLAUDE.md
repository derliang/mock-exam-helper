# 模擬考小幫手

純前端網頁 App（GitHub Pages）。學生資料只存在使用者本機，本 repo 公開，**不得出現任何真實學生姓名、學號、帳號**。需求與決定見 `docs/requirements.md`、`docs/decisions.md`；所有文件的入口是 `docs/README.md`（文件地圖），待辦只看 `docs/todo.md`。`docs/archive/` 是歷史紀錄，不當現行指示。

## 設計規範

任何新增或修改畫面、版面、元件、樣式，先讀 `docs/design/DESIGN.md`，並使用 `docs/design/tokens.css` 的變數，不要在元件內寫死色碼。成品頁與原型在 `docs/design/mockups/`，只用假資料。改了規範要在同一個 PR 內更新 DESIGN.md 與成品頁。改稿必升版號並更新 `docs/design/稿版號.md`、重發成品。座位稱呼：左右＝橫排（標「第N排」）、前後＝深位（標數字），座標寫「排－深位」。

設計員（或任何接手設計稿的人）開工先讀 `docs/design/設計員交接-最新.md` 與 `docs/design/稿版號.md`：以使用者審核通過的最新稿為實作基準（版號與通過日期以 `稿版號.md`〈基準規則〉為準，不在此寫死），實作中要改稿必須回頭改稿、升版號並在 commit 註明原因，不可默默變更。

## 程式版號

每次有使用者看得到的變更併進 `main` 之前，必須先依語意化版本升 `package.json` 與 `package-lock.json` 的 `version`（版號顯示在頁尾，由建置帶入）：新增功能（向下相容）升次版號，只修 bug 升修訂號，不相容的變更升主版號。併 PR 的人（調度員或直接施工的對話）負責檢查，只有純文件變更可不升。升版號與其內容同一個 PR，或緊接著的獨立 PR；回報要寫新版號。
