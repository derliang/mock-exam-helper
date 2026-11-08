/** 列印對位測試頁接入選用功能機制（H6，D75）：只在匯出頁多一個勾選項；功能關閉時不會被取出 */
import { ALIGN_PAPERS, renderAlignmentHtml } from '../../export/alignment';
import type { OutputFile } from '../../export/plan';
import { registerFeature, type ExportExtra } from '../features';

export const alignmentExport: ExportExtra = {
  key: 'print-alignment',
  title: '列印對位測試頁（A4、B4、A3）',
  sub: '先印這張確認 100% 縮放與邊界沒被裁掉，再印正式座位表與標籤；Word 與 PDF 都給列印用頁面',
  run: async (): Promise<OutputFile[]> => [{
    name: '列印對位測試頁-列印用頁面.html',
    mime: 'text/html',
    data: renderAlignmentHtml({ generatedAt: new Date().toISOString(), dataVersion: '對位測試' }),
    desc: `${ALIGN_PAPERS.length} 頁（A4、B4、A3 各一），開啟後選「列印」，縮放 100%、邊界「無」`,
    pages: ALIGN_PAPERS.length,
  }],
};

registerFeature('print-alignment', { exportItems: [alignmentExport] });
