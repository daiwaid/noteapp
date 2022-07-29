/**
 * Wrapper class for strokes
 */
 class Stroke {

  /************************
          Variables
  ************************/
 
  private static masterID: number = 0
  private path: {x: number, y: number, p: number}[] // normalized coords (ie. start at (0, 0))
  private start: {x: number, y: number}
  private style: string|CanvasGradient|CanvasPattern
  private width: number
  private id: number
  private bounding: {x0: number, x1: number, y0: number, y1: number} // bounding area (rectangle)

  public constructor() {
    this.path = []
    this.style = 'black'
    this.width = 2
    this.id = Stroke.masterID++
  }


  /************************
        Functions
  ************************/

  public addToPath = (x: number, y: number, pressure=0.5) => {
    if (this.getLength() === 0) {
      this.setStart(x, y)
    }

    const newPoint = {x: x, y: y, p: pressure}
    
    if (this.getLength() >= 2) { // smoothes path
      const {newX, newY} = Stroke.bezier(this.getCoord(-2), this.getCoord(-1), newPoint)
      this.setCoord(-1, {x: newX, y: newY})
    }

    const {normX, normY} = this.normalize(x, y)
    this.path.push(newPoint)
  }

  /** Returns the shortest distance from the stroke to the point (x, y) */
  public distanceTo = (x: number, y: number) => {
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
  public done = (scale: number) => {
    let i = 1, r = 0
    let c0 = this.getCoord(0)
    this.bounding = {x0: c0.x, x1: c0.x, y0: c0.y, y1: c0.y} // initializes the bounding box
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
        if (c1.x < this.bounding.x0) this.bounding.x0 = c1.x
        else if (c1.x > this.bounding.x1) this.bounding.x1 = c1.x
        if (c1.y < this.bounding.y0) this.bounding.y0 = c1.y
        else if (c1.y > this.bounding.y1) this.bounding.y1 = c1.y
      }
    }
    for (; i < this.getLength(); i++) { // updates bounding box for final few coords
      const c = this.getCoord(i)
      if (c === null) continue
      if (c.x < this.bounding.x0) this.bounding.x0 = c.x
      else if (c.x > this.bounding.x1) this.bounding.x1 = c.x
      if (c.y < this.bounding.y0) this.bounding.y0 = c.y
      else if (c.y > this.bounding.y1) this.bounding.y1 = c.y
    }

    this.removeNull()
  }

  /** Applies a function to all points in the stroke. */
  public map = (f: Function) => {
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

  private setStart = (startX: number, startY: number) => {
    this.start = {x: startX, y: startY}
  }

  /** Sets the x, y values for a point in the stroke, if coord is null, set path[index] = null. */
  private setCoord = (index: number, coord: {x: number, y: number}) => {
    if (index < 0) index = this.getLength() + index
    if (coord === null) {
      this.path[index] = null
      return
    }
    this.path[index].x = coord.x
    this.path[index].y = coord.y
  }

  /** Removes null points from the stroke path. */
  private removeNull = () => {
    this.path = this.path.filter(Boolean)
  }

   /** Normalizes a coord based on startX, startY values */
   private normalize = (x: number, y: number) => {
    return {normX: x-this.start.x, normY: y-this.start.y}
  }

  /** Takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
   * (aka smoothes out the middle point) */
  private static bezier = (p0: {x: number, y: number}, p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    return {newX : .5 ** 2 * p0.x + 2 * .5 ** 2 * p1.x + .5**2 * p2.x, newY : .5 ** 2 * p0.y + 2 * .5 ** 2 * p1.y + .5 **2 * p2.y}
  }

  /** Finds the distance between a point and a line formed by 2 points in 2D */
  private static distance = (px: number, py: number, lx0: number, ly0: number, lx1: number, ly1: number) => {
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
  private static angle = (p0: {x: number, y: number}, p1: {x: number, y: number}, p2: {x: number, y: number}) => {
    const v0 = {x: p1.x-p0.x, y: p1.y-p0.y}
    const v1 = {x: p2.x-p1.x, y: p2.y-p1.y}

    const ang = Math.acos((v0.x*v1.x + v0.y*v1.y) / Math.sqrt((v0.x**2+v0.y**2) * (v1.x**2+v1.y**2))) // dot product
    const dir = Math.sign(v0.y * v1.x - v0.x * v1.y) // cross product
    
    
    return ang * dir
  }
}

export default Stroke
