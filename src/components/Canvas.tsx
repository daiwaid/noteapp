import { useRef, useEffect, useState } from 'react'

/**
 * Wrapper class for strokes
 */
class Stroke {
  static masterId: number = 0
  path: number[]
  startX: number|undefined              // these two might not want to be undefined
  startY: number|undefined
  id: number

  constructor(path: number[]=[]) {
    this.path = path
    this.id = Stroke.masterId++

    if (path.length !== 0) {
      this.setStart(path[0], path[1])
    }
  }

  addToPath(offsetX: number, offsetY: number) {
    if (this.path.length === 0) {
      this.setStart(offsetX, offsetY)
    }

    this.path.push(offsetX, offsetY)
  }

  getLength() {
    return this.path.length / 2
  }

  // Note: Private helper, probably unnecessary.
  setStart(startX: number, startY: number) {
    this.startX = startX
    this.startY = startY
  }

  // custom iterator, returns a list [x, y] on each iteration
  [Symbol.iterator]() {
    let index = 0
    return {
      next: () => {
        if (index < this.getLength()) {
          const coordinate:[number, number] = [this.path[index*2], this.path[index*2+1]]
          let result: {value: [number, number], done: boolean}  = {value: coordinate, done: false}  // TODO: MASSIVELY JANK
          index++
          return result
        }
        return {value: index, done: true}
      }
    }
  }
}

class Tile { // potentially divide up the screen to a few tiles so when erasing we only check strokes in one tile
  static size = 2000 // size of each tile
  startX: number // top left (smaller)
  startY: number
  endX: number // bottom right (bigger)
  endY: number
  strokes: Stroke[]
  strokeIDs: number[]
  neighboringTiles: Tile[]

  constructor(x: number, y: number) { 
    this.startX = x
    this.startY = y
    this.endX = x + Tile.size
    this.endY = y + Tile.size

    this.strokes = []
    this.strokeIDs = []
  }

  addStroke(stroke: Stroke) {
    this.strokes.push(stroke)
    this.strokeIDs.push(stroke.id)
  }
  removeStroke(strokeID: number) {
    if (!this.strokeIDs.includes(strokeID)) return
    this.strokes = this.strokes.filter((s) => s.id !== strokeID)
  }
}

