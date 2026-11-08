import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copyrightText, formatVersion, preLabel, APP_VERSION } from './version';

describe('版本字串', () => {
  it('加 v 前綴，含 beta 標示', () => {
    expect(formatVersion('0.1.0-beta.1')).toBe('v0.1.0-beta.1');
    expect(formatVersion('1.2.3')).toBe('v1.2.3');
  });
  it('格式不對時不壞掉', () => {
    expect(formatVersion('')).toBe('v?');
    expect(formatVersion('abc')).toBe('v?');
  });
  it('預發布標籤', () => {
    expect(preLabel('0.1.0-beta.1')).toBe('beta');
    expect(preLabel('1.0.0-rc.2')).toBe('rc');
    expect(preLabel('1.0.0')).toBe('');
  });
  it('版權文字', () => {
    expect(copyrightText(2026, '某某')).toBe('© 2026 某某');
    expect(copyrightText()).toBe('© 2026 derliang');
  });
  it('注入值等於 package.json（單一來源）', () => {
    const v = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
    expect(APP_VERSION).toBe(v);
  });
});
