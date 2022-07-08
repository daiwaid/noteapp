import { useRef, useEffect, useState } from 'react'
import Square from './Square'

const Canvas = props => {
  
    const canvasRef = useRef(null)
    const contextRef = useRef(null)

    const [isDrawing, setIsDrawing] = useState(false)
    const [isErasing, setIsErasing] = useState(false)

    const [strokes, setStrokes] = useState([])
    let currStroke = []
    // const [currStroke, setCurrStroke] = useState([])

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

    const startDraw = (mouseEvent) => {
      const {offsetX, offsetY} = mouseEvent
      contextRef.current.beginPath()
      contextRef.current.moveTo(offsetX, offsetY)
      setIsDrawing(true)
    }
    const draw = (mouseEvent) => {
      if (!isDrawing) return
      const {offsetX, offsetY} = mouseEvent
      contextRef.current.lineTo(offsetX, offsetY)
      contextRef.current.stroke()
      currStroke.push(offsetX)
      currStroke.push(offsetY)
      // contextRef.current.beginPath()
      // contextRef.current.arc(offsetX, offsetY, 1, 0, 2*Math.PI)
      // contextRef.current.fill()
    }
    const endDraw = () => {
      contextRef.current.closePath()
      setIsDrawing(false)
      setStrokes(strokes.concat([currStroke]))
      currStroke = []
      // console.log(strokes)
    }

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

    const startErase = (mouseEvent) => {
      setIsErasing(true)
    }
    const erase = (mouseEvent) => {
      if (!isErasing | strokes.length === 0) return
      const {offsetX, offsetY} = mouseEvent

      const allStrokes = [...strokes]
      const size = 2

      loop1:
      for (let i = strokes.length-1; i >=0 ; i--) {
        for (let j = 0; j < strokes[i].length/2; j++) {
          if (Math.abs(offsetX-strokes[i][j*2]) < size & Math.abs(offsetY-strokes[i][j*2+1]) < size) {
            allStrokes.splice(i, 1)

            contextRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
            allStrokes.forEach(redraw)
            setStrokes(allStrokes)
            break loop1
          }
        }
      }
    }
    const endErase = () => {
      setIsErasing(false)
    }
  
    useEffect(() => {
      const canvas = canvasRef.current
      canvas.width = window.innerWidth * 2
      canvas.height = window.innerHeight * 2
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`

      const context = canvas.getContext('2d')
      context.scale(2,2)
      context.lineCap = 'round'
      context.strokeStyle = 'black'
      context.lineWidth = 5
      contextRef.current = context
      
    }, [])
  
  return <canvas 
    onMouseDown={mouseDown} 
    onMouseUp={mouseUp} 
    onMouseMove={mouseMove}
    onContextMenu={(e) => e.preventDefault()}
    ref={canvasRef} 
  />
}

export default Canvas