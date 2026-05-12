import { Hypergraph } from "./Hypergraph";

export type Point = [number, number];

export function sortPointsClockwise(points: Point[]): Point[] {
  if (points.length <= 2) return points;

  // 1. Compute centroid
  const center = points.reduce(
    (acc, p) => [acc[0] + p[0] / points.length, acc[1] + p[1] / points.length],
    [0, 0],
  );

  // 2. Sort by angle from centroid
  return [...points].sort((a, b) => {
    const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);

    // Clockwise order → reverse of standard CCW
    return angleB - angleA;
  });
}

export function fitLayoutToCanvas(
  hypergraph: Hypergraph,
  width: number,
  height: number,
  padding: number = 50,
) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const node of hypergraph.nodes) {
    if (node.x! < minX) minX = node.x!;
    if (node.x! > maxX) maxX = node.x!;
    if (node.y! < minY) minY = node.y!;
    if (node.y! > maxY) maxY = node.y!;
  }

  const layoutW = Math.max(1e-6, maxX - minX);
  const layoutH = Math.max(1e-6, maxY - minY);
  const targetW = width - 2 * padding;
  const targetH = height - 2 * padding;

  // Uniform scale so aspect ratio is preserved
  const scale = Math.min(targetW / layoutW, targetH / layoutH);

  // Center the result
  const offsetX = padding + (targetW - layoutW * scale) / 2;
  const offsetY = padding + (targetH - layoutH * scale) / 2;

  for (const node of hypergraph.nodes) {
    node.x = (node.x! - minX) * scale + offsetX;
    node.y = (node.y! - minY) * scale + offsetY;
  }
}
