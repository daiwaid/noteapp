import GriddedTracker from "../src/components/GriddedTracker" // TODO: Use project absolute path 
import Stroke from "../src/components/Stroke"

describe("Register and query tests", () => {
  const VertexChecker = class {
    private tracker: GriddedTracker

    constructor(tracker: GriddedTracker) {
      this.tracker = tracker
    }

    verify(coord: [number, number], ids: number[]) {
      for (const id of ids) {
        expect(this.tracker.getStrokesNear(...coord)).toEqual(ids)
      }
    }
  }
  
  test('0 stroke unequal segmenting', () => {
    const tracker = new GriddedTracker(100, 100, 3, 3)
    const vc = new VertexChecker(tracker)

    // Random checks in the middle
    vc.verify([55, 20], [])
    vc.verify([29, 0], [])
    vc.verify([78, 78], [])

    // Boundary checks
    vc.verify([0, 0], [])
    vc.verify([0, 99], [])
    vc.verify([99, 0], [])
    vc.verify([99, 99], [])
  });

  test('1 stroke', () => {
    const stroke = new Stroke()
    const id = stroke.getID()
    stroke.addToPath(20, 20)
    stroke.addToPath(32, 20)
    stroke.addToPath(95, 50)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke)

    const vc = new VertexChecker(tracker)
    // Checks different containment boundaries for each vertex
    vc.verify([25, 25], [id])
    vc.verify([20, 20], [id])

    vc.verify([39, 20], [id])
    vc.verify([30, 29], [id])

    vc.verify([90, 50], [id])
    vc.verify([95, 50], [id])

    // Checks emptiness of adjacent areas
    vc.verify([19, 20], [])
    vc.verify([40, 20], [])

    vc.verify([20, 30], [])
    vc.verify([30, 19], [])

    vc.verify([90, 49], [])
    vc.verify([90, 60], [])

    // Distant emptiness check
    vc.verify([0, 0], [])
    vc.verify([99, 99], [])
  });

  test('2 strokes non-overlapping', () => {
    const stroke1 = new Stroke()
    const id1 = stroke1.getID()
    stroke1.addToPath(20, 20)
    stroke1.addToPath(32, 20)
    stroke1.addToPath(95, 50)

    const stroke2 = new Stroke()
    const id2 = stroke2.getID()
    stroke2.addToPath(5, 23)
    stroke2.addToPath(47,23)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke1)
    tracker.registerStroke(stroke2)
    
    const vc = new VertexChecker(tracker)
    // basic inclusion tests for stroke1
    vc.verify([20, 20], [id1])
    vc.verify([30, 20], [id1])
    vc.verify([90, 50], [id1])

    // basic inclusion tests for stroke2
    vc.verify([0, 20], [id2])
    vc.verify([40, 20], [id2])

    // basic exclusion tests
    vc.verify([50, 50], [])
    vc.verify([10, 20], [])
  });

  test('3 strokes partially-overlapping', () => {
    const stroke1 = new Stroke()
    const id1 = stroke1.getID()
    stroke1.addToPath(20, 20) // 2
    stroke1.addToPath(32, 20) // 1
    stroke1.addToPath(95, 50) // 3

    const stroke2 = new Stroke()
    const id2 = stroke2.getID()
    stroke2.addToPath(95, 40) // 1
    stroke2.addToPath(95, 50) // 3
    stroke2.addToPath(20, 20) // 2

    const stroke3 = new Stroke()
    const id3 = stroke3.getID()
    stroke3.addToPath(95, 50) // 3
    stroke3.addToPath(95, 90) // 1

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke1)
    tracker.registerStroke(stroke2)
    tracker.registerStroke(stroke3)

    const vc = new VertexChecker(tracker)
    // inclusion tests for single vertex regions
    vc.verify([30, 20], [id1])
    vc.verify([90, 40], [id2])
    vc.verify([90, 90], [id3])

    // inclusion tests for 2 stroke region
    vc.verify([20, 20], [id1, id2])

    // inclusion tests for 3 stroke region
    vc.verify([90, 50], [id1, id2, id3])

    // basic exclusion tests
    vc.verify([50, 50], [])
    vc.verify([10, 20], [])
  });
})
