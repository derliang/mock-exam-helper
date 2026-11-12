# 歷史文件歸檔

> **這裡的檔案都是歷史紀錄，不是現行指示。** 現行文件從 [docs/README.md](../README.md) 找；待辦只看 [docs/todo.md](../todo.md)。歸檔檔案裡寫的「狀態」「待修」「下一步」「先讀這份」都停在當時，不再更新，也不代表現在還沒做。

## 為什麼歸檔

2026-11-12 文件整理：`docs/dispatch/` 和 `docs/design/` 累積了約 60 份已完成的完工紀錄、舊調度與設計員交接、依舊稿（v2.15）做的對稿報告、舊待修清單，和現行文件混在一起，接手的人分不清哪份還有效。這些檔已被現行文件取代或只剩紀錄價值，所以搬到這裡；**內容一字未刪**，只把指向其他搬移檔的路徑改成新位置。

## 怎麼對回原檔

- 搬移前的版本是 commit `762979d`（`762979d5590b3d3f1aaa399d9c7da39ac15e85f3`）。要看原位置的原檔：`git show 762979d:<原路徑>`；看單一檔的完整歷史：`git log --follow -- <新路徑>`。
- 目錄結構照原樣保留：`docs/dispatch/X` → `docs/archive/dispatch/X`，`docs/design/X` → `docs/archive/design/X`。檔名沒變，舊文件裡只寫檔名的引用（例如「見 `派工紀錄.md`」）在這裡用同一個檔名找得到。
- 歷任調度交接裡仍有效的長期指示已收進 [docs/dispatch/調度長期指示.md](../dispatch/調度長期指示.md)。

## 舊清單裡的未完成項目到哪裡去了

- `design/待修清單.md`（TODO-01～21）、`介面問題清單.md`、`M2-原型審閱意見.md`、`整站比對.md`：狀態欄停在 2026-11-08～09。這些項目由 `稿對決議/` 三份逐條核對、`稿修正-todo.md` 補進稿，之後兩輪全站比對都以最新核可稿為準（`docs/校稿差異清單.md` 對 v2.22、`docs/design/網頁與稿差異-2026-11-12.md` 對 v2.29）。**現在網頁與稿還有什麼不同，以這兩份為準**，不要回頭照舊清單的「待修」施工。
- `design/決定修訂建議.md`：已由 decisions D72 寫入（D72 原文註明依此檔）。
- `design/座位表與標籤-decisions修訂建議.md`：版面規格已進 DESIGN.md 第六章，但給 decisions 的條文草稿**還沒寫進去**，已列入 `docs/todo.md`〈F. 文件一致性〉。
- 舊調度交接的長期指示：見 `docs/dispatch/調度長期指示.md`。

## 之後的慣例

新的完工紀錄、交接仍先寫在 `docs/dispatch/`、`docs/design/`；工作併入 main、內容被新文件取代後，整理文件的人再搬來這裡，照上面同樣的方式更新路徑。

## 搬移對照（共 74 項）

