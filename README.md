# 模擬考小幫手

學校模擬考的行政小幫手。第一個功能是**考場座位安排**：依學生名單與教室座位配置，自動編排座位、產出 A4 座位表與 A3／B4 座位標籤（D74）。

- 純前端 Web App，部署在 GitHub Pages（<https://derliang.github.io/mock-exam-helper/>），沒有後端。
- **本儲存庫與 GitHub Pages 不放任何學生資料。** 學生名單、座位結果都只存在使用者自己電腦的資料夾，程式初始化時由使用者選擇資料夾（File System Access API；畫面上限使用 Chrome，見 D53）。
- 以桌機操作為主。
- 結果必須 100% 正確：排座後由獨立驗證器逐項檢查，沒通過不能匯出。

## 目前狀態

已上線，版號見 `package.json` 與網頁頁尾（升版規則見 [CLAUDE.md](CLAUDE.md)〈程式版號〉）。支援學測、會考模擬考的完整流程；分科模擬考的新模型（D99）稿已核可、程式尚未改寫（見 todo D 區）。選用功能（預設關）：領卷清單、考生查詢、出缺席記錄表、列印對位測試頁、會考快速模式。

待辦看 [docs/todo.md](docs/todo.md)，所有文件的入口是 [docs/README.md](docs/README.md)（文件地圖）。

## 開發

```bash
npm ci          # 會自動把 git hooks 指到 .githooks（push 前跑型別檢查與測試）
npm run dev     # 本機開發
npm test        # vitest
npm run build   # 型別檢查＋建置到 dist/
```

推到 `main` 會由 GitHub Actions 自動建置並部署 Pages（`.github/workflows/pages.yml`，只部署、不跑測試；測試在本機 pre-push）。

## 隱私原則

`.gitignore` 預設排除 `*.xlsx`、`*.xls`、`*.csv`、`*.docx`、`*.pdf` 與 `data/`，避免學生資料誤入版本庫。範例名單、座位表只留在作者本機，不進 repo。

## 授權

保留所有權利，詳見 [LICENSE.md](LICENSE.md)。聖功女中師生得於非營利教育目的範圍內免費使用；其他單位請先 Email 取得同意。公開在 GitHub 不代表開放原始碼授權。
