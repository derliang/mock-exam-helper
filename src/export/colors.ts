/** 12 色班級色（DESIGN.md §二，淺色）：底／線／字。colorIndex 1 起；匯出為紙本，固定用淺色版。 */
export interface ClassColor {
  bg: string;
  line: string;
  fg: string;
}
export const CLASS_COLORS: ClassColor[] = [
  { bg: 'FBE7C6', line: 'E0B365', fg: '6B4300' },
  { bg: 'D8EFD3', line: '8CC784', fg: '1F5A1A' },
  { bg: 'D6E6F8', line: '8DB4E2', fg: '1A4478' },
  { bg: 'E7DCF5', line: 'B39DD9', fg: '4A2E80' },
  { bg: 'F6D6EC', line: 'D98ABF', fg: '7A1C5E' },
  { bg: 'F9D5CA', line: 'E58A70', fg: '7A2A12' },
  { bg: 'CDEDE9', line: '6FC0B6', fg: '0F5A52' },
  { bg: 'E6EDBD', line: 'B5C752', fg: '4C5A0A' },
  { bg: 'DADCF7', line: '9A9FE0', fg: '2F3490' },
  { bg: 'EBDCCB', line: 'C09A72', fg: '5C3A17' },
  { bg: 'DFE3E8', line: '9AA5B1', fg: '2F3B48' },
  { bg: 'F8D3DC', line: 'E08AA0', fg: '7A1B38' },
];
export function classColor(colorIndex: number): ClassColor {
  const n = CLASS_COLORS.length;
  return CLASS_COLORS[(((colorIndex - 1) % n) + n) % n]!;
}
