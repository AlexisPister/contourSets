import * as turf from "@turf/turf";
import { Feature, Polygon, MultiPolygon } from "geojson";
import RBush from "rbush";

import type { Hypergraph, Hyperedge } from "../Hypergraph.ts";

type Poly = Feature<Polygon | MultiPolygon>;
type Point = [number, number];

type BBoxItem = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  index: number;
};

export function computeHypergraphArea(hypergraph: Hypergraph): number {
  let totalArea = 0;
  let unionPolygon: Poly = turf.polygon([
    [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
  ]);
  for (let edge of hypergraph.hyperedges) {
    const poly = hyperedgeToPolygon(edge);
    if (poly) {
      unionPolygon = turf.union(turf.featureCollection([unionPolygon, poly]));
    }
  }

  return polygonArea(unionPolygon.geometry);
}

export function computeHypergraphOverlapArea(hypergraph: Hypergraph): number {
  // ---- Step 1: Convert hyperedges → polygons ----
  const polygons: Poly[] = [];

  for (const h of hypergraph.hyperedges) {
    const poly = hyperedgeToPolygon(h);
    if (poly) {
      polygons.push(turf.cleanCoords(poly)); // improves robustness
    }
  }

  if (polygons.length < 2) return 0;

  // ---- Step 2: Build spatial index ----
  const tree = new RBush<BBoxItem>();

  const items: BBoxItem[] = polygons.map((p, i) => {
    const [minX, minY, maxX, maxY] = turf.bbox(p);
    return { minX, minY, maxX, maxY, index: i };
  });

  tree.load(items);

  // ---- Step 3: Incremental union of overlaps ----
  let merged: Poly | null = null;

  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const polyA = polygons[i];

    const candidates = tree.search(a);

    for (const b of candidates) {
      if (b.index <= i) continue;

      const polyB = polygons[b.index];

      // Fast reject
      if (!turf.booleanIntersects(polyA, polyB)) continue;

      // console.log(polyA, polyB);
      const inter = turf.intersect(turf.featureCollection([polyA, polyB]));
      if (!inter) continue;

      merged = merged
        ? turf.union(turf.featureCollection([merged, inter]))
        : (inter as Poly);
    }
  }

  if (!merged) return 0;

  // ---- Step 4: Final area ----
  return polygonArea(merged.geometry);
}

function polygonArea(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  let total = 0;

  if (geom.type === "Polygon") {
    const [outer, ...holes] = geom.coordinates;
    total += ringArea(outer);
    for (const hole of holes) total -= ringArea(hole);
  }

  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      const [outer, ...holes] = poly;
      total += ringArea(outer);
      for (const hole of holes) total -= ringArea(hole);
    }
  }

  return total;
}

// Shoelace formula
function ringArea(coords: number[][]): number {
  let sum = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function hyperedgeToPolygon(h: Hyperedge): Poly | null {
  const pts = hyperedgeToPoints(h);

  if (pts.length < 3) return null;

  // Ensure closed ring
  const ring =
    pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]
      ? pts
      : [...pts, pts[0]];

  try {
    return turf.polygon([ring]);
  } catch {
    return null;
  }
}

function hyperedgeToPoints(edge: Hyperedge): Point[] {
  return edge.nodes.map((n) => [n.x, n.y]);
}
