import Stroke from './Stroke'

/**
 * Used as a generalized interface for querying strokes from a canvas
 */
export interface StrokeTracker {
  /**
   * Adds stroke to the tracker
   * @return true if stroke successfully added to tracker, otherwise false
   */
  registerStroke(stroke: Stroke): boolean;

  /**
   * Removes stroke to the tracker
   * @return true if stroke successfully removed from tracker, otherwise false
   */
  deregisterStroke(stroke: Stroke): boolean;

  // /**
  //  * Updates the initial point of the stroke and its position in the tracker
  //  * @return true if stroke successfully updated, otherwise false
  //  * TODO: Uncomment
  //  */
  // updateStroke(stroke: Stroke, newStartX: number, newStartY: number): boolean

  /**
   * Gets the ID of the stroke added last at a given position.
   * @return The id of the topmost stroke at position, otherwise null
   */
  getTopAt(xOffset: number, yOffset: number): number | null;
}

/**
 * Stroke tracker that utilizes an underlying grid to track strokes
 */
export class GriddedTracker implements StrokeTracker {
  grid: number[][][]        // Stack of IDs in given region on 2d plane
  allStrokes: Set<number>   // Id of every stroke in the tracker
  rowStrokes: Set<number>[] // Id of every stroke in a given row
  colStrokes: Set<number>[] // Id of every stroke in a given column
  dim: [number, number]     // The dimensions of the region to be tracked
  scale: [number, number]   // The scale of each dimension                                         // Note: extraneous but maybe good for clarity?

  public constructor(dimX: number, dimY: number, scaleX: number=10, scaleY: number=10) {
    this.dim = [dimX, dimY]
    this.scale = [scaleX, scaleY]

    this.rowStrokes = []                                                                           // CHECK: Does this work in intializing the instance variables?
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

      // ensures id in row/col headers
      this.rowStrokes[row].add(id)
      this.colStrokes[col].add(id)
      
      // adds id to grid if not already present
      const gridStack = this.grid[row][col]                                                        // CHECK: does storing the reference update the underlying array?
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

  public getTopAt(xOffset: number, yOffset: number): number | null {
    const [row, col] = this.getTileCoordinates({x: xOffset, y: yOffset})
    const gridStack = this.grid[row][col]

    if (gridStack.length === 0) {
      return null
    }
    else {
      return gridStack[gridStack.length - 1]
    }
  }

  // /**
  //  * Updates the position of the stroke object and tracker
  //  *
  //  * TODO: Implement and make public
  //  */
  // private updateStroke(stroke: Stroke, newStartX: number, newStartY: number): boolean {
  //   return false
  // }

  private getTileCoordinates(coord: {x: number, y: number}): [number, number] {                          // CHECK: scale or scale - 1?
    return [Math.floor(coord.x / this.dim[0] * this.scale[0]),
            Math.floor(coord.y / this.dim[1] * this.scale[1])]
  }
}
