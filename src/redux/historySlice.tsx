import { createSlice } from '@reduxjs/toolkit'
import { History, HistSlice } from '../Interfaces'

const initialState: HistSlice = {
    index: 0,
    origin: 0,
    history: []
}

const historySlice = createSlice({
  name: 'history', initialState,
  reducers: {
  //  addHistory(state: HistSlice, action: {payload: History, type: string}) {                                          // TODO: FIX
  //    state.index = (state.index + 1) % 100
  //    state.history[state.index] = action.payload
  //    state.origin = (state.index + 1) % 100
  //    state.history[state.origin] = undefined
  //  },
  //  /** Updates the index for one undo. */
  //  undoAction(state: HistSlice) {
  //    if (state.index !== 0) state.index--
  //    else state.index = 99
  //  },
  //  /** Updates the index for one redo. */
  //  redoAction(state: HistSlice) {
  //    state.index = (state.index + 1) % 100
  //  }
  }
})

// export const { addHistory, undoAction, redoAction } = historySlice.actions
export default historySlice.reducer