# Issues 盤點 2

- 核對基準：`origin/main` = `b6a3e67`（含 PR #73／#74／#75）。Issue #57–#72 的稽核基準是舊的 `901cd659`，所以逐張讀現行程式確認「現在還在不在」。
- 日期：2026-11-08。只動文件與 GitHub issue 留言／關閉，沒改程式。
- 來源：#57–#72 為第三方 ChatGPT 靜態程式稽核（尚未實跑重現）；#40–#44 為文案稽核，先前已分流（見 `文案稽核處置.md`）。
- 分類：(a) 已解決　(b) 還在、納入施工　(c) 不納入／待決定。

## 一、逐張表

| # | 標題 | 分類 | 證據或理由 | 施工包／優先 |
|---|---|---|---|---|
| 57 | [P0] 全科缺考預設不排座，⑤驗證仍要求每人有座位 | **a 已關閉** | 7f3dc02（PR #73／#75）：`seating.ts validationChecks` 與座位數檢查改用 `seatableEntries`；③`capacity.ts`、`flow.ts`、⑤摘要同一選擇器；`seating.test.ts` 的 D79 三例重跑 13/13 通過。與驗收報告 2 的 V2-2 同一件事 | — |
| 58 | [P0] 並行 saveDoc 競態 | b | `App.tsx edit/onUndo/onUndoTo` 仍 `void repo.save`；`fsRepository.save` 直通 `saveDoc`，無佇列、無失敗提示 | 包 A，P0 |
| 59 | [P1] 採用考試名單清掉學號／類組／特殊註記 | b | `import/compare.ts setStudent` 仍只寫 classNo/seatNo/name | 包 B，P1 |
| 60 | [P1] 切換參加模式／改共用名單後不重算差異 | b | `Step2.tsx` 切換只改 `participation`，`examFiles.diffs` 不重算；⑤只看已存 diffs | 包 B，P1 |
| 61 | [P1] 共用姓名改了，版本碼不變 | b | `core/run.ts seatingVersion` 不含 `doc.rosters`；`export/model.ts:172` 姓名優先取共用名單 | 包 C，P1 |
| 62 | [P1] 全科缺考者仍參與標少數與抽離容量預覽 | b | `seating.ts` 的 `markSuggestions`、`detachPreview` 仍用 `examEntries`。（`capacity.ts` 一般教室容量已改 `seatableEntries`，這部分已好） | 包 C，P1 |
| 63 | [P1] ⑥不再要求⑤驗證通過 | b | `exportInput.ts prepareExport` 仍不跑 `validationChecks`；V2-2 修好後這條只剩「跳步」風險，但最後輸出邊界仍無防護 | 包 C，P1 |
| 65 | [P1] 只勾選用文件時下載鈕可按但無輸出 | b | `Step6.tsx` 按鈕判斷過濾「還沒勾選」，`go()` 內 `again` 沒過濾而靜默 return | 包 C，P1（小） |
| 66 | [P1] 同一考生 X＋加考，覆寫套同一 purpose | b | `Step5.tsx:218` 單一 purpose；`core/detach.ts` 逐科沿用。需先決定語意（見第四節 1） | 包 C，P1，需決定 |
| 67 | [P1] 手動核對改座號未檢查重複 | b | `Step2.tsx Editor` 只檢查正整數；`applyDiffs` 不跑 `validateStudent` | 包 B，P1 |
| 68 | [P2] 學測次別用累計數+1，第 5 次起超出 | b | `store.ts:87` 仍 `gsat 筆數 + 1`；Step1 只有 1–4 次 | 包 B，P2 |
| 69 | [P2] 新資料夾授權失敗仍載入舊資料夾 | b | `fsRepository.chooseFolder` 忽略 `adopt` 回傳；`App.changeFolder` 照常 `load()` | 包 A，P2（小） |
| 70 | [P2] ④組別對照表只取第一人的科目 | b | `seating.ts groupTable` 仍只在建立時取第一人 | 包 C，P2 |
| 71 | [P2] 略過未知班級時確認鈕人數仍是原始總數 | b | `RosterIO.tsx:73` 仍顯示 `plan.after` | 包 B，P2（小） |
| 72 | [P2] 輸入字元全量比對整份 Doc 並全量寫盤 | b（先量測） | 稽核自己說「尚非已證明的效能故障」；與 #58 同改存檔路徑，必須在 #58 之後或同包，不要平行 | 包 A，第二階段，P2 |
| 40–44 | [文案稽核 1–5/5] | **c 留著、待使用者決定** | 約 230 列提案，已分流：採用 73、已過時 15、不採用 123、需決定 18（見 `文案稽核處置.md`）。之後施工 N、I、L 等已改掉其中一部分，採用項目是否都已施工我沒有逐條重核。不是 bug，需使用者先回答處置文件第五節的決定題才能派 | 包 D（暫不派） |

