# 排座核心介面（`src/core`）

> 給施工C（畫面）與施工D（輸出）用。全部是純函式：不讀寫檔、不碰畫面、不取現在時間。
> 型別定義在 `src/data/types.ts`，由施工A 維護；核心沒有新增共用型別。
> 範例一律是假資料。

## 一、建議用法：只呼叫 `runSeating`

```ts
import { runSeating } from '../core';

const r = runSeating({
  examId: 'E1',
  division: 'senior',                 // 'junior' 國中部不分組；'senior' 理組／文組各自排
  classes,                            // ClassInfo[]，高中部每班要有 track
  classrooms,                         // 本次勾選的教室，依清單順序（班級教室＋預備教室）
  entries,                            // ExamEntry[]：誰參加、考哪些科
  subjects,                           // Subject[]
  markRules,                          // MarkRule[]：使用者確認後的標示規則
  overrides,                          // Override[]：單人特例
  now: new Date().toISOString(),      // 產生時間由呼叫端給
});

if (!r.ok) {
  // r.errors: string[]，中文、可直接顯示；只含考生編號，不含姓名
  // 例：['理組：座位不足：考生 139 人，座位 130 個，還差 9 個']
} else {
  r.result;    // SeatingResult：存檔用（施工A 的存檔層）
  r.special;   // SpecialPlacement[]：單人特例的地點（D26），印在座位表或抽離名單上
  r.warnings;  // string[]：單人特例對不上名單等提醒（D23），不擋排座
}
```

不合硬規則時一定回 `ok: false`，絕不輸出部分結果（D25）。

**全科缺考（D79）**：`subjectIds` 為空的考生預設**不排座**、不計份數，編號回在 `r.fullyAbsent`（`seatFullyAbsent: true` 才照排；有開時才進資料版本碼，舊存檔不會變過期）。畫面開關存在 `ExamConfig.seatFullyAbsent`。
**單人特例（D80）**：`special[].purpose` 以覆寫的 `purpose` 為準，不看標示方向；`specialOf(result)` 同。

## 二、結果結構

`SeatingResult`（`types.ts`）：

| 欄位 | 內容 |
|---|---|
| `assignments: SeatAssignment[]` | `{ classroomId, row, depth, code }`，依座位順序。row＝排（左右，1 起），depth＝深位（前後，1 在講臺邊） |
| `marks: Mark[]` | `{ code, subjectId, mode: 'absent' \| 'extra' }`；absent＝不考（標 X，抽離自習），extra＝加考（標 +，抽離考試）。不含顏色，顏色屬畫面層 |
| `detaches: Detach[]` | 抽離考試：`purpose: 'exam'` 有 `seat`；抽離自習：`purpose: 'study'` 沒有 `seat`，順序就是名單順序 |
| `overrides` | 本次套用的單人特例原樣保存 |
| `dataVersion` | `XXXX-XXXX-XXXX`，印在頁尾（D66）。名單或設定改了就會變；產生時間不影響 |

`SpecialPlacement`：`{ code, subjectId, purpose: 'exam' | 'study', location }`。單人特例保留原座位，不排進預備教室。

## 三、輸出與畫面要用的輔助函式

| 函式 | 用途 |
|---|---|
| `roomStats(classroomId, assignments, entries, subjects, detaches, special?)` → `RoomStats` | 座位表統計（D40）：`total`、`perClass[{classNo, count}]`、`perSubject[{subjectId, taking, detachedOut, inRoom, inRoomPerClass}]`。inRoom＝在本教室考這科的人數；**傳入 `special`（單人特例）時，到他處考試的人也扣掉**，不傳則和舊版相同 |
| `specialOf(result)` → `{code, subjectId, purpose, location}[]` | 由存檔的 `SeatingResult`（只存 overrides）推回單人特例；匯出統計請用 `roomStats(..., result.detaches, specialOf(result))`，才會和 ⑤ 畫面一致 |
| `detachRoomCounts(detaches, subjectId, roomId)` | 抽離教室的總人數與每班人數 |
| `suggestMarks(entries, classes, subjects)` → `MarkSuggestion[]` | 標示建議（D11）：每組每科一筆 `{track?, subjectId, total, taking, suggested, needsDecision}`。`needsDecision` 為 true 時畫面要讓使用者選、選完鎖定（D12） |
| `NEAR_HALF_RATIO` | 「接近一半」的門檻，目前是 0.4：少數方占比達到就要使用者選。這是暫定值，待使用者確認 |
| `isListeningSubject(subject)` | 英聽判定（D67），不參與標示與抽離 |
| `seatingVersion(input)` | 不排座、只算版本碼：用來判斷存檔的結果是否「過期」（D22） |
| `validateSeating(...)` | 驗證器。`runSeating` 已內建；只有畫面另外改座位時才需要直接呼叫 |
| `seatLabel(pos)`（`src/data/helpers`） | 座標字串「排－深位」，例 `1-2` |

## 四、範例（假資料）

兩班、一間 1 排 × 3 深位的教室，加一間預備教室：

```ts
classes = [
  { no: 1, name: '溫', division: 'senior', track: 'science', colorIndex: 0 },
  { no: 2, name: '良', division: 'senior', track: 'liberal', colorIndex: 1 },
];
classrooms = [
  { id: 'S', name: '溫', kind: 'class', rows: 1, depth: 3, seatCount: 3, track: 'science' },
  { id: 'L', name: '良', kind: 'class', rows: 1, depth: 3, seatCount: 3, track: 'liberal' },
  { id: 'P', name: '預備一', kind: 'reserve', rows: 1, depth: 4, seatCount: 4 },
];
entries = [
  { classNo: 1, seatNo: 1, name: '測試甲', subjectIds: ['soc'] },
  { classNo: 1, seatNo: 2, name: '測試乙', subjectIds: ['sci'] },
  { classNo: 2, seatNo: 1, name: '測試丙', subjectIds: ['soc', 'sci'] },
];
markRules = [
  { track: 'science', subjectId: 'soc', mode: 'mark-absent' },
  { track: 'liberal', subjectId: 'sci', mode: 'mark-extra' },
];
// 結果：
// assignments: S 1-1 0101、S 1-2 0102、L 1-1 0201
// marks:       0102 社會 absent、0201 自然 extra
// detaches:    0102 社會自習 → P；0201 自然考試 → P 1-1
```

這個範例同時是 `src/core/core.test.ts`〈runSeating 整合入口〉的測試資料。

## 五、排座規則摘要（D73）

各教室依清單順序，每排給輪到的下一班，班序跨教室延續；該班用完，就在同一排接下一班。結果是：同班編號沿座位嚴格遞增、同排不同班不穿插、空位只在該組最後一間的尾端。高中部理組、文組分開排，國中部全體一起排。這個排法已用舊座位表驗證，見 `docs/dispatch/完工-B.md`。
