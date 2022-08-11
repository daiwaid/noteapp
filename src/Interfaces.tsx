/** A single point in a stroke. */
export interface Point {
    x: number,
    y: number,
    p: number // pressure
}

/** Any object that can be selected. */
export interface Selectable {
    id: number,
    data?: any,
    bounding: Box
}

/** A single stroke. */
export interface Stroke extends Selectable {
    path: Point[],
    length: number,
    start: Coord,
    styles?: {color: string}
}

/** A "hash map", retrive objects with its ID. */
export interface IndexedObj {
    [id: number | string]: any
}

/** How IndexedObj is stored in Redux, contains a master ID. */
export interface IndexedStorage {
    masterID: number,
    data: IndexedObj
}

/** A single x, y coordinate. */
export interface Coord {
    x: number,
    y: number
}

/** A rectangular box defined by its top left and bottom right coords. */
export interface Box {
    x0: number,
    x1: number,
    y0: number,
    y1: number
}

/** Stores a single action and relevant data for undo/redo. */
export interface History {
    action: string,
    data: Stroke[],
    log?: any
}

/** Used for historySlice. */
export interface HistSlice {
    index: number, // where in history we are
    origin: number, // where the "origin index" currently is
    history: History[]
}

export enum StrokeType {
    Pencil,
    Chisel
}