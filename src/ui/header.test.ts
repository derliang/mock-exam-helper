import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL_HEADER, DEFAULT_SEAT_HEADER, fillHeader, headerTemplates } from './header';

describe('表頭範本（校-54）', () => {
  it('新存檔（舊欄是預設值）用稿的預設範本，兩欄分開', () => {
    expect(headerTemplates({ headerText: '模擬考' })).toEqual({ seat: DEFAULT_SEAT_HEADER, label: DEFAULT_LABEL_HEADER });
    expect(headerTemplates({ headerText: '' })).toEqual({ seat: DEFAULT_SEAT_HEADER, label: DEFAULT_LABEL_HEADER });
  });
  it('舊存檔自訂過單一表頭：兩欄都帶入它', () => {
    expect(headerTemplates({ headerText: '範例高中模擬考' })).toEqual({ seat: '範例高中模擬考', label: '範例高中模擬考' });
  });
  it('新欄位有設就各用各的，優先於舊欄', () => {
    expect(headerTemplates({ headerText: '舊', seatHeader: 'A', labelHeader: 'B' })).toEqual({ seat: 'A', label: 'B' });
    expect(headerTemplates({ headerText: '舊', seatHeader: 'A' })).toEqual({ seat: 'A', label: '舊' });
  });
  it('占位符 {學年}{次別}{類型} 換成這次模擬考的內容（8 月起算新學年）', () => {
    expect(fillHeader(DEFAULT_SEAT_HEADER, { kind: 'gsat', round: 2, createdAt: '2026-10-01T02:00:00Z' })).toBe('【115學年第2次學測模擬考】座位表');
    expect(fillHeader('{學年}{類型}', { kind: 'bcct', createdAt: '2026-03-01T02:00:00Z' })).toBe('114會考');
  });
});
