/**
 * 共用資料型別（施工A 定義；B、D、C 共用，要新增請開小 PR 或回報調度員）。
 * 稱呼（D49）：排＝左右，深位＝前後（由講臺往後 1、2、3…），座標寫「排－深位」。
 * 座位規則（D72）：座位中間不能禁用，空位只在最後；教室以「可用座位數」＋連續排列建模。
 * 純資料，不含畫面；全部可 JSON 序列化。
 */

/** 學部：國中部不分文理組（會考），高中部分文理組（D4/D9） */
export type Division = 'junior' | 'senior';
/** 考試類型：學測、分科（第一版灰階，D37）、會考 */
export type ExamKind = 'gsat' | 'ast' | 'bcct';
export type Track = 'science' | 'liberal';
export type Semester = 'first' | 'second';
/** 紙張：標籤可選 B4 或 A3（D57/D69）；座位表與名單固定 A4 */
export type LabelPaper = 'B4' | 'A3';

/** 學生編號：班級 2 位＋座號 2 位，例 "0101"（班 1 座號 1）、"0535" */
export type StudentCode = string;

/** 班級（設定頁，D61）；colorIndex 指向 12 色班級色表（D28/D60） */
export interface ClassInfo {
  /** 班級序號 1 起，與學生編號前兩碼對應 */
  no: number;
  /** 班級名稱，例 溫良恭儉勤誠 */
  name: string;
  division: Division;
  /** 高中部必填；國中部為 undefined（D9/D60） */
  track?: Track;
  colorIndex: number;
}

/** 學生名單項目（D62）：只存班級、座號、姓名（含學號），不存組別與考科 */
export interface Student {
  classNo: number;
  seatNo: number;
  name: string;
  /** 學校學號（可選，公開 repo 不得放真實值） */
  schoolId?: string;
  /** 高中部組別（只作紀錄；每次考試以考試名單的組別為準），國中部不使用 */
  groupCode?: string;
  /** 特殊生需求註明（只作紀錄，不影響標示） */
  special?: string;
}

/** 學生名單快照：新增模擬考時存一份（D62） */
export interface RosterSnapshot {
  division: Division;
  /** 取得時間（ISO 字串） */
  takenAt: string;
  students: Student[];
}

/** 教室種類：班級教室、預備教室（D6，預備座位不計入班級合計） */
export type ClassroomKind = 'class' | 'reserve';

/**
 * 教室。座位由排與深位組成：rows 排 × depth 深位；
 * seatCount ≤ rows*depth 為可用座位數。使用者可以任意指定哪些座位「不排」（disabled，2026-11-08 使用者裁示，修正 D72 的誤解：
 * 「空位只在最後」是排座演算法的結果規則——人由前往後連續坐、跳過不排的座位——不是限制使用者標示哪裡沒位子）。
 * 座位順序：第 1 排深位 1→depth，再第 2 排…，跳過 disabled，取前 seatCount 個。
 * 沒有 disabled 的舊資料：不排的座位就是順序最後的那幾個。
 */
export interface Classroom {
  id: string;
  name: string;
  kind: ClassroomKind;
  rows: number;
  depth: number;
  seatCount: number;
  /** 使用者指定「不排」的座位，格式「排-深位」，例 "2-3"；沒有就不設。seatCount 要同步成 rows*depth 減去它的數量 */
  disabled?: string[];
  /** 高中部班級教室所屬組別；國中部、預備教室不設（D4/D10） */
  track?: Track;
}

/** 座位座標：排－深位，皆 1 起 */
export interface SeatPos {
  row: number;
  depth: number;
}

/** 科目（D52：考科表自動帶入、可增刪改，不用節次） */
export interface Subject {
  id: string;
  name: string;
  /** 使用者改過預設時為 true，畫面標「已自訂」 */
  custom?: boolean;
  /** 誰要考：all＝每位考生都考、group＝依組別代碼決定（在步驟④設定）；沒設就依預設（見 subjects.ts） */
  who?: 'all' | 'group';
}

/** 是否全員參加（D64） */
export type Participation = 'all' | 'partial';

/** 標示方式：不考則標「X」、加考則標「+」（D5/D11） */
export type MarkMode = 'none' | 'mark-absent' | 'mark-extra';

/** 標示規則：某組別某科目如何標示（D12：接近一半時由使用者選，選完鎖定） */
export interface MarkRule {
  track?: Track;
  subjectId: string;
  mode: MarkMode;
  /** 使用者已裁示並鎖定（D12） */
  locked?: boolean;
}

/**
 * 標籤版面參數。格數待設計員補定（D72：非 48，7×7 或 8×6），故用參數表示、不寫死。
 */
export interface LabelLayout {
  paper: LabelPaper;
  cols: number;
  rows: number;
}

