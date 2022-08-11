import React from 'react'
import { useSelector } from "react-redux"
import store, { RootState } from "../redux/store"
import Selectable from "./Selectable"


const Content = () => {

  const selectables = useSelector((state: RootState) => state.selectables.data)

  const mapContent = () => {
    return Object.keys(selectables).map(
        (id) => <Selectable key={id} selectable={selectables[id]} />)
  }

  return (
    <div className="content">
      {mapContent()}
    </div>
  )
}

export default Content