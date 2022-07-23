import Stroke from './Stroke'
import { StrokeTracker } from './StrokeTracker'

/**
 * Stroke tracker that utilizes an underlying grid to track strokes
 */
export default class GriddedTracker implements StrokeTracker {
  grid: number[][][]        // Stack of IDs in given region on 2d plane
  allStrokes: Set<number>   // Id of every stroke in the tracker
  rowStrokes: Set<number>[] // Id of every stroke in a given row
  colStrokes: Set<number>[] // Id of every stroke in a given column
  dim: [number, number]     // The dimensions of the region to be tracked
  scale: [number, number]   // The scale of each dimension

  public constructor(dimX: number, dimY: number, scaleX: number=10, scaleY: number=10) {
    if (dimX < 0 || dimY < 0) {
      throw "dimensions must be greater than 0"
    }

    this.dim = [dimX, dimY]
    this.scale = [scaleX, scaleY]

    this.allStrokes = new Set()
    this.rowStrokes = []
    for (let i = 0; i < scaleX; i++) {
      this.rowStrokes.push(new Set())
    }

    this.colStrokes = []
    for (let i = 0; i < scaleY; i++) {
      this.colStrokes.push(new Set())
    }
    
    this.grid = []
    for (let i = 0; i < scaleX; i++) {
      let row: number[][] = []
      for (let k = 0; k < scaleY; k++) {
        row.push([])
      }

      this.grid.push(row)
    }
  }

  public registerStroke(stroke: Stroke): boolean {    
    const id = stroke.getID()
    if (this.allStrokes.has(id)) {
      return false
    }

    // adds id to list of all IDs
    this.allStrokes.add(id)

    for (const coord of stroke.getCoords()) {
      const [row, col] = this.getTileCoordinates(coord)

      // console.log(coord)                         // used for debugging
      // console.log(row, col)

      // ensures id in row/col headers
      this.rowStrokes[row].add(id)
      this.colStrokes[col].add(id)
      
      // adds id to grid if not already present
      const gridStack = this.grid[row][col]
      if (gridStack.length === 0 || gridStack[gridStack.length - 1] !== id) {
        this.grid[row][col].push(id)
      }
    }

    return true
  }

  public deregisterStroke(stroke: Stroke): boolean {
    const id = stroke.getID()
    if (!this.allStrokes.has(id)) {
      return false
    }

    this.allStrokes.delete(id)

    for (const coord of stroke.getCoords()) {
      const [row, col] = this.getTileCoordinates(coord)

      this.rowStrokes[row].delete(id)
      this.colStrokes[col].delete(id)

      const gridStack = this.grid[row][col]
      if (gridStack.length >= 0 && gridStack[gridStack.length - 1] === id) {
        gridStack.pop()
      }
    }

    return true
  }

  public getStrokesNear(xOffset: number, yOffset: number): number[] {
    const [row, col] = this.getTileCoordinates({x: xOffset, y: yOffset})
    const gridStack = this.grid[row][col]
    return [...gridStack] // shallow copy
  }

  // /**
  //  * Updates the position of the stroke object and tracker
  //  *
  //  * TODO: Implement and make public
  //  */
  // private updateStroke(stroke: Stroke, newStartX: number, newStartY: number): boolean {
  //   return false
  // }

  private getTileCoordinates(coord: {x: number, y: number}): [number, number] {
    return [Math.floor(coord.x / this.dim[0] * this.scale[0]),
            Math.floor(coord.y / this.dim[1] * this.scale[1])]
  }
}
