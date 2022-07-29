import React from 'react'
import DocumentMeta from 'react-document-meta'
import Stroke from './Stroke'
import Tile from './Tile'
import '../App.css'

type Props = {
  strokeColor: string,
  strokeSize: number
};

/**
 * Canvas component covering the entire window
 */
class Canvas extends React.Component<Props> {

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

  // saved values
  private static defaultRadius = 5 // the pointer radius when doing actions that doesn't specify a radius
  private static uiBoxes = [{x0: 0, x1: 60, y0: 0, y1: 20}] // the hitboxes for UI elements

  // stroke saves
  private currStroke = new Stroke()
  private tile = new Tile(0, 0) // [relative]
  private history: any[] = [] // saves the history, max useable size of 99 (1 always empty)
  private historyIndex = 0 // where in history we are
  private historyOrigin = 0 // where the "origin index" currently is

  // active states
  private windowSize = {x: -1, y: -1} // the size of the active canvas [absolute]
  private mode = 'draw' // the current active action/tool
  private isPointerDown = false // if the pointer's primary button is currently pressed down
  private isErasing = false
  private offset = {x: 0, y: 0} // the offset of the canvas [relative]
  private scale = 1
  private contentOffset = {x: 0, y: 0} // the default CSS offset [absolute]
  

  // saved states for animations (mostly)
  private animating = false
  private backupTimestep = -1
  private dpr = 1
  private lastMouseCoord = {x: 0, y: 0} // keeps track of the last mouse position [relative]
  private pointerDownOffset = {x: 0, y: 0} // the canvas offset when pointer is down
  private toOffset = {x: 0, y: 0} // how much more to offset [content absolute]
  private cssOffset = {x: 0, y: 0} // how much CSS is offset from content offset [absolute]
  private toScale = this.scale // unlike toOffset, this is the new scale after zooming, not offset
  private zoomCenterAbs = {x: 0, y: 0} // where to zoom from [content absolute]
  private zoomCenterRel = {x: 0, y: 0} // [relative]
  private cssScale = 1 // how much CSS is zoomed
  private isZooming = false
  private selectedObjs: any[] = [] // the currently selected objects
  private selectionBox: {x0: number, x1: number, y0: number, y1: number} // the box around currently selected object(s) [relative]
  private isSelected = false // if currently dragging the selection box around
  


  /************************
            Draw
  ************************/

  // when LMB is pressed, begins a new path and move it to the mouse's position
  private startDraw = (pointerEvent: PointerEvent) => {
    this.currStroke.setStyle(this.props.strokeColor)
    this.currStroke.setWidth(this.props.strokeSize)
    // console.log('currStyle', this.currStroke.getStyle())
    // console.log('currWidth', this.currStroke.getWidth())
    this.draw(pointerEvent)
    this.rerenderActive()
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isPointerDown || this.mode !== 'draw') return
    const offsetDiffX = this.pointerDownOffset.x - (this.offset.x - this.cssOffset.x)
    const offsetDiffY = this.pointerDownOffset.y - (this.offset.y - this.cssOffset.y)
    const [x, y] = [pointerEvent.offsetX-offsetDiffX, pointerEvent.offsetY-offsetDiffY] // gets current mouse position

