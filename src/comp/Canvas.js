import { useRef, useEffect, useState } from 'react'

class Stroke { // potentially save each pen stroke to its own class so it's easier to manipulate
  constructor(path) {
    this.stroke = path
    this.length = path.length / 2
  }
}

class Tile { // potentially divide up the screen to a few tiles so when erasing we only check strokes in one tile
  strokes = []
  constructor(x, y) { // top left
    this.x = x
    this.y = y
  }
}


const Canvas = props => { // The canvas class, covers the entire window
  
    // references to canvas and context, used for drawing
    const canvasRef = useRef(null)
    const contextRef = useRef(null)

    // states
    const [isDrawing, setIsDrawing] = useState(false)
    const [isErasing, setIsErasing] = useState(false)

    // saves all strokes in strokes, and saves the current stroke in currStroke
    const [strokes, setStrokes] = useState([])
    let currStroke = []

    // mouse events, will direct to different functions depending on button pressed
    const mouseDown = ({nativeEvent}) => {
      if (nativeEvent.button === 0) startDraw(nativeEvent)
      else if (nativeEvent.button === 2) startErase(nativeEvent)
    }
    const mouseUp = ({nativeEvent}) => {
      if (nativeEvent.button === 0) endDraw()
      else if (nativeEvent.button === 2) endErase()
    }
    const mouseMove = ({nativeEvent}) => {
      draw(nativeEvent)
      erase(nativeEvent)
    }

    // draws a stroke
    // when LMB is pressed, begins a new path and move it to the mouse's position
    const startDraw = (mouseEvent) => { 
      const {offsetX, offsetY} = mouseEvent
      contextRef.current.beginPath()
      contextRef.current.moveTo(offsetX, offsetY)
      setIsDrawing(true)
    }
    // when mouse is moving while LMB is pressed, will draw a line from last mouse position to current mouse position
    const draw = (mouseEvent) => { 
      if (!isDrawing) return
      const {offsetX, offsetY} = mouseEvent // gets current mouse position
      contextRef.current.lineTo(offsetX, offsetY)
      contextRef.current.stroke() // draws the lineTo
      currStroke.push(offsetX) // adds x, y to currStroke
      currStroke.push(offsetY)
    }
    // when LMB is lifted, will close current path and add the stroke to strokes and clear currStroke
    const endDraw = () => {
      contextRef.current.closePath()
      setIsDrawing(false)
      setStrokes(strokes.concat([currStroke]))
      console.log(currStroke)
      currStroke = []
      
    }

    // (re)draws a stroke by passing in an array of x, y coords
    const redraw = (path) => {
      if (path === undefined) return
      contextRef.current.beginPath()
      contextRef.current.moveTo(path[0], path[1])
      for (let i = 1; i < path.length/2; i++) {
        contextRef.current.lineTo(path[i*2], path[i*2+1])
        contextRef.current.stroke()
      }
      contextRef.current.closePath()
    }

    // erase strokes
    let lastX = 0, lastY = 0 // keeps track of the last mouse position so erase won't trigger if mouse did not move much
    const startErase = (mouseEvent) => {
      setIsErasing(true)
    }
    // loops through all arrays in strokes and remove any stroke close to the mouse
    const erase = (mouseEvent) => { // when mouse is moving and RMB is pressed
      if (!isErasing | strokes.length === 0) return
      const {offsetX, offsetY} = mouseEvent // gets current mouse position
      if (withinSquare(offsetX, offsetY, lastX, lastY, 5)) return // if mouse didn't move much then we won't recheck
      console.log("erasing")
      lastX = offsetX
      lastY = offsetY

      const allStrokes = [...strokes] // makes a copy of strokes to manipulate
      const size = 5 // the "radius" to erase

      loop1:
      for (let i = strokes.length-1; i >=0 ; i--) { // loops through each stroke in strokes
        for (let j = 0; j < strokes[i].length/2; j++) { // loops through each x, y pair in a stroke
          if (withinSquare(offsetX, offsetY, strokes[i][j*2], strokes[i][j*2+1], size)) {
            allStrokes.splice(i, 1) // if a stroke is within size, remove it from allStrokes

            // redraws all strokes left in allStrokes
            contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height) // clears screen
            allStrokes.forEach(redraw)
            setStrokes(allStrokes) // update strokes, removing the ones deleted
            break loop1 // only erases 1 line
          }
        }
      }
    }
    const endErase = () => {
      setIsErasing(false)
    }
  
    // initializes canvas
    useEffect(() => {
      const canvas = canvasRef.current
      // makes the canvas "high resolution", apparantly we need to do this
      canvas.width = window.innerWidth * 2
      canvas.height = window.innerHeight * 2
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`

      // gets context which is what we use to draw and sets a few properties
      const context = canvas.getContext('2d')
      context.scale(2,2)
      context.lineCap = 'round' // how the end of each line look
      context.strokeStyle = 'black'
      context.lineWidth = 5
      context.lineJoin = 'round' // how lines are joined
      contextRef.current = context
      
    }, [])

    // returns if 2 coords are within a 'length' of each other
    const withinSquare = (x1, y1, x2, y2, length) => {
      return Math.abs(x1-x2) <= length & Math.abs(y1-y2) <= length
    }
  
  return <canvas 
    onMouseDown={mouseDown} 
    onMouseUp={mouseUp} 
    onMouseMove={mouseMove}
    onContextMenu={(e) => e.preventDefault()}
    ref={canvasRef} 
  />
}

export default Canvas