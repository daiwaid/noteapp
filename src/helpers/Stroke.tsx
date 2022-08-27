import { Box, Coord, IndexedObj, Point, Selectable } from '../Interfaces'
import { addSelectable, removeSelectable } from '../redux/selectableSlice'
import store from "../redux/store"
import { start } from 'repl'
import { cloneElement } from 'react'

export default class Stroke implements Selectable {
  id: number
  data: any
  private pathOffsets: Point[]
  length: number
  start: Point
  end: Point
  private scale: number // TODO: Eh maybe just remove or something idk. I think it's cool to have
  bounding: Box
  styles?: {color: string}

  public constructor() {
    const getID = (): number => {
      return store.getState().selectables.masterID
    }

    this.id = getID()
    this.pathOffsets = []
    this.length = 0
    this.start = undefined
    this.end = undefined
    this.scale = 1
    this.bounding = undefined
    this.styles = {color: 'black'}
  }

  /** Generates points from beginning of stroke to the end */
  public* getPoints(): Generator<Point, any, void> {
    yield this.start

    let prev = this.start
    const path = this.pathOffsets
    for (let i = 0; i < this.pathOffsets.length; i++) {
      const currPoint: Point = {x: prev.x + path[i].x, y: prev.y + path[i].y, p: path[i].p}
      prev = currPoint
      yield currPoint
    }
  }

  /** Generates points from end of stroke to beginning */
  public* getReversePoints(): Generator<Point, any, void> {
    yield this.end

    let prev = this.end
    const path = this.pathOffsets
    for (let i = path.length - 1; i >= 1; i--) {                                                      // done: is >= 1 correct here? double check
      const currPoint: Point = {x: prev.x - path[i].x, y: prev.y - path[i].y, p: path[i - 1].p}
      yield currPoint
    }
  }

  /** Adds point to the stroke */
  public addToPath = (point: Point): void => {                                  // done: should be fixed EXCEPT YOU NEED TO CALCULATE BOUNDING ON THE FLY
      // applies bezier to last coord in path before adding in new coord
      if (this.length === 0) {
        this.start = point
      }
      else {
        const pointOffset = {x: point.x - this.end.x, y: point.y - this.end.y, p: point.p}
        this.pathOffsets.push(pointOffset)
      }

      this.end = point
      this.length++
      this.updateBounding()
      // this.applyBezier()                                                                                              // TODO: Maybe reimplement later after bounding finished?
  }

  /** Updates the bounding with the last added point */
  private updateBounding(): void {
    if (this.length === 1) {
      this.bounding = {x0: 0, x1: 0, y0: 0, y1: 0}
    }
    else {
      const [xOffset, yOffset] = [this.end.x - this.start.x, this.end.y - this.start.y]
      const box = this.bounding

      if (xOffset < box.x0)      { box.x0 = xOffset }
      else if (xOffset > box.x1) { box.x1 = xOffset }
      if (yOffset < box.y0)      { box.y0 = yOffset }
      else if (yOffset > box.y1) { box.y1 = yOffset }
    }
  }

  /** Smooths out the second to last point if there are more than 3 points in the stroke */
  private applyBezier = (): void => {                                                     // done???: should be fixed. ACTUALLY MAYBE NOT. last 2 lines might be off by 1 for index
    /** Takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
      * (aka smoothes out the middle point) */
    const bezier = (p0: Coord, p1: Coord, p2: Coord): Coord => {
      return {x : .5 ** 2 * p0.x + 2 * .5 ** 2 * p1.x + .5**2 * p2.x, y : .5 ** 2 * p0.y + 2 * .5 ** 2 * p1.y + .5 **2 * p2.y}
    }

    const path = this.pathOffsets
    const len = path.length
    if (this.length >= 3) {
        const b0End: Coord = this.end // coord on canvas

        const b1Offset = path[len - 1]
        const b1End: Coord = {x: b0End.x - b1Offset.x, y: b0End.y - b1Offset.y}

        const b2Offset = path[len - 2]
        const b2End: Coord = {x: b1End.x - b2Offset.x, y: b1End.y - b2Offset.y}

        const n = bezier(b2End, b1End, b0End)
        path[len - 2].x = n.x - b2End.x
        path[len - 2].y = n.y - b2End.y
    }
  }

  /** Adds an offset [relative] to all points as well as the bounding box. */
  public addOffset = (offsetX: number, offsetY: number) => {                    // done: Should be fixed
    this.start.x += offsetX
    this.start.y += offsetY

    this.end.x += offsetX
    this.end.y += offsetY

    this.bounding.x0 += offsetX   // TODO: maybe use the helper
    this.bounding.x1 += offsetX
    this.bounding.y0 += offsetY
    this.bounding.y1 += offsetY
  }

    /** Applies post-processing to the stroke and calculates its bounding box and SVG. */
  public processStroke = () => {                                                  // TODO: Probably remove everything except calc svg
    this.addBoundingPadding()
    this.calculateSVG()
  }

