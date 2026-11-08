# 完工回報：施工M（驗收缺陷修復）

分支 `build/m-defects`（A 軌，交 PR，不自行併 main）。基底 origin/main `da6df12`。

## 修了什麼（對照驗收報告）
| 缺陷 | 做法 | 位置 |
|---|---|---|
| D-1 重大 | 班級教室列加「組別（理組／文組）」分段鈕（步驟③與設定頁共用 RoomList；預備教室不顯示、設了也會清掉）。③ 與排座前置條件在高中部班級教室未指定組別時就擋下，說明缺什麼，並有「去 ③ 指定理組／文組」一鍵跳轉；③ 頁頂也有紅色提示。 | `rooms.ts`（setRoomTrack、roomsMissingTrack）、`RoomList.tsx`、`flow.ts`、`seating.ts`（seatingBlockers）、`Step3.tsx` |
| D-2 高 | 匯出改用 `seatingInputOf`（鎖定規則＋「標少數」建議，與 ⑤ 同源），標示 X、抽離自習名單、資料版本碼與 ⑤ 完全相同。 | `exportInput.ts` |
| D-3 中 | ④ 文案改為「已採用系統建議（可改）」，表中標籤「系統建議（可改）」；③ 未完成時 ④ 不再顯示已完成。 | `Step4.tsx`、`flow.ts` |
| D-4 低 | 新增 `guardNav`：已關閉的考生查詢頁不顯示（回模擬考列表），「← 回到」堆疊也濾掉。 | `nav.ts`、`App.tsx` |
| D-6 | 復原按鈕補 `aria-label`＝「復原：動作」；摘要列座位 0 時顯示「空位 —」，不再出現「缺位 41」；智慧匯入科目欄「國」現行版本已給「採用建議：國文」，補回歸測試（驗收時的情形未能重現）。 | `components/index.tsx`、`mDefects.test.ts` |

## 驗收員重現步驟逐項重跑（`src/ui/mDefects.test.ts`，8 項）
- D-1：全新資料夾→新增 2 間班級教室→③ 有擋下說明、`reseat` 被擋且訊息不是「理組沒有可用的教室」；指定理／文組後 `reseat` 成功。
- D-2：markRules 為空、有少數不考英文→匯出的 marks、detaches、assignments、dataVersion 與 ⑤ 的 `reseat` 結果相同。已驗證改回舊寫法此測試會失敗。
- D-4：關閉功能後目前頁與回頁堆疊皆被防護。

## 測試
- `npx tsc --noEmit`：無錯誤
- `npm test`：39 檔／322 測試全過
- `npm run build`：成功

## 沒做／未驗
- 未實機操作瀏覽器 UI 與實際下載 docx（以單元測試驗證資料層）；「匯出 docx 有 X 標示」由 marks 一致性間接保證。
- 未擴充 `export.property.test.ts` 成隨機性質測試，改用單一確定案例回歸（已驗證有效）。
- D-5 不在範圍。

## 我替你決定的事
- ④ 的「標少數」建議視為有效、不另存檔（使用者已授權）。
- 組別分段鈕只對班級教室顯示，國中部教室不檢查組別（排座本來就不用）。
- 摘要列座位為 0 時顯示「空位 —」而非「缺位」。