| 原路徑 | 類別 |
|---|---|
| `docs/design/M2-原型審閱意見.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/介面問題清單.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/實作對稿/` | 對稿報告（依舊稿） |
| `docs/design/座位表與標籤-decisions修訂建議.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/待修清單.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/整站比對.md` | 對稿報告（依舊稿） |
| `docs/design/決定修訂建議.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/稿修正-todo.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/design/稿對決議/` | 對稿報告（依舊稿） |
| `docs/design/設計員交接-2026-11-08.md` | 舊交接（已被最新交接取代） |
| `docs/design/設計員交接-2026-11-09-晚.md` | 舊交接（已被最新交接取代） |
| `docs/design/設計員交接-2026-11-09.md` | 舊交接（已被最新交接取代） |
| `docs/design/驗收截圖/` | 驗收／盤點報告 |
| `docs/dispatch/M2使用者意見清單-2026-11-08.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/dispatch/fix-huikao-check/` | 截圖 |
| `docs/dispatch/fix-v3/` | 截圖 |
| `docs/dispatch/issues盤點-2.md` | 驗收／盤點報告 |
| `docs/dispatch/完工-A.md` | 完工紀錄 |
| `docs/dispatch/完工-B.md` | 完工紀錄 |
| `docs/dispatch/完工-C.md` | 完工紀錄 |
| `docs/dispatch/完工-D.md` | 完工紀錄 |
| `docs/dispatch/完工-E.md` | 完工紀錄 |
| `docs/dispatch/完工-F.md` | 完工紀錄 |
| `docs/dispatch/完工-G.md` | 完工紀錄 |
| `docs/dispatch/完工-H1.md` | 完工紀錄 |
| `docs/dispatch/完工-H3.md` | 完工紀錄 |
| `docs/dispatch/完工-H4.md` | 完工紀錄 |
| `docs/dispatch/完工-H5.md` | 完工紀錄 |
| `docs/dispatch/完工-H6.md` | 完工紀錄 |
| `docs/dispatch/完工-H7.md` | 完工紀錄 |
| `docs/dispatch/完工-I-截圖/` | 截圖 |
| `docs/dispatch/完工-I.md` | 完工紀錄 |
| `docs/dispatch/完工-J-截圖/` | 截圖 |
| `docs/dispatch/完工-J.md` | 完工紀錄 |
| `docs/dispatch/完工-K-截圖/` | 截圖 |
| `docs/dispatch/完工-K.md` | 完工紀錄 |
| `docs/dispatch/完工-L-復原按鈕.jpg` | 截圖 |
| `docs/dispatch/完工-L.md` | 完工紀錄 |
| `docs/dispatch/完工-M.md` | 完工紀錄 |
| `docs/dispatch/完工-N.md` | 完工紀錄 |
| `docs/dispatch/完工-O.md` | 完工紀錄 |
| `docs/dispatch/完工-P.md` | 完工紀錄 |
| `docs/dispatch/完工-Q-截圖/` | 截圖 |
| `docs/dispatch/完工-Q.md` | 完工紀錄 |
| `docs/dispatch/完工-Q2.md` | 完工紀錄 |
| `docs/dispatch/完工-R-截圖/` | 截圖 |
| `docs/dispatch/完工-R.md` | 完工紀錄 |
| `docs/dispatch/完工-S1.md` | 完工紀錄 |
| `docs/dispatch/完工-U.md` | 完工紀錄 |
| `docs/dispatch/完工-fix-huikao-check.md` | 完工紀錄 |
| `docs/dispatch/完工-fix-junior-scan.md` | 完工紀錄 |
| `docs/dispatch/完工-fix-v2-截圖/` | 截圖 |
| `docs/dispatch/完工-fix-v2.md` | 完工紀錄 |
| `docs/dispatch/完工-fix-v3.md` | 完工紀錄 |
| `docs/dispatch/完工-設計員對稿v222-截圖/` | 截圖 |
| `docs/dispatch/完工-設計員對稿v222.md` | 完工紀錄 |
| `docs/dispatch/完工-設計員頁尾.md` | 完工紀錄 |
| `docs/dispatch/待派-H5H6.md` | 舊派工單 |
| `docs/dispatch/施工分包-第三批.md` | 舊派工單 |
| `docs/dispatch/施工分包-第二批.md` | 舊派工單 |
| `docs/dispatch/施工分包-第四批.md` | 舊派工單 |
| `docs/dispatch/施工分包.md` | 舊派工單 |
| `docs/dispatch/派工紀錄.md` | 舊派工單 |
| `docs/dispatch/節次研究交接.md` | 舊意見、建議與待修清單（不再更新） |
| `docs/dispatch/調度員交接-2.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/調度員交接-3.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/調度員交接-4.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/調度員交接-5.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/調度員交接-6.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/階段3派工.md` | 舊交接（已被最新交接取代） |
| `docs/dispatch/驗收報告-2-截圖/` | 截圖 |
| `docs/dispatch/驗收報告-2.md` | 驗收／盤點報告 |
| `docs/dispatch/驗收報告.md` | 驗收／盤點報告 |
| `docs/dispatch/驗收簡報.md` | 驗收／盤點報告 |
