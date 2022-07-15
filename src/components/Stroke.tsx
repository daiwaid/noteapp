
/**
 * Wrapper class for strokes
 */
 class Stroke {
    private static masterID: number = 0
    public path: number[]                           // TODO: Private after qcurve fixed
    private startX: number|undefined
    private startY: number|undefined
    private id: number
  
    public constructor(path: number[]=[]) {
      this.path = path
      this.id = Stroke.masterID++
  
      if (path.length !== 0) {
        this.setStart(path[0], path[1])
      }
    }
  
    public addToPath(offsetX: number, offsetY: number) {
      if (this.path.length === 0) {
        this.setStart(offsetX, offsetY)
      }
      if (this.path.length >= 2) { // smoothes path
        const {x0, y0, x1, y1} = this.getLastTwoPoints()
        const {x, y} = Stroke.bezier(x0, y0, x1, y1, offsetX, offsetY)
        
        this.path[this.path.length-2] = x
        this.path[this.path.length-1] = y
        this.path.push(offsetX, offsetY)


        // if (redraw === null) return
        // redraw([new Stroke([x0, y0, x1, y1, offsetX, offsetY])], 'erase')
        // redraw([new Stroke([x0, y0, x, y, offsetX, offsetY])], 'draw')
      }
  
      this.path.push(offsetX, offsetY)
    }
  
    public smoothPath() {
      for (let i = 2; i < this.getLength(); i++) {
        const {x, y} = Stroke.bezier(this.path[i*2-4], this.path[i*2-3], this.path[i*2-2], this.path[i*2-1], this.path[i*2], this.path[i*2+1])
        this.path[i*2-2] = x
        this.path[i*2-1] = y
      }
    }
  
    // custom iterator, returns a tuple [x, y] on each iteration
    public [Symbol.iterator]() {
      let index = 0
      return {
        next: () => {
          let result: {value: [number, number], done: boolean}
  
          if (index < this.getLength()) {
            result = {value: this.getPathVertex(index), done: false}
            index++
          }
          else {
            result = {value: undefined, done: true}
          }
  
          return result 
        }
      }
    }
  
    public isEmpty() { return this.path.length === 0 }

    public getPathVertex(index: number): [number, number] { return [this.path[index * 2], this.path[index * 2 + 1]] }
    public getPath() { return this.path }
    public getID() { return this.id }
    public getLength() { return this.path.length / 2 }
    public getStartX() { return this.startX }
    public getStartY() { return this.startY }

    private getLastTwoPoints() {
        const l = this.path.length
        return {x0: this.path[l-4], y0: this.path[l-3], x1: this.path[l-2], y1: this.path[l-1]}
    }

    private setStart(startX: number, startY: number) {
      this.startX = startX
      this.startY = startY
    }

    // takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
    // aka smoothes out the middle point
    private static bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
        return {x : .5 ** 2 * x0 + 2 * .5 ** 2 * x1 + .5**2 * x2, y : .5 ** 2 * y0 + 2 * .5 ** 2 * y1 + .5 **2 * y2}
      }
  }

export default Stroke