    if (this.currStroke.getLength() !== 0) {
      const last = this.currStroke.getCoord(-1)
      if ((x - last.x)**2 + (y - last.y)**2 < 9) return // if didn't move much, don't record
    } 
    // draws the line
    this.currStroke.addToPath(x, y)
  }
  // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
  private endDraw = () => {
    if (this.currStroke.isEmpty()) return

    // converts stroke coords from screen absolute to relative and add to tile
    this.currStroke.map((c: any) => this.processCoord(c, 0, 2, this.pointerDownOffset))
    // console.log("before:", this.currStroke.getLength())
    this.currStroke.done(this.scale)
    // console.log("after:", this.currStroke.getLength())
    this.addStroke(this.currStroke)
    this.addHistory('draw', this.currStroke)
    this.currStroke = new Stroke()
  }


  /************************
          Erase
  ************************/

  private startErase = (pointerEvent: PointerEvent) => {
    this.isErasing = true
    this.erase(pointerEvent)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  private erase = (pointerEvent: PointerEvent) => {
    if (!this.isErasing) return
    
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    const lastCoordNoOffset = this.processCoord(this.lastMouseCoord, 2, 0)
    // if mouse didn't move much then don't recheck
    if (Canvas.withinLength(x, y, lastCoordNoOffset.x, lastCoordNoOffset.y, 2*this.dpr)) return 
    if (this.tile.isEmpty()) return

    const mouseCoord = this.processCoord({x: x, y: y}, 0, 2)
    const toErase = this.tile.nearestStroke(mouseCoord.x, mouseCoord.y, Canvas.defaultRadius/this.scale)
    if (toErase !== null) { // if found a stroke
      this.addHistory('erase', toErase)
      this.eraseStroke(toErase)
    }
    this.lastMouseCoord = mouseCoord
  }
  private endErase = () => {
    this.isErasing = false
  }


  /************************
          Select
  ************************/

  private selectDown = (pointerEvent: PointerEvent) => {
    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    this.lastMouseCoord = {x: x, y: y}
    const mouseCoord = this.processCoord({x: x, y: y}, 0, 2) // get relative mouse coords

    // if clicked within selectionBox don't do anything
    if (this.selectedObjs.length > 0 && Canvas.withinBox(mouseCoord, this.selectionBox)) {
      this.isSelected = true
    }
    else {
      // otherwise select a new object
      const selected = this.tile.nearestStroke(mouseCoord.x, mouseCoord.y, Canvas.defaultRadius*this.dpr/this.scale)

      this.selectedObjs = [] // clears selected objects
      if (selected !== null) {
        this.selectedObjs.push(selected)
        this.selectionBox = selected.getBoundingBox()
      }
    }
    this.rerenderActive()
  }
  private select = (pointerEvent: PointerEvent) => {
    if (this.mode !== 'select' || !this.isSelected) return

    const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
    const movedX = (x - this.lastMouseCoord.x) / this.scale
    const movedY = (y - this.lastMouseCoord.y) / this.scale
    
    this.selectionBox.x0 += movedX
    this.selectionBox.x1 += movedX
    this.selectionBox.y0 += movedY
    this.selectionBox.y1 += movedY

    this.lastMouseCoord = {x: x, y: y}
  }
  private selectUp = () => {
    this.isSelected = false
  }


  /************************
       Other Actions
  ************************/

  private scroll = (wheelEvent: WheelEvent) => {
    // if (this.isPointerDown || this.isErasing) return // don't allow scroll while doing actions
    if (wheelEvent.shiftKey) this.toOffset.x += -wheelEvent.deltaY // shift+scroll allows horizontal scroll
    else {
      this.toOffset.x += wheelEvent.deltaX
      this.toOffset.y += -wheelEvent.deltaY
    }
    if (!this.animating) this.rerender()
  }

  private zoom = (wheelEvent: WheelEvent) => {
    if (this.isPointerDown || this.isErasing) return // don't allow zoom while doing actions

    // calculates zoomCenter
    const newOffset = {x: this.offset.x, y: this.offset.y}
    if (this.isZooming) { // if already zooming, compute what the offset would be so zoomCenter will be correct
      newOffset.x = this.zoomCenterRel.x - this.zoomCenterAbs.x / this.scale
      newOffset.y = this.zoomCenterRel.y - this.zoomCenterAbs.y / this.scale
    }
    this.zoomCenterAbs = this.processCoord({x: wheelEvent.offsetX, y: wheelEvent.offsetY}, 0, 1)
    this.zoomCenterRel = this.processCoord(this.zoomCenterAbs, 1, 2, newOffset)

    this.toScale += Math.round(this.toScale+1) * Math.sign(-wheelEvent.deltaY) / 12 // scales how much is zoomed
    console.log("zoom", this.toScale)
    // caps the zoom
    if (this.toScale < 0.1) this.toScale = 0.1 
    else if (this.toScale > 20) this.toScale = 20

    this.isZooming = true
    if (!this.animating) this.rerender()
  }

  /** Resizes the canavs, also reapplies default settings. */
  private resize = () => {
    const newWindowSize = {x: window.innerWidth, y: window.innerHeight}
    this.dpr = window.devicePixelRatio * 2
    const newCanvasSize = {x: newWindowSize.x * this.dpr, y: newWindowSize.y * this.dpr}
    // if resize is very small, ignore
    if (Math.abs(this.windowSize.x - newWindowSize.x) + Math.abs(this.windowSize.y - newWindowSize.y) < this.dpr*2) return

    // activeContext
    this.activeContext.canvas.width = newCanvasSize.x
    this.activeContext.canvas.height = newCanvasSize.y
    this.activeContext.canvas.style.width = `${newWindowSize.x}px`
    this.activeContext.canvas.style.height = `${newWindowSize.y}px`

    this.contentContext.canvas.width = newCanvasSize.x * 2
    this.contentContext.canvas.height = newCanvasSize.y * 2
    this.contentContext.canvas.style.width = `${newWindowSize.x * 2}px`
    this.contentContext.canvas.style.height = `${newWindowSize.y * 2}px`
    this.contentOffset = {x: -newWindowSize.x/2, y: -newWindowSize.y/2}
    this.contentContext.canvas.style.left = `${this.contentOffset.x}px`
    this.contentContext.canvas.style.top = `${this.contentOffset.y}px`

    // updates canvas config
    for (const context of [this.activeContext, this.contentContext]) {
      context.scale(this.dpr,this.dpr)
      context.lineCap = 'round' // how the end of each line look
      // context.strokeStyle = 'black' // sets the color of the stroke
      // context.lineWidth = this.strokeWidth
      context.lineJoin = 'round' // how lines are joined
    }

    const canvasDiffX = this.windowSize.x - newWindowSize.x
    const canvasDiffY = this.windowSize.y - newWindowSize.y
    if (this.windowSize.x >= 0) { // shifts offset so center is retained and update canvasSize
      this.offset.x += Math.round(canvasDiffX / this.scale)
      this.offset.y += Math.round(canvasDiffY / this.scale)
    }
    this.windowSize = newWindowSize
    
    this.redraw(this.tile.getStrokes(), 'refresh')
  }

  private undo = () => {
    if (this.historyIndex === this.historyOrigin) return // no more to undo
    const hist = this.history[this.historyIndex]
    if (hist === undefined) return // if empty
    switch (hist.action) {
      case 'draw': this.eraseStroke(hist.data); break;
      case 'erase': this.addStroke(hist.data); break;
      default: break;
    }
    this.scrollToObj(hist.data)

    // decrement history index
    if (this.historyIndex !== 0) this.historyIndex--
    else {
      this.historyIndex = 99
    }
  }
  private redo = () => {
    const nextIndex = (this.historyIndex + 1) % 100
    if (nextIndex === this.historyOrigin) return // if reached end

    const hist = this.history[nextIndex]
    if (hist === undefined) return // if empty

    this.historyIndex = nextIndex
    switch (hist.action) {
    case 'draw': this.addStroke(hist.data); break;
    case 'erase': this.eraseStroke(hist.data); break;
    default: break;
    }
    this.scrollToObj(hist.data)
  }


  /************************
           Render
  ************************/

  /** "(re)draws" all strokes for ONE canvas layer by only drawing the difference;
   * type: either 'draw', 'erase', or 'refresh' */
   private redraw = (strokes: Stroke[], type='refresh', contextNum=1) => {
    const context = contextNum === 1 ? this.contentContext : this.activeContext

    if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
      Canvas.clearScreen(context)
      return
    }
    // sets to either only draw in the difference or remove the difference
    if (type === 'draw') context.globalCompositeOperation = 'source-over'
    else if (type === 'erase') context.globalCompositeOperation = 'destination-in'
    else {
      context.globalCompositeOperation = 'source-over'
      Canvas.clearScreen(context)
      console.log("refresh")
    }

    /** adds a stroke to be redrawn */
    const addStroke = (stroke: Stroke) => {
      const start = this.processCoord(stroke.getStart(), 2, contextNum) // processe the coord
      context.moveTo(start.x, start.y)
      context.arc(start.x, start.y, stroke.getWidth()/10, 0, Math.PI*2) // draws a circle at the starting position
      // for (let i = 1; i < stroke.getLength()-1; i+=2) {
      //   const zoomed1 = this.processCoord(stroke.getCoord(i), 2, 1)
      //   const zoomed2 = this.processCoord(stroke.getCoord(i+1), 2, 1)
      //   context.quadraticCurveTo(zoomed1.x, zoomed1.y, zoomed2.x, zoomed2.y)
      // }
      for (const coord of stroke.getCoords()) {
        const zoomed = this.processCoord(coord, 2, contextNum) // processes the coord
        context.lineTo(zoomed.x, zoomed.y)
      }
      context.stroke()
    }

    // adds all strokes to be redrawn and then draws all at once
    strokes.forEach(addStroke)
  }

  /** Re-renders repeatedly until no more changes are detected. */
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
      const moved = this.animateScroll(timestep)
      const zoomed = this.animateZoom(timestep)
      doneChanging = moved.done && zoomed.done

      if (moved.render || zoomed.render) this.redraw(this.tile.getStrokes(), 'refresh')
      if (!doneChanging) {
        this.rerenderActive()
        window.requestAnimationFrame(animate)
      }
      else this.animating = false // stops animating
    }
    window.requestAnimationFrame(animate)
  }

  /** Re-renders the active layer. All coords in active layer should be absolute. */
  private rerenderActive = () => {
    let currLength = this.currStroke.getLength()

    const animate = (timeStamp: DOMHighResTimeStamp) => {
      let render = false // whether to rerender

      // redraws this.currStroke
      const drawCurrStroke = () => { 
        if (this.currStroke.getLength() === 0) return // if stroke is empty return

        const offsetDiffX = this.pointerDownOffset.x - (this.offset.x - this.cssOffset.x)
        const offsetDiffY = this.pointerDownOffset.y - (this.offset.y - this.cssOffset.y)
        this.activeContext.beginPath()
        this.activeContext.strokeStyle = this.currStroke.getStyle()
        this.activeContext.lineWidth = this.currStroke.getWidth()
        const start = this.currStroke.getStart()
        // moves to start and draws a circle at the starting position
        this.activeContext.moveTo(start.x + offsetDiffX, start.y + offsetDiffY)
        this.activeContext.arc(start.x + offsetDiffX, start.y + offsetDiffY, this.currStroke.getWidth()/10, 0, Math.PI*2) 
        for (const coord of this.currStroke.getCoords()) { // draws the rest
          this.activeContext.lineTo(coord.x + offsetDiffX, coord.y + offsetDiffY)
        }
        const end = this.currStroke.getCoord(-1)
        // draws a 5x circle at the ending position used as cursor
        this.activeContext.arc(end.x + offsetDiffX, end.y + offsetDiffY, this.currStroke.getWidth()/2, 0, Math.PI*2) 
        this.activeContext.stroke()
        currLength = this.currStroke.getLength()
      }

      // redraws selecte strokes and give them an outline
      const drawSelectedStrokes = () => {
        this.redraw(this.selectedObjs, 'draw', 0)
      }

      // draws the selection box
      const drawSelectionBox = () => { 
        if (this.selectedObjs.length === 0 || this.mode !== 'select') return

        const topLeft = this.processCoord({x: this.selectionBox.x0, y: this.selectionBox.y0}, 2, 0)
        const bottomRight = this.processCoord({x: this.selectionBox.x1, y: this.selectionBox.y1}, 2, 0)

        this.activeContext.lineWidth = this.dpr/2
        this.activeContext.setLineDash([this.dpr, this.dpr*2]) // draws dashed lines
        this.activeContext.strokeRect(topLeft.x-this.dpr*2, topLeft.y-this.dpr*2, bottomRight.x-topLeft.x+this.dpr*4, bottomRight.y-topLeft.y+this.dpr*4)

        this.activeContext.lineWidth = this.currStroke.getWidth()
        this.activeContext.setLineDash([]) // back to straight lines
      }

      const isDrawing = this.isPointerDown && this.mode === 'draw'
      
      if (true || this.mode === 'select' || currLength !== this.currStroke.getLength()) { // only redraw if a new coord was added
        console.log("active render", this.isSelected)
        Canvas.clearScreen(this.activeContext)
        drawCurrStroke()
        drawSelectionBox()
      }
      
      if (isDrawing || this.isSelected) window.requestAnimationFrame(animate)
    }
    window.requestAnimationFrame(animate)
  }


  /************************
      Helper Functions
  ************************/

  /** Adds a stroke to tile and calls rerender. */
  private addStroke = (stroke: Stroke) => {
    this.tile.addStroke(stroke)
    this.redraw([stroke], 'draw')
  }

  /** Removes a stroke from tile and calls rerender. */
  private eraseStroke = (stroke: Stroke) => {
    this.tile.removeStroke(stroke.getID())
    this.redraw(this.tile.getStrokes(), 'erase')
  }

  /** Adds an action to history. */
  private addHistory = (action: string, data: any) => {
    this.historyIndex = (this.historyIndex + 1) % 100
    this.history[this.historyIndex] = {action: action, data: data}
    // if added something, bring origin next to history and erase anything there
    this.historyOrigin = (this.historyIndex + 1) % 100
    this.history[this.historyOrigin] = undefined
  }

  /** Changes the CSS offset for a context/canvas [absolute]. */
  private cssMove = (context: any, offsetX: number, offsetY: number) => {
    context.canvas.style.left = `${offsetX}px`
    context.canvas.style.top = `${offsetY}px`
  }

  /** Changes the CSS zoom amount [absolute]. */
  private cssZoom = (context: any, scale: number, centerX: number=undefined, centerY: number=undefined) => {
    if (centerX !== undefined)
      this.contentContext.canvas.style.transformOrigin = `${centerX}px ${centerY}px`
    this.contentContext.canvas.style.transform = `scale(${scale})`
  }

  /** Moves the content canvas for 1 frame. */
  private animateScroll = (timestep: number) => {
    let doneChanging = true
    let needRender = false

    const cssResetPos = () => { // resets CSS position and need to render
      needRender = true
      this.offset.x -= this.cssOffset.x / this.scale
      this.offset.y -= this.cssOffset.y / this.scale
      this.cssOffset.x = this.cssOffset.y = 0
      this.cssMove(this.contentContext, this.contentOffset.x, this.contentOffset.y)
    }
    
    if (this.isZooming) return {done: true, render: false} // if zooming, don't scroll

    if (this.toOffset.x !== 0) {
      doneChanging = false
      const move = Canvas.smoothTransition(0, this.toOffset.x, timestep)
      this.toOffset.x -= move
      this.cssOffset.x += move
    }
    if (this.toOffset.y !== 0) {
      doneChanging = false
      const move = Canvas.smoothTransition(0, this.toOffset.y, timestep)
      this.toOffset.y -= move
      this.cssOffset.y += move
    }
    if (Math.abs(this.cssOffset.x) > window.innerHeight/2 || Math.abs(this.cssOffset.y) > window.innerHeight/2)
      cssResetPos() // if scrolled too far, reset CSS offset
    else this.cssMove(this.contentContext, this.contentOffset.x+this.cssOffset.x, this.contentOffset.y+this.cssOffset.y)

    if (doneChanging) cssResetPos()
    return {done: doneChanging, render: needRender}
  }

  /** Zooms the content canvas for 1 frame. */
  private animateZoom = (timestep: number) => {
    let render = false

    const cssResetZoom = () => {
      this.offset.x = this.zoomCenterRel.x - this.zoomCenterAbs.x / this.scale
      this.offset.y = this.zoomCenterRel.y - this.zoomCenterAbs.y / this.scale
      this.cssScale = 1
      this.cssZoom(this.contentContext, 1)
      render = true
    }

    if (!this.isZooming) return {done: true, render: false} // return if not currently zooming
    const zoomDiff = Canvas.smoothTransition(0, (this.toScale-this.scale)*256, timestep) / 256
    this.cssScale *= (this.scale + zoomDiff) / this.scale
    this.scale += zoomDiff
    if (this.cssScale > 1.5 || this.cssScale < 0.75) { // prevent CSS from zooming too much
      cssResetZoom()
    }
    else this.cssZoom(this.contentContext, this.cssScale, this.zoomCenterAbs.x, this.zoomCenterAbs.y)
    
    if (this.scale === this.toScale) { // finished
      cssResetZoom()
      this.isZooming = false
      return {done: true, render: true}
    }
    return {done: false, render: render}
  }

  private shiftActiveCanvas = (timestep: number) => {
    if (this.mode === 'draw') return // if drawing, don't shift canvas
    const currentOffsetX = this.offset.x - this.cssOffset.x
    const currentOffsetY = this.offset.y - this.cssOffset.y
    if (this.pointerDownOffset.x === currentOffsetX && this.pointerDownOffset.y === currentOffsetY) return

    const shiftX = (this.pointerDownOffset.x - currentOffsetX) / this.scale
    const shiftY = (this.pointerDownOffset.y - currentOffsetY) / this.scale
    console.log("shift", shiftX, shiftY)
    this.cssMove(this.activeContext, shiftX, shiftY)
  }

  /** If the object is not on screen, scroll so it's within the center half of the screen. Optionally performs an action after scrolling.
   * NOTE: object needs to have a 'boundingBox' property. */
  private scrollToObj = (object: any) => {
    const whereTo = () => { // returns the coord that needs to be on screen
      const toCoord = {x: 0, y: 0}
      const boundCenter = {x: (bounds.x0+bounds.x1)/2, y: (bounds.y0+bounds.y1)/2}
      // get screen size
      const topLeft = this.processCoord({x: 0, y: 0}, 0, 2)
      const bottomRight = this.processCoord(this.windowSize, 0, 2)
      
      if (boundCenter.x < topLeft.x) {          // left
        toCoord.x = Math.floor((topLeft.x - boundCenter.x) * this.scale) + this.windowSize.x/4
      }
      else if (boundCenter.x > bottomRight.x) { // right
        toCoord.x = Math.floor((bottomRight.x - boundCenter.x) * this.scale) - this.windowSize.x/4
      }
      if (boundCenter.y < topLeft.y) {          // top
        toCoord.y = Math.floor((topLeft.y - boundCenter.y) * this.scale) + this.windowSize.y/4
      }
      else if (boundCenter.y > bottomRight.y) { // bottom
        toCoord.y = Math.floor((bottomRight.y - boundCenter.y) * this.scale) - this.windowSize.y/4
      }
      return toCoord
    }

    const bounds = object.getBoundingBox() // get the bounds
    if (bounds === null) return // if no bounds do nothing

    this.toOffset = whereTo() // calculate offset and set the offset
    this.rerender() // let animateScroll() take care of the rest
  }

  /** Converts coords from one coordinate (system?) to another, returns a NEW coord object.
   * 0: screen layer [absolute]; 1: content layer [absolute]; 2: strokes coords [relative]
   */
  private processCoord = (coord: {x: number, y: number}, from=1, to=2, offset=this.offset) => {
    const newCoord = {x: coord.x, y: coord.y}
    if (from === to) return newCoord // if same do nothing
    if (from === 0) { // 0 -> 1
      newCoord.x = newCoord.x - this.contentOffset.x
      newCoord.y = newCoord.y - this.contentOffset.y
    }
    if (to === 2) { // to relative
      newCoord.x = newCoord.x / this.scale + offset.x
      newCoord.y = newCoord.y / this.scale + offset.y
    }
    if (from === 2) { // from relative
      newCoord.x = (newCoord.x - offset.x) * this.scale
      newCoord.y = (newCoord.y - offset.y) * this.scale
      if (to === 0) {
        newCoord.x = newCoord.x + this.contentOffset.x
        newCoord.y = newCoord.y + this.contentOffset.y
      }
    }
    return newCoord
  }

  /** Returns if the current mouse coord [absolute] is on top of UI elements. */
  private onUI = (coord: {x: number, y: number}) => {
    const collide = Canvas.uiBoxes.filter((b) => Canvas.withinBox(coord, b))
    if (collide.length === 0) return false
    return true
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
  private static withinLength = (x0: number, y0: number, x1: number, y1: number, length: number) => {
    return Math.abs(x0-x1) <= length && Math.abs(y0-y1) <= length
  }

  /** Returns if a coord is within the box. Both should be passed in with the same coord system. */
  private static withinBox = (coord: {x: number, y: number}, box: {x0: number, x1: number, y0: number, y1: number}) => {
    if (coord.x >= box.x0 && coord.x <= box.x1 && coord.y >= box.y0 && coord.y <= box.y1) return true
    return false
  }

  /** Smoothly transitions from x0 to x1, returns what x0 should become in the next time step. */
  private static smoothTransition = (x0: number, x1: number, timestep: number) => {
    const cutoff = 0.5
    if (Math.abs(x1 - x0) < cutoff) return x1
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
    const coord = {x: nativeEvent.offsetX, y: nativeEvent.offsetY}
    this.pointerDownOffset = {...this.offset}
    if (this.onUI(coord)) return
    if (nativeEvent.button === 0) {
      this.isPointerDown = true
      switch (this.mode) {
        case 'draw': this.startDraw(nativeEvent); break;
        default: this.selectDown(nativeEvent); break;
      }
      
    }
    else if (nativeEvent.button === 2) this.startErase(nativeEvent)
  }
  private pointerUp = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    this.isPointerDown = false
    this.endDraw()
    this.endErase()
    this.selectUp()
  }
  private pointerMove = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
    this.draw(nativeEvent)
    this.erase(nativeEvent)
    this.select(nativeEvent)
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
      switch (nativeEvent.key.toLowerCase()) {
        case 'z': this.undo(); break;
        case 'y': this.redo(); break;
        default: break;
      }
    }
  }
  private toggleSelect = () => {
    this.mode = this.mode === 'select' ? 'draw' : 'select'
    const btn = document.getElementById('btn')
    btn.textContent = this.mode === 'select' ? 'draw' : 'select'
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
        tabIndex={0}
        className="Canvas">

        <DocumentMeta {...meta} />

        <canvas id='active' ref={this.activeCanvasRef} style={{zIndex: 3}} />
        <canvas id='content' ref={this.contentCanvasRef} style={{zIndex: 2}} />
        <button id='btn' onClick={this.toggleSelect} style={{position: 'absolute', zIndex: 99}}> select </button>
      </div>
    )
  }
}

export default Canvas
