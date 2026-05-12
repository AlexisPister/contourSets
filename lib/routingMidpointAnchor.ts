import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 2;

export class HyperedgeRoutingMidpointAnchor {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToHyperedgeToDirection: Map<NodeId, Map<HyperedgeId, [number, number]>>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 10;
    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToHyperedgeToDirection = new Map();
  }

  run() {
    this.computeDepths();
    this.computePolygons();
  }

  computeDepths() {
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

    // Phase 1 — for each edge, compute the geometric outward direction at each
    // of its hull nodes (outward perpendicular to the chord prev→next in the
    // sorted hull). This is independent of edge centroids.
    const edgeGeomDirs = new Map<HyperedgeId, Map<NodeId, [number, number]>>();
    const edgeHullNodeIds = new Map<HyperedgeId, Set<NodeId>>();

    for (const edge of edges) {
      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;
      const edgePoints = edge.nodes.map((node) => this.layout.get(node.id)!);
      const hull = d3.polygonHull(edgePoints as [number, number][]);
      if (!hull) continue;

      const hullNodes = edge.nodes.filter((node) =>
        hull.includes(this.layout.get(node.id)!),
      );

      hullNodes.sort((a, b) => {
        const [ax, ay] = this.layout.get(a.id)! as [number, number];
        const [bx, by] = this.layout.get(b.id)! as [number, number];
        return Math.atan2(by - cy, bx - cx) - Math.atan2(ay - cy, ax - cx);
      });

      const n = hullNodes.length;
      const geomDirs = new Map<NodeId, [number, number]>();

      hullNodes.forEach((node, i) => {
        const [x, y] = this.layout.get(node.id)! as [number, number];
        const [px, py] = this.layout.get(hullNodes[(i + n - 1) % n].id)! as [
          number,
          number,
        ];
        const [qx, qy] = this.layout.get(hullNodes[(i + 1) % n].id)! as [
          number,
          number,
        ];

        const chordX = qx - px;
        const chordY = qy - py;
        const chordLen = Math.sqrt(chordX * chordX + chordY * chordY);

        let dirX: number, dirY: number;
        if (chordLen < 1e-9) {
          const dx = x - cx,
            dy = y - cy;
          const dl = Math.sqrt(dx * dx + dy * dy);
          dirX = dl < 1e-9 ? 1 : dx / dl;
          dirY = dl < 1e-9 ? 0 : dy / dl;
        } else {
          dirX = -chordY / chordLen;
          dirY = chordX / chordLen;
          if ((x - cx) * dirX + (y - cy) * dirY < 0) {
            dirX = -dirX;
            dirY = -dirY;
          }
        }

        geomDirs.set(node.id, [dirX, dirY]);
      });

      edgeGeomDirs.set(edge.id, geomDirs);
      edgeHullNodeIds.set(edge.id, new Set(hullNodes.map((nd) => nd.id)));
    }

    // Phase 2 — at each node, group the geometric directions from all incident
    // hull edges by angular proximity, average each group into a merged direction,
    // and assign depths 1, 2, 3… within the group by global rank.
    for (const node of this.hypergraph.nodes) {
      const hullEdges = edges.filter((e) =>
        edgeHullNodeIds.get(e.id)?.has(node.id),
      );
      if (hullEdges.length === 0) continue;

      const withAngles = hullEdges.map((edge) => {
        const [dirX, dirY] = edgeGeomDirs.get(edge.id)!.get(node.id)!;
        return { edge, angle: Math.atan2(dirY, dirX) };
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
        const avgX =
          group.reduce((s, e) => s + Math.cos(e.angle), 0) / group.length;
        const avgY =
          group.reduce((s, e) => s + Math.sin(e.angle), 0) / group.length;
        const avgLen = Math.sqrt(avgX * avgX + avgY * avgY);
        const mergedDirX = avgLen < 1e-9 ? 1 : avgX / avgLen;
        const mergedDirY = avgLen < 1e-9 ? 0 : avgY / avgLen;

        const sorted = [...group].sort(
          (a, b) => globalRank.get(a.edge.id)! - globalRank.get(b.edge.id)!,
        );
        let depth = 1;
        for (const { edge } of sorted) {
          directionMap.set(edge.id, [mergedDirX, mergedDirY]);
          depthMap.set(edge.id, depth++);
        }
      }

      this.nodeToHyperedgeToDirection.set(node.id, directionMap);
      this.nodeToHyperedgeToDepth.set(node.id, depthMap);
    }
  }

  computePolygons() {
    for (const edge of this.hypergraph.hyperedges.filter(
      (e) => e.nodes.length > 2,
    )) {
      updateCentroid(edge);
      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;

      const edgePoints = edge.nodes.map((node) => this.layout.get(node.id)!);
      const hull = d3.polygonHull(edgePoints as [number, number][]);
      if (!hull) continue;

      const hullNodes = edge.nodes.filter((node) =>
        hull.includes(this.layout.get(node.id)!),
      );
      if (hullNodes.length === 0) continue;

      const hullAnchors = hullNodes.map((node) => {
        const [x, y] = this.layout.get(node.id)! as [number, number];
        const [dirX, dirY] = this.nodeToHyperedgeToDirection
          .get(node.id)
          ?.get(edge.id) ?? [1, 0];
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        return {
          anchor: [
            x + dirX * this.gapLength * depth,
            y + dirY * this.gapLength * depth,
          ] as [number, number],
          nodePos: [x, y] as [number, number],
          depth,
        };
      });

      // Sort CW by anchor angle from centroid
      hullAnchors.sort((a, b) => {
        const angA = Math.atan2(a.anchor[1] - cy, a.anchor[0] - cx);
        const angB = Math.atan2(b.anchor[1] - cy, b.anchor[0] - cx);
        return angB - angA;
      });

      const n = hullAnchors.length;
      const collected: {
        anchor: [number, number];
        nodePos: [number, number];
      }[] = [];

      for (let k = 0; k < n; k++) {
        const curr = hullAnchors[k];
        const next = hullAnchors[(k + 1) % n];

        collected.push({ anchor: curr.anchor, nodePos: curr.nodePos });

        // Midpoint anchor: start from the midpoint of the two node positions,
        // then push outward along the perpendicular to the chord between them.
        // This guarantees the midpoint stays outside the hull even when the
        // two adjacent anchors are on opposite sides (averaging anchor positions
        // would land inside for elongated hulls).
        const mx = (curr.nodePos[0] + next.nodePos[0]) / 2;
        const my = (curr.nodePos[1] + next.nodePos[1]) / 2;
        const chordX = next.nodePos[0] - curr.nodePos[0];
        const chordY = next.nodePos[1] - curr.nodePos[1];
        const chordLen = Math.sqrt(chordX * chordX + chordY * chordY);
        if (chordLen < 1e-9) continue;

        let midDirX = -chordY / chordLen;
        let midDirY = chordX / chordLen;
        if ((mx - cx) * midDirX + (my - cy) * midDirY < 0) {
          midDirX = -midDirX;
          midDirY = -midDirY;
        }

        const midDepth = (curr.depth + next.depth) / 2;

        collected.push({
          anchor: [
            mx + midDirX * this.gapLength * midDepth,
            my + midDirY * this.gapLength * midDepth,
          ],
          nodePos: [mx, my],
        });
      }

      edge.polygon = collected.map((c) => c.anchor);
      edge.polygonNodes = collected.map((c) => c.nodePos);
    }
  }
}
