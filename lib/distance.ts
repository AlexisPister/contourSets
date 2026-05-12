import { Hypergraph } from "./Hypergraph.ts";
import type { Node } from "./Hypergraph.ts";

export function computeDistanceMatrix(hg: Hypergraph): number[][] {
  const nodes = Array.from(hg.nodes);
  const n = nodes.length;

  const index = new Map<NodeId, number>();
  nodes.forEach((node, i) => index.set(node.id, i));

  const D: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(Infinity),
  );

  for (let i = 0; i < n; i++) {
    const source = nodes[i];
    const distances = bfsFromNode(hg, source.id);
    console.log(distances);

    for (const [targetId, dist] of distances.entries()) {
      const j = index.get(targetId)!;
      D[i][j] = dist;
    }
  }

  return D;
}

function bfsFromNode(hg: Hypergraph, startId: NodeId): Map<NodeId, number> {
  const queue: Array<{
    id: NodeId | HyperedgeId;
    type: "node" | "edge";
    depth: number;
  }> = [];

  const visitedNodes = new Set<NodeId>();
  const visitedEdges = new Set<HyperedgeId>();
  const distances = new Map<NodeId, number>();

  queue.push({ id: startId, type: "node", depth: 0 });
  visitedNodes.add(startId);
  distances.set(startId, 0);

  while (queue.length > 0) {
    const { id, type, depth } = queue.shift()!;

    if (type === "node") {
      const hyperedges = hg.nodeIdToHyperedges.get(id as NodeId);
      // console.log(33, hyperedges);
      if (!hyperedges) continue;

      for (const edgeId of hyperedges) {
        if (!visitedEdges.has(edgeId)) {
          visitedEdges.add(edgeId);
          queue.push({
            id: edgeId,
            type: "edge",
            depth: depth + 1,
          });
        }
      }
    } else {
      const hyperedge = Array.from(hg.hyperedges).find((e) => e.id === id);
      if (!hyperedge) continue;

      for (const node of hyperedge.nodes) {
        if (!visitedNodes.has(node.id)) {
          visitedNodes.add(node.id);

          const vertexDistance = Math.floor((depth + 1) / 2);
          distances.set(node.id, vertexDistance);

          queue.push({
            id: node.id,
            type: "node",
            depth: depth + 1,
          });
        }
      }
    }
  }

  return distances;
}
