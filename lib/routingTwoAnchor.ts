import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 2;

export class HyperedgeRoutingTwoAnchor {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  // Individual direction: node → away from this edge's centroid (routing.ts style)
  nodeToHyperedgeToDirection: Map<NodeId, Map<HyperedgeId, [number, number]>>;
  // Group-averaged direction for this edge's group (routingOneAnchor style)
  nodeToHyperedgeToGroupDir: Map<NodeId, Map<HyperedgeId, [number, number]>>;
  // Group size: how many edges share this group at this node
  nodeToHyperedgeToGroupSize: Map<NodeId, Map<HyperedgeId, number>>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 18;
    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToHyperedgeToDirection = new Map();
    this.nodeToHyperedgeToGroupDir = new Map();
    this.nodeToHyperedgeToGroupSize = new Map();
  }

  run() {
    this.computeGroupedDirectionsAndDepths();
    this.computeSplinesPoints();
  }

  computeGroupedDirectionsAndDepths() {
    const edges = this.hypergraph.hyperedges.filter((e) => e.nodes.length > 2);
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

    for (const node of this.hypergraph.nodes) {
      const [nx, ny] = this.layout.get(node.id)!;
      const hyperedgeIds = this.hypergraph.getNodeHyperedges(node.id);
      if (!hyperedgeIds || hyperedgeIds.length === 0) continue;

      const hyperedges = edges.filter((e) => hyperedgeIds.includes(e.id));

      const withAngles = hyperedges.map((edge) => {
        const dx = (edge.centroidX as number) - nx;
        const dy = (edge.centroidY as number) - ny;
        const len = Math.sqrt(dx * dx + dy * dy);
        return { edge, angle: Math.atan2(dy, dx) };
      });

      withAngles.sort((a, b) => a.angle - b.angle);

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
      const indivDirMap = new Map<HyperedgeId, [number, number]>();
      const groupDirMap = new Map<HyperedgeId, [number, number]>();
      const groupSizeMap = new Map<HyperedgeId, number>();

      for (const group of groups) {
        // Group-averaged direction (routingOneAnchor style)
        const avgDx =
          group.reduce((s, e) => s + Math.cos(e.angle), 0) / group.length;
        const avgDy =
          group.reduce((s, e) => s + Math.sin(e.angle), 0) / group.length;
        const avgLen = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
        const groupDirX = avgLen === 0 ? 1 : -avgDx / avgLen;
        const groupDirY = avgLen === 0 ? 0 : -avgDy / avgLen;

        const sorted = [...group].sort(
          (a, b) => globalRank.get(a.edge.id)! - globalRank.get(b.edge.id)!,
        );

        let depth = 1;
        for (const { edge } of sorted) {
          // Individual direction: away from this edge's own centroid
          const dx = (edge.centroidX as number) - nx;
          const dy = (edge.centroidY as number) - ny;
          const len = Math.sqrt(dx * dx + dy * dy);
          indivDirMap.set(edge.id, [
            len === 0 ? 1 : -dx / len,
            len === 0 ? 0 : -dy / len,
          ]);
          groupDirMap.set(edge.id, [groupDirX, groupDirY]);
          groupSizeMap.set(edge.id, group.length);
          depthMap.set(edge.id, depth++);
        }
      }

      this.nodeToHyperedgeToDepth.set(node.id, depthMap);
      this.nodeToHyperedgeToDirection.set(node.id, indivDirMap);
      this.nodeToHyperedgeToGroupDir.set(node.id, groupDirMap);
      this.nodeToHyperedgeToGroupSize.set(node.id, groupSizeMap);
    }
  }

  computeSplinesPoints() {
    for (const edge of this.hypergraph.hyperedges.filter(
      (e) => e.nodes.length > 2,
    )) {
      updateCentroid(edge);

      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;

      const edgePoints = edge.nodes.map((node) => this.layout.get(node.id));
      const hull = d3.polygonHull(edgePoints as [number, number][]);
      if (!hull) continue;

      const collected: {
        anchor: [number, number];
        nodePos: [number, number];
      }[] = [];

      for (const node of edge.nodes) {
        const point = this.layout.get(node.id);
        if (!hull.includes(point)) continue;

        const [x, y] = point as [number, number];
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        const [indivX, indivY] = this.nodeToHyperedgeToDirection
          .get(node.id)
          ?.get(edge.id) ?? [1, 0];
        const [groupX, groupY] = this.nodeToHyperedgeToGroupDir
          .get(node.id)
          ?.get(edge.id) ?? [1, 0];
        const groupSize =
          this.nodeToHyperedgeToGroupSize.get(node.id)?.get(edge.id) ?? 1;
        const d = depth * this.gapLength;

        // Anchor 1: individual direction (routing.ts)
        collected.push({
          anchor: [x + indivX * d, y + indivY * d],
          nodePos: [x, y],
        });

        // Anchor 2: group-averaged direction — only meaningful when group has >1 edge
        if (groupSize > 1) {
          collected.push({
            anchor: [x + groupX * d, y + groupY * d],
            nodePos: [x, y],
          });
        }
      }

      // Sort all anchor points clockwise around the hyperedge centroid
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