/** 一次模擬考的設定，隨該次保存（D34） */
export interface ExamConfig {
  id: string;
  name: string;
  kind: ExamKind;
  division: Division;
  semester: Semester;
  /** 學測第幾次（1～4）；決定數學是否分 A/B 與英聽（D36/D52） */
  round?: number;
  participation: Participation;
  /** D79：全科缺考者仍排座（預設不排） */
  seatFullyAbsent?: boolean;
  subjects: Subject[];
  markRules: MarkRule[];
  /** 本次勾選的教室 id（D65） */
  classroomIds: string[];
  labelLayout: LabelLayout;
  createdAt: string;
  /** 最後修改時間（ISO）；舊資料沒有這個欄位時以 createdAt 代替 */
  updatedAt?: string;
  /** false＝使用者在步驟①按了「不沿用，從空白開始」；沒設＝沿用上一次同類型的設定 */
  carry?: boolean;
}

/** 考試名單一筆（D63）：誰參加、考什麼科 */
export interface ExamEntry {
  classNo: number;
  seatNo: number;
  name: string;
  /** 大考中心組別代碼（D15），原樣保存 */
  groupCode?: string;
  /** 實際考的科目 id */
  subjectIds: string[];
  /** 特殊生需求等備註（D15） */
  note?: string;
}

/** 名單比對差異（D42/D54/D64） */
export type RosterDiffKind =
  | 'only-in-exam' // 考試名單有、學生名單沒有
  | 'only-in-roster' // 學生名單有、考試名單沒有（部分參加時不產生）
  | 'mismatch'; // 同一人班級／座號／姓名不一致
export type RosterDiffChoice = 'use-exam' | 'use-roster' | 'manual';

export interface RosterDiff {
  kind: RosterDiffKind;
  code: StudentCode;
  exam?: Pick<ExamEntry, 'classNo' | 'seatNo' | 'name'>;
  roster?: Pick<Student, 'classNo' | 'seatNo' | 'name'>;
  /** 使用者處理結果；全部有值才能排座（D42） */
  choice?: RosterDiffChoice;
  /** choice 為 manual 時的編輯結果 */
  edited?: Pick<Student, 'classNo' | 'seatNo' | 'name'>;
}

/** 覆寫：獨立檔案，重排後重套並走驗證器（D23）。目前只有單人特例（D26） */
export interface SingleOverride {
  kind: 'single';
  code: StudentCode;
  /** 自填地點，例 教務處 */
  location: string;
  /** 考試或自習 */
  purpose: 'exam' | 'study';
  /** 各科各自的用途（#66）：沒設的科目依標示方向（＋加考→考試、X不考→自習）；舊資料只有 purpose */
  purposes?: Record<string, 'exam' | 'study'>;
}
export type Override = SingleOverride;

/** 一個座位的分配 */
export interface SeatAssignment extends SeatPos {
  classroomId: string;
  code: StudentCode;
}

/** 學生在某科的標示（D5：標示即抽離） */
export interface Mark {
  code: StudentCode;
  subjectId: string;
  mode: 'absent' | 'extra';
}

/** 抽離（D27）：每節科目各自計算 */
export interface Detach {
  code: StudentCode;
  subjectId: string;
  /** exam＝抽離考試（要座位）；study＝抽離自習（只出名單，D7） */
  purpose: 'exam' | 'study';
  roomId: string;
  seat?: SeatPos;
}

/** 資料版本碼：事後核對印出的表是否對應現在的名單與設定（D66） */
export type DataVersion = string;

/** 排座結果（D22：存檔；名單或設定改了標「過期」） */
export interface SeatingResult {
  examId: string;
  generatedAt: string;
  dataVersion: DataVersion;
  assignments: SeatAssignment[];
  marks: Mark[];
  detaches: Detach[];
  overrides: Override[];
}

/** 設定頁資料夾層級固定資訊（D61） */
export interface Settings {
  schoolName: string;
  /** 座位表與標籤的固定表頭文字 */
  headerText: string;
  defaultLabelPaper: LabelPaper;
  /** 標籤下方注意事項框的文字（每行一句，**粗體**）；沒有這個欄位（舊存檔）＝預設文字，空字串＝不印 */
  labelNotes?: string;
  classes: ClassInfo[];
  /** 教室常用清單（D65） */
  classrooms: Classroom[];
  /** 考試名單科目標示的對應（E 包）：標示寫法 → 科目 id 或 ignore，可重用 */
  markMap?: Record<string, string>;
  /** 選用功能開關（D75）：功能 id → 是否開啟；沒有這個欄位或沒寫的功能一律視為關 */
  features?: Record<string, boolean>;
}

/** 磁碟檔案外殼：版本與損壞偵測用（D21） */
export interface FileEnvelope<T> {
  schemaVersion: number;
  data: T;
}
