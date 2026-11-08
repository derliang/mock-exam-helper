# 逐頁並排截圖腳本

驗收用：同一個 vite dev server 開「稿」（docs/design/mockups/原型.html）與實作，播種假資料後逐頁、逐寬度、逐淺深色截圖並合成並排圖，同時量字級與橫向溢出。只用虛構資料。

```
npx vite --port 5517 --strictPort            # 先啟動（埠號寫在 run.mjs、seed.mjs 的 PORT）
node scripts/compare-shots/run.mjs <暫存資料夾> <輸出資料夾> [頁名前綴,...] [寬度,...] [light,dark]
```

- 需要本機 Chrome（路徑寫在 cdp.mjs），用獨立的暫存 profile，不動你自己的 Chrome。
- 同一時間只跑一份（共用除錯埠 9333，兩份同跑會互相覆蓋資料）。
- 實作端的 `showDirectoryPicker` 改指向瀏覽器內的 OPFS 資料夾「模擬考資料」，每個情境前重新播種。
