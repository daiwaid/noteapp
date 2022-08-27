import React from 'react'
import { useRef, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { Coord, Point, IndexedObj, Selectable, Box } from '../Interfaces'
import Stroke, { getAllStrokes, nearestStroke, processCoord } from '../helpers/Stroke'
import { copyHistory } from '../helpers/deepCopy'
import store from "../redux/store"
import { addPageOffset, addScale, setPageOffset, setScale } from '../redux/pageSlice'
import { setdpr, setWindowSize } from '../redux/windowSlice'
import { addSelectable, removeSelectable } from '../redux/selectableSlice'
// import { addHistory, redoAction, undoAction } from '../redux/historySlice'                                           // TODO: FIX!!!!
import '../App.css'


const ActiveCanvas = () => {

  /************************
          Variables
  ************************/
  // constants
  const uiBoxes = [{x0: 0, x1: 50, y0: 0, y1: 22}]//, {x0: 50, x1: 500, y0: 0, y1: 50}] // the hitboxes for UI elements
  const defaultRadius = 5 // the pointer radius when doing actions that doesn't specify a radius
  const strokeWidth = 2
  
  // references to canvas and context, used for drawing
  const canvasRef = useRef(null)
   let context: any

  // active states
  let isPointerDown = false
  let mode = "draw" // the current active action/tool
  let isErasing = false
  let currStroke: Stroke = new Stroke()
  let selectedObjs: Stroke[] = []
  let canvasOffset = {x: 0, y: 0} // the starting CSS offset (so canvas is centered) [absolute]

  // saved states for animations (mostly)
  let animating = false // used for re-rendering
  let lastMouseCoord = {x: 0, y: 0} // keeps track of the last mouse position [relative]
  let localOffset = {x: 0, y: 0} // the page offset, but only updates when finished scrolling
  let toOffset = {x: 0, y: 0} // how much more to offset [absolute]
  let scrollOffset = {x: 0, y: 0} // the scrolled amount [absolute]
  let cssOffset = {x: 0, y: 0} // the CSS offset for the active layer [absolute]
  let toScale = 1 // unlike toOffset, this is the new scale after zooming, not offset
  let isZooming = false
  let zoomCenterAbs = {x: 0, y: 0} // where to zoom from [absolute]
  let zoomCenterRel = {x: 0, y: 0} // [relative]
  let cssScale = 1 // how much CSS is zoomed
  let selectionBox = {x0: 0, x1: 0, y0: 0, y1: 0} // the box around currently selected object(s) [relative]
  let selectedBoxes: Box[] = [] // the selection box for all currently selected
  let selectMode = 0 // where currently interacting with the selection box. 0: no, 1: move, 2-9: transform
  let selectStart = {x: 0, y: 0} // the starting coords when moving with select tool [relative]

  /************************
          Draw
  ************************/

  const startDraw = (pointerEvent: PointerEvent) => {
    deselect()

    draw(pointerEvent)
    rerenderActive()
  }
  const draw = (pointerEvent: PointerEvent) => {
    if (!isPointerDown || mode !== 'draw') return

    // gets current mouse position in [relative]
    const mouseCoord = offsetMouseCoord(pointerEvent.clientX, pointerEvent.clientY)
    const relMouseCoord = processCoord(mouseCoord, true)
    
    if (currStroke.length !== 0) { // if didn't move much, don't record
      const last = currStroke.end
      const dpr = store.getState().window.dpr
      if ((relMouseCoord.x - last.x)**2 + (relMouseCoord.y - last.y)**2 < 4*dpr**2) return
    }


    // applies bezier to last coord in path before adding in new coord
    const newPoint = {x: relMouseCoord.x, y: relMouseCoord.y, p: pointerEvent.pressure}
    currStroke.addToPath(newPoint)
  }
  const endDraw = () => {
    if (currStroke.length === 0) return

    currStroke.processStroke()
    storeStroke(currStroke)
    addToHistory('draw', [currStroke])

    clearScreen()
    currStroke = new Stroke()
  }


  /************************
          Erase
  ************************/

  const startErase = (pointerEvent: PointerEvent) => {
    // deselect() // if selected something, deselect it
    isErasing = true
    erase(pointerEvent)
  }
  // loops through all arrays in strokes and remove any stroke close to the mouse
  // when mouse is moving and RMB is pressed
  const erase = (pointerEvent: PointerEvent) => {
    if (!isErasing) return
    // gets current mouse position
    const mouseCoord = offsetMouseCoord(pointerEvent.clientX, pointerEvent.clientY)
    const dpr = store.getState().window.dpr

    // if mouse didn't move much or if no strokes then don't recheck
    if (withinLength(mouseCoord.x, mouseCoord.y, lastMouseCoord.x, lastMouseCoord.y, 2*dpr)) return
    const strokes = getAllStrokes()
    if (strokes.length === 0) return

    // convert to relative coords and try to find a stroke
    const relMouseCoord = processCoord(mouseCoord, true)
    const scale = store.getState().page.scale
    const toErase = nearestStroke(relMouseCoord.x, relMouseCoord.y, 5*dpr/scale)
    if (toErase !== null) { // if found a stroke
      addToHistory('erase', [toErase])
      removeStroke(toErase)
      console.log("erasing")
    }
    lastMouseCoord = mouseCoord
  }
  const endErase = () => {
    isErasing = false
  }

  /************************
          Select
  ************************/

  const selectDown = (pointerEvent: PointerEvent) => {
    const [x, y] = [pointerEvent.clientX, pointerEvent.clientY]
    const relMouseCoord = processCoord(offsetMouseCoord(x, y), true) // get relative mouse coords
    lastMouseCoord = {x: x, y: y} // logs the absolute coords

    // if clicked within selectionBox don't find new object
    if (selectedObjs.length > 0 && selectMode !== 0)
      selectStart = relMouseCoord
    else { // otherwise find a new object
      const scale = store.getState().page.scale
      const dpr = store.getState().window.dpr
      const selected = nearestStroke(relMouseCoord.x, relMouseCoord.y, defaultRadius*dpr/scale)

      deselect()
      if (!selected) return
      addToSelection(selected)
      renderSelection()
    }
  }
  const select = (pointerEvent: PointerEvent) => {
    if (mode !== 'select' || !isPointerDown || selectMode === 0) return

    const dpr = store.getState().window.dpr
    const pos = {x: pointerEvent.clientX, y: pointerEvent.clientY} // gets current mouse position

    const movedX = pos.x - lastMouseCoord.x
    const movedY = pos.y - lastMouseCoord.y
    if (Math.abs(movedX) + Math.abs(movedY) > 2*dpr) {
      if (selectMode === 1) moveActive(movedX, movedY)
      else zoomSelect(movedX, movedY)
      
      lastMouseCoord = pos
      autoScroll()
    }
  }
  const selectUp = (pointerEvent: PointerEvent) => {
    if (mode !== 'select') return

    resetActivePos()
    const mouseCoord = offsetMouseCoord(pointerEvent.clientX, pointerEvent.clientY)
    const selectEnd = processCoord(mouseCoord, true)
    const xDiff = selectEnd.x - selectStart.x
    const yDiff = selectEnd.y - selectStart.y
    
    if (xDiff !== 0 || yDiff !== 0) {
      if (selectMode === 1) {
        const log = {movedX: xDiff, movedY: yDiff}
        addToHistory('move', selectedObjs, log)
      }
      else if (selectMode !== 0) {
        const newBoxes = []
        for (const obj of selectedObjs) {
          obj.calculateSVG()
          newBoxes.push(obj.bounding)
        }
        const log = {moved: calcZoomBox(xDiff, yDiff)}
        addToHistory('scale', selectedObjs, log)
      }
    }

    changeCursor(pointerEvent, true)
  }
        

  /************************
       Other Actions
  ************************/

  const scroll = (wheelEvent: WheelEvent) => {
    if (isPointerDown && mode === 'draw') return // don't allow scroll while drawing
    if (wheelEvent.shiftKey) toOffset.x -= wheelEvent.deltaY // shift+scroll allows horizontal scroll
    else {
      toOffset.x -= wheelEvent.deltaX
      toOffset.y -= wheelEvent.deltaY
    }
    if (!animating) rerender()
  }

  const zoom = (wheelEvent: WheelEvent) => {
    if (isPointerDown || isErasing) return // don't allow zoom while doing actions

    // calculates zoomCenter
    const offset = store.getState().page.offset
    const newOffset = {x: offset.x, y: offset.y}
    if (isZooming) { // if already zooming, compute what the offset would be so zoomCenter will be correct
      newOffset.x = zoomCenterRel.x - zoomCenterAbs.x / toScale
      newOffset.y = zoomCenterRel.y - zoomCenterAbs.y / toScale
    }
    zoomCenterAbs = offsetMouseCoord(wheelEvent.clientX, wheelEvent.clientY)
    zoomCenterRel = processCoord(zoomCenterAbs, true)

    toScale += Math.round(toScale+1) * Math.sign(-wheelEvent.deltaY) / 12 // scales how much is zoomed
    console.log("zoom", toScale)
    // caps the zoom
    if (toScale < 0.1) toScale = 0.1
    else if (toScale > 20) toScale = 20

    isZooming = true
    if (!animating) rerender()
  }

  /** Resizes the canavs, also reapplies default settings. */
  const resize = () => {
    const windowSize = store.getState().window.size
    const scale = store.getState().page.scale
    const dpr = window.devicePixelRatio * 2
    const newWindowSize = {x: window.innerWidth, y: window.innerHeight}
    const newCanvasSize = {x: newWindowSize.x * dpr, y: newWindowSize.y * dpr}

    // if resize is very small, ignore
    if (Math.abs(windowSize.x - newWindowSize.x) + Math.abs(windowSize.y - newWindowSize.y) < 5*dpr) return

    canvasOffset = {x: Math.round(-newWindowSize.x/2), y: Math.round(-newWindowSize.y/2)}
    // updates canvas config
    context.canvas.width = newCanvasSize.x * 2
    context.canvas.height = newCanvasSize.y * 2
    context.canvas.style.width = `${newWindowSize.x * 2}px`
    context.canvas.style.height = `${newWindowSize.y * 2}px`
    context.canvas.style.left = `${canvasOffset.x}px`
    context.canvas.style.top = `${canvasOffset.y}px`
    
    context.scale(dpr, dpr)
    context.lineCap = 'round' // how the end of each line look
    context.lineJoin = 'round' // how lines are joined
    context.lineWidth = strokeWidth

    const canvasDiffX = windowSize.x - newWindowSize.x
    const canvasDiffY = windowSize.y - newWindowSize.y
    // shifts offset so center is retained and update canvasSize
    if (windowSize.x > 0 && windowSize.y > 0) {
      const offset = {x: Math.round(canvasDiffX / scale), y: Math.round(canvasDiffY / scale)}
      dispatch(addPageOffset(offset))
      localOffset.x += offset.x
      localOffset.y += offset.y
    }
    dispatch(setWindowSize(newWindowSize))
    dispatch(setdpr(dpr))

    renderSelection()
  }

  const undo = () => {
    const history = store.getState().history
    if (history.index === history.origin) return // no more to undo
    if (!history.history[history.index]) return // if empty
    const hist = copyHistory(history.history[history.index])
    
    deselect(false)
    let scrollTo
    switch (hist.action) {
      case 'draw':
        removeStroke(hist.data[0]);
        scrollTo = hist.data[0].bounding
        break;
      case 'erase':
        for (const stroke of hist.data)
          storeStroke(stroke);
        scrollTo = hist.data[0].bounding
        break;
      case 'move':
        for (const obj of hist.data) {
          obj.addStartAndBoundingOffset(-hist.log.movedX, -hist.log.movedY)
          addToSelection(obj)
        }
        break;
      case 'scale':
        const inv = {x0: -hist.log.moved.x0, x1: -hist.log.moved.x1, 
                     y0: -hist.log.moved.y0, y1: -hist.log.moved.y1}
        for (const obj of hist.data) {
          obj.moveBounding(inv)
          addToSelection(obj)
        }
        break;
    }
    if (selectedObjs.length > 0) { // renders selected objects
      selectionBox = calcSelectionBox()
      renderSelection()
      if (!scrollTo) scrollTo = selectionBox
    }
    scrollToBox(scrollTo)

    // decrement history index
    // dispatch(undoAction())                                                                                           // TODO: FIX
  }
  const redo = () => {
    const history = store.getState().history
    const nextIndex = (history.index + 1) % 100
    if (nextIndex === history.origin) return // if reached end
    if (!history.history[nextIndex]) return // if empty

    const hist = copyHistory(history.history[nextIndex])
    // dispatch(redoAction()) // update history index                                                                   // TODO: FIX
    
    deselect(false)
    let scrollTo
    switch (hist.action) {
    case 'draw': 
      storeStroke(hist.data[0]);
      scrollTo = hist.data[0].bounding
      break;
    case 'erase': 
    console.log("redo, erased")
      removeStroke(hist.data[0]);
      scrollTo = hist.data[0].bounding
      break;
    case 'move':
      for (const obj of hist.data)
        addToSelection(obj)
      break;
    case 'scale':
      for (const obj of hist.data) {
        addToSelection(obj)
      }
    }
    if (selectedObjs.length > 0) {
      selectionBox = calcSelectionBox()
      renderSelection()
      if (!scrollTo) scrollTo = selectionBox
    }
    scrollToBox(scrollTo)
  }


  /************************
           Render
  ************************/

  /** Draws a single stroke, does not refresh by default. */
  const drawStroke = (stroke: Stroke, clear=false, color: string=undefined, width=strokeWidth) => {
    if (!stroke) { // if no stroke then just clear screen
      clearScreen()
      return
    }
    if (clear) clearScreen()

    context.strokeStyle = color ? color : stroke.styles.color
    const scale = store.getState().page.scale
    context.lineWidth = width * scale

    context.beginPath()
    const start = processCoord(stroke.start, false, localOffset) // processe the coord
    context.moveTo(start.x, start.y)
    context.arc(start.x, start.y, width/10, 0, Math.PI*2) // draws a circle at the starting position

    for (const coord of stroke.getPoints()) {
      const zoomed = processCoord(coord, false, localOffset) // processes the coord
      context.lineTo(zoomed.x, zoomed.y)
    }
    context.stroke()
  }

  /** Keeps re-rendering the canvas until mouse up. */
  const rerenderActive = () => {
    let currLength = currStroke.length

    const animate = (timeStamp: DOMHighResTimeStamp) => {
      if (mode === 'draw') {
        if (currLength !== currStroke.length && currStroke.length > 0) {
          // only redraw if a new coord was added
          drawStroke(currStroke, true, undefined, undefined)
          currLength = currStroke.length
        }
      }
      else renderSelection()

      if (isPointerDown) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  /** Renders the selection box and its components. */
  const renderSelection = () => {

    // redraws selected strokes and give them an outline
    const drawSelectedStrokes = () => {
      const dpr = store.getState().window.dpr
      for (const stroke of selectedObjs) {
        drawStroke(stroke, false, 'darkgray', strokeWidth + dpr*2)
        drawStroke(stroke)
      }
    }

    // draws the selection box
    const drawSelectionBox = () => { 
      // get absolute coords
      const topLeft = processCoord({x: selectionBox.x0, y: selectionBox.y0}, false, localOffset)
      const bottomRight = processCoord({x: selectionBox.x1, y: selectionBox.y1}, false, localOffset)
      const dpr = store.getState().window.dpr

      // draws box
      context.beginPath()
      context.lineWidth = Math.ceil(dpr/2)
      context.strokeStyle = 'lightgray'
      context.setLineDash([dpr, dpr*2]) // draws dashed lines
      context.strokeRect(topLeft.x, topLeft.y, bottomRight.x-topLeft.x, bottomRight.y-topLeft.y)
      context.stroke()
      context.setLineDash([]) // back to straight lines

      // draws surrounding circles
      context.fillStyle = 'lightgray'
      context.strokeStyle = 'darkgray'
      const middle = {x: (topLeft.x+bottomRight.x) / 2, y: (topLeft.y+bottomRight.y) / 2}
      for (const xPos of [topLeft.x, middle.x, bottomRight.x])
        for (const yPos of [topLeft.y, middle.y, bottomRight.y]) {
          if (xPos === middle.x && yPos === middle.y) continue
          context.beginPath()
          context.arc(xPos, yPos, dpr*2, 0, Math.PI*2)
          context.fill()
          context.stroke()
        }
    }

    clearScreen()
    if (selectedObjs.length === 0 || mode !== 'select') return
    drawSelectedStrokes()
    drawSelectionBox()
  }

  /** Re-renders repeatedly until no more changes are detected. 
   * Optionally calls a callback function at every timestep until finished changing. */
   const rerender = (callback: Function=null) => {
    let prevTimeStamp = -1

    // renders 1 frame for content layer
    const animate = (timeStamp: DOMHighResTimeStamp) => {
      animating = true // starts animating
      let doneChanging = true

      // gets the timestep since last frame
      let timestep
      if (prevTimeStamp === -1) timestep = 1
      else timestep = timeStamp - prevTimeStamp
      prevTimeStamp = timeStamp

      // checks page movement and zoom
      const moved = animateScroll(timestep)
      const zoomed = animateZoom(timestep)
      doneChanging = moved.done && zoomed.done

      if (moved.render || zoomed.render)
        renderSelection()
      if (!doneChanging) {
        if (callback) callback(timestep)
        requestAnimationFrame(animate)
      }
      else animating = false
    }
    requestAnimationFrame(animate)
  }

  /** Actively checks the cursor position and changes the cursor if needed. */
  const changeCursor = (pointerEvent: PointerEvent, force=false) => {
    if (!force && isPointerDown) return
    if (mode !== 'select' || selectedObjs.length === 0) return
    const mx = pointerEvent.clientX + cssOffset.x
    const my = pointerEvent.clientY + cssOffset.y
    const c = offsetMouseCoord(mx, my)
    const mouseCoord = processCoord(c) // convert mouse coord to relative
    const dpr = store.getState().window.dpr
    const scale = store.getState().page.scale
    const padding = 3*dpr/scale

    // selection box
    const b = selectionBox
    if (withinLength(mouseCoord.x, mouseCoord.y, b.x0, b.y0, padding)) {  // top left
      context.canvas.style.cursor = 'nwse-resize'
      selectMode = 2; return
    }
    if (withinLength(mouseCoord.x, mouseCoord.y, b.x1, b.y0, padding)) {  // top right
      context.canvas.style.cursor = 'nesw-resize'
      selectMode = 3; return
    }
    if (withinLength(mouseCoord.x, mouseCoord.y, b.x0, b.y1, padding)) {  // bottom  left
      context.canvas.style.cursor = 'nesw-resize'
      selectMode = 4; return
    }
    if (withinLength(mouseCoord.x, mouseCoord.y, b.x1, b.y1, padding)) {  // bottom right
      context.canvas.style.cursor = 'nwse-resize'
      selectMode = 5; return
    }
    if (withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y0}, padding)) { // top
      context.canvas.style.cursor = 'ns-resize'
      selectMode = 6; return
    }
    if (withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y1, y1: b.y1}, padding)) { // bottom
      context.canvas.style.cursor = 'ns-resize'
      selectMode = 7; return
    }
    if (withinBox(mouseCoord, {x0: b.x0, x1: b.x0, y0: b.y0, y1: b.y1}, padding)) { // left
      context.canvas.style.cursor = 'ew-resize'
      selectMode = 8; return
    }
    if (withinBox(mouseCoord, {x0: b.x1, x1: b.x1, y0: b.y0, y1: b.y1}, padding)) { // right
      context.canvas.style.cursor = 'ew-resize'
      selectMode = 9; return
    }
    if (withinBox(mouseCoord, {x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1})) { // right
      context.canvas.style.cursor = 'move'
      selectMode = 1; return
    }
    context.canvas.style.cursor = 'auto'
    selectMode = 0
  }


  /************************
      Helper Functions
  ************************/

  /** Stores a stroke into selectableSlice. */
  const storeStroke = (stroke: Stroke) => {
    dispatch(addSelectable(stroke))
  }

  /** Removes a stroke from selectableSlice. */
  const removeStroke = (stroke: Stroke) => {
    dispatch(removeSelectable(stroke.id))
  }

  /** Adds a copy of an action to history. */
  const addToHistory = (action: string, data: any, log: any=undefined) => {
    // console.log("added to history:", action)
    const newHist = copyHistory({action: action, data: data, log: log})
    if (toOffset.y !== 0 || toOffset.x !== 0) { // if still scrolling, add in the scrolled offset
      const scale = store.getState().page.scale
      for (const obj of newHist.data)
        obj.addStartAndBoundingOffset(-scrollOffset.x / scale, -scrollOffset.y / scale)
    }
    // dispatch(addHistory(newHist))                                                                                    // TODO: FIX
  }

  /** Changes the CSS offset for the canvas [absolute]. */
  const cssMove = (offsetX: number, offsetY: number) => {
    context.canvas.style.left = `${offsetX}px`
    context.canvas.style.top = `${offsetY}px`
  }

  /** Changes the CSS zoom amount [absolute]. */
  const cssZoom = (scale: number, centerX: number=undefined, centerY: number=undefined) => {
    if (centerX !== undefined)
      context.canvas.style.transformOrigin = `${centerX}px ${centerY}px`
    context.canvas.style.transform = `scale(${scale})`
  }


  /** Moves the active & content canvases for 1 frame. */
  const animateScroll = (timestep: number) => {
    let doneChanging = true
    let needRender = false

    const cssResetPos = () => {
      needRender = true
      localOffset.x -= scrollOffset.x / scale
      localOffset.y -= scrollOffset.y / scale
      cssOffset.x -= scrollOffset.x
      cssOffset.y -= scrollOffset.y
      updateSelection(cssOffset.x, cssOffset.y)
      cssMove(canvasOffset.x, canvasOffset.y)
      cssOffset.x = cssOffset.y = 0
      scrollOffset.x = scrollOffset.y = 0
    }
    
    if (isZooming) return {done: true, render: false} // if zooming, don't scroll

    let move = {x: 0, y: 0}
    if (toOffset.x !== 0) {
      doneChanging = false
      move.x = smoothTransition(0, toOffset.x, timestep)
      toOffset.x -= move.x
      scrollOffset.x += move.x
    }
    if (toOffset.y !== 0) {
      doneChanging = false
      move.y = smoothTransition(0, toOffset.y, timestep)
      toOffset.y -= move.y
      scrollOffset.y += move.y
    }

    // updates page offset
    const scale = store.getState().page.scale
    dispatch(addPageOffset({x: -move.x/scale, y: -move.y/scale}))

    if (!isPointerDown || mode !== 'select') // only scrolls if not holding down select
      needRender = moveActive(move.x, move.y)
    if (Math.abs(scrollOffset.x) > window.innerWidth/2 || Math.abs(scrollOffset.y) > window.innerHeight/2)
      cssResetPos() // if scrolled too far, reset CSS offset

    if (doneChanging) cssResetPos()
    return {done: doneChanging, render: needRender}
  }

  /** Zooms the active & content canvases for 1 frame. */
  const animateZoom = (timestep: number) => {
    let render = false

    const cssResetZoom = () => {
      render = true
      
      localOffset = {...newOffset}
      cssScale = 1
      cssZoom(1)
      if (selectedObjs.length > 0) // recalculate padding
        selectionBox = calcSelectionBox()
    }

    if (!isZooming) return {done: true, render: false} // return if not currently zooming
    
    const scale = store.getState().page.scale
    const zoomDiff = smoothTransition(0, (toScale-scale)*256, timestep) / 256
    const newScale = scale + zoomDiff
    cssScale *= newScale / scale
    dispatch(setScale(newScale))
    const newOffset: Coord = {x: undefined, y: undefined}
    newOffset.x = zoomCenterRel.x - zoomCenterAbs.x / newScale
    newOffset.y = zoomCenterRel.y - zoomCenterAbs.y / newScale
    dispatch(setPageOffset(newOffset))

    if (cssScale > 1.25 || cssScale < 0.8) // prevent CSS from zooming too much
      cssResetZoom()
    else if (selectedObjs.length > 0)
        cssZoom(cssScale, zoomCenterAbs.x, zoomCenterAbs.y)
    
    if (newScale === toScale) { // finished
      cssResetZoom()
      isZooming = false
      return {done: true, render: true}
    }
    return {done: false, render: render}
  }

  /** If the bounding box is not on screen, scroll/zoom so it's within the center half of the screen. */
  const scrollToBox = (boundingBox: Box) => {
    const toCoord = {x: 0, y: 0}
    const boundCenter = {x: (boundingBox.x0+boundingBox.x1)/2, y: (boundingBox.y0+boundingBox.y1)/2}
    // get screen size
    const topLeft = processCoord({x: -canvasOffset.x, y: -canvasOffset.y}, true)
    const windowSize = store.getState().window.size
    const windowCoord = {x: windowSize.x-canvasOffset.x, y: windowSize.y-canvasOffset.y}
    const bottomRight = processCoord(windowCoord, true)

    const whereTo = () => { // returns the coord that needs to be on screen
      const scale = store.getState().page.scale
      if (boundCenter.x < topLeft.x) {          // left
        toCoord.x = Math.floor((topLeft.x - boundCenter.x) * scale) + windowCoord.x/4
      }
      if (boundCenter.x > bottomRight.x) {      // right
        toCoord.x = Math.floor((bottomRight.x - boundCenter.x) * scale) - windowCoord.x/4
      }
      if (boundCenter.y < topLeft.y) {          // top
        toCoord.y = Math.floor((topLeft.y - boundCenter.y) * scale) + windowCoord.y/4
      }
      else if (boundCenter.y > bottomRight.y) { // bottom
        toCoord.y = Math.floor((bottomRight.y - boundCenter.y) * scale) - windowCoord.y/4
      }
      return toCoord
    }
    const zoomTo = () => { // zoom out if neccessary TODO
      const xZoom = (bottomRight.x - topLeft.x) / (boundingBox.x1 - boundingBox.x0)
      const yDiff = (bottomRight.y - topLeft.y) / (boundingBox.y1 - boundingBox.y0)
    }

    toOffset = whereTo() // calculate offset and set the offset
    rerender() // let animateScroll() take care of the rest
  }

  /** Checks lastMouseCoord [client] and autoscrolls if needed. */
  const autoScroll = () => {

    /** Keep adding offset while mouse is stationary. */
    const addScroll = (timestep: number=1) => {
      if (!isPointerDown) return // if pointer up stop adding offset
      const windowSize = store.getState().window.size
      const dpr = store.getState().window.dpr
      // set auto scroll area to be the outer 10% of smaller side
      const scrollArea = Math.min(windowSize.x, windowSize.y) * 0.05

      if (lastMouseCoord.x < scrollArea)
        toOffset.x += (scrollArea - lastMouseCoord.x) * dpr / timestep
      else if (lastMouseCoord.x > windowSize.x - scrollArea)
        toOffset.x += (windowSize.x - scrollArea - lastMouseCoord.x) * dpr / timestep
      if (lastMouseCoord.y < scrollArea)
        toOffset.y += (scrollArea - lastMouseCoord.y) * dpr / timestep
      else if (lastMouseCoord.y > windowSize.y - scrollArea)
        toOffset.y += (windowSize.y - scrollArea - lastMouseCoord.y) * dpr / timestep

      if (!animating) rerender(addScroll)
    }

    addScroll()
  }

  /** Moves the active layer by (x, y) [absolute]. Returns whether a re-render is needed. */
  const moveActive = (offsetX: number, offsetY: number): boolean => {
    if (Math.abs(cssOffset.x) > window.innerWidth/2 || Math.abs(cssOffset.y) > window.innerHeight/2) {
      resetActivePos()
      return true
    }
    cssOffset.x += offsetX
    cssOffset.y += offsetY
    cssMove(canvasOffset.x+cssOffset.x, canvasOffset.y+cssOffset.y)
    return false
  }

  /** Adds cssOffset to everything in the canvas, reset CSS, and re-renders the selection. */
  const resetActivePos = (render=true) => {
    if (cssOffset.x === 0 && cssOffset.y === 0) return

    if (currStroke.length > 0) // add cssOffset to all points in currPath
      currStroke.addStartOffset(cssOffset.x, cssOffset.y)
    updateSelection(cssOffset.x, cssOffset.y) // selection

    cssOffset.x = cssOffset.y = 0
    cssMove(canvasOffset.x, canvasOffset.y)
    if (render) renderSelection()
  }

  /** Adds one object to selectedObjs. */
  const addToSelection = (obj: any) => {
    selectedObjs.push(obj)
    selectedBoxes.push(obj.boundingBox)
    selectionBox = calcSelectionBox()
    removeStroke(obj)
  }

  /** Deselect everything with an option to render. */
  const deselect = (render=true) => {
    if (selectedObjs.length === 0) return
    for (const stroke of selectedObjs)
      storeStroke(stroke)
    selectedObjs = []
    if (render) renderSelection()
  }

  /** Calculates and returns the bounding box that surrounds all objects currently selected.
   * Adds [absolute] padding on all sides. */
   const calcSelectionBox = (): Box => {
    if (selectedObjs.length === 0) return // If no objects, don't update

    const box = {...selectedObjs[0].bounding}
    for (let i = 1; i < selectedObjs.length; i++) {
      const objBox = selectedObjs[i].bounding
      if (objBox.x0 < box.x0) box.x0 = objBox.x0
      if (objBox.x1 > box.x1) box.x1 = objBox.x1
      if (objBox.y0 < box.y0) box.y0 = objBox.y0
      if (objBox.y1 > box.y1) box.y1 = objBox.y1
    }

      // add neccessary padding (adds extra if bounding box is too small)
      const dpr = store.getState().window.dpr
      const scale = store.getState().page.scale
      const p = 4*dpr/scale
      box.x0 -= p
      box.x1 += p
      box.y0 -= p
      box.y1 += p

    return box
  }

  /** Updates the selection. Takes in [absolute] offsets. */
  const updateSelection = (offsetX: number, offsetY: number) => {
    const scale = store.getState().page.scale
    // selection box
    selectionBox.x0 += offsetX/scale
    selectionBox.x1 += offsetX/scale
    selectionBox.y0 += offsetY/scale
    selectionBox.y1 += offsetY/scale
    // selected objects
    for (const obj of selectedObjs)
      obj.addStartAndBoundingOffset(offsetX/scale, offsetY/scale)
  }

  /** Rescales the selected objects. Mouse coord in [absolute]. */
  const zoomSelect = (movedX: number, movedY: number) => {
    if (!isPointerDown) return

    const scale = store.getState().page.scale
    const toMove = calcZoomBox(movedX/scale, movedY/scale)
    
    for (const obj of selectedObjs)
      obj.moveBounding(toMove)
    selectionBox = calcSelectionBox()
    renderSelection()
  }

  /** Calculates toMove box based on current select mode and moved distances.
   * Passed in coords are [relative]. */
  const calcZoomBox = (movedX: number, movedY: number): Box => {

    const mean1 = (movedX + movedY) / 2
    const mean2 = (movedX - movedY) / 2
    const toMove = {x0: 0, x1: 0, y0: 0, y1: 0}

    switch (selectMode) {
      case 2: // top left
        toMove.x0 = mean1
        toMove.y0 = mean1
        break
      case 3: // top right
        toMove.x1 = mean2
        toMove.y0 = -mean2
        break
      case 4: // bottom left
        toMove.x0 = mean2
        toMove.y1 = -mean2
        break
      case 5: // bottom right
        toMove.x1 = mean1
        toMove.y1 = mean1
        break
      case 6: // top
        toMove.y0 = movedY
        break
      case 7: // bottom
        toMove.y1 = movedY
        break
      case 8: // left
        toMove.x0 = movedX
        break
      case 9: // right
        toMove.x1 = movedX
        break
      default: break;
    }
    return toMove
  }

  /** Adds canvas offset to mouse coords. */
  const offsetMouseCoord = (x: number, y: number): Coord => {
    return {x: x-canvasOffset.x, y: y-canvasOffset.y}
  }

  /** Smoothly transitions from x0 to x1, returns what x0 should become in the next time step. */
  const smoothTransition = (x0: number, x1: number, timestep: number): number => {
    const cutoff = 0.5
    if (Math.abs(x1 - x0) < cutoff) return x1
    return x0 + Math.sign(x1-x0) * ((Math.abs(x1-x0)+300)**2 / 2**13 - 10.5) * timestep/8
  }

  /** Returns whether 2 coords are within a 'length' of each other */
  const withinLength = (x0: number, y0: number, x1: number, y1: number, length: number): boolean => {
    return Math.abs(x0-x1) <= length && Math.abs(y0-y1) <= length
  }

  /** Returns if a coord is within the box. Optinally adds in a padding on the box on all directions.
   * All should be passed in with the same coord system. */
   const withinBox = (coord: Coord, box: Box, padding=0): boolean => {
    return coord.x + padding >= box.x0 && coord.x - padding <= box.x1 
        && coord.y + padding >= box.y0 && coord.y - padding <= box.y1
  }

  /** Clears the screen. */
  const clearScreen = () => {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  }

  /** Returns if the current mouse coord [absolute] is on top of UI elements. */
  const onUI = (coord: Coord): boolean => {
    const collide = uiBoxes.filter((b) => withinBox(coord, b))
    if (collide.length === 0) return false
    return true
  }

  /** Dispatch for Redux. */
  const dispatch = useDispatch()


  /************************
       Process Events
  ************************/
  // will direct to different functions depending on button pressed
  // NOTE: buttons is a bitmask; LMB=1, RMB=2, MMB=4, back=8, forward=16, pen eraser=32
  const pointerDown = (nativeEvent: PointerEvent) => {
    const coord = {x: nativeEvent.clientX, y: nativeEvent.clientY}
    if (onUI(coord)) return

    if (nativeEvent.button === 0) {
      isPointerDown = true
      switch (mode) {
        case 'draw': startDraw(nativeEvent); break;
        default: selectDown(nativeEvent); break;
      }
    }
    else if (nativeEvent.button === 2) startErase(nativeEvent)
  }
  const pointerUp = (nativeEvent: PointerEvent) => {
    isPointerDown = false
    endDraw()
    endErase()
    selectUp(nativeEvent)
  }
  const pointerMove = (nativeEvent: PointerEvent) => {
    changeCursor(nativeEvent)
    draw(nativeEvent)
    erase(nativeEvent)
    select(nativeEvent)
  }
  const keyDown = (nativeEvent: KeyboardEvent) => {
    if (nativeEvent.ctrlKey) {
      nativeEvent.preventDefault()
      switch (nativeEvent.key.toLowerCase()) {
        case 'z': undo(); break;
        case 'y': redo(); break;
        default: break;
      }
    }
  }
  const wheel = (event: any) => {
    if (event.ctrlKey) {
      event.preventDefault()
      zoom(event)
    }
    else scroll(event)
  }

  const toggleSelect = () => {
    mode = mode === 'select' ? 'draw' : 'select'
    const btn = document.getElementById('btn')
    btn.textContent = mode === 'select' ? 'draw' : 'select'
  }


  /************************
          useEffect
  ************************/

  // initializes canvas
  useEffect(() => {
    // get context and initializes everything
    context = canvasRef.current.getContext('2d')
    resize()

    // add event listeners
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerleave', pointerUp)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('resize', resize)
    window.addEventListener('wheel', wheel, {passive: false})
  }, [])

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      tabIndex={0}
      className="Canvas" >

      <canvas ref={canvasRef} style={{zIndex: 10}} />

      <button id='btn' onClick={toggleSelect} style={{position: 'absolute', zIndex: 99}}> select </button>

    </div>
      
  )
}

export default ActiveCanvas