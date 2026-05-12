import * as d3 from "d3";

import { sortNodesClockwise, updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 2;

export class HyperedgeRouting {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToHyperedgeToDirection: Map<NodeId, Map<HyperedgeId, [number, number]>>;
  // All individual directions in the same group as a given (node, edge)
  nodeToHyperedgeToGroupDirs: Map<NodeId, Map<HyperedgeId, [number, number][]>>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 18;

    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToHyperedgeToDirection = new Map();
    this.nodeToHyperedgeToGroupDirs = new Map();
  }

  run() {
    this.computeGroupedDirectionsAndDepths();
    this.computeSplinesPoints();
  }

  computeGroupedDirectionsAndDepths() {
    this.hypergraph.hyperedges.forEach((e) => updateCentroid(e));
    const globalRank = new Map<HyperedgeId, number>(
      [...this.hypergraph.hyperedges]
        .sort(
          (a, b) =>
            (a.centroidY as number) - (b.centroidY as number) ||
            (a.centroidX as number) - (b.centroidX as number),
        )
        .map((e, i) => [e.id, i]),
    );

    for (const node of this.hypergraph.nodes) {
      const [nx, ny] = this.layout.get(node.id)!;
      const hyperedgeIds = this.hypergraph.getNodeHyperedges(node.id);
      if (!hyperedgeIds || hyperedgeIds.length === 0) continue;

      const hyperedges = this.hypergraph.hyperedges.filter((e) =>
        hyperedgeIds.includes(e.id),
      );

      const withAngles = hyperedges.map((edge) => {
        const dx = (edge.centroidX as number) - nx;
        const dy = (edge.centroidY as number) - ny;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const dirX = len === 0 ? 1 : -dx / len;
        const dirY = len === 0 ? 0 : -dy / len;
        return { edge, angle, dirX, dirY };
      });

      withAngles.sort((a, b) => a.angle - b.angle);

      const groups: (typeof withAngles)[] = [];
      let current: typeof withAngles = [withAngles[0]];
      for (let i = 1; i < withAngles.length; i++) {
        let diff = Math.abs(withAngles[i].angle - withAngles[i - 1].angle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < ANGLE_THRESHOLD) {
          current.push(withAngles[i]);
        } else {
          groups.push(current);
          current = [withAngles[i]];
        }
      }
      groups.push(current);

      const depthMap = new Map<HyperedgeId, number>();
      const directionMap = new Map<HyperedgeId, [number, number]>();
      const groupDirsMap = new Map<HyperedgeId, [number, number][]>();

      for (const group of groups) {
        const sorted = [...group].sort(
          (a, b) => globalRank.get(a.edge.id)! - globalRank.get(b.edge.id)!,
        );
        // All individual directions in this group, in depth order
        const groupDirs: [number, number][] = sorted.map((item) => [
          item.dirX,
          item.dirY,
        ]);

        let depth = 1;
        for (const item of sorted) {
          directionMap.set(item.edge.id, [item.dirX, item.dirY]);
          depthMap.set(item.edge.id, depth++);
          // Every edge in the group shares the same set of group directions
          groupDirsMap.set(item.edge.id, groupDirs);
        }
      }

      this.nodeToHyperedgeToDirection.set(node.id, directionMap);
      this.nodeToHyperedgeToDepth.set(node.id, depthMap);
      this.nodeToHyperedgeToGroupDirs.set(node.id, groupDirsMap);
    }
  }

  // Each hull node contributes one anchor point per direction in the group,
  // all at the same depth assigned to this (node, edge) pair.
  // All anchors are sorted globally by angle from the hyperedge centroid so the
  // polygon is always non-self-intersecting regardless of node traversal order.
  computeSplinesPoints() {
    for (const edge of this.hypergraph.hyperedges) {
      updateCentroid(edge);

      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;

      const edgePoints = edge.nodes.map((node) => this.layout.get(node.id));
      const hull = d3.polygonHull(edgePoints as [number, number][]);

      const collected: {
        anchor: [number, number];
        nodePos: [number, number];
      }[] = [];

      for (const node of edge.nodes) {
        const point = this.layout.get(node.id);
        if (!hull || !hull.includes(point)) continue;

        const [x, y] = point;
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        const groupDirs = this.nodeToHyperedgeToGroupDirs
          .get(node.id)
          ?.get(edge.id) ?? [
          this.nodeToHyperedgeToDirection.get(node.id)?.get(edge.id) ?? [1, 0],
        ];

        for (const [dirX, dirY] of groupDirs) {
          collected.push({
            anchor: [
              x + dirX * this.gapLength * depth,
              y + dirY * this.gapLength * depth,
            ],
            nodePos: [x, y],
          });
        }
      }

      // Sort all anchor points clockwise around the centroid — guarantees a
      // non-self-intersecting polygon when anchors are all outside the centroid.
      collected.sort((a, b) => {
        const angA = Math.atan2(a.anchor[1] - cy, a.anchor[0] - cx);
        const angB = Math.atan2(b.anchor[1] - cy, b.anchor[0] - cx);
        return angB - angA;
      });

      edge.polygon = collected.map((c) => c.anchor);
      edge.polygonNodes = collected.map((c) => c.nodePos);
    }
  }
}
