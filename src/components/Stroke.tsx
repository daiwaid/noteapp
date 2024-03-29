import { Box, Coord, Point } from '../Interfaces'

/**
 * Wrapper class for strokes
 */
export default class Stroke {

  /************************
          Variables
  ************************/
 
  private static masterID: number = 0
  private id: number
  protected path: Point[]
  private start: Coord
  private style: string|CanvasGradient|CanvasPattern
  protected width: number
  private bounding: Box // bounding area (rectangle)

  public constructor() {
    this.path = []
    this.style = 'black'
    this.width = 2
    this.id = Stroke.masterID++
  }


  /************************
        Functions
  ************************/

  public addToPath (x: number, y: number, pressure: number): void {
    if (this.getLength() === 0) {
      this.setStart(x, y)
    }

    const newPoint = {x: x, y: y, p: pressure}
    
    if (this.getLength() >= 2) { // smooths path
      const {newX, newY} = Stroke.bezier(this.getCoord(-2), this.getCoord(-1), newPoint)
      this.setCoord(-1, {x: newX, y: newY})
    }

    this.path.push(newPoint)
  }

  /** Returns the shortest distance from the stroke to the point (x, y) */
  public distanceTo = (x: number, y: number): number => {
    let shortest = 9999999
    if (this.getLength() === 1) { // if only 1 point in stroke
      const p = this.getCoord(0)
      return Math.abs(p.x-x)+Math.abs(p.y-y)
    }
    for (let i = 0; i < this.getLength()-1; i++) {
      const p0 = this.getCoord(i)
      const p1 = this.getCoord(i+1)
      const newDist = Stroke.distance(x, y, p0.x, p0.y, p1.x, p1.y)
      shortest = shortest > newDist ? newDist : shortest
    }
    return shortest
  }

  /** Calls when a stroke is finished, applies post processing. */
  public done = (): void => {
    let i = 1, r = 0
    let c0 = this.getCoord(0)
    this.bounding = {x0: c0.x, x1: c0.x, y0: c0.y, y1: c0.y} // initializes the bounding box
    const w = this.width/2

    while (i+r+2 < this.getLength()) {
      // get the next 5 coords
      const c1 = this.getCoord(i)
      const c2 = this.getCoord(i+r+1)
      const c3 = this.getCoord(i+r+2)

      // calculate angles between prevVec & lVect, lVect & rVect
      const angle1 = Stroke.angle(c0, c1, c2)
      const angle2 = Stroke.angle(c1, c2, c3)

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
        this.setCoord(i+1+r, null) // remove the middle coord
        r++
      }
      else {
        c0 = c1
        i = i + r + 1
        r = 0

        // updates bounding
        if (c1.x-w < this.bounding.x0) this.bounding.x0 = c1.x-w
        else if (c1.x+w > this.bounding.x1) this.bounding.x1 = c1.x+w
        if (c1.y-w < this.bounding.y0) this.bounding.y0 = c1.y-w
        else if (c1.y+w > this.bounding.y1) this.bounding.y1 = c1.y+w
      }
    }
    for (i = 0; i > -2; i--) { // updates bounding box for final few coords
      const c = this.getCoord(i)
      if (c === null) continue
      if (c.x-w < this.bounding.x0) this.bounding.x0 = c.x-w
      else if (c.x+w > this.bounding.x1) this.bounding.x1 = c.x+w
      if (c.y-w < this.bounding.y0) this.bounding.y0 = c.y-w
      else if (c.y+w > this.bounding.y1) this.bounding.y1 = c.y+w
    }

