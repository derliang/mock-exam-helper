/** 出缺席記錄表接入選用功能機制（H5，D75）：只在匯出頁多一個勾選項；功能關閉時不會被取出 */
import { buildAttendancePages } from '../../export/attendance';
import { renderPrintHtml } from '../../export/htmlRender';
import type { OutputFile } from '../../export/plan';
import { prepareExport } from '../exportInput';
import { registerFeature, type ExportExtra } from '../features';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const safe = (s: string): string => s.replace(/[\/:*?"<>|]/g, '_').trim() || '考試';

export const attendanceExport: ExportExtra = {
  key: 'attendance',
  title: '出缺席記錄表（A4）',
  sub: '每間教室一頁，照座位順序列出考生，每科留一格打勾；不考的科目與抽離去處已標明',
  run: async ({ doc, exam, format }): Promise<OutputFile[]> => {
    const prepared = prepareExport(doc, exam);
    if (!prepared.ok) throw new Error(prepared.errors.join('；'));
    const pages = buildAttendancePages(prepared.input);
    const meta = { generatedAt: prepared.input.result.generatedAt, dataVersion: prepared.input.result.dataVersion };
    const base = `${safe(exam.name)}-出缺席記錄表`;
    const desc = `${pages.length} 頁以上（每間教室一頁，人多會接下一頁）`;
    if (format === 'pdf') {
      return [{ name: `${base}-列印用頁面.html`, mime: 'text/html', data: renderPrintHtml({ table: pages }, meta), desc: `${desc}，開啟後選「另存為 PDF」`, pages: pages.length }];
    }
    const { fonts } = await (await import('../../export/fontLoader')).loadFonts();
    const { renderDocx } = await import('../../export/docxRender');
    return [{ name: `${base}.docx`, mime: DOCX_MIME, data: await renderDocx({ table: pages }, { fonts, ...meta }), desc, pages: pages.length }];
  },
};

registerFeature('attendance-sheet', { exportItems: [attendanceExport] });
