import Stroke from './Stroke'

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
    this.strokeIDs.push(stroke.getID())
  }

  public removeStroke = (strokeID: number) => {
    if (!this.strokeIDs.includes(strokeID)) return
    this.strokes = this.strokes.filter((s) => s.getID() !== strokeID)
    this.strokeIDs = this.strokeIDs.filter((s) => s !== strokeID)
  }

  public isEmpty = () => this.strokeIDs.length === 0

  public numElements = () => this.strokes.length
  
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