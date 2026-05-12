import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

const ANGLE_THRESHOLD = Math.PI / 3;
const CORNER_THRESHOLD = Math.PI / 8;

export class HyperedgeRoutingBoundaryAnchor {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;
  nodeToHyperedgeToDepth: Map<NodeId, Map<HyperedgeId, number>>;
  nodeToHyperedgeToLeftDir: Map<NodeId, Map<HyperedgeId, [number, number]>>;
  nodeToHyperedgeToRightDir: Map<NodeId, Map<HyperedgeId, [number, number]>>;

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 10;
    this.nodeToHyperedgeToDepth = new Map();
    this.nodeToHyperedgeToLeftDir = new Map();
    this.nodeToHyperedgeToRightDir = new Map();
  }

  run() {
    this.computeDepths();
    this.computePolygons();
  }

  computeDepths() {
    const edges = this.hypergraph.hyperedges.filter((e) => e.nodes.length > 2);
    edges.forEach((e) => updateCentroid(e));

    // Phase 1 — compute geometric outward direction at each hull node per edge
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

    // Phase 2 — group directions by angular proximity; store the two angular
    // boundary directions (min-angle and max-angle in the group) instead of a
    // single merged direction. All edges in a group get depth 1.
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
      const leftDirMap = new Map<HyperedgeId, [number, number]>();
      const rightDirMap = new Map<HyperedgeId, [number, number]>();

      for (const group of groups) {
        const sortedByAngle = [...group].sort((a, b) => a.angle - b.angle);
        const leftAngle = sortedByAngle[0].angle;
        const rightAngle = sortedByAngle[sortedByAngle.length - 1].angle;
        const leftDir: [number, number] = [
          Math.cos(leftAngle),
          Math.sin(leftAngle),
        ];
        const rightDir: [number, number] = [
          Math.cos(rightAngle),
          Math.sin(rightAngle),
        ];

        for (const { edge } of group) {
          leftDirMap.set(edge.id, leftDir);
          rightDirMap.set(edge.id, rightDir);
          depthMap.set(edge.id, 1);
        }
      }

      this.nodeToHyperedgeToLeftDir.set(node.id, leftDirMap);
      this.nodeToHyperedgeToRightDir.set(node.id, rightDirMap);
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
        const [px, py] = this.layout.get(
          hullNodes[(i + n - 1) % n].id,
        )! as [number, number];
        const [qx, qy] = this.layout.get(
          hullNodes[(i + 1) % n].id,
        )! as [number, number];

        const depth =
          this.nodeToHyperedgeToDepth.get(node.id)?.get(edge.id) ?? 1;
        const d = depth * this.gapLength;

        // Interior angle at N
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
          // Sharp corner: two anchors from the edge normals
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
          // Normal case: emit left and right boundary anchors of the group.
          // When the group has a single edge, leftDir == rightDir → one anchor.
          const [lx, ly] =
            this.nodeToHyperedgeToLeftDir.get(node.id)?.get(edge.id) ?? [1, 0];
          const [rx, ry] =
            this.nodeToHyperedgeToRightDir.get(node.id)?.get(edge.id) ?? [
              1, 0,
            ];

          hullAnchors.push({
            anchor: [x + lx * d, y + ly * d],
            nodePos: [x, y],
            depth,
          });
          if (Math.abs(lx - rx) > 1e-9 || Math.abs(ly - ry) > 1e-9) {
            hullAnchors.push({
              anchor: [x + rx * d, y + ry * d],
              nodePos: [x, y],
              depth,
            });
          }
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
