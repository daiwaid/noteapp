import React, { useState } from 'react'
import { Menu } from './Menu'
import Canvas from './Canvas'

export default function CanvasManager() {
  const [strokeColor, setStrokeColor] = useState<string>('black');
  const [strokeSize, setStrokeSize] = useState<number>(2);

  return (
    <div className="CanvasManager">
      <Menu 
        setStrokeColor={setStrokeColor}
        setStrokeSize={setStrokeSize}
      />
      <Canvas 
        strokeColor={strokeColor}
        strokeSize={strokeSize}
      />
    </div>
  )
}
