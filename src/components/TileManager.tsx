import Stroke from './Stroke'
import Tile from './Tile'

class TileManager {
    tiles: Tile[]
    constructor(screenWidth: number, screenHeight: number) {
        this.tiles = []
        this.tiles.push(new Tile(0, 0))
    }

    public getOnScreenTiles(x: number, y: number) {
        return this.tiles
    }
}


export default TileManager