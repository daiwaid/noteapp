import { Box, Coord, IndexedObj, Point, Stroke } from '../Interfaces'
import { copyStroke } from './deepCopy'
import { addSelectable, removeSelectable } from '../redux/selectableSlice'
import store from "../redux/store"

/** Generates a new stroke with a unique ID. */
export const generate = (): Stroke => {
  return {
    id: getID(),
    path: [],
    length: 0,
    start: undefined,
    bounding: undefined,
    styles: {color: 'black'}
  }
}

/** Returns the shortest distance from the stroke to the point (x, y) */
export const distanceTo = (stroke: Stroke, x: number, y: number): number => {
  let shortest = 9999999
  if (stroke.length === 1) { // if only 1 point in stroke
    const p = stroke.path[0]
    return Math.abs(p.x-x)+Math.abs(p.y-y)
  }
  for (let i = 0; i < stroke.length-1; i++) {
    const p0 = stroke.path[i]
    const p1 = stroke.path[i+1]
    const newDist = distance(x, y, p0.x, p0.y, p1.x, p1.y)
    shortest = shortest > newDist ? newDist : shortest
  }
  return shortest
}

/** Adds an offset [relative] to all points as well as the bounding box. */
export const addOffset = (stroke: Stroke, offsetX: number, offsetY: number) => {
  if (offsetX === 0 && offsetY === 0) return
  for (const point of stroke.path) {
    point.x += offsetX
    point.y += offsetY
  }
  stroke.start.x += offsetX
  stroke.start.y += offsetY
  stroke.bounding.x0 += offsetX
  stroke.bounding.x1 += offsetX
  stroke.bounding.y0 += offsetY
  stroke.bounding.y1 += offsetY
}

/** Returns all strokes within selectableSlice as an array. */
export const getAllStrokes = (): Stroke[] => {
  const sel = store.getState().selectables.data

  return Object.keys(sel).reduce((strokes: Stroke[], id: string) => {
    if ("path" in sel[id]) strokes.push(sel[id])
    return strokes
  }, [])
}

/** Returns the last stroke in radius to the passed in [relative] coord. If none found, return null.  */
export const nearestStroke = (x: number, y: number, radius: number) => {
  const strokes = getAllStrokes()
  for (let i = strokes.length - 1; i >= 0; i--) { // loops through each stroke in strokes
    if (distanceTo(strokes[i], x, y) < radius) {
      return copyStroke(strokes[i])
    }
  }
  return null
}

/** Takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
  * (aka smoothes out the middle point) */
export const bezier = (p0: Coord, p1: Coord, p2: Coord): Coord => {
  return {x : .5 ** 2 * p0.x + 2 * .5 ** 2 * p1.x + .5**2 * p2.x, y : .5 ** 2 * p0.y + 2 * .5 ** 2 * p1.y + .5 **2 * p2.y}
}

/** Converts coords from absolute to relative and vice versa, returns a NEW coord object.
  * Can optionally pass in a different offset &/ scale. */
export const processCoord = (coord: Coord, toRelative=true, offset: Coord=undefined, scale: number=undefined): Coord => {
  const newCoord = {x: coord.x, y: coord.y}
  if (!offset) offset = store.getState().page.offset
  if (!scale) scale = store.getState().page.scale

  if (toRelative) { // to relative
    newCoord.x = newCoord.x / scale + offset.x
    newCoord.y = newCoord.y / scale + offset.y
  }
  else { // from relative
    newCoord.x = (newCoord.x - offset.x) * scale
    newCoord.y = (newCoord.y - offset.y) * scale
  }
  return newCoord
}

/** Applies post-processing to the stroke and calculates its bounding box and SVG. */
export const processStroke = (stroke: Stroke) => {
  let i = 1, r = 0
  let c0 = stroke.start
  const bounding = {x0: c0.x, x1: c0.x, y0: c0.y, y1: c0.y} // initializes the bounding box
  const w = 1 // width/2                    TODO

  while (i+r+2 < stroke.path.length) {
    // get the next 5 coords
    const c1 = stroke.path[i]
    const c2 = stroke.path[i+r+1]
    const c3 = stroke.path[i+r+2]

    // calculate angles between prevVec & lVect, lVect & rVect
    const angle1 = angle(c0, c1, c2)
    const angle2 = angle(c1, c2, c3)

    // calculate vectors
    const vect1 = {x: c2.x-c1.x, y: c2.y-c1.y}
    const vect2 = {x: c3.x-c2.x, y: c3.y-c2.y}
    // get the ratio of |lVec|/|rVec| and cap it to < 10px (reg ~0.4px)
    let lengthDiff = (vect1.x**2 + vect1.y**2) / (vect2.x**2 + vect2.y**2) / 10 - 1
    if (lengthDiff < 0) lengthDiff = 0
    else if (lengthDiff > 5) lengthDiff = 5

    // if the incomming angle is close to the outgoing anlge, and the two angles are going in opposite directions
    const closeAngle = Math.max(Math.abs(angle1), Math.abs(angle2)) < (0.3 + lengthDiff/5) && Math.sign(angle1) - Math.sign(angle2) !== 0

    if (closeAngle) {
      stroke.path[i+1+r] = undefined // remove the middle coord
      r++
    }
    else {
      c0 = c1
      i = i + r + 1
      r = 0

      // updates bounding
      if (c1.x-w < bounding.x0) bounding.x0 = c1.x-w
      else if (c1.x+w > bounding.x1) bounding.x1 = c1.x+w
      if (c1.y-w < bounding.y0) bounding.y0 = c1.y-w
      else if (c1.y+w > bounding.y1) bounding.y1 = c1.y+w
    }
  }

  // updates bounding box for final few coords
  for (i = stroke.path.length-2; i < stroke.path.length; i++) {
    const c = stroke.path[i]
    if (!c) continue
    if (c.x-w < bounding.x0) bounding.x0 = c.x-w
    else if (c.x+w > bounding.x1) bounding.x1 = c.x+w
    if (c.y-w < bounding.y0) bounding.y0 = c.y-w
    else if (c.y+w > bounding.y1) bounding.y1 = c.y+w
  }

  // removes null values and updates length & bounding
  stroke.path = stroke.path.filter(Boolean)
  stroke.length = stroke.path.length
  stroke.bounding = bounding
  calculateSVG(stroke)
}

