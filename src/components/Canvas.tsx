import React from 'react'
import DocumentMeta from 'react-document-meta'
import Stroke, { PressureStroke } from './Stroke'
import Tile from './Tile'
import { Box, Coord, StrokeType } from './Interfaces'
import '../App.css'
import { createTextChangeRange } from 'typescript'

type Props = {
  strokeType: StrokeType,
  strokeColor: string,
  strokeSize: number
};

/**
 * Canvas component covering the entire window
 */
class Canvas extends React.Component<Props> {

  // saved const data
  private static defaultRadius = 5 // the pointer radius when doing actions that doesn't specify a radius
  private static uiBoxes = [{x0: 0, x1: 60, y0: 0, y1: 20}] // the hitboxes for UI elements
  private static zoomLevels = [0.1, 0.25, 0.5, 0.]


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
  private tile = new Tile(0, 0) // [relative]
  private history: any[] = [] // saves the history, max useable size of 99 (1 always empty)
  private historyIndex = 0 // where in history we are
  private historyOrigin = 0 // where the "origin index" currently is

  // active states
  private inputType = 0 // 0: mouse, 1: touchpad, 2: touchscreen, 3: pen
  private windowSize = {x: -1, y: -1} // the size of the current window [absolute]
  private mode = 'draw' // the current active action/tool
  private isPointerDown = false // if the pointer's primary button is currently pressed down
  private isErasing = false
  private offset = {x: 0, y: 0} // the offset of the canvas [relative]
  private scale = 1
  private canvasOffset = {x: 0, y: 0} // the starting CSS offset (so canvas is centered) [absolute]
  

  // saved states for animations (mostly)
  private animating = false
  private backupTimestep = -1
  private dpr = 1
  private lastMouseCoord = {x: 0, y: 0} // keeps track of the last mouse position [relative]
  private pointerDownOffset = {x: 0, y: 0} // the canvas offset when pointer is down
  private toOffset = {x: 0, y: 0} // how much more to offset [absolute]
  private cssOffset = {x: 0, y: 0} // how much CSS is offset from content offset [absolute]
  private toScale = this.scale // unlike toOffset, this is the new scale after zooming, not offset
  private zoomCenterAbs = {x: 0, y: 0} // where to zoom from [absolute]
  private zoomCenterRel = {x: 0, y: 0} // [relative]
  private cssScale = 1 // how much CSS is zoomed
  private isZooming = false
  private selectedObjs: any[] = [] // the currently selected objects
  private selectionBox = {x0: 0, x1: 0, y0: 0, y1: 0} // the box around currently selected object(s) [relative]
  private selectMode = 0 // where currently interacting with the selection box. 0: no, 1: move, 2-9: transform
  private selectStart = {x: 0, y: 0} // the starting coords when moving with select tool [relative]
  private activeOffset = {x: 0, y: 0} // the (CSS) offset for the active layer [absolute]
  private activeIsZooming = false // if the active layer is zooming, used for select tool
  private activeZoomCenter = {x: 0, y: 0} // the zoom center for the active layer
  private activeScale = {x: 1, y: 1} // the x and y scale for the active layer
  


  /************************
            Draw
  ************************/

  // when LMB is pressed, begins a new path and move it to the mouse's position
  private startDraw = (pointerEvent: PointerEvent) => {
    this.deselect()
    if (this.props.strokeType === StrokeType.Chisel) {
      this.currStroke = new PressureStroke()
    }

    this.currStroke.setStyle(this.props.strokeColor)
    this.currStroke.setWidth(this.props.strokeSize)
    this.draw(pointerEvent)
    this.rerenderActive()
  }
  // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
  private draw = (pointerEvent: PointerEvent) => {
    if (!this.isPointerDown || this.mode !== 'draw') return
    const offsetDiffX = this.canvasOffset.x + (this.pointerDownOffset.x - (this.offset.x - this.activeOffset.x/this.scale)) * this.scale
    const offsetDiffY = this.canvasOffset.y + (this.pointerDownOffset.y - (this.offset.y - this.activeOffset.y/this.scale)) * this.scale
    const [x, y] = [pointerEvent.clientX-offsetDiffX, pointerEvent.clientY-offsetDiffY] // gets current mouse position

    if (this.currStroke.getLength() !== 0) {
      const last = this.currStroke.getCoord(-1)
      if ((x - last.x)**2 + (y - last.y)**2 < 4*this.dpr**2) return // if didn't move much, don't record
    }
    // draws the line
    this.currStroke.addToPath(x, y, pointerEvent.pressure)
  }
  // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
  private endDraw = () => {
    if (this.currStroke.isEmpty()) return

    Canvas.clearScreen(this.activeContext) // clears active layer
    // converts stroke coords from screen absolute to relative and add to tile
    this.currStroke.map((c: any) => this.processCoord(c, true, this.pointerDownOffset))
    // console.log("before:", this.currStroke.getLength())
    this.currStroke.done(this.scale)
    if (this.currStroke.constructor.name === 'PressureStroke') {
      const pCurrStroke = this.currStroke as PressureStroke
      pCurrStroke.refreshOutline()
    }
    // console.log("after:", this.currStroke.getLength())
    this.addStroke(this.currStroke)
    this.addHistory('draw', this.currStroke)
    this.currStroke = new Stroke()
  }


