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
    if (this.getLength() === 0) this.setStart(x, y)

    const newPoint = {x: x, y: y, p: pressure}
    
    if (this.getLength() >= 2) { // smoothes path
      const {newX, newY} = Stroke.bezier(this.getCoord(-2), this.getCoord(-1), newPoint)
      this.setCoord(-1, {x: newX, y: newY})
    }

    // const {normX, normY} = this.normalize(x, y)
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

  /** returns a coord along the path at index, optionally pass in offsets to offset the normalized coord */
  public getCoord = (index: number, offsetX=0, offsetY=0) => {
    if (index < 0) index = this.getLength() + index
    if (this.path[index] === undefined) console.log(index)
    return {x: this.path[index].x + offsetX, y: this.path[index].y + offsetY} 
  }
  public getPath = () => this.path
  public getID = () => this.id
  public getLength = () => this.path.length
  public getStart = () => this.path[0]
  public getStyle = () => this.style
  public getWidth = () => this.width


  /************************
      Helper functions
  ************************/

  private setStart = (startX: number, startY: number) => {
    this.start = {x: startX, y: startY}
  }

  /** Sets the x, y values for a point in the stroke. */
  private setCoord = (index: number, coord: {x: number, y: number}) => {
    if (index < 0) index = this.getLength() + index
    this.path[index].x = coord.x
    this.path[index].y = coord.y
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
}

export default Stroke
