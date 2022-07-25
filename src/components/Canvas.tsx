import React from 'react'
import DocumentMeta from 'react-document-meta'
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
  private tile = new Tile(0, 0)

  // active states
  private isDrawing = false
  private isErasing = false
  private offset = {x: 0, y: 0} // the offset of the canvas
  private zoomCenterAbsolute = {x: 0, y: 0}
  private zoomCenterRelative = {x: 0, y: 0}
  private scale = 1

  // saved states for animations
  private animating = false
  private backupTimestep = -1
  private dpr = 1
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
      const start = this.processCoord(stroke.getStart(), false) // processe the coord
      this.context.moveTo(start.x, start.y)
      this.context.arc(start.x, start.y, this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      for (const coord of stroke.getCoords()) {
        const zoomed = this.processCoord(coord, false) // processes the coord
        // this.context.quadraticCurveTo(path[i*4], path[i*4+1], path[i*4+2], path[i*4+3])
        this.context.lineTo(zoomed.x, zoomed.y)
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

      // checks page movement and zoom
      const animateChange = this.animateMove(timestep)
      const zoomChange = this.animateZoom(timestep)
      doneChanging = animateChange && zoomChange

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
    const coord = this.processCoord({x: x, y: y})
    console.log(coord)
    this.currStroke.addToPath(coord.x, coord.y) // adds x, y to currStroke
    
    // console.log(currStroke)
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isDrawing) return
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    const coord = this.processCoord({x: x, y: y})
    this.currStroke.addToPath(coord.x, coord.y)

    // draws the line
    this.context.lineTo(x, y)
    this.context.stroke()
  }
  // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
  private endDraw = () => {
    this.isDrawing = false
    if (this.currStroke.isEmpty()) return

    this.tile.addStroke(this.currStroke) // NEED TO CHANGE LATER
    this.currStroke = new Stroke()
  }


  /************************
          Erase
  ************************/

  // keeps track of the last mouse position
  private lastCoord = {x: 0, y: 0}

  private startErase = (pointerEvent: PointerEvent) => {
    this.isErasing = true
    if (this.isDrawing) this.endDraw()
    this.erase(pointerEvent)
    console.log(this.offset)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  private erase = (pointerEvent: PointerEvent) => {
    if (!this.isErasing) return
    
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    const lastCoordNoOffset = this.processCoord(this.lastCoord)
    if (Canvas.withinSquare(x, y, lastCoordNoOffset.x, lastCoordNoOffset.y, this.dpr*4)) return // if mouse didn't move much then we won't recheck
    if (this.tile.isEmpty()) return

    this.lastCoord = {x: x, y: y}
    const eraserSize = 5 // the "radius" to erase

    for (let i = this.tile.numElements() - 1; i >= 0; i--) { // loops through each stroke in strokes
      const mouseCoord = this.processCoord({x: x, y: y})
      if (this.tile.getStroke(i).distanceTo(mouseCoord.x, mouseCoord.y) < eraserSize) {
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
       Other Functions
  ************************/

  private scroll = (wheelEvent: WheelEvent) => {
    if (this.isDrawing || this.isErasing) return // don't allow scroll while doing actions
    if (wheelEvent.shiftKey) this.toOffset.x += wheelEvent.deltaY / this.scale // shift+scroll allows horizontal scroll
    else {
      this.toOffset.x += wheelEvent.deltaX / this.scale
      this.toOffset.y += wheelEvent.deltaY / this.scale
    }
    if (!this.animating) this.rerender()
  }

  private zoom = (wheelEvent: WheelEvent) => {
    if (this.isDrawing || this.isErasing) return // don't allow zoom while doing actions
    this.zoomCenterAbsolute = {x: wheelEvent.offsetX, y: wheelEvent.offsetY}
    this.zoomCenterRelative = this.processCoord({x: wheelEvent.offsetX, y: wheelEvent.offsetY})
    if (this.scale < 80)
    this.toScale += Math.ceil(this.toScale) * Math.sign(-wheelEvent.deltaY)/12
    console.log("zoom", this.toScale)
    if (this.toScale < 0.1) this.toScale = 0.1 // caps the zoom
    else if (this.toScale > 20) this.toScale = 20
    if (!this.animating) this.rerender()
  }

  /** Resizes the canavs, also reapplies default settings. */
  private resize = () => {
    this.dpr = window.devicePixelRatio * 2
    this.context.canvas.width = window.innerWidth * this.dpr
    this.context.canvas.height = window.innerHeight * this.dpr
    this.canvas.style.width = `${window.innerWidth}px`
    this.canvas.style.height = `${window.innerHeight}px`

    this.context.scale(this.dpr,this.dpr)
    this.context.lineCap = 'round' // how the end of each line look
    this.context.strokeStyle = 'black' // sets the color of the stroke
    this.context.lineWidth = this.strokeWidth
    this.context.lineJoin = 'round' // how lines are joined
    this.redraw(this.tile.getStrokes(), 'draw')
  }


  /************************
      Helper Functions
  ************************/

  /** Generates the page offset for 1 animation frame. */
  private animateMove= (timestep: number) => {
    let doneChanging = true
    if (this.toOffset.x !== this.offset.x) {
      doneChanging = false
      this.offset.x = Canvas.smoothTransition(this.offset.x, this.toOffset.x, timestep)
    }
    if (this.toOffset.y !== this.offset.y) {
      doneChanging = false
      this.offset.y = Canvas.smoothTransition(this.offset.y, this.toOffset.y, timestep)
    }
    return doneChanging
  }

  private animateZoom = (timestep: number) => { // pure dark magic don't question it
    if (this.toScale === this.scale) return true

    this.scale += Canvas.smoothTransition(0, (this.toScale-this.scale)*256, timestep) / 256
    this.offset.x = this.toOffset.x = this.zoomCenterRelative.x - this.zoomCenterAbsolute.x / this.scale
    this.offset.y = this.toOffset.y = this.zoomCenterRelative.y - this.zoomCenterAbsolute.y / this.scale
    return false
  }

  /** Converts on screen (absolute) coord to page (relative) coord, or vice versa. */
  private processCoord = (coord: {x: number, y: number}, toRelative=true) => {
    if (toRelative) {
      const newX = coord.x / this.scale + this.offset.x
      const newY = coord.y / this.scale + this.offset.y
      return {x: newX, y: newY}
    }
    else {
      //zoom from offset
      const newX = (coord.x-this.offset.x) * this.scale
      const newY = (coord.y-this.offset.y) * this.scale
      return {x: newX, y: newY}

    }
  }

  /** Returns the tile the pointer is currently in, returns null if pointer not in any tile. */
  private static getTile = (tiles: Tile[], x: number, y: number) => {
  for (const tile of tiles) {
    if (tile.enclosesVertex(x, y))
      return tile
    }
    return null
  }

  /** Returns whether 2 coords are within a 'length' of each other */
  private static withinSquare = (x0: number, y0: number, x1: number, y1: number, length: number) => {
    return Math.abs(x0-x1) <= length && Math.abs(y0-y1) <= length
  }

  /** Smoothly transitions from x0 to x1, returns what x0 should become in the next time step. */
  private static smoothTransition = (x0: number, x1: number, timestep: number) => {
    const cutoff = 0.5
    if (Math.abs(x1 - x0) < cutoff) return x1
    // console.log(x1-x0)
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
  private wheel = (event: any) => {
    if (event.ctrlKey) {
      event.preventDefault()
      this.zoom(event)
    }
    else this.scroll(event)
  }
  private keyDown = ({nativeEvent}: {nativeEvent: KeyboardEvent}) => {
    if (nativeEvent.ctrlKey) {
      nativeEvent.preventDefault()
    }
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
    window.addEventListener('wheel', this.wheel, {passive: false})
  }

  shouldComponentUpdate(nextProps: Readonly<{}>, nextState: Readonly<{}>, nextContext: any): boolean {
    return false
  }

  render() {
    const meta = {
      title: "NoteApp",
      meta: {
        viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
      }
    }
    return (
      <div>
        <DocumentMeta {...meta} />
        <canvas 
          onPointerDown={this.pointerDown} 
          onPointerUp={this.pointerUp} 
          onPointerMove={this.pointerMove}
          onPointerLeave={this.pointerUp}
          onKeyDown={this.keyDown}
          onContextMenu={(e) => e.preventDefault()}
          tabIndex={0}
          ref={this.canvasRef}
        />
      </div>
    )
  }
}

export default Canvas
