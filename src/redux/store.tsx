import { configureStore } from '@reduxjs/toolkit'
import selectableReducer from './selectableSlice'
import pageReducer from './pageSlice'
import windowReducer from './windowSlice'
import historyReducer from './historySlice'


const store = configureStore({
  reducer: {
    selectables: selectableReducer,
    page: pageReducer,
    window: windowReducer,
    history: historyReducer
  }
})

export default store

// Infer the `RootState` and `AppDispatch` types from the store itself
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch