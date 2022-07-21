/**
 * Wrapper class for strokes
 */
 class Stroke {
    private static masterID: number = 0
    private path: number[] // stores normalized coords (ie. start at (0, 0))
    private startX: number|undefined
    private startY: number|undefined
    private id: number
  
    public constructor(path: number[]=[]) {
      this.path = []
      this.id = Stroke.masterID++
  
      if (path.length !== 0) {
        this.setStart(path[0], path[1])
        for (let i = 0; i < path.length / 2; i++) {
          const {normX, normY} = this.normalize(path[i*2], path[i*2+1])
          this.path.push(normX, normY)
        }
      }
    }


    /************************
          Functions
    ************************/

    public addToPath(x: number, y: number) {
      if (this.path.length === 0) {
        this.setStart(x, y)
      }
      
      // if (this.path.length >= 2) { // smoothes path
      //   const {x0, y0, x1, y1} = this.getLastTwoPoints()
      //   const {newX, newY} = Stroke.bezier(x0, y0, x1, y1, x, y)
        
      //   this.path[this.path.length-2] = newX
      //   this.path[this.path.length-1] = newY
      //   this.path.push(x, y)

      //   // if (redraw === null) return
      //   // redraw([new Stroke([x0, y0, x1, y1, x, y])], 'erase')
      //   // redraw([new Stroke([x0, y0, x, y, x, y])], 'draw')
      // }
  
      const {normX, normY} = this.normalize(x, y)
      this.path.push(normX, normY)
    }

    /** Returns the shortest distance from the stroke to the point (x, y) */
    public distanceTo(x: number, y: number) {
      let shortest = 9999999
      for (let i = 0; i < this.getLength()-1; i++) {
        const p0 = this.getCoord(i, this.startX, this.startY)
        const p1 = this.getCoord(i+1, this.startX, this.startY)
        const newDist = Stroke.distance(x, y, p0.x, p0.y, p1.x, p1.y)
        shortest = shortest > newDist ? newDist : shortest
      }
      return shortest
    }
  
    /** custom generator, takes in a offset coord and returns the offset {x, y} on each iteration */
    public* getCoords(offsetX: number=0, offsetY: number=0) {
      let index = 0
      while (index < this.getLength()) {
        yield this.getCoord(index, this.startX, this.startY)
        index++
      }
    }
  
    public isEmpty() { return this.path.length === 0 }


    /************************
            Getters
    ************************/

    /** returns a coord along the path at index, optionally pass in offsets to offset the normalized coord */
    public getCoord(index: number, offsetX=0, offsetY=0) { 
      return {x: this.path[index * 2] + this.startX + offsetX, y: this.path[index * 2 + 1] + this.startY + offsetY} 
    }
    public getPath() { return this.path }
    public getID() { return this.id }
    public getLength() { return this.path.length / 2 }
    public getStartX() { return this.startX }
    public getStartY() { return this.startY }


    /************************
        Helper functions
    ************************/

    private setStart(startX: number, startY: number) {
      this.startX = startX
      this.startY = startY
    }

    private smoothPath() {
      for (let i = 2; i < this.getLength(); i++) {
        const {x, y} = Stroke.bezier(this.path[i*2-4], this.path[i*2-3], this.path[i*2-2], this.path[i*2-1], this.path[i*2], this.path[i*2+1])
        this.path[i*2-2] = x
        this.path[i*2-1] = y
      }
    }

    /** Returns the last two points stored, in order to smooth the curve. */
    private getLastTwoPoints() {
      const l = this.path.length
      return {x0: this.path[l-4], y0: this.path[l-3], x1: this.path[l-2], y1: this.path[l-1]}
    }

    /** Normalizes a coord based on startX, startY values */
    private normalize(x: number, y: number) {
      return {normX: x-this.startX, normY: y-this.startY}
    }

    /** Takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
     * (aka smoothes out the middle point) */
    private static bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
      return {x : .5 ** 2 * x0 + 2 * .5 ** 2 * x1 + .5**2 * x2, y : .5 ** 2 * y0 + 2 * .5 ** 2 * y1 + .5 **2 * y2}
    }

    /** Finds the distance between a point and a line formed by 2 points in 2D */
    private static distance(px: number, py: number, lx0: number, ly0: number, lx1: number, ly1: number) {
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
