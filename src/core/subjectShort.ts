/** 座位表與標籤上的科目簡稱（稿 H-3：「X數B」不是「X數學B」，標籤格內才放得下）。其他科目維持原名 */
export function subjectShort(name: string): string {
  return name.replace(/^數學(?=[ABab甲乙])/, '數');
}
