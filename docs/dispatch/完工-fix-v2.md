# 完工-fix-v2：教室列塌陷＋全科缺考者驗證

## 做了什麼
1. **教室列塌陷**：`.roomrow.trk` 與開關軌道 `.trk`（46×26、圓角 99px）撞名。教室列改用 `hastrack`（`app.css`、`RoomList.tsx`）；開關軌道 `.trk` 與 `components/index.tsx` 的 Switch 未動。
2. **全科缺考者**：預設（未勾「仍排座」）時，⑤驗證報「考生沒有座位：0106」。根因是 `validationChecks` 用全部考生。現在 core 新增並匯出 `fullyAbsentCodes`（原 `runSeating` 內的判斷，行為不變，`runSeating` 改呼叫它），UI 新增 `seatableEntries` 同樣呼叫它。套用處：
   - `validationChecks`（恰好一座位、座位數 ≥ 考生數）
   - `capacity.ts`（③容量檢核，人數；「尚未匯入名單」仍以全部名單判斷）
   - `flow.ts`（流程「考生數／座位不足」）
   - `Step5.tsx` 摘要列「考生」
   勾「仍排座」時行為不變。
   - 沒改：`examList`、`QuickPanel` 的人數（那是名單人數）、Step5 姓名表、⑥匯出（⑥只看 flow 的 ⑤驗證，已隨之修好）。

## 驗證
- 重現：新測試在舊碼下失敗，訊息 `考生沒有座位：0106`；修後通過。
- `npx tsc --noEmit` 綠；`npm test` 384 全綠（原 380＋新 4）；`npm run build` 綠。
- 新測試：`seating.test.ts`〈D79 全科缺考者與驗證〉3 則（預設、仍排座、座位剛好夠）；`css.test.ts`〈類別撞名〉1 則（教室列不含 `.trk`、`.trk` 仍是 46×26）。
- 瀏覽器：`docs/dispatch/完工-fix-v2-截圖/`，教室列 500／820／1280 × 淺／深，假資料；量測教室列 class 為 `roomrow hastrack`，整列正常展開。

## 沒驗到的地方
- 截圖用暫時 harness（只渲染 RoomList，已刪除、未提交），不是完整 App（需檔案夾授權）。
- 無頭 Chrome 最小寬約 500，沒有真正的 375；窄版以 500 代替，請實機再看。
- 為了讓既有測試仍有效，`steps123.test.tsx` 的考生測資 `subjectIds: []` 改成 `['chi']`（原本等於全員缺考，改後才符合「有考生」的意圖）。

## 我替你決定的事
- ③容量檢核與流程提示也改成排除全科缺考者（與 core 排座一致）。要改回：把 `capacity.ts`/`flow.ts`/`Step5.tsx` 的 `seatableEntries` 換回 `examEntries`。
- 上述測資修改。

## 需要使用者決定的事
無。

## 狀態
本機已 commit、已 push 分支（見 PR）；origin/main 未含；未部署。
