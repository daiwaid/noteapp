import React from 'react'
import '../App.css'

export const Menu = ({setStrokeColor, setStrokeSize}: {setStrokeColor: any, setStrokeSize: any}) => {
  // console.log(setStrokeColor)
  // console.log(setStrokeSize)

  return (
    <div className="Menu" style={{position: 'absolute', left: '50px', top: '-10px'}} >
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
