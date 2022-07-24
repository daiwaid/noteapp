import Stroke from './Stroke'
import StrokeTracker from './StrokeTracker'
import GriddedTracker from './GriddedTracker'

/**
 * Divides up the canvas into sections containing strokes to optimize the erasing process
 */
 class Tile {
    public static size = 3000 // size of each tile
    private static masterID = 0

    public id: number
    private startX: number // top left (smaller)
    private startY: number
    private endX: number // bottom right (bigger)
    private endY: number
    private strokeMap: Map<number, Stroke> // StrokeIDs to Strokes
    private neighboringTiles: {left: Tile, right: Tile, up: Tile, down: Tile}
    private tracker: StrokeTracker
  
    public constructor(x: number, y: number) { 
      this.startX = x
      this.startY = y
      this.endX = x + Tile.size
      this.endY = y + Tile.size
      this.id = Tile.masterID++
  
      this.strokeMap = new Map()
      this.tracker = new GriddedTracker([3000, 3000], [100, 100])
    }
  
    public addStroke(stroke: Stroke) {
      this.strokeMap.set(stroke.getID(), stroke)
      this.tracker.registerStroke(stroke)
    }
  
    public removeStroke(strokeID: number) {
      if (!this.strokeMap.has(strokeID)) return

      this.tracker.deregisterStroke(this.strokeMap.get(strokeID))
      this.strokeMap.delete(strokeID)
    }

    /**
     * Gets topmost stroke at some coordinate within some max distance from stroke vertex
     * @return the stroke within offset from coord if exists, otherwise null
     */
    public getStrokeAt(coord: [number, number], maxOffset: number=0): Stroke | null {
      const nearbyStrokeIDs = this.tracker.getStrokesNear(...coord)

      if (nearbyStrokeIDs.length === 0) {
        return null
      }

      for (let i = nearbyStrokeIDs.length - 1; i >= 0; i--) {
        const currStroke = this.strokeMap.get(nearbyStrokeIDs[i])

        if (currStroke.distanceTo(...coord) < maxOffset) {
          return currStroke
        }
      }

      return null
    }

    public isEmpty() {
      return this.strokeMap.size === 0
    }
  
    public numElements() {
      return this.strokeMap.size
    }
    
    public enclosesVertex(x: number, y: number) { 
        return x - this.startX >= 0 && this.endX - x > 0 && y - this.startY >= 0 && this.endY - y > 0
    }

    public getID() { return this.id }
    public getNeighboringTiles() { return this.neighboringTiles }
    public getStrokesIterator() { return this.strokeMap.values() }

    public setNeighboringTiles(newNeighbors: {left: Tile, right: Tile, up: Tile, down: Tile}) {
        this.neighboringTiles = newNeighbors
    }
  }

  export default Tile