  /************************
          Erase
  ************************/

  private startErase = (pointerEvent: PointerEvent) => {
    this.deselect() // if selected something, deselect it
    this.isErasing = true
    this.erase(pointerEvent)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  private erase = (pointerEvent: PointerEvent) => {
    if (!this.isErasing) return

    // gets current mouse position
    const mouseCoord = this.offsetMouseCoord(pointerEvent.clientX, pointerEvent.clientY)
    // if mouse didn't move much then don't recheck
    if (Canvas.withinLength(mouseCoord.x, mouseCoord.y, this.lastMouseCoord.x, this.lastMouseCoord.y, 2*this.dpr)) return 
    if (this.tile.isEmpty()) return

    // convert to relative coords and try to find a stroke
    const relMouseCoord = this.processCoord(mouseCoord, true)
    const toErase = this.tile.nearestStroke(relMouseCoord.x, relMouseCoord.y, Canvas.defaultRadius/this.scale)
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
    const [x, y] = [pointerEvent.clientX, pointerEvent.clientY]
    const mouseCoord = this.processCoord(this.offsetMouseCoord(x, y), true) // get relative mouse coords
    this.lastMouseCoord = {x: x, y: y} // logs the absolute coords

    // if clicked within selectionBox don't find new object
    if (this.selectedObjs.length > 0 && this.selectMode !== 0)
      this.selectStart = mouseCoord
    else { // otherwise find a new object
      const selected = this.tile.nearestStroke(mouseCoord.x, mouseCoord.y, Canvas.defaultRadius*this.dpr/this.scale)

      this.deselect()
      if (selected === null) return
      this.addToSelection(selected)
      this.renderSelection()
    }
  }
  private select = (pointerEvent: PointerEvent) => {
    if (this.mode !== 'select' || !this.isPointerDown || this.selectMode === 0) return

    const [x, y] = [pointerEvent.clientX, pointerEvent.clientY] // gets current mouse position

    this.autoScroll(x, y)

    if (this.activeIsZooming) {
      this.zoomSelect(this.offsetMouseCoord(x, y)); return
    }
    const movedX = x - this.lastMouseCoord.x
    const movedY = y - this.lastMouseCoord.y
    if (Math.abs(movedX)+Math.abs(movedY) > this.dpr) {
      switch (this.selectMode) {
        case 1: this.moveActive(movedX, movedY); break; // move
        case 6: // top
        console.log('zoom')
          const midX = (this.selectionBox.x1+this.selectionBox.x0) / 2
          this.activeZoomCenter = {x: midX, y: this.selectionBox.y1}
          this.activeIsZooming = true
          this.zoomSelect(this.offsetMouseCoord(x, y))
          break;
        default: break;
      }
      
      this.lastMouseCoord = {x: x, y: y}
    }
  }
  private selectUp = (pointerEvent: PointerEvent) => {
    if (this.mode !== 'select') return

    this.resetActivePos()
    const c = this.offsetMouseCoord(pointerEvent.clientX, pointerEvent.clientY)
    const selectEnd = this.processCoord(c, true)
    const xDiff = selectEnd.x - this.selectStart.x
    const yDiff = selectEnd.y - this.selectStart.y
    
    if (xDiff !== 0 || yDiff !== 0) {
      switch (this.selectMode) {
        case 1:
            const log = {movedX: xDiff, movedY: yDiff}
            this.addHistory('move', this.selectedObjs, log)
      }
    }

    this.changeCursor(pointerEvent, true)
  }


  /************************
       Other Actions
  ************************/

  private scroll = (wheelEvent: WheelEvent) => {
    if (this.isPointerDown && this.mode === 'draw') return // don't allow scroll while drawing
    if (wheelEvent.shiftKey) this.toOffset.x -= wheelEvent.deltaY // shift+scroll allows horizontal scroll
    else {
      this.toOffset.x -= wheelEvent.deltaX
      this.toOffset.y -= wheelEvent.deltaY
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
    this.zoomCenterAbs = this.offsetMouseCoord(wheelEvent.clientX, wheelEvent.clientY)
    this.zoomCenterRel = this.processCoord(this.zoomCenterAbs, true, newOffset)

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

    this.canvasOffset = {x: Math.round(-newWindowSize.x/2), y: Math.round(-newWindowSize.y/2)}
     // updates canvas config
     for (const context of [this.activeContext, this.contentContext]) {
      context.canvas.width = newCanvasSize.x * 2
      context.canvas.height = newCanvasSize.y * 2
      context.canvas.style.width = `${newWindowSize.x * 2}px`
      context.canvas.style.height = `${newWindowSize.y * 2}px`
      context.canvas.style.left = `${this.canvasOffset.x}px`
      context.canvas.style.top = `${this.canvasOffset.y}px`

      context.scale(this.dpr,this.dpr)
      context.lineCap = 'round' // how the end of each line look
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
    this.renderSelection()
  }

  private undo = () => {
    if (this.historyIndex === this.historyOrigin) return // no more to undo
    const hist = this.history[this.historyIndex]
    if (hist === undefined) return // if empty
    
    this.deselect(false)
    let scrollToBox
    switch (hist.action) {
      case 'draw': this.eraseStroke(hist.data); break;
      case 'erase': this.addStroke(hist.data); break;
      case 'move':
        for (const obj of hist.data) {
          obj.addOffset(-hist.log.movedX, -hist.log.movedY)
          this.addToSelection(obj)
        }
        this.calcSelectionBox()
        scrollToBox = this.selectionBox
        this.renderSelection()
        break;
      default: break;
    }
    if (scrollToBox === undefined) scrollToBox = hist.data.getBoundingBox()
    this.scrollToBox(scrollToBox)

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
    this.deselect(false)
    let scrollToBox
    switch (hist.action) {
    case 'draw': this.addStroke(hist.data); break;
    case 'erase': this.eraseStroke(hist.data); break;
    case 'move':
      for (const obj of hist.data) {
        obj.addOffset(hist.log.movedX, hist.log.movedY)
        this.addToSelection(obj)
      }
      this.calcSelectionBox()
      scrollToBox = this.selectionBox
      this.renderSelection()
      break;
    default: break;
    }
    if (scrollToBox === undefined) scrollToBox = hist.data.getBoundingBox()
    this.scrollToBox(scrollToBox)
  }


  /************************
           Render
  ************************/

  /** "(re)draws" all strokes for ONE canvas layer; optionally takes in a color and redraws all strokes in that color.
   * type: either 'draw', 'erase', or 'refresh' */
   private redraw = (strokes: Stroke[], type='refresh', context=this.contentContext, color: string=undefined) => {

    if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
      Canvas.clearScreen(context)
      return
    }
    // sets to either only draw in the difference or remove the difference
    if (type === 'draw') context.globalCompositeOperation = 'source-over'
    // else if (type === 'erase') context.globalCompositeOperation = 'destination-in'
    else {
      context.globalCompositeOperation = 'source-over'
      Canvas.clearScreen(context)
      console.log("refresh")
    }

    /** adds a stroke to be redrawn */
    const addStroke = (stroke: Stroke) => {
      const strokeColor = color ? color : stroke.getStyle()
      const start = this.processCoord(stroke.getStart(), false) // processe the coord

      if (stroke.constructor.name === 'PressureStroke') { // TODO: Maybe use an enum or something instead / find a better way to handle checking classtype
        const pStroke = stroke as PressureStroke
        let region = new Path2D()
        context.fillStyle = strokeColor
        //region.moveTo(start.x, start.y)

        for (const coord of pStroke.getOutline()) {
          const zoomed = this.processCoord(coord, false) // processes the coord
          region.lineTo(zoomed.x, zoomed.y)
        }

        region.closePath()
        context.fill(region)
      }
      else { // fallback default behavior draws along strokepath
        context.beginPath()
        context.strokeStyle = strokeColor
        context.lineWidth = stroke.getWidth()
        context.moveTo(start.x, start.y)
        context.arc(start.x, start.y, stroke.getWidth()/10, 0, Math.PI*2) // draws a circle at the starting position

        for (const coord of stroke.getCoords()) {
          const zoomed = this.processCoord(coord, false) // processes the coord
          context.lineTo(zoomed.x, zoomed.y)
        }
        context.stroke()
      }
    }

    // adds all strokes to be redrawn and then draws all at once
    strokes.forEach(addStroke)
  }

  /** Re-renders repeatedly until no more changes are detected. 
   * Optionally calls a callback function at every timestep until finished changing. */
  private rerender = (callback: Function=null) => {
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

      if (moved.render || zoomed.render) {
        this.redraw(this.tile.getStrokes(), 'refresh')
        this.renderSelection()
        if (this.currStroke.getLength() > 0) this.drawCurrStroke()
      }
      if (!doneChanging) {
        if (callback) callback(timestep)
        requestAnimationFrame(animate)
      }
      else this.animating = false // stops animating
    }
    requestAnimationFrame(animate)
  }

  /** Keeps re-rendering the active layer until mouse up. */
  private rerenderActive = () => {
    let currLength = this.currStroke.getLength()

    const animate = (timeStamp: DOMHighResTimeStamp) => {
      if (this.mode === 'draw') {
        if (currLength !== this.currStroke.getLength()) {
          // only redraw if a new coord was added
          this.drawCurrStroke(true)
          currLength = this.currStroke.getLength()
        }
      }
      else this.renderSelection()

      if (this.isPointerDown) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  /** redraws this.currStroke; does not clear screen by default. */ 
  private drawCurrStroke = (clear=false) => { 
    if (this.currStroke.getLength() === 0) return // if stroke is empty return
    if (clear) Canvas.clearScreen(this.activeContext)

    console.log("drawing")

    const offsetDiffX = this.pointerDownOffset.x - (this.offset.x - this.cssOffset.x)
    const offsetDiffY = this.pointerDownOffset.y - (this.offset.y - this.cssOffset.y)
    const start = this.currStroke.getStart()
    if (this.currStroke.constructor.name === 'PressureStroke') {
      const pStroke = this.currStroke as PressureStroke
      let region = new Path2D()

      this.activeContext.fillStyle = this.currStroke.getStyle()
      for (const coord of pStroke.getOutline()) {
        region.lineTo(coord.x + offsetDiffX, coord.y + offsetDiffY)
      }

      region.closePath()
      this.activeContext.fill(region)
    }
    else {
      this.activeContext.beginPath()
      this.activeContext.strokeStyle = this.currStroke.getStyle()
      this.activeContext.lineWidth = this.currStroke.getWidth()
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
    }
  }

  /** Renders the selection box and its components. */
  private renderSelection = () => {

    // redraws selected strokes and give them an outline
    const drawSelectedStrokes = () => {
      for (const stroke of this.selectedObjs) {
        stroke.setWidth(stroke.getWidth() + this.dpr*2)
        this.redraw([stroke], 'draw', this.activeContext, 'darkgray')
        stroke.setWidth(stroke.getWidth() - this.dpr*2)
        this.redraw([stroke], 'draw', this.activeContext)
      }
    }

    // draws the selection box
    const drawSelectionBox = () => { 
      // get absolute coords
      const topLeft = this.processCoord({x: this.selectionBox.x0, y: this.selectionBox.y0}, false)
      const bottomRight = this.processCoord({x: this.selectionBox.x1, y: this.selectionBox.y1}, false)

      // draws box
      this.activeContext.beginPath()
      this.activeContext.lineWidth = Math.ceil(this.dpr/2)
      this.activeContext.strokeStyle = 'lightgray'
      this.activeContext.setLineDash([this.dpr, this.dpr*2]) // draws dashed lines
      this.activeContext.strokeRect(topLeft.x, topLeft.y, bottomRight.x-topLeft.x, bottomRight.y-topLeft.y)
      this.activeContext.stroke()
      this.activeContext.lineWidth = this.currStroke.getWidth()
      this.activeContext.setLineDash([]) // back to straight lines

      // draws surrounding circles
      this.activeContext.fillStyle = 'lightgray'
      this.activeContext.strokeStyle = 'darkgray'
      const middle = {x: (topLeft.x+bottomRight.x) / 2, y: (topLeft.y+bottomRight.y) / 2}
      for (const xPos of [topLeft.x, middle.x, bottomRight.x])
        for (const yPos of [topLeft.y, middle.y, bottomRight.y]) {
          if (xPos === middle.x && yPos === middle.y) continue
          this.activeContext.beginPath()
          this.activeContext.arc(xPos, yPos, this.dpr*2, 0, Math.PI*2)
          this.activeContext.fill()
          this.activeContext.stroke()
        }
    }

    Canvas.clearScreen(this.activeContext)
    if (this.selectedObjs.length === 0 || this.mode !== 'select') return
    drawSelectedStrokes()
    drawSelectionBox()
  }

  /** Actively checks the cursor position and changes the cursor if needed. */
  private changeCursor = (pointerEvent: PointerEvent, force=false) => {
    if (!force && this.isPointerDown) return
    if (this.mode !== 'select' || this.selectedObjs.length === 0) return
    const mx = pointerEvent.clientX + this.activeOffset.x
    const my = pointerEvent.clientY + this.activeOffset.y
    const c = this.offsetMouseCoord(mx, my)
    const mouseCoord = this.processCoord(c) // convert mouse coord to relative
    const paddingS = 2*this.dpr, paddingL = 3*this.dpr

    // selection box
    const b = this.selectionBox
    if (Canvas.withinLength(mouseCoord.x, mouseCoord.y, b.x0, b.y0, paddingL)) {  // top left
      this.activeContext.canvas.style.cursor = 'nwse-resize'
      this.selectMode = 2; return
    }
    if (Canvas.withinLength(mouseCoord.x, mouseCoord.y, b.x1, b.y0, paddingL)) {  // top right
      this.activeContext.canvas.style.cursor = 'nesw-resize'
      this.selectMode = 3; return
    }
    if (Canvas.withinLength(mouseCoord.x, mouseCoord.y, b.x0, b.y1, paddingL)) {  // bottom  left
      this.activeContext.canvas.style.cursor = 'nesw-resize'
      this.selectMode = 4; return
    }
    if (Canvas.withinLength(mouseCoord.x, mouseCoord.y, b.x1, b.y1, paddingL)) {  // bottom right
      this.activeContext.canvas.style.cursor = 'nwse-resize'
      this.selectMode = 5; return
    }
    if (Canvas.withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y0}, paddingS)) { // top
      this.activeContext.canvas.style.cursor = 'ns-resize'
      this.selectMode = 6; return
    }
    if (Canvas.withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y1, y1: b.y1}, paddingS)) { // bottom
      this.activeContext.canvas.style.cursor = 'ns-resize'
      this.selectMode = 7; return
    }
    if (Canvas.withinBox(mouseCoord, {x0: b.x0, x1: b.x0, y0: b.y0, y1: b.y1}, paddingS)) { // left
      this.activeContext.canvas.style.cursor = 'ew-resize'
      this.selectMode = 8; return
    }
    if (Canvas.withinBox(mouseCoord, {x0: b.x1, x1: b.x1, y0: b.y0, y1: b.y1}, paddingS)) { // right
      this.activeContext.canvas.style.cursor = 'ew-resize'
      this.selectMode = 9; return
    }
    if (Canvas.withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1})) { // right
      this.activeContext.canvas.style.cursor = 'move'
      this.selectMode = 1; return
    }
    this.activeContext.canvas.style.cursor = 'auto'
    this.selectMode = 0
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
    this.redraw(this.tile.getStrokes(), 'refresh')
  }

  /** Adds an action to history. */
  private addHistory = (action: string, data: any, log: any=undefined) => {
    console.log("added to history:", action)
    this.historyIndex = (this.historyIndex + 1) % 100
    this.history[this.historyIndex] = {action: action, data: data, log: log}
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
      context.canvas.style.transformOrigin = `${centerX}px ${centerY}px`
    context.canvas.style.transform = `scale(${scale})`
  }

  /** Moves the active & content canvases for 1 frame. */
  private animateScroll = (timestep: number) => {
    let doneChanging = true
    let needRender = false

    const cssResetPos = () => { // resets CSS position and need to render
      needRender = true
      //active canvas
      this.activeOffset.x -= this.cssOffset.x
      this.activeOffset.y -= this.cssOffset.y
      this.updateSelection(this.activeOffset.x, this.activeOffset.y)
      this.activeOffset.x = this.activeOffset.y = 0
      this.cssMove(this.activeContext, this.canvasOffset.x, this.canvasOffset.y)
      // content canvas
      this.offset.x -= this.cssOffset.x / this.scale
      this.offset.y -= this.cssOffset.y / this.scale
      this.cssOffset.x = this.cssOffset.y = 0
      this.cssMove(this.contentContext, this.canvasOffset.x, this.canvasOffset.y)
    }
    
    if (this.isZooming) return {done: true, render: false} // if zooming, don't scroll

    let move = {x: 0, y: 0}
    if (this.toOffset.x !== 0) {
      doneChanging = false
      move.x = Canvas.smoothTransition(0, this.toOffset.x, timestep)
      this.toOffset.x -= move.x
      this.cssOffset.x += move.x
    }
    if (this.toOffset.y !== 0) {
      doneChanging = false
      move.y = Canvas.smoothTransition(0, this.toOffset.y, timestep)
      this.toOffset.y -= move.y
      this.cssOffset.y += move.y
    }
    if (Math.abs(this.cssOffset.x) > window.innerWidth/2 || Math.abs(this.cssOffset.y) > window.innerHeight/2)
      cssResetPos() // if scrolled too far, reset CSS offset
    else {
      this.cssMove(this.contentContext, this.canvasOffset.x + this.cssOffset.x, 
                                        this.canvasOffset.y + this.cssOffset.y)
      if (!this.isPointerDown || this.mode !== 'select')
        this.moveActive(move.x, move.y) // only scrolls if not holding down select
    }

    if (doneChanging) cssResetPos()
    return {done: doneChanging, render: needRender}
  }

  /** Zooms the active & content canvases for 1 frame. */
  private animateZoom = (timestep: number) => {
    let render = false

    const cssResetZoom = () => {
      render = true
      // content canvas
      this.offset.x = this.zoomCenterRel.x - this.zoomCenterAbs.x / this.scale
      this.offset.y = this.zoomCenterRel.y - this.zoomCenterAbs.y / this.scale
      this.cssScale = 1
      this.cssZoom(this.contentContext, 1)
      // active canvas
      this.cssZoom(this.activeContext, 1)
      if (this.selectedObjs.length > 0) this.calcSelectionBox() // recalculate padding
    }

    if (this.toScale === this.scale) return {done: true, render: false} // return if not currently zooming
    const zoomDiff = Canvas.smoothTransition(0, (this.toScale-this.scale)*256, timestep) / 256
    this.cssScale *= (this.scale + zoomDiff) / this.scale
    this.scale += zoomDiff

    if (this.cssScale > 1.5 || this.cssScale < 0.75) { // prevent CSS from zooming too much
      cssResetZoom()
    }
    else {
      this.cssZoom(this.contentContext, this.cssScale, this.zoomCenterAbs.x, this.zoomCenterAbs.y)
      if (this.selectedObjs.length > 0)
        this.cssZoom(this.activeContext, this.cssScale, this.zoomCenterAbs.x, this.zoomCenterAbs.y)
    }
    
    if (this.scale === this.toScale) { // finished
      cssResetZoom()
      this.isZooming = false
      return {done: true, render: true}
    }
    return {done: false, render: render}
  }
  
  /** If the bounding box is not on screen, scroll/zoom so it's within the center half of the screen. */
  private scrollToBox = (boundingBox: Box) => {

    const toCoord = {x: 0, y: 0}
      const boundCenter = {x: (boundingBox.x0+boundingBox.x1)/2, y: (boundingBox.y0+boundingBox.y1)/2}
      // get screen size
      const topLeft = this.processCoord({x: -this.canvasOffset.x, y: -this.canvasOffset.y}, true)
      const windowCoord = {x: this.windowSize.x-this.canvasOffset.x, y: this.windowSize.y-this.canvasOffset.y}
      const bottomRight = this.processCoord(windowCoord, true)

    const whereTo = () => { // returns the coord that needs to be on screen
      if (boundCenter.x < topLeft.x) {          // left
        toCoord.x = Math.floor((topLeft.x - boundCenter.x) * this.scale) + windowCoord.x/4
      }
      if (boundCenter.x > bottomRight.x) {      // right
        toCoord.x = Math.floor((bottomRight.x - boundCenter.x) * this.scale) - windowCoord.x/4
      }
      if (boundCenter.y < topLeft.y) {          // top
        toCoord.y = Math.floor((topLeft.y - boundCenter.y) * this.scale) + windowCoord.y/4
      }
      else if (boundCenter.y > bottomRight.y) { // bottom
        toCoord.y = Math.floor((bottomRight.y - boundCenter.y) * this.scale) - windowCoord.y/4
      }
      return toCoord
    }
    const zoomTo = () => { // zoom out if neccessary TODO
      const xZoom = (bottomRight.x - topLeft.x) / (boundingBox.x1 - boundingBox.x0)
      const yDiff = (bottomRight.y - topLeft.y) / (boundingBox.y1 - boundingBox.y0)
    }

    this.toOffset = whereTo() // calculate offset and set the offset
    this.rerender() // let animateScroll() take care of the rest
  }

  /** Takes in mouse coords [client] and autoscrolls if needed. */
  private autoScroll = (x: number, y: number) => {

    /** Keep adding offset while mouse is stationary. */
    const addScroll = (timestep: number=this.backupTimestep) => {
      if (x < this.windowSize.x * 0.05) this.toOffset.x += this.windowSize.x * 0.05 - x
      else if (x > this.windowSize.x * 0.95) this.toOffset.x += this.windowSize.x * 0.95 - x
      if (y < this.windowSize.y * 0.05) this.toOffset.y += this.windowSize.y * 0.05 - y
      else if (y > this.windowSize.y * 0.95) this.toOffset.y += this.windowSize.y * 0.95 - y

      // if (this.lastMouseCoord.x !== x || this.lastMouseCoord.y !== y) return

      if (!this.animating) this.rerender()
    }

    if (!this.isPointerDown) return
    addScroll()
  }

  /** Moves the active layer by (x, y) [absolute]. */
  private moveActive = (offsetX: number, offsetY: number) => {
    if (Math.abs(this.activeOffset.x) > window.innerWidth/2 || Math.abs(this.activeOffset.y) > window.innerHeight/2)
      this.resetActivePos()
    else {
      this.activeOffset.x += offsetX
      this.activeOffset.y += offsetY
      this.cssMove(this.activeContext, this.canvasOffset.x+this.activeOffset.x, this.canvasOffset.y+this.activeOffset.y)
    }
  }

  /** Adds activeOffset to everything in active layer, reset CSS, and re-renders the selection. */
  private resetActivePos = (render=true) => {
    if (this.activeOffset.x === 0 && this.activeOffset.y === 0) return

    if (this.currStroke.getLength() > 0) // current stroke
      this.currStroke.addOffset(this.activeOffset.x, this.activeOffset.y)
    this.updateSelection(this.activeOffset.x, this.activeOffset.y) // selection

    this.activeOffset.x = this.activeOffset.y = 0
    this.cssMove(this.activeContext, this.canvasOffset.x+this.activeOffset.x, 
                                      this.canvasOffset.y+this.activeOffset.y)
    if (render) this.renderSelection()
  }

  /** Calculates the bounding box that surrounds all objects currently selected and updates this.selectionBox. 
   * If no objects, don't update this.selectionBox. */
  private calcSelectionBox = () => {
    if (this.selectedObjs.length === 0) return
    const box = {...this.selectedObjs[0].getBoundingBox()}
    for (let i = 1; i < this.selectedObjs.length; i++) {
      const objBox = this.selectedObjs[i].getBoundingBox()
      if (objBox.x0 < box.x0) box.x0 = objBox.x0
      if (objBox.x1 > box.x1) box.x1 = objBox.x1
      if (objBox.y0 < box.y0) box.y0 = objBox.y0
      if (objBox.y1 > box.y1) box.y1 = objBox.y1
    }

    // add neccessary padding (adds extra if bounding box is too small)
    const padding = 4*this.dpr/this.scale
    box.x0 -= padding
    box.x1 += padding
    box.y0 -= padding
    box.y1 += padding

    this.selectionBox = box
  }

  /** Updates the selection. Takes in [absolute] offsets. */
  private updateSelection = (offsetX: number, offsetY: number) => {
    // selection box
    this.selectionBox.x0 += offsetX/this.scale
    this.selectionBox.x1 += offsetX/this.scale
    this.selectionBox.y0 += offsetY/this.scale
    this.selectionBox.y1 += offsetY/this.scale
    // selected objects
    for (const obj of this.selectedObjs)
      obj.addOffset(offsetX/this.scale, offsetY/this.scale)
  }

  /** Adds one object to selectedObjs. */
  private addToSelection = (obj: any) => {
    this.selectedObjs.push(obj)
    this.calcSelectionBox()
    this.eraseStroke(obj)
  }
  
  /** Deselect everything with an option to render. */
  private deselect = (render=true) => {
    if (this.selectedObjs.length === 0) return
    for (const stroke of this.selectedObjs)
      this.addStroke(stroke)
    this.selectedObjs = []
    if (render) this.renderSelection()
  }

  /** Rescales the selected objects. Mouse coord in [absolute]. */
  private zoomSelect = (mouseCoord: Coord) => {
    const relCoord = this.processCoord(mouseCoord)
    const startDiffX = this.selectStart.x - this.activeZoomCenter.x
    const startDiffY = this.selectStart.y - this.activeZoomCenter.y
    const endDiffX = relCoord.x - this.activeZoomCenter.x
    const endDiffY = relCoord.y - this.activeZoomCenter.y
    if (startDiffX === 0 || startDiffY === 0) return // won't happen, but just in case

    if (this.selectMode === 6 ) this.activeScale.y = endDiffY / startDiffY
    else this.activeScale.x = endDiffX / startDiffX
    
    console.log(this.activeScale.y)
    
  }

  /** Converts coords from absolute to relative and vice versa, returns a NEW coord object.
   * Can optionally pass in a different offset &/ scale
   */
  private processCoord = (coord: Coord, toRelative=true, offset=this.offset, scale=this.scale): Coord => {
    const newCoord = {x: coord.x, y: coord.y}

    if (toRelative) { // to relative
      newCoord.x = newCoord.x / scale + offset.x
      newCoord.y = newCoord.y / scale + offset.y
    }
    else { // from relative
      newCoord.x = (newCoord.x - offset.x) * scale
      newCoord.y = (newCoord.y - offset.y) * scale
    }
    return newCoord
  }

  /** Adds canvas offset to mouse coords. */
  private offsetMouseCoord = (x: number, y: number) => {
    return {x: x - this.canvasOffset.x, y: y - this.canvasOffset.y}
  }

  /** Returns if the current mouse coord [absolute] is on top of UI elements. */
  private onUI = (coord: Coord): Boolean => {
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
  private static withinLength = (x0: number, y0: number, x1: number, y1: number, length: number): Boolean => {
    return Math.abs(x0-x1) <= length && Math.abs(y0-y1) <= length
  }

  /** Returns if a coord is within the box. Optinally adds in a padding on the box on all directions.
   * All should be passed in with the same coord system. */
  private static withinBox = (coord: Coord, box: Box, padding=0): Boolean => {
    return coord.x + padding >= box.x0 && coord.x - padding <= box.x1 
        && coord.y + padding >= box.y0 && coord.y - padding <= box.y1
  }

  /** Smoothly transitions from x0 to x1, returns what x0 should become in the next time step. */
  private static smoothTransition = (x0: number, x1: number, timestep: number): number => {
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
  private pointerDown = (nativeEvent: PointerEvent) => {
    this.pointerDownOffset = {...this.offset}
    const coord = {x: nativeEvent.clientX, y: nativeEvent.clientY}
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
  private pointerUp = (nativeEvent: PointerEvent) => {
    this.isPointerDown = false
    this.endDraw()
    this.endErase()
    this.selectUp(nativeEvent)
  }
  private pointerMove = (nativeEvent: PointerEvent) => {
    this.changeCursor(nativeEvent)
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
  private keyDown = (nativeEvent: KeyboardEvent) => {
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
    window.addEventListener('pointerdown', this.pointerDown)
    window.addEventListener('pointerup', this.pointerUp)
    window.addEventListener('pointermove', this.pointerMove)
    window.addEventListener('pointerleave', this.pointerUp)
    window.addEventListener('keydown', this.keyDown)
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