/** Moves the bounding box and scales/moves the stroke to fit new box. */
export const moveBounding = (stroke: Stroke, toMove: Box) => {
  // calculates new bounding box
  const newBound = {x0: stroke.bounding.x0+toMove.x0, x1: stroke.bounding.x1+toMove.x1,
                    y0: stroke.bounding.y0+toMove.y0, y1: stroke.bounding.y1+toMove.y1}

  // moves points to top left
  for (const coord of stroke.path) {
    coord.x += toMove.x0
    coord.y += toMove.y0
  }

  const moveX = toMove.x1 - toMove.x0
  const moveY = toMove.y1 - toMove.y0

  if (moveX !== 0) { // scales x
    const diffX = stroke.bounding.x1 - stroke.bounding.x0
    const scaleX = (diffX + moveX) / diffX
    
    for (const coord of stroke.path) {
      coord.x = newBound.x0 + (coord.x-newBound.x0) * scaleX
    }
  }
  if (moveY !== 0) { // scales y
    const diffY = stroke.bounding.y1 - stroke.bounding.y0
    const scaleY = (diffY + moveY) / diffY
    for (const coord of stroke.path) {
      coord.y = newBound.y0 + (coord.y-newBound.y0) * scaleY
    }
  }

  stroke.start = {x: stroke.path[0].x, y: stroke.path[0].y}
  stroke.bounding = newBound
}

const normalize = (stroke: Stroke) => {
  for (const point of stroke.path) {
    point.x -= stroke.start.x
    point.y -= stroke.start.y
  }
}

/** Calculates a stroke's SVG and assigns it to stroke.data. */
export const calculateSVG = (stroke: Stroke) => {
  const dummyWidth = 2                                                        // TODO: Change later!!

  const strokeBounds = stroke.bounding
  const xDim = strokeBounds.x1 - strokeBounds.x0
  const yDim = strokeBounds.y1 - strokeBounds.y0
  const C2S = require('canvas2svg')
  const context = new C2S(xDim, yDim)

  const [xMin, yMin] = [strokeBounds.x0, strokeBounds.y0]

  const strokeColor = stroke.styles.color
  const start = {x: stroke.start.x-xMin, y: stroke.start.y-yMin}
  // if (stroke.constructor.name === 'PressureStroke') {
  //   const pStroke = stroke as PressureStroke
  //   let region = new Path2D()
  //   context.fillStyle = strokeColor

  //   for (const coord of pStroke.getOutline()) {
  //     coord.x -= xMin
  //     coord.y -= yMin

  //     region.lineTo(coord.x, coord.y)
  //   }

  //   region.closePath()
  //   context.fill(region)
  // }
  // else {
    context.beginPath()
    context.strokeStyle = strokeColor
    context.lineWidth = dummyWidth
    context.moveTo(start.x, start.y)
    context.arc(start.x, start.y, dummyWidth/10, 0, Math.PI*2)

    for (const coord of stroke.path)
      context.lineTo(coord.x-xMin, coord.y-yMin)
    context.stroke()
  // }

  let serializedSVG = context.getSerializedSvg()
  // console.log(serializedSVG)

  stroke.data = serializedSVG
}

const getID = (): number => {
  return store.getState().selectables.masterID
}

/** Finds the distance between a point and a line formed by 2 points in 2D */
const distance = (px: number, py: number, lx0: number, ly0: number, lx1: number, ly1: number): number => {
  const ux = px - lx0
  const uy = py - ly0
  const vx = lx1 - lx0
  const vy = ly1 - ly0
  const wx = px - lx1
  const wy = py - ly1
  const magU = Math.sqrt(ux**2 + uy**2)
  const magV = Math.sqrt(vx**2 + vy**2)
  const magW = Math.sqrt(wx**2 + wy**2)

  // check if angle is < 90, aka cos(ang) > 0
  const angleL = (ux*vx + uy*vy) / (magU * magV)
  const angleR = (-vx*wx - vy*wy) / (magV * magW)
  let dist: number
  if (angleL > 0) {
    if (angleR > 0) dist = Math.abs(ux*vy - uy*vx) / magV
    else dist = magW
  }
  else dist = magU
  return dist
}

/** Returns the angle difference between <p0, p1> and <p1, p2>. */
const angle = (p0: Coord, p1: Coord, p2: Coord): number => {
  const v0 = {x: p1.x-p0.x, y: p1.y-p0.y}
  const v1 = {x: p2.x-p1.x, y: p2.y-p1.y}

  const ang = Math.acos((v0.x*v1.x + v0.y*v1.y) / Math.sqrt((v0.x**2+v0.y**2) * (v1.x**2+v1.y**2))) // dot product
  const dir = Math.sign(v0.y * v1.x - v0.x * v1.y) // cross product
  
  
  return ang * dir
}