    this.removeNull()
  }

  /** Adds an offset to all points as well as the bounding box. */
  public addOffset = (offsetX: number, offsetY: number): void => {
    if (offsetX === 0 && offsetY === 0) return

    for (const coord of this.path) {
      coord.x += offsetX
      coord.y += offsetY
    }
    this.bounding.x0 += offsetX
    this.bounding.x1 += offsetX
    this.bounding.y0 += offsetY
    this.bounding.y1 += offsetY
  }

  /** Moves the bounding box and scales/moves the stroke to fit new box. */
  public moveBounding = (toMove: Box) => {
    // calculates new bounding box
    const newBound = {x0: this.bounding.x0+toMove.x0, x1: this.bounding.x1+toMove.x1,
                      y0: this.bounding.y0+toMove.y0, y1: this.bounding.y1+toMove.y1}

    // moves points to top left
    for (const coord of this.path) {
      coord.x += toMove.x0
      coord.y += toMove.y0
    }

    const moveX = toMove.x1 - toMove.x0
    const moveY = toMove.y1 - toMove.y0
    
    if (moveX !== 0) { // scales x
      const diffX = this.bounding.x1 - this.bounding.x0
      const scaleX = (diffX + moveX) / diffX
      
      for (const coord of this.getCoords()) {
        coord.x = newBound.x0 + (coord.x-newBound.x0) * scaleX
      }
    }
    if (moveY !== 0) { // scales y
      const diffY = this.bounding.y1 - this.bounding.y0
      const scaleY = (diffY + moveY) / diffY
      for (const coord of this.getCoords()) {
        coord.y = newBound.y0 + (coord.y-newBound.y0) * scaleY
      }
    }

    this.bounding = newBound
  }

  /** Applies a function to all points in the stroke. */
  public map = (f: Function): void => {
    for (let i = 0; i < this.getLength(); i++) {
      this.setCoord(i, f(this.path[i]))
    }
  }

  /** custom generator, takes in a offset coord and returns the offset {x, y} on each iteration */
  public* getCoords() {
    let index = 0
    while (index < this.getLength()) {
      yield this.getCoord(index)
      index++
    }
  }

  public isEmpty = () => this.path.length === 0

  /************************
          Setters
  ************************/
  public setStyle = (style: string | CanvasGradient | CanvasPattern) => {
    this.style = style
  }

  public setWidth = (width: number) => {
    this.width = width
  }

  /************************
          Getters
  ************************/

  /** returns a coord along the path at index, allows negative indexing. */
  public getCoord = (index: number) => {
    if (index < 0) index = this.getLength() + index
    return this.path[index]
  }
  public getPath = () => this.path
  public getID = () => this.id
  public getLength = () => this.path.length
  public getStart = () => this.path[0]
  public getStyle = () => this.style
  public getWidth = () => this.width
  public getBoundingBox = () => this.bounding


  /************************
      Helper functions
  ************************/

  private setStart = (startX: number, startY: number): void => {
    this.start = {x: startX, y: startY}
  }

  /** Sets the x, y values for a point in the stroke, if coord is null, set path[index] = null. */
  private setCoord = (index: number, coord: Coord): void => {
    if (index < 0) index = this.getLength() + index
    if (coord === null) {
      this.path[index] = null
      return
    }
    this.path[index].x = coord.x
    this.path[index].y = coord.y
  }

  /** Removes null points from the stroke path. */
  private removeNull = (): void => {
    this.path = this.path.filter(Boolean)
  }

   /** Normalizes a coord based on startX, startY values */
   private normalize = (x: number, y: number) => {
    return {normX: x-this.start.x, normY: y-this.start.y}
  }

  /** Takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
   * (aka smoothes out the middle point) */
  private static bezier = (p0: Coord, p1: Coord, p2: Coord) => {
    return {newX : .5 ** 2 * p0.x + 2 * .5 ** 2 * p1.x + .5**2 * p2.x, newY : .5 ** 2 * p0.y + 2 * .5 ** 2 * p1.y + .5 **2 * p2.y}
  }

  /** Finds the distance between a point and a line formed by 2 points in 2D */
  private static distance = (px: number, py: number, lx0: number, ly0: number, lx1: number, ly1: number): number => {
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
  private static angle = (p0: Coord, p1: Coord, p2: Coord): number => {
    const v0 = {x: p1.x-p0.x, y: p1.y-p0.y}
    const v1 = {x: p2.x-p1.x, y: p2.y-p1.y}

    const ang = Math.acos((v0.x*v1.x + v0.y*v1.y) / Math.sqrt((v0.x**2+v0.y**2) * (v1.x**2+v1.y**2))) // dot product
    const dir = Math.sign(v0.y * v1.x - v0.x * v1.y) // cross product
    
    
    return ang * dir
  }
}

export class PressureStroke extends Stroke {
  outline: [Coord[], Coord[]]

  public constructor() {
    super()
    this.outline = [[], []]
  }

  public* getOutline() { // uninherited method
    for (let i = 0; i < this.outline[0].length; i++) {
      yield(this.outline[0][i])
    }

    // generates values in reverse order for second array
    for (let i = this.outline[1].length - 1; i >= 0; i--) {
      yield(this.outline[1][i])
    }
  }

  // Adds points to outline on the fly
  public addToPath = (x: number, y: number, pressure: number): void => {
    super.addToPath(x, y, pressure)

    // Current point must have a point to go to
    if (this.getLength() <= 1) {
      return;
    }

    const currPoint = this.path[this.path.length - 2]
    if (currPoint.x === x && currPoint.y === y) {
      return
    }

    this.addToOutline(this.getOutlinePoints(currPoint, {x: x, y: y, p: pressure}))
  }

  /**
   * Gets array of coordinates representing the outline of the stroke
   */
  public refreshOutline() { // uninherited method
    this.outline = [[], []]
    let currPoint: Point = this.getStart()

    // iterate over all except first
    const iter = this.getCoords()
    for (const coord of iter) {
      if (currPoint.x !== 0 || currPoint.y !== 0) {
        this.addToOutline(this.getOutlinePoints(currPoint))
      }

      currPoint = coord
    }
  }

  private addToOutline(coords: [Coord, Coord]) {
    this.outline[0].push(coords[0])
    this.outline[1].push(coords[1])
  }

  private getOutlinePoints(currPoint: Point, nextPoint?: Point): [Coord, Coord] {
    const getPointOffset = (): {x: number, y: number} => {
      const getAngleBetween = (p1: Coord, p2: Coord) => {
        if (p2 === undefined) {
          return Math.atan2(p1.y, p1.x)
        }

        const dx = p2.x - p1.x
        const dy = p2.y - p1.y

        return Math.atan2(dy, dx)
      }

      const angleOffset = Math.PI / 2

      const angle = getAngleBetween(currPoint, nextPoint)
      // const magnitude = Math.max(Math.floor(this.width * currPoint.p), 1)
      const magnitude = Math.max(Math.floor(Math.pow(this.width * currPoint.p, 1.15)), 1)
      const pointAngle = angle + angleOffset
      const pointOffset = {x: Math.cos(pointAngle) * magnitude,
                            y: Math.sin(pointAngle) * magnitude}
      
      // console.log(angle)
      // console.log(pointAngle)
      // console.log(pointOffset)

      return pointOffset
    }

    const pointOffset = getPointOffset()

    return [{x: currPoint.x + pointOffset.x, y: currPoint.y + pointOffset.y},
            {x: currPoint.x - pointOffset.x, y: currPoint.y - pointOffset.y}]
  }
}