// The canvas class, covers the entire window
const Canvas = (props: {}) => { 

    /************************
            Variables
    ************************/
    // references to canvas and context, used for drawing
    const canvasRef = useRef(null)
    const contextRef = useRef(null)

    // states
    let isDrawing = false
    let isErasing = false
    let currStroke = new Stroke()

    let onScreenTiles: Tile[] = []


    /************************
          Mouse Events
    ************************/
    // will direct to different functions depending on button pressed
    const pointerDown = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      if (nativeEvent.button === 0) startDraw(nativeEvent)
      else if (nativeEvent.button === 2) startErase(nativeEvent)
    }
    const pointerUp = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      if (nativeEvent.button === 0 || nativeEvent.button === -1) endDraw()
      if (nativeEvent.button === 2 || nativeEvent.button === -1) endErase()
    }
    const pointerMove = ({nativeEvent}: {nativeEvent: PointerEvent}) => {
      draw(nativeEvent)
      erase(nativeEvent)
    }


    /************************
            Draw
    ************************/
    const strokeWidth = 2

    // when LMB is pressed, begins a new path and move it to the mouse's position
    const startDraw = (pointerEvent: PointerEvent) => {
      isDrawing = true
      const {offsetX, offsetY} = pointerEvent
      contextRef.current.beginPath()
      contextRef.current.moveTo(offsetX, offsetY)
      contextRef.current.arc(offsetX, offsetY, strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      contextRef.current.stroke() // actually draws it
      currStroke.addToPath(offsetX, offsetY) // adds x, y to currStroke
      // console.log(currStroke)
    }
    // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
    const draw = (pointerEvent: PointerEvent) => {
      if (!isDrawing) return
      const {offsetX, offsetY} = pointerEvent // gets current mouse position
      currStroke.addToPath(offsetX, offsetY) // adds x, y to currStroke

      // draws the line
      contextRef.current.lineTo(offsetX, offsetY)
      contextRef.current.stroke()
    }
    // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
    const endDraw = () => {
      isDrawing = false
      if (currStroke.getLength() === 0) return
      for (let i = 2; i < currStroke.getLength(); i++) {
        var {x, y} = bezier(currStroke.path[i*2-4], currStroke.path[i*2-3], currStroke.path[i*2-2], currStroke.path[i*2-1], currStroke.path[i*2], currStroke.path[i*2+1])
        currStroke.path[i*2-2] = x
        currStroke.path[i*2-1] = y
      }
      onScreenTiles[0].addStroke(currStroke) // NEED TO CHANGE LATER
      currStroke = new Stroke()
      // console.log("mouse lifted \n", currStroke)
    }

    // (re)draws all strokes by only drawing the difference
    // type: either 'draw' or 'erase'
    const redraw = (strokes: Stroke[], type='erase') => {
      if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
        contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        return 
      }
      // sets to either only draw in the difference or remove the difference
      // if (type === 'draw') contextRef.current.globalCompositeOperation = 'source-out'
      // else if (type === 'erase') contextRef.current.globalCompositeOperation = 'destination-in'
      contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)

      // adds a stroke to be redrawn
      const addStroke = (stroke: Stroke) => {
        contextRef.current.moveTo(stroke.startX, stroke.startY)
        contextRef.current.arc(stroke.startX, stroke.startY, strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
        for (let i = 1; i < stroke.getLength()/2; i++) {
          contextRef.current.quadraticCurveTo(stroke.path[i*4], stroke.path[i*4+1], stroke.path[i*4+2], stroke.path[i*4+3])
          // contextRef.current.lineTo(stroke.path[i*2], stroke.path[i*2+1])
        }
      }

      // adds all strokes to be redrawn and then draws all at once
      contextRef.current.beginPath()
      strokes.forEach(addStroke)
      contextRef.current.stroke()
      contextRef.current.globalCompositeOperation = 'source-over'
    }


    /************************
            Erase
    ************************/
    // keeps track of the last mouse position
    let lastX = 0, lastY = 0

    const startErase = (pointerEvent: PointerEvent) => {
      isErasing = true
      erase(pointerEvent)
    }
    // loops through all arrays in strokes and remove any stroke close to the mouse
    // when mouse is moving and RMB is pressed
    const erase = (pointerEvent: PointerEvent) => {
      if (!isErasing) return
      const {offsetX, offsetY} = pointerEvent // gets current mouse position
      if (withinSquare(offsetX, offsetY, lastX, lastY, 5)) return // if mouse didn't move much then we won't recheck
      const currentTile = getTile(onScreenTiles, offsetX, offsetY)
      if (currentTile.strokes.length === 0) return // if strokes is empty return

      lastX = offsetX
      lastY = offsetY
      const allStrokes = [...currentTile.strokes] // makes a copy of strokes to manipulate
      const size = 5 // the "radius" to erase

      loop1:
      for (let i = currentTile.strokes.length-1; i >=0 ; i--) { // loops through each stroke in strokes
        for (const coord of currentTile.strokes[i]) {
          if (typeof(coord) === 'number') {  														// TODO: EXTREME JANKNESS
			break;
		  }
          if (withinSquare(offsetX, offsetY, coord[0], coord[1], size)) {
            allStrokes.splice(i, 1) // if a stroke is within size, remove it from allStrokes      TODO: REDO THIS
            // redraws all strokes left in allStrokes
            redraw(allStrokes, 'erase')
            currentTile.removeStroke(currentTile.strokes[i].id)
            break loop1 // only erases 1 stroke
          }
        }
      }
    }
    const endErase = () => {
      isErasing = false
    }
  

    /************************
          useEffect
    ************************/
    // initializes canvas
    useEffect(() => {
      const canvas = canvasRef.current
      // makes the canvas "high resolution", apparantly we need to do this
      const dpr = window.devicePixelRatio * 2
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`

      // gets context which is what we use to draw and sets a few properties
      const context = canvas.getContext('2d')
      context.scale(dpr,dpr)
      context.lineCap = 'round' // how the end of each line look
      context.strokeStyle = 'black' // sets the color of the stroke
      context.lineWidth = strokeWidth
      context.lineJoin = 'round' // how lines are joined
      contextRef.current = context

      // initialize Tiles
      onScreenTiles.push(new Tile(0, 0))
    }, [])


    /************************
        Helper Functions
    ************************/
   // returns the tile the pointer is currently in, returns null if pointer not in any tile
   const getTile = (tiles: Tile[], x: number, y: number) => {
    for (const tile of tiles) {
      if (x - tile.startX >= 0 && tile.endX - x > 0 && y - tile.startY >= 0 && tile.endY - y > 0)
        return tile
    }
    return null
   }
    // returns if 2 coords are within a 'length' of each other
    const withinSquare = (x1: number, y1: number, x2: number, y2: number, length: number) => {
      return Math.abs(x1-x2) <= length && Math.abs(y1-y2) <= length
    }

    // takes in 3 points, calculates the quadratic bezier curve and return the middle of the curve
    // aka smoothes out the middle point
    const bezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
      return {x : .5 ** 2 * x0 + 2 * .5 ** 2 * x1 + .5**2 * x2, y : .5 ** 2 * y0 + 2 * .5 ** 2 * y1 + .5 **2 * y2}
    }
  
  return (
      <canvas 
        onPointerDown={pointerDown} 
        onPointerUp={pointerUp} 
        onPointerMove={pointerMove}
        onPointerLeave={pointerUp}
        onContextMenu={(e) => e.preventDefault()}
        
        ref={canvasRef} 
      />
  )
}

export default Canvas
