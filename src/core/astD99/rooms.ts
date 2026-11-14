/**
 * 教室資料 → 分科新模型（D99）的規劃教室。只讀、不改存檔。
 * - 本次可用：沿用步驟③ 勾選的教室（ExamConfig.classroomIds；ast-spec-gap D-12，不另做開關）；綜合教室（kind＝reserve）可多間。
 * - 座位：classroomSeats（每排深位數可不同、跳過停用座位）。
 * - 自習容量：studyCapacityOf（沒設＝可用座位數；程式不自行調大）。
 * - 原班：班級教室與班級以名稱對應（現行資料就是這樣對的，見 helpers.roomDivision）；文理組取教室自己的 track，沒有就取班級的。
 */
import type { ClassInfo, Classroom } from '../../data/types';
import { classroomSeats, studyCapacityOf } from '../../data/helpers';
import type { PlanRoom } from './contract';

export function toPlanRooms(classrooms: readonly Classroom[], selectedIds: readonly string[], classes: readonly ClassInfo[]): PlanRoom[] {
  const picked = new Set(selectedIds);
  return classrooms
    .filter((c) => picked.has(c.id))
    .map((c) => {
      const cls = c.kind === 'class' ? classes.find((k) => k.name === c.name && (!c.division || k.division === c.division)) : undefined;
      const track = c.kind === 'class' ? c.track ?? cls?.track : undefined;
      return {
        id: c.id,
        kind: c.kind,
        ...(cls ? { classNo: cls.no } : {}),
        seats: classroomSeats(c),
        studyCapacity: studyCapacityOf(c),
        ...(track ? { track } : {}),
      };
    });
}
