/**
 * 空位格的斜線底紋（稿件：135° 兩色交錯，每條 1.2mm）。
 * Word 的內建圖樣只有極細的點狀，跟稿件差很多，所以改畫成圖片填進格子。
 * 純函式、不用 canvas（測試與瀏覽器都能跑）；PNG 用不壓縮的 deflate 區塊，單格約 2 萬位元組以內。
 */
const COLORS: [number, number, number][] = [
  [0xf1, 0xed, 0xe0],
  [0xe2, 0xdc, 0xc8],
];
const PX_PER_MM = 6;

let crcTable: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const be32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  return new Uint8Array([...be32(data.length), ...body, ...be32(crc32(body))]);
}

const cache = new Map<string, { data: Uint8Array; w: number; h: number }>();

/** 產生 wMm × hMm 的斜線底紋 PNG；回傳位元組與像素尺寸（同尺寸只算一次） */
export function hatchPng(wMm: number, hMm: number): { data: Uint8Array; w: number; h: number } {
  const key = `${Math.round(wMm * PX_PER_MM)}x${Math.round(hMm * PX_PER_MM)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = draw(wMm, hMm);
  cache.set(key, made);
  return made;
}

function draw(wMm: number, hMm: number): { data: Uint8Array; w: number; h: number } {
  const w = Math.max(1, Math.round(wMm * PX_PER_MM));
  const h = Math.max(1, Math.round(hMm * PX_PER_MM));
  // 每列前面一個濾鏡位元組（0）
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = ((x + y) / PX_PER_MM) * Math.SQRT1_2; // 沿 135° 方向的距離（mm）
      raw[y * (w + 1) + 1 + x] = Math.floor(t / 1.2) % 2;
    }
  }
  // zlib：標頭＋不壓縮區塊（每塊最多 65535）＋Adler32
  const blocks: number[] = [0x78, 0x01];
  const parts: Uint8Array[] = [];
  for (let i = 0; i < raw.length; i += 65535) {
    const len = Math.min(65535, raw.length - i);
    const last = i + len >= raw.length ? 1 : 0;
    parts.push(new Uint8Array([last, len & 255, len >>> 8, ~len & 255, (~len >>> 8) & 255]), raw.subarray(i, i + len));
  }
  let a = 1;
  let b = 0;
  for (let i = 0; i < raw.length; i++) {
    a = (a + raw[i]!) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  const zl = parts.reduce((n, p) => n + p.length, 0) + blocks.length + 4;
  const z = new Uint8Array(zl);
  z.set(blocks, 0);
  let zo = blocks.length;
  for (const p of parts) {
    z.set(p, zo);
    zo += p.length;
  }
  z.set(be32(adler), zo);
  const ihdr = new Uint8Array([...be32(w), ...be32(h), 8, 3, 0, 0, 0]);
  const plte = new Uint8Array(COLORS.flat());
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const out = [sig, chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', z), chunk('IEND', new Uint8Array())];
  const data = new Uint8Array(out.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of out) {
    data.set(p, o);
    o += p.length;
  }
  return { data, w, h };
}
