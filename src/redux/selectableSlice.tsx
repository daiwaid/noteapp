import { createSlice } from '@reduxjs/toolkit'
import { IndexedStorage } from '../Interfaces'

const initialState: IndexedStorage = {masterID: 0, data: {}}

const selectableSlice = createSlice({
  name: 'selectables', initialState,
  reducers: {
    addSelectable(state: IndexedStorage, action) {
      const obj = action.payload
      state.data[obj.id] = obj
      state.masterID += 1
    },
    removeSelectable(state: IndexedStorage, action) {
      const id: number = action.payload
      delete state.data[id]
      return
    }
  }
})

export const { addSelectable, removeSelectable } = selectableSlice.actions
export default selectableSlice.reducer