# 完工記錄：施工D 輸出（`build/d-export`）

> 範圍 `src/export/`。Word 為主、PDF 為輔（D29、D57）。**尚未經 Word 實機渲染驗證**，見〈真檔抽驗〉。

## 做了什麼

| 檔案 | 內容 |
|---|---|
| `src/export/model.ts` | 中介版面模型（Word、PDF 共用）：座位表頁、標籤頁、抽離名單；統計（D40）；頁尾文字（D66，台北時間＋資料版本碼）；字集外罕用字掃描（只回報班級＋座號＋字元，不含姓名） |
| `src/export/docxRender.ts` | .docx 輸出：座位表 A4、標籤 B4／A3、抽離名單 A4；每類合併成一個多頁檔（D69）；內嵌字型；`boldMode` 兩種粗體做法可切換 |
| `src/export/htmlRender.ts` | PDF 用列印 HTML（`@page` 具名紙張），瀏覽器「列印成 PDF」 |
| `src/export/colors.ts` | 12 色班級色（DESIGN §二淺色版） |
| `src/export/fonts/` | Noto Sans TC 子集：Regular＝ASCII＋全形標點＋Big5 全集（4.8MB）；Bold＝只含數字、編號與固定詞（14KB）；`*.chars.txt` 是 Regular 的實際字集；`OFL.txt` 授權 |
| `scripts/build-export-fonts.py` | 重新產生字型子集（需 fonttools） |
| `scripts/make-sample-export.ts` | 用假資料產生抽驗檔 |
| `src/export/fixtures.ts`、`export.test.ts` | 假資料與 16 個測試 |

## 決定與設計（我替調度員決定的事）

1. **（D74 已裁示）粗體只用在數字／編號／固定詞**，姓名、班級名稱用一般體。
2. **（D74 已裁示）標籤頁邊界 10mm**（`labelMarginMm`）。格數預設：A3 7×7，每格固定 35mm 正方；B4 6 欄×8 列，格子＝（紙張－兩側邊界－3mm）÷ 格數。`defaultLabelLayout(paper)` 提供預設，施工C 建立考試時請改用它（`src/ui/store.ts` 目前寫死 6×8）。
3. **標籤格數參數化**（`LabelLayout.cols/rows`，不寫死 48）；座位多於格數會丟錯，不默默截斷。舊標籤（D71 檔）是 A3、7 欄×7 列、每格 35mm 正方，可作 D72 的參考。
4. 統計已改用核心 `roomStats`／`detachRoomCounts`（`src/core/stats.ts`），各科人數＝本教室實際考的人數（inRoom）。
5. 座位表：深位大的在上、1 在下、講臺在下方、0101 在左下（DESIGN §五）；抽離考試座位表用柔和單色，每間預備教室每個抽離考試科目一頁。
6. 粗體字型兩種掛法（待真檔結果擇一）：`separate-family`（預設，Bold 當獨立家族 `Noto Sans TC Bold`）；`embed-bold`（後處理 `fontTable.xml`，掛成同家族 `embedBold`）。

## 測試

```
npm run typecheck   # 無錯誤
npx vitest run      # 2 檔 20 個測試全綠（含 data 4 個）
```

檢查內容：解開 .docx 驗證字型檔 2 個、`embedTrueTypeFonts`、字型混淆還原後逐位元相同、紙張尺寸（A4／B4）、標籤欄寬相等與列高固定、頁尾資料版本碼、`embed-bold` 後處理、PDF HTML 的 `@page` 與特殊字元脫逸、標籤超格丟錯、統計、空位只在最後。乾淨 clone 的 `npm ci && typecheck && test && build` 結果見 PR 說明。

## 真檔抽驗（D45 最後一關，留給驗收員／使用者，最少步驟）

1. 產生抽驗檔（在本機 repo）：`npx vite-node scripts/make-sample-export.ts sample-out separate-family`，再跑一次最後一個參數改 `embed-bold`。得到 `座位表-*.docx`、`標籤-*.docx`、`抽離名單-*.docx`（假資料，約 3MB；`*.docx` 不進 git）。
2. 把 `座位表-separate-family.docx` 與 `座位表-embed-bold.docx` 複製到**一台沒裝 Noto Sans TC 的電腦**，用 Word 開。
3. 看三件事：①中文字是明體以外的黑體（Noto Sans TC），不是方框或宋體；②各格的大字編號（如 0101）是粗體；③頁尾有「資料版本碼：SAMPLE01」。
4. 兩個檔哪一個的編號粗體正常，就選那個 `boldMode`；都正常選預設。標籤檔另看：B4 一張紙一頁、沒有多出空白頁。
5. 列印實測：標籤用 100% 縮放列印，量格子大小，確認邊界設定（`labelMarginMm`）是否合適。

## 未完成／風險

- 沒有 Word／LibreOffice 渲染驗證（本機沒裝），版面密度（座位表 7 排以上的字級、標籤 A3 字級）只有程式推算，沒有看過實際輸出。
- 罕用字：Big5 全集以外的字（如部分人名用字）會退回使用者電腦的字型；輸出前請用 `findMissingChars` 掃描並警告。
- 排座結果結構目前用 `SeatingResult`（src/data）；施工B 的實際輸出若有欄位差異再調。
- 考生查詢、領卷清單：第一版先不做（調度員裁示）。
- 字型檔 4.8MB 進 repo；正式網站需延遲載入（只在匯出時載入），由施工C 整合。
