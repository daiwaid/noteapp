import Stroke from './Stroke'

/**
 * Used as a generalized interface for querying strokes from a canvas
 */
export default interface StrokeTracker {
  /**
   * Adds stroke to the tracker
   * @return true if stroke successfully added to tracker, otherwise false
   */
  registerStroke(stroke: Stroke): boolean;

  /**
   * Removes stroke to the tracker
   * @return true if stroke successfully removed from tracker, otherwise false
   */
  deregisterStroke(stroke: Stroke): boolean;

  // /**
  //  * Updates the initial point of the stroke and its position in the tracker
  //  * @return true if stroke successfully updated, otherwise false
  //  * TODO: Uncomment
  //  */
  // updateStroke(stroke: Stroke, newStartX: number, newStartY: number): boolean

  /**
   * Gets the IDs of strokes near the given position.
   * @return array of strokes with the topmost element near the position at the end of the array
   */
  getStrokesNear(xOffset: number, yOffset: number): number[];
}
