
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
  
    public addToPath(offsetX: number, offsetY: number) {
      if (this.path.length === 0) {
        this.setStart(offsetX, offsetY)
      }
      
      // if (this.path.length >= 2) { // smoothes path
      //   const {x0, y0, x1, y1} = this.getLastTwoPoints()
      //   const {x, y} = Stroke.bezier(x0, y0, x1, y1, offsetX, offsetY)
        
      //   this.path[this.path.length-2] = x
      //   this.path[this.path.length-1] = y
      //   this.path.push(offsetX, offsetY)

      //   // if (redraw === null) return
      //   // redraw([new Stroke([x0, y0, x1, y1, offsetX, offsetY])], 'erase')
      //   // redraw([new Stroke([x0, y0, x, y, offsetX, offsetY])], 'draw')
      // }
  
      const {normX, normY} = this.normalize(offsetX, offsetY)
      this.path.push(normX, normY)
    }
  
    public smoothPath() {
      for (let i = 2; i < this.getLength(); i++) {
        const {x, y} = Stroke.bezier(this.path[i*2-4], this.path[i*2-3], this.path[i*2-2], this.path[i*2-1], this.path[i*2], this.path[i*2+1])
        this.path[i*2-2] = x
        this.path[i*2-1] = y
      }
    }
  
    /** custom generator, takes in a offset coord and returns the offset {x, y} on each iteration */
    public* getCoords(offsetX: number, offsetY: number) {
      let index = 0
      while (index < this.getLength()) {
        yield this.getPathVertex(index, this.startX, this.startY)
        index++
      }

    }
  
    public isEmpty() { return this.path.length === 0 }


    /************************
            Getters
    ************************/

    /** returns a coord along the path at index, optionally pass in offsets to offset the normalized coord */
    public getPathVertex(index: number, offsetX=0, offsetY=0) { 
      return {x: this.path[index * 2] + offsetX, y: this.path[index * 2 + 1] + offsetY} 
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

    /** Returns the last two points stored, in order to smooth the curve. */
    private getLastTwoPoints() {
      const l = this.path.length
      return {x0: this.path[l-4], y0: this.path[l-3], x1: this.path[l-2], y1: this.path[l-1]}
    }

    /** Normalizes a coord based on startX, startY values */
    private normalize(x: number, y: number) {
      return {normX: x-this.startX, normY: y-this.startY}
    }

    /** takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
     * (aka smoothes out the middle point) */
    private static bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
      return {x : .5 ** 2 * x0 + 2 * .5 ** 2 * x1 + .5**2 * x2, y : .5 ** 2 * y0 + 2 * .5 ** 2 * y1 + .5 **2 * y2}
    }
  }

export default Stroke