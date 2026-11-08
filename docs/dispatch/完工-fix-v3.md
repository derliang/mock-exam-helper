# 完工記錄：fix-v3（版面溢出）

分支 `build/fix-v3-overflow`（基於 origin/main b6a3e67）。範圍：驗收報告 V3-1、V2-5。未動 Word 標籤／座位表、排座演算法、資料結構、版號。

## V3-1 步驟③ 1280 寬橫向溢出（已修）
- 根因：`.rw` 是 grid，子項預設 `min-width:auto`，教室列被內容撐到 870px，比卡片內寬 819px 突出；`@media(max-width:1180px)` 的換行版對 1280 寬無效（卡片寬度才是實際限制）。
- 修法（`src/styles/app.css` 檔尾）：`.rw>*{min-width:0}`；`.roomrow.hastrack` 改任何寬度都 flex 換行。組別鈕保留、可見可按。
- 實測（本機 dev，記憶體示範資料；教室列右緣＝所在卡片右緣）：1440／1280／820／375 × 淺／深共 8 組，`documentElement.scrollWidth` 皆未超過視窗（差的 15px 為捲軸），組別鈕完整可見。修前 1280：列 870px 超出卡片。截圖：`docs/dispatch/fix-v3/步驟3-1280-深色-修後.jpg`。

## V2-5 375 寬紙張鈕被截（已修）
- `@media(max-width:480px)`：`.seg` 撐滿、按鈕 `flex:1 1 0` 且文字可換行。實測 375 寬步驟⑥「標籤紙張」兩顆鈕 scrollWidth＝clientWidth（無截斷）。截圖：`步驟6-375-深色-修後.jpg`。

## 測試
- `src/styles/css.test.ts` 新增 3 項（.rw 子項 min-width:0、hastrack 最終為 flex 換行、窄螢幕分段鈕可換行）。
- `npx tsc --noEmit`、`npm test`、`npm run build` 結果見 PR。

## 沒驗到
- 只用記憶體示範資料量測（真實資料夾路徑未走）；只量步驟③⑥與預設一間班級教室＋一間預備教室，未量 4 間以上教室。
- 寬度為 375／820／1280／1440，未測其他寬度。全站 84 組溢出複測未重跑（改動只影響 `.rw` 子項與窄螢幕 `.seg`）。
- 暫時關掉檔案系統支援以取得示範資料的改動已還原，未 commit。
