# 文件地圖

> 只列**現行**文件；每個主題只有一個權威出處。已完成的完工紀錄、舊交接、依舊稿做的對稿報告在 [archive/](archive/README.md)，是歷史紀錄，不當現行指示。專案規則在根目錄 [CLAUDE.md](../CLAUDE.md)。

## 開工先看

| 你是 | 先讀 |
|---|---|
| 任何人 | [todo.md](todo.md)（唯一待辦總表） |
| 調度員 | [dispatch/調度交接-2026-11-12.md](dispatch/調度交接-2026-11-12.md)（最新交接）、[dispatch/調度長期指示.md](dispatch/調度長期指示.md)、[dispatch/調度員授權紀錄.md](dispatch/調度員授權紀錄.md) |
| 設計員 | [design/設計員交接-最新.md](design/設計員交接-最新.md)、[design/稿版號.md](design/稿版號.md)（實作基準以〈基準規則〉為準） |
| 施工 | 派工單指定的項目，加上 [design/DESIGN.md](design/DESIGN.md) 與相關 D 編號 |

## 規格與決定

| 主題 | 權威出處 |
|---|---|
| 使用者原始需求 | [requirements.md](requirements.md) |
| 決定記錄（D 編號：已定、暫定、退役、未決） | [decisions.md](decisions.md) |
| 範例檔歸納的規則 | [sample-analysis.md](sample-analysis.md) |
| 分科模擬考規格 | [ast-spec.md](ast-spec.md)（分科座位新模型以 decisions D99 為準） |
| 正式考試日程、節次與時長 | [exam-schedule.md](exam-schedule.md)（程式內建時段表的來源） |
| 排座核心介面（`src/core`） | [core-api.md](core-api.md)（2026-11-08 寫，之後新增的時段、分科 D99 等模組未列入，以程式為準） |
| 選用功能怎麼接進畫面 | [dispatch/H包接入指南.md](dispatch/H包接入指南.md) |
| 版權頁、隱私權頁內容 | [dispatch/版權頁內容規格.md](dispatch/版權頁內容規格.md)、[dispatch/隱私權頁內容規格.md](dispatch/隱私權頁內容規格.md) |

## 設計

| 主題 | 權威出處 |
|---|---|
| 設計規範（畫面、元件、紙面版面） | [design/DESIGN.md](design/DESIGN.md)；色彩與尺寸變數 [design/tokens.css](design/tokens.css)（程式直接 import，不可搬移） |
| 設計稿（原型、設計系統、拉皮稿、頁首方案） | [design/mockups/](design/mockups/)；版號、成品網址與實作基準見 [design/稿版號.md](design/稿版號.md) |
| 網頁與最新稿的差異 | [design/網頁與稿差異-2026-11-12.md](design/網頁與稿差異-2026-11-12.md)（對 v2.29）；[校稿差異清單.md](校稿差異清單.md)（對 v2.22，校-NN 編號仍被 todo 引用） |
| 下一版稿的計畫與使用者註記 | [design/v2.29-出稿計畫.md](design/v2.29-出稿計畫.md)、[design/使用者註記-v2.28.md](design/使用者註記-v2.28.md)、[design/遺落稿盤點.md](design/遺落稿盤點.md) |

## 流程與調度

| 主題 | 權威出處 |
|---|---|
| 品質關卡（測試、審併、驗收） | [dispatch/品質關卡.md](dispatch/品質關卡.md) |
| 使用者裁決（2026-11-12，14 項） | [dispatch/使用者裁決-2026-11-12.md](dispatch/使用者裁決-2026-11-12.md) |
| 文案稽核 Issue #40～#44 的分流 | [dispatch/文案稽核處置.md](dispatch/文案稽核處置.md) |
| 待命對話與交接方式 | [dispatch/待命池規則.md](dispatch/待命池規則.md) |

## 文件放哪裡

- 新的完工紀錄、交接先寫在 `dispatch/`、`design/`；被取代後搬進 `archive/`（做法見 [archive/README.md](archive/README.md)）。
- 交接檔是當次狀態；會跨交接沿用的規則寫進對應的權威檔（上表），不要只留在交接裡。
- 公開 repo：任何文件都不得出現真實學生姓名、學號、帳號。
