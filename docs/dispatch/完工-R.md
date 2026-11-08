# 完工-R：教室列開關＋下載格式鈕（拉皮方案 A）

分支 `build/r-switch-format`。依 DESIGN 10.7／10.9、`mockups/拉皮稿.html`、TODO-15／16／20。

## 做了什麼
1. **步驟③教室列**（`RoomList.tsx`、`Step3.tsx`、新元件 `Switch`）：勾選框改滑動開關（軌道 46×26）。上方標示：班級教室「列為考場」、預備教室「列為預備」；右側文字「已列入／未列入」。未列入的教室整列變淡（`.roomrow.off`）；座位合計本來就只算 `exam.classroomIds`，故不計入（有測試）。
2. **新增預設**：步驟③按「新增班級教室」→ 自動列入本次考試；「新增預備教室」→ 不列入（`newClassRoomIds`）。
3. **步驟⑥格式鈕**（`FormatPick`）：標籤只寫 Word／PDF，拿掉主要／輔助（說明文字裡的「Word 為主要成品」一併改掉）；自繪 SVG 圖示；Word 藍、PDF 磚紅用 `--fmt-*` tokens，紅只用在圖示與選中底色，文字深色。
4. **Excel 鈕**（`FormatButton kind="xls"`）：設定頁學生名單「下載學生名單」。範本下載與 Modal 內按鈕維持一般鈕。
5. CSS：`.sw` 改為原型規格（`.swf/.trk/.st`）、新增 `.fmt*`、`.btn-fmt`。DESIGN.md 補程式對應；成品頁原型本來就有，無需改。

## 替使用者決定的事
- **舊資料（未列入的班級教室）**：沿用資料原本的選用狀態（`exam.classroomIds`），不批次改。理由：不動資料、不改變既有考試的座位合計與排座結果；只改「新增」時的預設。
- 設定頁（共用教室清單）沒有「選用」概念，不顯示開關（維持原樣）。
- 未選中的格式鈕邊框維持中性灰、圖示帶色（與原型一致）。

## 驗證
- `npx tsc --noEmit` 無錯；`npm test` 44 檔 378 測試全過（新增 `src/ui/switchFormat.test.tsx` 7 項：標示文字、on/off 類別、預設列入規則、關閉教室不計座位、格式鈕標籤與無主要／輔助、Excel 鈕）；`npm run build` 成功。
- 截圖 `docs/dispatch/完工-R-截圖/`：375／820／1280 × 淺／深，只用假資料。

## 沒驗到的地方
- 截圖用暫時的 harness 頁（Step3 元件＋格式鈕，未提交）取得，不是完整 App：完整 App 需 File System Access 選資料夾，自動化開不了；步驟⑥整頁（需完整排座資料）與設定頁的 Excel 鈕沒有逐頁截圖（鈕本身在 harness 內已截）。
- 無頭 Chrome 最小視窗寬約 500，375 截圖右側被裁；窄版排版請在實機或 DevTools 再看一次。
- 鍵盤操作（Tab、空白鍵切換）只靠原生 checkbox，未實機走過。
