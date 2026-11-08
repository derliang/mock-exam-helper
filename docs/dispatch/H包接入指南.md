# H 包接入指南：怎麼把一個選用功能接進畫面

> 給 H3～H7 各包。機制見 D75、D77、D78；程式在 `src/ui/features.ts`，測試在 `src/ui/features.test.tsx`。

## 原則

- 選用功能**預設全關**，使用者在 設定 →「選用功能」勾選。關掉就**完全消失**（導覽、匯出頁、步驟都沒有，不留灰色入口），也不影響核心流程。
- 開關存在 `settings.json` 的 `settings.features`（功能 id → true/false）。舊存檔沒有這個欄位，或沒寫的功能，一律視為關。
- 只有勾選清單，沒有分級、角色或進階設定。
- 「會考專用」（`scope: 'bcct'`）的功能只在會考（`exam.kind === 'bcct'`）出現；學測、分科、以及不在考試裡（設定頁、列表）都不出現，即使使用者勾了。

## 目錄（已預先登記，id 固定，不要改名）

| id | 名稱 | 範圍 | 包 |
|---|---|---|---|
| `pickup-list` | 領卷清單（含對卷） | all | H3 |
| `student-lookup` | 考生查詢 | all | H4 |
| `attendance-sheet` | 出缺席記錄表 | all | H5 |
| `print-alignment` | 列印對位測試頁 | all | H6 |
| `bcct-quick-mode` | 會考快速模式 | bcct | H7 |

名稱與說明文字在 `BUILTIN_FEATURES`；要改說明只改那一處。需要新增功能時，在 `BUILTIN_FEATURES` 加一筆（id、name、desc、scope），不另開機制。

## 接入：每包只做一件事，呼叫 `registerFeature`

在你的功能檔裡（例如 `src/ui/featureRegister/pickup.tsx`），登記一次，並在 `src/ui/App.tsx` 頂端加一行 `import './featureRegister/pickup';`（副作用匯入，每包一行，避免互相衝突）：

```tsx
import { registerFeature } from '../features';

registerFeature('pickup-list', {
  // ① 頂端導覽多一個按鈕；route 的頁面元件由你在 App 路由表加一行（需要獨立頁才用）
  nav: { label: '領卷清單', route: { page: 'pickup' } },
  // ② 匯出頁多一個勾選項；run 回傳 OutputFile[]（text/html 走列印頁，其餘下載）
  exportItems: [{
    key: 'pickup', title: '領卷清單（A4）', sub: '每間教室每科的試卷與答案卡份數',
    run: async ({ doc, exam, format }) => [/* OutputFile */],
  }],
  // ③ 某一步驟最下方多一塊（1～6）
  stepPanels: [{ step: 5, render: ({ doc, exam, onChange }) => <PickupHint doc={doc} exam={exam} /> }],
});
```

三個欄位都可省略，只接你需要的位置。**不要自己判斷開關**：註冊表只在功能開啟（且符合適用範圍）時才取出你的項目，關閉時你的導覽、匯出項、面板根本不會被呼叫。

## 在自己的元件內需要判斷時

```tsx
import { useIsEnabled } from '../features';
const on = useIsEnabled('student-lookup', exam.kind); // 會考專用要帶 examKind
```

純函式版本：`isEnabled(id, { settings, examKind })`，可在單元測試直接用。

## 測試要求（每包都做）

- 用 `registerFeature(id, ui)` 後，驗證 `enabledNav／enabledExportItems／enabledStepPanels`：設定沒開時回空、開了才出現（範例見 `features.test.tsx` 的「註冊表接入」）。
- 匯出項：驗證關閉時匯出頁不出現你的標題（`renderToString(<Step6 … />)`）。
- 會考專用功能另測：學測考試不顯示。

## 檔案與衝突

- 你只新增自己的檔案，並在 App.tsx 加一行 import（導覽頁另加一行路由）。不要改 `features.ts`、`Step6.tsx` 的接入邏輯；需要新的接入點（例如首頁卡片）請先找 H1 的施工對話。
- 匯出內容的版面請沿用 `src/export/` 的 `model.ts`／`docxRender.ts`／`htmlRender.ts`（頁尾版本碼、字型內嵌）；標題用「考試名稱」變數，不寫死「模擬考」（D77③）。
