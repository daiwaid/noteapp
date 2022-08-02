import Stroke from "./Stroke"

/** A single point in a stroke. */
export interface Point {
    x: number,
    y: number,
    p: number // pressure
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

export interface History {
    action: string,
    data: Stroke[],
    log?: any
}

export enum StrokeType {
    Pencil,
    Chisel
}