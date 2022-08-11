import { createSlice } from '@reduxjs/toolkit'
import { Coord } from '../Interfaces'

const initialState = {
    size: {x: 0, y: 0},
    dpr: 1
}

const windowSlice = createSlice({
    name: 'window', initialState,
    reducers: {
        setdpr(state, action: {payload: number, type: string}) {
            state.dpr = action.payload
        },
        setWindowSize(state, action: {payload: Coord, type: string}) {
            state.size = action.payload
        }
    }
})

export const { setdpr, setWindowSize } = windowSlice.actions
export default windowSlice.reducer