import { registerFeature } from '../features';

/** 考生查詢（H4，D77②）：頂端導覽多一個獨立頁；預設關，設定頁勾選才出現 */
registerFeature('student-lookup', { nav: { label: '考生查詢', route: { page: 'lookup' } } });
