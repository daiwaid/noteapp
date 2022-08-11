import { Point, History, Stroke } from "../Interfaces";

export const copyStroke = (stroke: Stroke): Stroke => {
  return {
    id: stroke.id,
    data: stroke.data,
    bounding: {...stroke.bounding},
    path: copyPath(stroke.path),
    length: stroke.length,
    start: {...stroke.start},
    styles: {...stroke.styles}
  }
}

export const copyHistory = (history: History): History => {
  const newHist: History = {
    action: history.action,
    data: [],
    log: undefined
  }
  for (const obj of history.data) {
    newHist.data.push(copyStroke(obj))
  }
  if (!history.log) return newHist

  switch (history.action) {
    case 'move':
      newHist.log = {...history.log}; break;
    case 'scale':
      newHist.log = {moved: {...history.log.moved}}; break;
    default: break;
  }
  return newHist
}

const copyPath = (path: Point[]) => {
  const newPath = []
  for (const point of path)
    newPath.push({...point})
  return newPath
}