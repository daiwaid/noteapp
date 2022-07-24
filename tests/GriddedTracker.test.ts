import GriddedTracker from "../src/components/GriddedTracker" // TODO: Use project absolute path 
import Stroke from "../src/components/Stroke"

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

describe('Register and query tests', () => {
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
});

describe('Delete tests', () => {
  test('Deregistering a nonexistent stroke', () => {
    const tracker = new GriddedTracker(100, 100, 10, 10)

    const stroke = new Stroke()
    stroke.addToPath(50, 50)

    // Deregister on fresh tracker
    expect(tracker.deregisterStroke(stroke)).toEqual(false)

    // Deregister stroke twice
    expect(tracker.registerStroke(stroke)).toEqual(true)
    expect(tracker.deregisterStroke(stroke)).toEqual(true)
    expect(tracker.deregisterStroke(stroke)).toEqual(false)
  });

  test('Simple 1 stroke register and deregister query', () => {
    const stroke = new Stroke()
    const id = stroke.getID()
    stroke.addToPath(50, 50)
    stroke.addToPath(60, 52)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke)
    tracker.deregisterStroke(stroke)

    const vc = new VertexChecker(tracker)
    vc.verify([50, 50], [])
    vc.verify([60, 50], [])
  });

  test('Registering and deregistering 1 stroke with overlapping vertices', () => {
    const stroke = new Stroke()
    stroke.addToPath(50, 50)
    stroke.addToPath(50, 50)
    stroke.addToPath(54, 52)
    stroke.addToPath(20, 70)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke)
    tracker.deregisterStroke(stroke)

    const vc = new VertexChecker(tracker)
    vc.verify([50, 50], [])
    vc.verify([20, 70], [])
  });

  test('Registering a stroke twice and deregistering twice', () => {
    const stroke = new Stroke()
    stroke.addToPath(54, 52)
    stroke.addToPath(20, 70)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    expect(tracker.registerStroke(stroke)).toEqual(true)
    expect(tracker.registerStroke(stroke)).toEqual(false)
    expect(tracker.deregisterStroke(stroke)).toEqual(true)

    const vc = new VertexChecker(tracker)
    vc.verify([50, 50], [])
    vc.verify([20, 70], [])

    expect(tracker.deregisterStroke(stroke)).toEqual(false)
  });

  test('Registering 2 strokes, deregistering 1', () => {
    const stroke1 = new Stroke()
    const id1 = stroke1.getID()
    stroke1.addToPath(50, 30)
    stroke1.addToPath(40, 20)

    const stroke2 = new Stroke()
    const id2 = stroke2.getID()
    stroke2.addToPath(53, 30)
    stroke2.addToPath(60, 10)

    const tracker = new GriddedTracker(100, 100, 10, 10)
    tracker.registerStroke(stroke1)
    tracker.registerStroke(stroke2)
    tracker.deregisterStroke(stroke2)

    const vc = new VertexChecker(tracker)
    vc.verify([50, 30], [id1])
    vc.verify([40, 20], [id1])
    vc.verify([60, 10], [])
  });

  test('Registering 3 strokes, deregistering 3', () => {
    const stroke1 = new Stroke()    // Same strokes as 3 stroke test above
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
    tracker.deregisterStroke(stroke3)
    tracker.deregisterStroke(stroke2)
    tracker.deregisterStroke(stroke1)

    const vc = new VertexChecker(tracker)

    // exclusion previous 1 stroke region
    vc.verify([30, 20], [])
    vc.verify([90, 40], [])
    vc.verify([90, 90], [])

    // exclusion 2 stroke region
    vc.verify([20, 20], [])

    // exclusion 3 stroke region
    vc.verify([90, 50], [])

    // exclusion 0 stroke region
    vc.verify([50, 50], [])
    vc.verify([10, 20], [])
  });

  test('Deregistering stroke underneath other strokes', () => {
    const stroke1 = new Stroke()    // Same strokes as 3 stroke test above
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
    tracker.deregisterStroke(stroke1)

    const vc = new VertexChecker(tracker)

    // previously 1 stroke regions
    vc.verify([30, 20], [])
    vc.verify([90, 40], [id2])
    vc.verify([90, 90], [id3])

    // previously 2 stroke region
    vc.verify([20, 20], [id2])

    // previously 3 stroke regions
    vc.verify([90, 50], [id2, id3])
  });
});
