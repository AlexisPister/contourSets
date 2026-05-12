import * as d3 from "d3";

import { sortNodesClockwise, updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

// Hyperedges within this angular distance (radians) share a direction at a node
const ANGLE_THRESHOLD = Math.PI / 4;
// const ANGLE_THRESHOLD = Math.PI;

export class HyperedgeRoutingOneAnchor {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToHyperedgeToDirection: Map<NodeId, Map<HyperedgeId, [number, number]>>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 18;

    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToHyperedgeToDirection = new Map();
  }

  run() {
    this.computeGroupedDirectionsAndDepths();
    this.computeSplinesPoints();
  }

  // For each node, group incident hyperedges by the angle from the node to their
  // centroid. Hyperedges within ANGLE_THRESHOLD of each other share one averaged
  // direction and get depths 1, 2, 3... within that group independently.
  computeGroupedDirectionsAndDepths() {
    let edges = this.hypergraph.hyperedges.filter((e) => e.nodes.length > 2);

    edges.forEach((e) => updateCentroid(e));

    const globalRank = new Map<HyperedgeId, number>(
      [...edges]
        .sort(
          (a, b) =>
            (a.centroidY as number) - (b.centroidY as number) ||
            (a.centroidX as number) - (b.centroidX as number),
        )
        .map((e, i) => [e.id, i]),
    );

    for (let node of this.hypergraph.nodes) {
      const [nx, ny] = this.layout.get(node.id)!;
      const hyperedgeIds = this.hypergraph.getNodeHyperedges(node.id);
      if (!hyperedgeIds || hyperedgeIds.length === 0) continue;

      const hyperedges = edges.filter((e) => hyperedgeIds.includes(e.id));

      // Compute angle from node toward each hyperedge centroid
      const withAngles = hyperedges.map((edge) => {
        updateCentroid(edge);
        const dx = (edge.centroidX as number) - nx;
        const dy = (edge.centroidY as number) - ny;
        return { edge, angle: Math.atan2(dy, dx) };
      });

      // Sort by angle so adjacent entries in the array are angularly close
      withAngles.sort((a, b) => a.angle - b.angle);

      // Split into groups whenever the angular gap exceeds the threshold
      const groups: (typeof withAngles)[] = [];
      let current: typeof withAngles = [withAngles[0]];
      for (let i = 1; i < withAngles.length; i++) {
        let diff = Math.abs(withAngles[i].angle - current[0].angle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < ANGLE_THRESHOLD) {
          current.push(withAngles[i]);
        } else {
          groups.push(current);
          current = [withAngles[i]];
        }
      }
      groups.push(current);

      // Merge first and last groups if they're within threshold across the ±π boundary
      if (groups.length >= 2) {
        const firstAngle = groups[0][0].angle;
        const lastGroup = groups[groups.length - 1];
        const lastAngle = lastGroup[lastGroup.length - 1].angle;
        let wrapDiff = Math.abs(firstAngle - lastAngle);
        if (wrapDiff > Math.PI) wrapDiff = 2 * Math.PI - wrapDiff;
        if (wrapDiff < ANGLE_THRESHOLD) {
          groups[0] = [...lastGroup, ...groups[0]];
          groups.pop();
        }
      }

      const depthMap = new Map<HyperedgeId, number>();
      const directionMap = new Map<HyperedgeId, [number, number]>();

      for (const group of groups) {
        // Average unit vector pointing from node toward group centroid, then invert
        const avgDx =
          group.reduce((s, e) => s + Math.cos(e.angle), 0) / group.length;
        const avgDy =
          group.reduce((s, e) => s + Math.sin(e.angle), 0) / group.length;
        const len = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
        const dirX = len === 0 ? 1 : -avgDx / len;
        const dirY = len === 0 ? 0 : -avgDy / len;

        const sorted = [...group].sort(
          (a, b) => globalRank.get(a.edge.id)! - globalRank.get(b.edge.id)!,
        );

        let depth = 1;
        for (const { edge } of sorted) {
          directionMap.set(edge.id, [dirX, dirY]);
          depthMap.set(edge.id, depth++);
        }
      }

      this.nodeToHyperedgeToDirection.set(node.id, directionMap);
      this.nodeToHyperedgeToDepth.set(node.id, depthMap);
    }
  }

  computeSplinesPoints() {
    for (let edge of this.hypergraph.hyperedges.filter(
      (e) => e.nodes.length > 2,
    )) {
      updateCentroid(edge);
      sortNodesClockwise(edge);

      const edgePolygon: [number, number][] = [];
      const polygonNodes: [number, number][] = [];

      const edgePoints = edge.nodes.map((node) => this.layout.get(node.id));
      const hull = d3.polygonHull(edgePoints);

      for (let node of edge.nodes) {
        const point = this.layout.get(node.id);
        if (!hull.includes(point)) continue;

        const [x, y] = point;
        const [dirX, dirY] = this.nodeToHyperedgeToDirection
          .get(node.id)
          ?.get(edge.id) ?? [1, 0];
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;

        edgePolygon.push([
          x + dirX * this.gapLength * depth,
          y + dirY * this.gapLength * depth,
        ]);
        polygonNodes.push([x, y]);
      }

      edge.polygon = edgePolygon;
      edge.polygonNodes = polygonNodes;
    }
  }
}
