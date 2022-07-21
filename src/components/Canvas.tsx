import React from 'react'
import Stroke from './Stroke'
import Tile from './Tile'

/**
 * Canvas component covering the entire window
 */
class Canvas extends React.Component {

  /************************
          Variables
  ************************/

  // references to canvas and context, used for drawing
  public canvasRef = React.createRef<HTMLCanvasElement>()
  public canvas: any
  public context: any

  // states
  private isDrawing = false
  private isErasing = false
  private currStroke = new Stroke()
  private roughStroke: number[] = []
  private offsetX = 0 // the offset of the canvas
  private offsetY = 0
  private tile = new Tile(0, 0)


  /************************
          Draw
  ************************/

  private strokeWidth = 2

  // when LMB is pressed, begins a new path and move it to the mouse's position
  private startDraw = (pointerEvent: PointerEvent) => {
    this.isDrawing = true
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    this.context.beginPath()
    this.context.moveTo(x, y)
    this.context.arc(x, y, this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
    this.context.stroke() // actually draws it
    this.currStroke.addToPath(x, y) // adds x, y to currStroke
    this.roughStroke.push(x, y)
    // console.log(currStroke)
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isDrawing) return
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    this.roughStroke.push(x, y) // adds x, y to currStroke
    if (this.currStroke.addToPath(x, y))


    // draws the line
    this.context.lineTo(x, y)
    this.context.stroke()
  }
  // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
  private endDraw = () => {
    this.isDrawing = false
    if (this.currStroke.isEmpty()) return

    this.tile.addStroke(this.currStroke) // NEED TO CHANGE LATER
    // redraw(tile.getStrokes(), 'erase')
    this.currStroke = new Stroke()
    // console.log("mouse lifted \n", currStroke)
  }

  // "(re)draws" all strokes by only drawing the difference
  // type: either 'draw' or 'erase'
  private redraw = (strokes: Stroke[], type='erase') => {
    if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    // sets to either only draw in the difference or remove the difference
    if (type === 'draw') this.context.globalCompositeOperation = 'source-over'
    else if (type === 'erase') this.context.globalCompositeOperation = 'destination-in'
    // this.context.clearRect(0, 0, canvas.width, canvas.height) // clears whole screen, for testing only

    // adds a stroke to be redrawn
    const addStroke = (stroke: Stroke) => {
      this.context.moveTo(stroke.getStartX(), stroke.getStartY())
      this.context.arc(stroke.getStartX(), stroke.getStartY(), this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      for (const coord of stroke.getCoords(this.offsetX, this.offsetY)) {
        // this.context.quadraticCurveTo(path[i*4], path[i*4+1], path[i*4+2], path[i*4+3])
        this.context.lineTo(coord.x, coord.y)
      }
    }

    // adds all strokes to be redrawn and then draws all at once
    this.context.beginPath()
    strokes.forEach(addStroke)
    this.context.stroke()
    this.context.globalCompositeOperation = 'source-over'
  }


  /************************
          Erase
  ************************/

  // keeps track of the last mouse position
  private lastX = 0
  private lastY = 0

  private startErase = (pointerEvent: PointerEvent) => {
    this.isErasing = true
    this.erase(pointerEvent)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  private erase = (pointerEvent: PointerEvent) => {
    if (!this.isErasing) return
    
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    if (Canvas.withinSquare(x, y, this.lastX, this.lastY, 5)) return // if mouse didn't move much then we won't recheck
    if (this.tile.isEmpty()) return

    this.lastX = x
    this.lastY = y
    const eraserSize = 5 // the "radius" to erase

    for (let i = this.tile.numElements() - 1; i >= 0; i--) { // loops through each stroke in strokes
      if (this.tile.getStroke(i).distanceTo(x, y) < eraserSize) {
        console.log("erasing")
          const toErase = this.tile.getStroke(i)
          this.tile.removeStroke(toErase.getID())
          this.redraw(this.tile.getStrokes(), 'erase')
          break // only erases 1 stroke
      }
    }
  }
  private endErase = () => {
    this.isErasing = false
  }


  /************************
          Other
  ************************/
  private scroll = (wheelEvent: WheelEvent) => {
    
  }
  private zoom = (wheelEvent: WheelEvent) => {

  }
  private resize = () => {
    const dpr = window.devicePixelRatio * 2
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`
    this.context.scale(dpr,dpr)
    this.context.lineCap = 'round' // how the end of each line look
    this.context.strokeStyle = 'black' // sets the color of the stroke
    this.context.lineWidth = this.strokeWidth
    this.context.lineJoin = 'round' // how lines are joined
    this.redraw(this.tile.getStrokes())
  }


  /************************
      Helper Functions
  ************************/

  // returns the tile the pointer is currently in, returns null if pointer not in any tile
  private static getTile = (tiles: Tile[], x: number, y: number) => {
  for (const tile of tiles) {
    if (tile.enclosesVertex(x, y))
      return tile
    }
    return null
  }

  // returns if 2 coords are within a 'length' of each other
  private static withinSquare = (x1: number, y1: number, x2: number, y2: number, length: number) => {
    return Math.abs(x1-x2) <= length && Math.abs(y1-y2) <= length
  }

  
  /************************
       External Events
  ************************/

  // will direct to different functions depending on button pressed
  private pointerDown = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    if (nativeEvent.button === 0) this.startDraw(nativeEvent)
    else if (nativeEvent.button === 2) this.startErase(nativeEvent)
  }
  private pointerUp = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    if (nativeEvent.button === 0 || nativeEvent.button === -1) this.endDraw()
    if (nativeEvent.button === 2 || nativeEvent.button === -1) this.endErase()
  }
  private pointerMove = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    this.draw(nativeEvent)
    this.erase(nativeEvent)
  }
  private wheel = ({nativeEvent}: {nativeEvent: WheelEvent}) => {
    if (nativeEvent.ctrlKey) this.zoom(nativeEvent)
    else this.scroll(nativeEvent)
  }
  

  /************************
        React Things
  ************************/

  componentDidMount() {
    this.canvas = this.canvasRef.current
    // makes the canvas "high resolution", apparantly we need to do this
    const dpr = window.devicePixelRatio * 2
    this.canvas.width = window.innerWidth * dpr
    this.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`

    // gets context which is what we use to draw and sets a few properties
    this.context = this.canvas.getContext('2d')
    this.context.scale(dpr,dpr)
    this.context.lineCap = 'round' // how the end of each line look
    this.context.strokeStyle = 'black' // sets the color of the stroke
    this.context.lineWidth = this.strokeWidth
    this.context.lineJoin = 'round' // how lines are joined

    // adds window resize listener
    // window.addEventListener('resize', resize)
  }

  shouldComponentUpdate(nextProps: Readonly<{}>, nextState: Readonly<{}>, nextContext: any): boolean {
    return false
  }

  render() {
    return (
      <canvas 
        onPointerDown={this.pointerDown} 
        onPointerUp={this.pointerUp} 
        onPointerMove={this.pointerMove}
        onPointerLeave={this.pointerUp}
        onWheel={this.wheel}
        onContextMenu={(e) => e.preventDefault()}

        ref={this.canvasRef}
      />
    )
  }
}

export default Canvas
