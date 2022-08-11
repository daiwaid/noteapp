import { createSlice } from '@reduxjs/toolkit'
import { Coord } from '../Interfaces'

const initialState = {
  offset: {x: 0, y: 0},
  scale: 1
}

const pageSlice = createSlice({
  name: 'offset', initialState,
  reducers: {
    setPageOffset(state, action: {payload: Coord, type: string}) {
      state.offset = action.payload
    },
    addPageOffset(state, action: {payload: Coord, type: string}) {
      state.offset.x += action.payload.x
      state.offset.y += action.payload.y
    },
    setScale(state, action: {payload: number, type: string}) {
      state.scale = action.payload
    },
    addScale(state, action: {payload: number, type: string}) {
      state.scale += action.payload
    }
  }
})

export const {setPageOffset, addPageOffset, setScale, addScale } = pageSlice.actions
export default pageSlice.reducer