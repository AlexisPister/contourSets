import { sortPointsClockwise, type Point } from "../geometryUtils.ts";
import type { Hypergraph } from "../Hypergraph.ts";
import type { Hyperedge } from "../Hyperedge.ts";

export function computePolygonCrossings(hypergraph: Hypergraph): number {
  const segmentSets = hypergraph.hyperedges.map(hyperedgeToSegments);

  let crossings = 0;

  for (let i = 0; i < segmentSets.length; i++) {
    for (let j = i + 1; j < segmentSets.length; j++) {
      for (const segA of segmentSets[i]) {
        for (const segB of segmentSets[j]) {
          if (segmentsIntersect(segA[0], segA[1], segB[0], segB[1])) {
            crossings++;
          }
        }
      }
    }
  }

  return crossings;
}

function hyperedgeToSegments(edge: Hyperedge): [Point, Point][] {
  const pts = sortPointsClockwise(
    (edge.nodes as any[]).map((n) => [n.x, n.y] as Point),
  );

  if (pts.length < 2) return [];

  const segments: [Point, Point][] = [];
  for (let i = 0; i < pts.length; i++) {
    segments.push([pts[i], pts[(i + 1) % pts.length]]);
  }
  return segments;
}

// Returns true if segment p1-p2 and segment p3-p4 properly intersect.
// Shared endpoints are not counted as crossings.
function segmentsIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point,
): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  let countOnSegment = false;

  // Collinear cases
  if (d1 === 0 && onSegment(p3, p4, p1)) return countOnSegment;
  if (d2 === 0 && onSegment(p3, p4, p2)) return countOnSegment;
  if (d3 === 0 && onSegment(p1, p2, p3)) return countOnSegment;
  if (d4 === 0 && onSegment(p1, p2, p4)) return countOnSegment;

  return false;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function onSegment(p: Point, q: Point, r: Point): boolean {
  return (
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1])
  );
}
