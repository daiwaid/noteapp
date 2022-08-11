import React from 'react'
import { useSelector } from 'react-redux'
import { Selectable } from '../Interfaces'
import { RootState } from '../redux/store'

const SelComponent = ({ selectable }: {selectable: Selectable}) => {

  const offset = useSelector((state: RootState) => state.page.offset)
  const scale = useSelector((state: RootState) => state.page.scale)
  const left = (selectable.bounding.x0 - offset.x) * scale - window.innerWidth/2
  const top = (selectable.bounding.y0 - offset.y) * scale - window.innerHeight/2

  return (
    <div
      dangerouslySetInnerHTML={{__html: selectable.data}}

      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        transformOrigin: `${0}px ${0}px`,
        transform: `scale(${scale})`}}>
    </div>
  )
}

export default SelComponent