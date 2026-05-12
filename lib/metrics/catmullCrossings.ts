type Point = { x: number; y: number };
type Curve = Point[]; // control points of a closed Catmull-Rom

// --- 1. Sample a closed Catmull-Rom curve into polyline points ---
function catmullRomPoint(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
  alpha = 0.5,
): Point {
  // Centripetal Catmull-Rom (alpha=0.5) avoids cusps/self-intersections
  const tj = (pa: Point, pb: Point, ti: number) => {
    const dx = pb.x - pa.x,
      dy = pb.y - pa.y;
    return Math.pow(Math.sqrt(dx * dx + dy * dy), alpha) + ti;
  };
  const t0 = 0;
  const t1 = tj(p0, p1, t0);
  const t2 = tj(p1, p2, t1);
  const t3 = tj(p2, p3, t2);
  const tt = t1 + (t2 - t1) * t;

  const lerp = (a: Point, b: Point, ta: number, tb: number): Point => ({
    x: ((tb - tt) * a.x + (tt - ta) * b.x) / (tb - ta),
    y: ((tb - tt) * a.y + (tt - ta) * b.y) / (tb - ta),
  });

  const A1 = lerp(p0, p1, t0, t1);
  const A2 = lerp(p1, p2, t1, t2);
  const A3 = lerp(p2, p3, t2, t3);
  const B1 = lerp(A1, A2, t0, t2);
  const B2 = lerp(A2, A3, t1, t3);
  return lerp(B1, B2, t1, t2);
}

function sampleClosedCurve(cps: Point[], samplesPerSegment = 32): Point[] {
  const n = cps.length;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = cps[(i - 1 + n) % n];
    const p1 = cps[i];
    const p2 = cps[(i + 1) % n];
    const p3 = cps[(i + 2) % n];
    const steps = i === n - 1 ? samplesPerSegment : samplesPerSegment;
    for (let s = 0; s < steps; s++) {
      out.push(catmullRomPoint(p0, p1, p2, p3, s / steps));
    }
  }
  return out; // closed: implicit edge from last back to first
}

// --- 2. Segment-segment intersection ---
function segmentsIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): Point | null {
  const rx = b.x - a.x,
    ry = b.y - a.y;
  const sx = d.x - c.x,
    sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-12) return null; // parallel/collinear: ignore
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

// --- 3. Count crossings between two sampled closed polylines ---
function countCrossings(
  polyA: Point[],
  polyB: Point[],
  mergeDist = 1e-4,
): number {
  const hits: Point[] = [];
  const na = polyA.length,
    nb = polyB.length;
  for (let i = 0; i < na; i++) {
    const a1 = polyA[i],
      a2 = polyA[(i + 1) % na];
    for (let j = 0; j < nb; j++) {
      const b1 = polyB[j],
        b2 = polyB[(j + 1) % nb];
      const p = segmentsIntersect(a1, a2, b1, b2);
      if (p) hits.push(p);
    }
  }
  // Deduplicate: nearby hits come from adjacent sample segments at one true crossing
  const unique: Point[] = [];
  for (const h of hits) {
    if (!unique.some((u) => Math.hypot(u.x - h.x, u.y - h.y) < mergeDist)) {
      unique.push(h);
    }
  }
  return unique.length;
}

// --- 4. All-pairs crossings across a set of curves ---
function totalCrossings(curves: Curve[], samples = 32): number {
  const polys = curves.map((c) => sampleClosedCurve(c, samples));
  let total = 0;

  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++)
      total += countCrossings(polys[i], polys[j]);

  return total;
}
