import { useRef, useEffect } from 'react'
import Stroke from './Stroke'
import Tile from './Tile'

/**
 * Canvas component covering the entire window
 */
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
    let [offsetX, offsetY] = [0, 0] // the offset of the canvas
    let tile = new Tile(0, 0)


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
      const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
      contextRef.current.beginPath()
      contextRef.current.moveTo(x, y)
      contextRef.current.arc(x, y, strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
      contextRef.current.stroke() // actually draws it
      currStroke.addToPath(x, y) // adds x, y to currStroke
      // console.log(currStroke)
    }
    // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
    const draw = (pointerEvent: PointerEvent) => {
      if (!isDrawing) return
      const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
      currStroke.addToPath(x, y) // adds x, y to currStroke

      // draws the line
      contextRef.current.lineTo(x, y)
      contextRef.current.stroke()
    }
    // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
    const endDraw = () => {
      isDrawing = false
      if (currStroke.isEmpty()) return

      tile.addStroke(currStroke) // NEED TO CHANGE LATER
      // redraw(tile.getStrokes(), 'erase')
      currStroke = new Stroke()
      // console.log("mouse lifted \n", currStroke)
    }

    // "(re)draws" all strokes by only drawing the difference
    // type: either 'draw' or 'erase'
    const redraw = (strokes: Stroke[], type='erase') => {
      if (strokes === undefined || strokes.length === 0) { // if no strokes then clear screen
        contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        return
      }
      // sets to either only draw in the difference or remove the difference
      if (type === 'draw') contextRef.current.globalCompositeOperation = 'source-over'
      else if (type === 'erase') contextRef.current.globalCompositeOperation = 'destination-in'
      // contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height) // clears whole screen, for testing only

      // adds a stroke to be redrawn
      const addStroke = (stroke: Stroke) => {
        contextRef.current.moveTo(stroke.getStartX(), stroke.getStartY())
        contextRef.current.arc(stroke.getStartX(), stroke.getStartY(), strokeWidth/10, 0, Math.PI*2) // draws a circle at the starting position
        for (const coord of stroke.getCoords(offsetX, offsetY)) {
          // contextRef.current.quadraticCurveTo(path[i*4], path[i*4+1], path[i*4+2], path[i*4+3])
          contextRef.current.lineTo(coord.x, coord.y)
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
      
      const [x, y] = [pointerEvent.offsetX, pointerEvent.offsetY] // gets current mouse position
      if (withinSquare(x, y, lastX, lastY, 5)) return // if mouse didn't move much then we won't recheck
      if (tile.isEmpty()) return

      lastX = x
      lastY = y
      const eraserSize = 5 // the "radius" to erase

      const eraseCandidate = tile.getStrokeAt([x, y], eraserSize)
      if (eraseCandidate !== null) {
        console.log("erasing")
        tile.removeStroke(eraseCandidate.getID())
        redraw(Array.from(tile.getStrokesIterator()), 'erase')
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
    }, [])


    /************************
        Helper Functions
    ************************/

   // returns the tile the pointer is currently in, returns null if pointer not in any tile
   const getTile = (tiles: Tile[], x: number, y: number) => {
    for (const tile of tiles) {
      if (tile.enclosesVertex(x, y))
        return tile
      }
      return null
    }

    // returns if 2 coords are within a 'length' of each other
    const withinSquare = (x1: number, y1: number, x2: number, y2: number, length: number) => {
      return Math.abs(x1-x2) <= length && Math.abs(y1-y2) <= length
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
