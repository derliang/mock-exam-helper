/**
 * JSON 檔案外殼、版本與損壞偵測（D21）。
 * 格式：{ schemaVersion, checksum, data }；checksum 是 data 序列化後的 FNV-1a 32 位元雜湊。
 * 被手改或寫壞時 decode 會回報原因，絕不吞掉錯誤、不回傳半份資料。
 */
import type { FileEnvelope } from './types';

export const SCHEMA_VERSION = 1;

export type DecodeError = 'parse' | 'shape' | 'checksum' | 'newer-version';
export type Decoded<T> = { ok: true; data: T } | { ok: false; reason: DecodeError; message: string };

/** FNV-1a 32 位元，輸出 8 位小寫十六進位 */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

interface Stored<T> extends FileEnvelope<T> {
  checksum: string;
}

export function encode<T>(data: T): string {
  const body = JSON.stringify(data);
  const env = `{"schemaVersion":${SCHEMA_VERSION},"checksum":"${checksum(body)}","data":${body}}`;
  return env;
}

const fail = (reason: DecodeError, message: string): Decoded<never> => ({ ok: false, reason, message });

export function decode<T>(text: string, validate?: (data: unknown) => data is T): Decoded<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('parse', '檔案不是有效的 JSON，可能已損壞');
  }
  if (typeof raw !== 'object' || raw === null) return fail('shape', '檔案格式不符');
  const env = raw as Partial<Stored<unknown>>;
  if (typeof env.schemaVersion !== 'number' || typeof env.checksum !== 'string' || !('data' in env)) {
    return fail('shape', '檔案格式不符');
  }
  if (env.schemaVersion > SCHEMA_VERSION) {
    return fail('newer-version', '檔案來自較新的版本，請更新程式後再開啟');
  }
  if (checksum(JSON.stringify(env.data)) !== env.checksum) {
    return fail('checksum', '檔案內容與驗證碼不符，可能被手動修改或已損壞');
  }
  if (validate && !validate(env.data)) return fail('shape', '檔案內容結構不符');
  return { ok: true, data: env.data as T };
}
