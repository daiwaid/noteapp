import { Point, History } from "../Interfaces";

export const copyHistory = (history: History): History => {
  const newHist: History = {
    action: history.action,
    data: [],
    log: undefined
  }
  for (const obj of history.data) {
    newHist.data.push(obj.clone())
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