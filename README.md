# 模擬考小幫手

學校模擬考的行政小幫手。第一個功能是**考場座位安排**：依學生名單與教室座位配置，自動編排座位、產出 A4 座位表與 A3 座位標籤。

- 純前端 Web App，部署在 GitHub Pages，沒有後端。
- **本儲存庫與 GitHub Pages 不放任何學生資料。** 學生名單、座位結果都只存在使用者自己電腦的資料夾，程式初始化時由使用者選擇資料夾（File System Access API，需 Chrome 或 Edge）。
- 以桌機操作為主。
- 結果必須 100% 正確：排座後由獨立驗證器逐項檢查，沒通過不能匯出。

## 目前狀態

規劃階段，尚未有程式碼。2026-11-07 完成第一輪需求討論與範例檔分析，結論都寫在 `docs/`：

| 文件 | 內容 |
|---|---|
| [docs/requirements.md](docs/requirements.md) | 使用者的原始需求整理 |
| [docs/decisions.md](docs/decisions.md) | 決定記錄：已定、暫定、已退役、未決 |
| [docs/sample-analysis.md](docs/sample-analysis.md) | 從既有成果（名單、座位表、標籤）歸納的規則與證據 |
| [docs/dispatch/待命池規則.md](docs/dispatch/待命池規則.md) | 調度員交接的待命對話規則 |

## 隱私原則

`.gitignore` 預設排除 `*.xlsx`、`*.xls`、`*.csv`、`*.docx`、`*.pdf` 與 `data/`，避免學生資料誤入版本庫。範例名單、座位表只留在作者本機，不進 repo。

## 授權

保留所有權利，詳見 [LICENSE.md](LICENSE.md)。聖功女中師生得於非營利教育目的範圍內免費使用；其他單位請先 Email 取得同意。公開在 GitHub 不代表開放原始碼授權。