  private addBoundingPadding() {
    const pad = 1   // width/2                                                    // TODO
    const box = this.bounding

    box.x0 -= pad
    box.y0 -= pad
    box.x1 += pad
    box.y1 += pad
  }

  /** Moves the bounding box and scales/moves the stroke to fit new box. */
  public moveBounding = (toMove: Box) => {                                      // FORME: Should work if toMove is what I think it is (offset)
    // calculates new bounding box
    const newBound = {x0: this.bounding.x0+toMove.x0, x1: this.bounding.x1+toMove.x1,
                      y0: this.bounding.y0+toMove.y0, y1: this.bounding.y1+toMove.y1}

    // moves start to top left of bounding box
    this.start.x += toMove.x0
    this.start.y += toMove.y0

    const moveX = toMove.x1 - toMove.x0
    const moveY = toMove.y1 - toMove.y0

    if (moveX !== 0) { // scales x
      const diffX = this.bounding.x1 - this.bounding.x0
      const scaleX = (diffX + moveX) / diffX
      
      for (const coord of this.pathOffsets) {
        coord.x *= scaleX
      }
    }
    if (moveY !== 0) { // scales y
      const diffY = this.bounding.y1 - this.bounding.y0
      const scaleY = (diffY + moveY) / diffY

      for (const coord of this.pathOffsets) {
        coord.y = scaleY
      }
    }

    this.bounding = newBound
  }

  public getMinBounds = (): {x: number, y: number} => {
    return {x: this.start.x + this.bounding.x0, y: this.start.y + this.bounding.y0}
  }
  public getMaxBounds = (): {x: number, y: number} => {
    return {x: this.start.x + this.bounding.x1, y: this.start.y + this.bounding.y1}
  }

  /** Calculates a stroke's SVG and assigns it to stroke.data. */
  public calculateSVG = () => {
    const dummyWidth = 2                                                        // TODO: Change later!!

    const strokeBounds = this.bounding
    const xDim = strokeBounds.x1 - strokeBounds.x0
    const yDim = strokeBounds.y1 - strokeBounds.y0
    const C2S = require('canvas2svg')
    const context = new C2S(xDim, yDim)

    const min = this.getMinBounds()
    const [xMin, yMin] = [min.x, min.y]

    console.log("BRUHMOMENTMRJEIKRJLKAJRKLAJ")
    console.log(this)
    console.log(xDim, yDim, xMin, yMin)

    const strokeColor = this.styles.color
    const start = {x: this.start.x-xMin, y: this.start.y-yMin}
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

      for (const coord of this.getPoints()) {
        context.lineTo(coord.x-xMin, coord.y-yMin)
      }
      context.stroke()
    // }

    let serializedSVG = context.getSerializedSvg()
    // console.log(serializedSVG)

    this.data = serializedSVG
  }

  /** Returns the shortest distance from the stroke to the point (x, y) */
  public distanceTo = (x: number, y: number): number => {                       // FORME: Eh maybe fixed?
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

    if (this.length === 0) {
      return undefined                                                                                // done: ehh maybe not?
    }
    else if (this.length === 1) {
      const p = this.start
      return Math.abs(p.x-x)+Math.abs(p.y-y)
    }
    else {
      let shortest = 999999                                                                           // meh: ehh
      const iter = this.getPoints()
      let p0: Point = this.start
      let p1Offset

      while ((p1Offset = iter.next().value) !== undefined) {                                          // TODO: does this work after the return type of the generator was set?
        const p1 = {x: p0.x + p1Offset.x, y: p0.y + p1Offset.y}
        const newDist = distance(x, y, p0.x, p0.y, p1.x, p1.y)
        shortest = shortest > newDist ? newDist : shortest
      }

      return shortest
    }
  }

  public clone = (): Stroke => {
    const copyPath = (path: Point[]) => {
      const newPath = []
      for (const point of path)
        newPath.push({...point})
      return newPath
    }

    let clone = new Stroke();

    clone.id = this.id
    clone.data = this.data
    clone.bounding = {...this.bounding}
    clone.pathOffsets = copyPath(this.pathOffsets)
    clone.length = this.length
    clone.start = {...this.start}
    clone.end = {...this.end}
    clone.scale = this.scale
    clone.styles = this.styles

    return clone
  }
}

/** Returns all strokes within selectableSlice as an array. */
export const getAllStrokes = (): Stroke[] => {                                                      // done: probably no issues
  const sel = store.getState().selectables.data

  return Object.keys(sel).reduce((strokes: Stroke[], id: string) => {
    if ("path" in sel[id]) strokes.push(sel[id])
    return strokes
  }, [])
}

/** Returns the last stroke in radius to the passed in [relative] coord. If none found, return null.  */
export const nearestStroke = (x: number, y: number, radius: number) => {                            // done: probably no issues
  const strokes = getAllStrokes()
  for (let i = strokes.length - 1; i >= 0; i--) { // loops through each stroke in strokes
    if (strokes[i].distanceTo(x, y) < radius) {
      return strokes[i].clone()
    }
  }
  return null
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