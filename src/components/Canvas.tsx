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

  // reference to canvas, in order to pull it after component renders
  public canvasRef = React.createRef<HTMLCanvasElement>()
  public canvas: any
  public context: any

  // stroke saves
  private currStroke = new Stroke()
  private roughStroke: number[] = []
  private tile = new Tile(0, 0)

  // active states
  private activeButton = -1 // which button is the last pressed
  private isDrawing = false
  private isErasing = false
  private offset = {x: 0, y: 0} // the offset of the canvas
  private scale = 1

  // saved states for animations
  private animating = false
  private backupTimestep = -1
  private toOffset = {x: 0, y: 0}
  private toScale = this.scale


  /************************
          Render
  ************************/

  /** "(re)draws" all strokes by only drawing the difference;
   * type: either 'draw' or 'erase' */
  private redraw = (strokes: Stroke[], type='erase') => {

    if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      return
    }
    // sets to either only draw in the difference or remove the difference
    if (type === 'draw') {
      this.context.globalCompositeOperation = 'source-over'
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
    else if (type === 'erase') this.context.globalCompositeOperation = 'destination-in'
    // this.context.clearRect(0, 0, this.canvas.width, this.canvas.height) // clears whole screen, for testing only

    /** adds a stroke to be redrawn */
    const addStroke = (stroke: Stroke) => {
      this.context.moveTo(stroke.getStartX(this.offset.x), stroke.getStartY(this.offset.y))
      this.context.arc(stroke.getStartX(this.offset.x), stroke.getStartY(this.offset.y), this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      for (const coord of stroke.getCoords(this.offset.x, this.offset.y)) {
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

  /** Re-renders the canvas repeatedly until no more changes are detected. */
  private rerender = () => {
    let prevTimeStamp = -1
    let frame = 0

    // renders 1 frame
    const animate = (timeStamp: DOMHighResTimeStamp) => {
      this.animating = true // starts animating
      let doneChanging = true

      // gets the timestep since last frame
      if (prevTimeStamp === -1) prevTimeStamp = timeStamp
      let timestep = timeStamp - prevTimeStamp
      if (timestep === 0) timestep = this.backupTimestep
      else if (this.backupTimestep === 0) this.backupTimestep = timestep
      prevTimeStamp = timeStamp

      // checks page movement
      if (this.toOffset.x !== this.offset.x) {
        this.offset.x = Canvas.smoothTransition(this.offset.x, this.toOffset.x, timestep)
        if (this.toOffset.x !== this.offset.x) doneChanging = false
      }
      if (this.toOffset.y !== this.offset.y) {
        const aa=Canvas.smoothTransition(this.offset.y, this.toOffset.y, timestep)
        console.log("ntm:", this.toOffset.y-this.offset.y, ", moved:", aa-this.offset.y, ", frame:", frame, ", timestep:", timestep)
        this.offset.y = aa
        if (this.toOffset.y !== this.offset.y) doneChanging = false
      }

      this.redraw(this.tile.getStrokes(), 'draw')
      if (!doneChanging) window.requestAnimationFrame(animate)
      else this.animating = false // stops animating
      frame++
    }
    window.requestAnimationFrame(animate)
  }


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
    this.currStroke.addToPath(x-this.offset.x, y-this.offset.y) // adds x, y to currStroke
    this.roughStroke.push(x-this.offset.x, y-this.offset.y)
    // console.log(currStroke)
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isDrawing) return
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    this.roughStroke.push(x-this.offset.x, y-this.offset.y) // adds x, y to currStroke
    if (this.currStroke.addToPath(x-this.offset.x, y-this.offset.y))


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


  /************************
          Erase
  ************************/

  // keeps track of the last mouse position
  private lastX = 0
  private lastY = 0

  private startErase = (pointerEvent: PointerEvent) => {
    this.isErasing = true
    if (this.isDrawing) this.endDraw()
    this.erase(pointerEvent)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  private erase = (pointerEvent: PointerEvent) => {
    if (!this.isErasing) return
    
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    if (Canvas.withinSquare(x-this.offset.x, y-this.offset.y, this.lastX-this.offset.x, this.lastY-this.offset.y, 5)) return // if mouse didn't move much then we won't recheck
    if (this.tile.isEmpty()) return

    this.lastX = x
    this.lastY = y
    const eraserSize = 5 // the "radius" to erase

    for (let i = this.tile.numElements() - 1; i >= 0; i--) { // loops through each stroke in strokes
      if (this.tile.getStroke(i).distanceTo(x-this.offset.x, y-this.offset.y) < eraserSize) {
        console.log("erased")
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
    if (this.isDrawing || this.isDrawing) return // don't allow scroll while doing actions
    if (wheelEvent.shiftKey) this.toOffset.x -= wheelEvent.deltaY
    else {
      this.toOffset.x += wheelEvent.deltaX
      this.toOffset.y -= wheelEvent.deltaY
    }
    if (!this.animating) this.rerender()
  }
  private zoom = (wheelEvent: WheelEvent) => {

  }
  /** Resizes the canavs, also reapplies default settings. */
  private resize = () => {
    const dpr = window.devicePixelRatio * 2
    this.context.canvas.width = window.innerWidth * dpr
    this.context.canvas.height = window.innerHeight * dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`

    this.context.scale(dpr,dpr)
    this.context.lineCap = 'round' // how the end of each line look
    this.context.strokeStyle = 'black' // sets the color of the stroke
    this.context.lineWidth = this.strokeWidth
    this.context.lineJoin = 'round' // how lines are joined
    this.redraw(this.tile.getStrokes(), 'draw')
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

  // smoothly transitions from x0 to x1, returns what x0 should become in the next time step
  private static smoothTransition = (x0: number, x1: number, timestep: number) => {
    const cutoff = 0.5
    if (Math.abs(x1 - x0) < cutoff) return x1
    return x0 + Math.sign(x1-x0) * ((Math.abs(x1-x0)+300)**2 / 2**13 - 10.5) * timestep/8
  }

  
  /************************
       Process Events
  ************************/

  // will direct to different functions depending on button pressed
  // NOTE: buttons is a bitmask; LMB=1, RMB=2, MMB=4, back=8, forward=16, pen eraser=32
  private pointerDown = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    if (nativeEvent.button === 0) this.startDraw(nativeEvent)
    else if (nativeEvent.button === 2) this.startErase(nativeEvent)
  }
  private pointerUp = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    this.endDraw()
    this.endErase()
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
    // gets canvas and its context
    this.canvas = this.canvasRef.current
    this.context = this.canvas.getContext('2d')

    this.resize()

    // adds window resize listener
    window.addEventListener('resize', this.resize)
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
