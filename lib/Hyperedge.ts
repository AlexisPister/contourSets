export type HyperedgeId = String | Number;

export interface Hyperedge {
  id: HyperedgeId;
  centroidX?: number;
  centroidY?: number;
  nodes: Array<Node>;
  [key: string]: any;
  polygon?: Array<[number, number]>;
}

export function updateCentroid(hyperedge: Hyperedge) {
  if (!hyperedge.nodes.length) return [0, 0];

  const center = hyperedge.nodes.reduce(
    (acc, n) => ({
      x: acc.x + n.x / hyperedge.nodes.length,
      y: acc.y + n.y / hyperedge.nodes.length,
    }),
    { x: 0, y: 0 },
  );

  hyperedge.centroidX = center.x;
  hyperedge.centroidY = center.y;
}

export function sortNodesClockwise(hyperedge: Hyperedge) {
  if (hyperedge.nodes.length <= 2) return;

  // 1. Compute centroid
  const center = hyperedge.nodes.reduce(
    (acc, n) => ({
      x: acc.x + n.x / hyperedge.nodes.length,
      y: acc.y + n.y / hyperedge.nodes.length,
    }),
    { x: 0, y: 0 },
  );

  // 2. Sort by angle around centroid
  hyperedge.nodes.sort((a, b) => {
    const angleA = Math.atan2(a.y - center.y, a.x - center.x);
    const angleB = Math.atan2(b.y - center.y, b.x - center.x);

    // Clockwise order
    if (angleA === angleB) {
      // Tie-breaker: distance from center
      const distA = (a.x - center.x) ** 2 + (a.y - center.y) ** 2;
      const distB = (b.x - center.x) ** 2 + (b.y - center.y) ** 2;
      return distA - distB;
    }

    return angleB - angleA;
  });
}
