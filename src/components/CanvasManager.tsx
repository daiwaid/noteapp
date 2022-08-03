import React, { useState } from 'react'
import { Menu } from './Menu'
import { StrokeType } from './Interfaces'
import Canvas from './Canvas'

export default function CanvasManager() {
  const [strokeType, setStrokeType] = useState<StrokeType>(StrokeType.Pencil)
  const [strokeColor, setStrokeColor] = useState<string>('black');
  const [strokeSize, setStrokeSize] = useState<number>(2);

  return (
    <div className="CanvasManager">
      <Canvas 
        strokeType={strokeType}
        strokeColor={strokeColor}
        strokeSize={strokeSize}
      />
      <Menu 
        setStrokeType={setStrokeType}
        setStrokeColor={setStrokeColor}
        setStrokeSize={setStrokeSize}
      />
    </div>
  )
}