## 二、已關閉

- **#57**（理由見上表，已在 issue 留言附 commit 與測試）。

其餘 14 張（#58–#63、#65–#72）已留言「以 b6a3e67 確認仍存在，已納入施工清單」，未關。#64 不存在（PR 編號）。

## 三、建議施工包

檔案範圍互不重疊，A、B、C 可平行。

### 包 A：存檔可靠度（#58、#69，之後 #72）
- 範圍：`src/data/fsRepository.ts`、`src/data/folder.ts`、`src/ui/App.tsx`（edit／onUndo／changeFolder）。
- 做法：同一資料夾單一持久化佇列（連續操作可合併，保證最後快照最後寫入）；寫入失敗顯示錯誤與重試；`chooseFolder` 回傳成功與否，失敗明示「仍使用原資料夾」；換資料夾前等佇列完成。
- 驗收：可控延遲的 FS mock，連續 100 次 edit／undo，重載後等於最後 Doc；寫檔失敗有可見錯誤；A→B 拒絕授權時不切換；資料格式不變。
- #72：A 完成後先量測（中大型假資料：6／24／60 次考試 × 100／300／500 人，記單字輸入延遲、寫入次數），有數字再決定要不要優化，不要在 A 內順手做。
- 優先：最高（P0）。

### 包 B：名單比對與匯入（#59、#60、#67、#71、#68）
- 範圍：`src/import/compare.ts`、`src/ui/pages/Step2.tsx`、`src/ui/pages/RosterIO.tsx`、`src/ui/rosterIO.ts`、`src/ui/store.ts`（newExam round）、`src/ui/pages/Step1.tsx`、`ImportWizard.tsx`。
- 做法：套用差異時保留原 Student 的 schoolId／groupCode／special；差異對輸入（共用名單、考試名單、參加方式）重算，或標示「比對需重做」並擋 ⑤⑥；套用前驗整份名單主鍵唯一、座號 1–99、班級存在，碰撞時不寫入並指出哪兩人；匯入確認鈕人數依「新增班級／略過」即時算，全略過不得悄悄清空名單；學測次別改為使用者選擇／依學年推算，且 round 必在 1–4。
- 驗收：各條 issue 的驗收清單；全員↔部分雙向切換差異筆數正確；重載後學號仍在；`npm test`、`tsc` 全綠。
- 優先：高（P1），#68、#71 為 P2 可同包尾段。

### 包 C：排座統計口徑與下載邊界（#62、#63、#61、#65、#66、#70）
- 範圍：`src/ui/seating.ts`、`src/ui/capacity.ts`、`src/ui/exportInput.ts`、`src/ui/pages/Step5.tsx`、`Step6.tsx`、`src/core/run.ts`（seatingVersion）、`src/core/detach.ts`、`src/export/model.ts`。
- 做法：④標示建議與抽離預覽改用 `seatableEntries`；`prepareExport` 前置跑 `validationChecks`，不過就擋；⑥「至少選一項」前後用同一條件、擋下一律顯示原因；版本碼納入影響輸出的共用欄位（或另設文件內容版本）；組別對照表同代碼考科不一致時標「N 人考科不同」；#66 先依第四節 1 的答案再動。
- 驗收：各 issue 驗收清單；測試補「全科缺考 0／1／多人跨 40% 門檻」「可存結果但驗證不過時⑥擋下」「只選用文件單獨下載」「只改共用姓名版本碼變」；全測試綠。
- 優先：P1。#66 若決定未出前，可先交付其餘五張。

### 不派：包 D 文案（#40–#44）
等使用者回答文案處置文件的決定題（Q1 導覽名稱等）。

## 四、需使用者決定

1. #66：單人特例要做成「各科各自選去處／用途」，還是「同一地點、每科依 X／＋自行決定考試或自習」？
2. #40–#44：是否要先處理文案處置文件第五節的決定題，才派文案包。
3. 驗收報告 2 的 V2-3（Word 標示被截）、V2-4（B4 標籤 3 頁）、V2-5、V2-6 沒有對應 Issue。V2-3 已有修（a614e30、523c1a9、PR #73），是否已複驗不在本次範圍；V2-4～V2-6 是否要開 Issue 由調度員決定。

## 五、沒驗到的地方

- 15 張稽核 issue 我只靜態讀 main 的程式與既有測試，沒有實跑重現（瀏覽器未開）。「仍存在」是依程式現況判斷，不是實測。
- #57 以現行單元測試重跑為證，未重走 UI。
- #40–#44 的「採用」項目現況沒有逐列重核。
