import React from 'react'
import { StrokeType } from '../Interfaces'
import '../App.css'

export const Menu = ({setStrokeType, setStrokeColor, setStrokeSize}: {setStrokeType: any, setStrokeColor: any, setStrokeSize: any}) => {
  return (
    <div className="Menu" style={{position: 'absolute', left: '50px', top: '-10px'}} >
      <button onClick={(e) => {setStrokeType(StrokeType.Pencil)}} style={{zIndex:99}}>
        Pencil
      </button>
      <button onClick={(e) => {setStrokeType(StrokeType.Chisel)}} style={{zIndex:99}}>
        Chisel
      </button>
      <label>Color </label>
      <input
        type="color"
        onChange={(e) => {
          setStrokeColor(e.target.value)
        }}
        style={{zIndex:99}}
      />
      <label>Width </label>
      <input
        type="range"
        min="1"
        max="20"
        defaultValue="2"
        onChange={(e) => {
          setStrokeSize(Number(e.target.value))
        }}
        style={{zIndex:99}}
      />
    </div>
  )
}
