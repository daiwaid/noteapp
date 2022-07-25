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

  // reference to canvas layers, in order to pull it after component renders
  // public uiCanvasRef = React.createRef<HTMLCanvasElement>()
  public activeCanvasRef = React.createRef<HTMLCanvasElement>()
  public contentCanvasRef = React.createRef<HTMLCanvasElement>()
  // public backgroundCanvasRef = React.createRef<HTMLCanvasElement>()
  public activeContext: any
  public contentContext: any

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
  private animatingActive = false
  private backupTimestep = -1
  private dpr = 1
  private toOffset = {x: 0, y: 0}
  private toScale = this.scale
  


  /************************
            Draw
  ************************/

  private strokeWidth = 2

  // when LMB is pressed, begins a new path and move it to the mouse's position
  private startDraw = (pointerEvent: PointerEvent) => {
    this.isDrawing = true
    this.draw(pointerEvent)
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isDrawing) return
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    
    // draws the line
    this.currStroke.addToPath(x, y)
    this.rerenderActive()
  }
  // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
  private endDraw = () => {
    this.isDrawing = false
    if (this.currStroke.isEmpty()) return

    // converts stroke from absolute coords to relative coords and add to tile
    this.currStroke.map(this.processCoord)
    this.tile.addStroke(this.currStroke)
    this.currStroke = new Stroke()
    this.rerender()
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
    this.toScale += Math.ceil(this.toScale) * Math.sign(-wheelEvent.deltaY) / 12 // scales how much is zoomed
    console.log("zoom", this.toScale)
    if (this.toScale < 0.1) this.toScale = 0.1 // caps the zoom
    else if (this.toScale > 20) this.toScale = 20
    if (!this.animating) this.rerender()
  }

  /** Resizes the canavs, also reapplies default settings. */
  private resize = () => {
    this.dpr = window.devicePixelRatio * 2
    for (const context of [this.activeContext, this.contentContext]) {
      context.canvas.width = window.innerWidth * this.dpr
      context.canvas.height = window.innerHeight * this.dpr
      context.canvas.style.width = `${window.innerWidth}px`
      context.canvas.style.height = `${window.innerHeight}px`

      context.scale(this.dpr,this.dpr)
      context.lineCap = 'round' // how the end of each line look
      context.strokeStyle = 'black' // sets the color of the stroke
      context.lineWidth = this.strokeWidth
      context.lineJoin = 'round' // how lines are joined
    }
    this.redraw(this.tile.getStrokes(), 'draw')
  }


  /************************
           Render
  ************************/

  /** "(re)draws" all strokes for ONE canvas layer by only drawing the difference;
   * type: either 'draw', 'erase', or 'refresh' */
   private redraw = (strokes: Stroke[], type='refresh', context=this.contentContext) => {

    if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
      Canvas.clearScreen(context)
      return
    }
    // sets to either only draw in the difference or remove the difference
    if (type === 'draw') context.globalCompositeOperation = 'source-out'
    else if (type === 'erase') context.globalCompositeOperation = 'destination-in'
    else {
      context.globalCompositeOperation = 'source-over'
      Canvas.clearScreen(context)
    }

    /** adds a stroke to be redrawn */
    const addStroke = (stroke: Stroke) => {
      const start = this.processCoord(stroke.getStart(), false) // processe the coord
      context.moveTo(start.x, start.y)
      context.arc(start.x, start.y, this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      for (const coord of stroke.getCoords()) {
        const zoomed = this.processCoord(coord, false) // processes the coord
        // context.quadraticCurveTo(path[i*4], path[i*4+1], path[i*4+2], path[i*4+3])
        context.lineTo(zoomed.x, zoomed.y)
      }
    }

    // adds all strokes to be redrawn and then draws all at once
    context.beginPath()
    strokes.forEach(addStroke)
    context.stroke()
  }

  /** Re-renders the content layer repeatedly until no more changes are detected. */
  private rerender = () => {
    let prevTimeStamp = -1

    // renders 1 frame for content layer
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

      this.redraw(this.tile.getStrokes(), 'refresh')
      if (!doneChanging) window.requestAnimationFrame(animate)
      else this.animating = false // stops animating
    }
    window.requestAnimationFrame(animate)
  }

  /** Re-renders the active layer. All coords in active layer should be absolute. */
  private rerenderActive = () => {
    const animate = (timeStamp: DOMHighResTimeStamp) => {

      /** redraws this.currStroke. */
      const absRedraw = () => {
        Canvas.clearScreen(this.activeContext)
        if (this.currStroke.getLength() === 0) return // if stroke is empty return

        this.activeContext.beginPath()
        const start = this.currStroke.getStart()
        this.activeContext.moveTo(start.x, start.y)
        this.activeContext.arc(start.x, start.y, this.strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
        for (const coord of this.currStroke.getCoords()) {
          this.activeContext.lineTo(coord.x, coord.y)
        }
        this.activeContext.stroke()
      }

      absRedraw()
      if (this.isDrawing) window.requestAnimationFrame(animate)
    }
    window.requestAnimationFrame(animate)
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

  /** Clears a canvas layer. */
  private static clearScreen = (context: any) => {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
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
    // gets canvas layers' contexts
    this.activeContext = this.activeCanvasRef.current.getContext('2d')
    this.contentContext = this.contentCanvasRef.current.getContext('2d')

    this.resize()

    // adds event listeners
    window.addEventListener('resize', this.resize)
    window.addEventListener('wheel', this.wheel, {passive: false})
  }

  shouldComponentUpdate(nextProps: Readonly<{}>, nextState: Readonly<{}>, nextContext: any): boolean {
    return false // makes sure component never updates
  }

  render() {
    const meta = { // some HTML tags
      title: "NoteApp",
      meta: {
        // disables zoom on mobile
        viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0"
      }
    }
    return (
      <div
        onPointerDown={this.pointerDown} 
        onPointerUp={this.pointerUp} 
        onPointerMove={this.pointerMove}
        onPointerLeave={this.pointerUp}
        onKeyDown={this.keyDown}
        onContextMenu={(e) => e.preventDefault()}
        tabIndex={0}>

        <DocumentMeta {...meta} />

        <canvas id='active' ref={this.activeCanvasRef} style={{zIndex: 3}} />
        <canvas id='content' ref={this.contentCanvasRef} style={{zIndex: 2}} />
      </div>
    )
  }
}

export default Canvas
