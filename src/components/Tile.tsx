import Stroke from './../helpers/Stroke'

/**
 * Divides up the canvas into sections containing strokes to optimize the erasing process
 */
 class Tile {

  /************************
          Variables
  ************************/

  public static size = 3000 // size of each tile
  private static masterID = 0

  public id: number
  private startX: number // top left (smaller)
  private startY: number
  private endX: number // bottom right (bigger)
  private endY: number
  private strokes: Stroke[]
  private strokeIDs: number[]
  private neighboringTiles: {left: Tile, right: Tile, up: Tile, down: Tile}

  public constructor(x: number, y: number) { 
    this.startX = x
    this.startY = y
    this.endX = x + Tile.size
    this.endY = y + Tile.size
    this.id = Tile.masterID++

    this.strokes = []
    this.strokeIDs = []
  }
  

  /************************
          Functions
  ************************/

  public addStroke = (stroke: Stroke) => {
    this.strokes.push(stroke)
    this.strokeIDs.push(stroke.id)
  }

  public removeStroke = (strokeID: number) => {
    if (!this.strokeIDs.includes(strokeID)) return
    this.strokes = this.strokes.filter((s) => s.id !== strokeID)
    this.strokeIDs = this.strokeIDs.filter((s) => s !== strokeID)
  }

  /** Returns the last stroke in radius to the passed in [relative] coord. If none found, return null.  */
  public nearestStroke = (x: number, y: number, radius: number) => {
    for (let i = this.numStrokes() - 1; i >= 0; i--) { // loops through each stroke in strokes
      if (this.getStroke(i).distanceTo(x, y) < radius) {
        return this.getStroke(i)
      }
    }
    return null
  }

  public isEmpty = () => this.strokeIDs.length === 0

  public numStrokes = () => this.strokes.length
  
  public enclosesVertex = (x: number, y: number) => {
      return x - this.startX >= 0 && this.endX - x > 0 && y - this.startY >= 0 && this.endY - y > 0
  }

  public getID = () =>  this.id
  public getStrokes = () => this.strokes
  public getStroke = (index: number) => this.strokes[index]
  public getNeighboringTiles = () => this.neighboringTiles

  public setNeighboringTiles = (newNeighbors: {left: Tile, right: Tile, up: Tile, down: Tile}) => {
      this.neighboringTiles = newNeighbors
  }
}

export default Tile