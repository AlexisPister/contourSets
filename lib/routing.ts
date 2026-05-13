import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 2;
const HALF_ARC = (60 * Math.PI) / 180 / 2; // ±40° around the mean direction

export type DirectionStrategy = "perpendicular" | "mean";

export class HyperedgeRouting {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  directionStrategy: DirectionStrategy;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToHyperedgeToDirection: Map<NodeId, Map<HyperedgeId, [number, number]>>;

  constructor(
    hypergraph: Hypergraph,
    layout: Layout,
    directionStrategy: DirectionStrategy = "mean",
  ) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 10;
    this.directionStrategy = directionStrategy;
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

    // Phase 1 — compute the geometric outward direction at each hull node for
    // each edge (outward perpendicular to the chord prev→next in the sorted hull).
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

        let dirX: number, dirY: number;

        if (this.directionStrategy === "mean") {
          // Mean of the two unit vectors pointing away from each neighbor
          const toPx = x - px,
            toPy = y - py;
          const toQx = x - qx,
            toQy = y - qy;
          const toPLen = Math.sqrt(toPx * toPx + toPy * toPy);
          const toQLen = Math.sqrt(toQx * toQx + toQy * toQy);
          const sumX =
            (toPLen > 1e-9 ? toPx / toPLen : 0) +
            (toQLen > 1e-9 ? toQx / toQLen : 0);
          const sumY =
            (toPLen > 1e-9 ? toPy / toPLen : 0) +
            (toQLen > 1e-9 ? toQy / toQLen : 0);
          const sumLen = Math.sqrt(sumX * sumX + sumY * sumY);
          if (sumLen < 1e-9) {
            const dx = x - cx,
              dy = y - cy;
            const dl = Math.sqrt(dx * dx + dy * dy);
            dirX = dl < 1e-9 ? 1 : dx / dl;
            dirY = dl < 1e-9 ? 0 : dy / dl;
          } else {
            dirX = sumX / sumLen;
            dirY = sumY / sumLen;
            if ((x - cx) * dirX + (y - cy) * dirY < 0) {
              dirX = -dirX;
              dirY = -dirY;
            }
          }
        } else {
          // Perpendicular to the chord P→Q
          const chordX = qx - px;
          const chordY = qy - py;
          const chordLen = Math.sqrt(chordX * chordX + chordY * chordY);
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
        }

        geomDirs.set(node.id, [dirX, dirY]);
      });

      edgeGeomDirs.set(edge.id, geomDirs);
      edgeHullNodeIds.set(edge.id, new Set(hullNodes.map((nd) => nd.id)));
    }

    // Phase 2 — at each node, group geometric directions from all incident hull
    // edges by angular proximity, average each group into a merged direction, and
    // assign depths 1, 2, 3… within the group by global rank.
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

      const hullAnchors: {
        anchor: [number, number];
        nodePos: [number, number];
        depth: number;
      }[] = [];

      // Each hull node contributes two arc anchors spread ±HALF_ARC around its
      // mean outward direction, both at depth * gapLength from the node.
      for (const node of hullNodes) {
        const [x, y] = this.layout.get(node.id)! as [number, number];
        const [dirX, dirY] = this.nodeToHyperedgeToDirection
          .get(node.id)
          ?.get(edge.id) ?? [1, 0];
        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        const d = depth * this.gapLength;
        const meanAngle = Math.atan2(dirY, dirX);

        hullAnchors.push({
          anchor: [
            x + Math.cos(meanAngle + HALF_ARC) * d,
            y + Math.sin(meanAngle + HALF_ARC) * d,
          ],
          nodePos: [x, y],
          depth,
        });
        hullAnchors.push({
          anchor: [
            x + Math.cos(meanAngle - HALF_ARC) * d,
            y + Math.sin(meanAngle - HALF_ARC) * d,
          ],
          nodePos: [x, y],
          depth,
        });
      }

      // Sort all anchors CW by anchor angle from centroid
      hullAnchors.sort((a, b) => {
        const angA = Math.atan2(a.anchor[1] - cy, a.anchor[0] - cx);
        const angB = Math.atan2(b.anchor[1] - cy, b.anchor[0] - cx);
        return angB - angA;
      });

      const m = hullAnchors.length;
      const collected: {
        anchor: [number, number];
        nodePos: [number, number];
      }[] = [];

      for (let k = 0; k < m; k++) {
        const curr = hullAnchors[k];
        const next = hullAnchors[(k + 1) % m];

        collected.push({ anchor: curr.anchor, nodePos: curr.nodePos });

        // Midpoint anchor between consecutive hull nodes. When curr and next
        // share the same nodePos (the two arc anchors at the same node),
        // chordLen ≈ 0 so the midpoint is skipped — the arc pair is already
        // adjacent and no midpoint is needed between them.
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
