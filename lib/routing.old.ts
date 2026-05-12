import { sortNodesClockwise, updateCentroid } from "./Hyperedge";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

export class HyperedgeRouting {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToDirection: Map<NodeId, [number, number]>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 14;

    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToDirection = new Map();
  }

  run() {
    this.computeHyperedgesDepth();
    this.computeNodeDirections();
    this.computeSplinesPoints();
  }

  computeHyperedgesDepth() {
    for (let node of this.hypergraph.nodes) {
      const hyperedgesIds = this.hypergraph.getNodeHyperedges(node.id);
      const hyperedges = this.hypergraph.hyperedges.filter((e) =>
        hyperedgesIds?.includes(e.id),
      );

      if (hyperedges) {
        hyperedges.sort((a, b) => a.nodes.length - b.nodes.length);

        let depth = 1;
        for (let hyperedge of hyperedges) {
          if (this.nodeToHyperedgeToDepth.has(node.id)) {
            this.nodeToHyperedgeToDepth.get(node.id)!.set(hyperedge.id, depth);
          } else {
            this.nodeToHyperedgeToDepth.set(
              node.id,
              new Map([[hyperedge.id, depth]]),
            );
          }
          depth++;
        }
      }
    }

    console.log(33, this.nodeToHyperedgeToDepth);
  }

  computeNodeDirections() {
    for (let node of this.hypergraph.nodes) {
      const [nx, ny] = this.layout.get(node.id)!;
      const hyperedgeIds = this.hypergraph.getNodeHyperedges(node.id);
      if (!hyperedgeIds || hyperedgeIds.length === 0) continue;

      const hyperedges = this.hypergraph.hyperedges.filter((e) =>
        hyperedgeIds.includes(e.id),
      );

      let sumCX = 0;
      let sumCY = 0;
      for (let edge of hyperedges) {
        updateCentroid(edge);
        sumCX += edge.centroidX as number;
        sumCY += edge.centroidY as number;
      }

      const avgCX = sumCX / hyperedges.length;
      const avgCY = sumCY / hyperedges.length;

      const diffX = nx - avgCX;
      const diffY = ny - avgCY;
      const dist = Math.sqrt(diffX * diffX + diffY * diffY);

      this.nodeToDirection.set(
        node.id,
        dist === 0 ? [1, 0] : [diffX / dist, diffY / dist],
      );
    }
  }

  computeSplinesPoints() {
    for (let edge of this.hypergraph.hyperedges) {
      updateCentroid(edge);
      sortNodesClockwise(edge);

      // let centroidX = edge.centroidX as number;
      // let centroidY = edge.centroidY as number;

      let edgePolygon = [];

      for (let node of edge.nodes) {
        const [x, y] = this.layout.get(node.id);

        // let diffX = x - centroidX;
        // let diffY = y - centroidY;

        // let distance = Math.sqrt(diffX * diffX + diffY * diffY);

        // let normalizedX = diffX / distance;
        // let normalizedY = diffY / distance;

        // let depth = this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id);

        // let splineX = (x + normalizedX * this.gapLength * depth) as number;
        // let splineY = (y + normalizedY * this.gapLength * depth) as number;

        // console.log(x);

        // edgePolygon.push([splineX, splineY]);

        const [dirX, dirY] = this.nodeToDirection.get(node.id) ?? [1, 0];
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;

        edgePolygon.push([
          x + dirX * this.gapLength * depth,
          y + dirY * this.gapLength * depth,
        ]);
      }

      edge.polygon = edgePolygon;
    }
  }
}
