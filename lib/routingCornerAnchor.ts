import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 3;
// Hull nodes whose interior angle is below this get two anchors (one per adjacent edge normal)
const CORNER_THRESHOLD = Math.PI / 8;

export class HyperedgeRoutingCornerAnchor {
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

      // Sort hull nodes CW by angle from centroid
      hullNodes.sort((a, b) => {
        const [ax, ay] = this.layout.get(a.id)! as [number, number];
        const [bx, by] = this.layout.get(b.id)! as [number, number];
        return Math.atan2(by - cy, bx - cx) - Math.atan2(ay - cy, ax - cx);
      });

      const n = hullNodes.length;
      const hullAnchors: {
        anchor: [number, number];
        nodePos: [number, number];
        depth: number;
      }[] = [];

      for (let i = 0; i < n; i++) {
        const node = hullNodes[i];
        const [x, y] = this.layout.get(node.id)! as [number, number];
        const [px, py] = this.layout.get(hullNodes[(i + n - 1) % n].id)! as [
          number,
          number,
        ];
        const [qx, qy] = this.layout.get(hullNodes[(i + 1) % n].id)! as [
          number,
          number,
        ];

        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        const d = depth * this.gapLength;

        // Interior angle at N (between edges P→N and N→Q)
        const v1x = px - x,
          v1y = py - y;
        const v2x = qx - x,
          v2y = qy - y;
        const v1len = Math.sqrt(v1x * v1x + v1y * v1y);
        const v2len = Math.sqrt(v2x * v2x + v2y * v2y);

        let interiorAngle = Math.PI;
        if (v1len > 1e-9 && v2len > 1e-9) {
          const dot = (v1x * v2x + v1y * v2y) / (v1len * v2len);
          interiorAngle = Math.acos(Math.max(-1, Math.min(1, dot)));
        }

        if (interiorAngle < CORNER_THRESHOLD) {
          // Sharp corner: two anchors, one perpendicular to each adjacent edge

          // Anchor A: outward perp to edge P→N
          const e1x = x - px,
            e1y = y - py;
          const e1len = Math.sqrt(e1x * e1x + e1y * e1y);
          if (e1len > 1e-9) {
            let a1x = -e1y / e1len,
              a1y = e1x / e1len;
            if ((x - cx) * a1x + (y - cy) * a1y < 0) {
              a1x = -a1x;
              a1y = -a1y;
            }
            hullAnchors.push({
              anchor: [x + a1x * d, y + a1y * d],
              nodePos: [x, y],
              depth,
            });
          }

          // Anchor B: outward perp to edge N→Q
          const e2x = qx - x,
            e2y = qy - y;
          const e2len = Math.sqrt(e2x * e2x + e2y * e2y);
          if (e2len > 1e-9) {
            let b1x = -e2y / e2len,
              b1y = e2x / e2len;
            if ((x - cx) * b1x + (y - cy) * b1y < 0) {
              b1x = -b1x;
              b1y = -b1y;
            }
            hullAnchors.push({
              anchor: [x + b1x * d, y + b1y * d],
              nodePos: [x, y],
              depth,
            });
          }
        } else {
          // Normal case: single anchor using merged direction from computeDepths
          const [dirX, dirY] = this.nodeToHyperedgeToDirection
            .get(node.id)
            ?.get(edge.id) ?? [1, 0];
          hullAnchors.push({
            anchor: [x + dirX * d, y + dirY * d],
            nodePos: [x, y],
            depth,
          });
        }
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

        // Midpoint anchor between consecutive hull anchors.
        // When curr and next share the same nodePos (two anchors at a sharp corner),
        // chordLen ≈ 0 so the midpoint is skipped — the two corner anchors are
        // already adjacent and no midpoint is needed between them.
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
