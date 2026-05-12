import * as d3 from "d3";

import { updateCentroid } from "./Hyperedge.ts";
import type { Hyperedge, HyperedgeId } from "./Hyperedge";
import { Hypergraph } from "./Hypergraph.ts";
import type { NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

// ── Grouping ──────────────────────────────────────────────────────────────────
const ANGLE_GROUP_THRESHOLD = Math.PI / 2;

// ── Optimizer ─────────────────────────────────────────────────────────────────
const ITERATIONS = 300;
const ADAM_LR = 0.1;
const ADAM_B1 = 0.9;
const ADAM_B2 = 0.999;
const ADAM_EPS = 1e-8;
const GRAD_H = 1e-4;

// ── Energy weights ────────────────────────────────────────────────────────────
// E_natural  – pull anchor toward the node's natural outward direction
const W_NATURAL = 0.4;
// E_repulse  – keep anchors at the same node from colliding
const W_REPULSE = 3.0;
// E_parallel – shared hull segments between two edges should be parallel
const W_PARALLEL = 10.0;
// E_gap      – anchors at a shared hull node should be |Δdepth|·gap apart
const W_GAP = 6.0;
// E_smooth   – polygon should be convex; concave vertices are heavily penalised
const W_SMOOTH = 1.5;
const W_CONCAVE = 8.0; // extra factor on top of W_SMOOTH for concave vertices

const MIN_ANCHOR_SEP = 10; // min Euclidean distance between anchors at same node
// ─────────────────────────────────────────────────────────────────────────────

function angDiff(a: number, b: number): number {
  let d = (((a - b) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d;
}

interface EdgePair {
  e1: Hyperedge;
  e2: Hyperedge;
  sharedNodes: NodeId[]; // hull nodes belonging to both hulls
  sharedSegs: [NodeId, NodeId][]; // pairs consecutive in e1's hull AND in e2's hull
}

export class HyperedgeRoutingEnergy {
  hypergraph: Hypergraph;
  layout: Layout;
  gapLength: number;

  private theta: Map<NodeId, Map<HyperedgeId, number>> = new Map();
  private depth: Map<NodeId, Map<HyperedgeId, number>> = new Map();
  private hullOf: Map<HyperedgeId, NodeId[]> = new Map();
  private hullSetOf: Map<HyperedgeId, Set<NodeId>> = new Map();
  private pairs: EdgePair[] = [];

  constructor(hypergraph: Hypergraph, layout: Layout) {
    this.hypergraph = hypergraph;
    this.layout = layout;
    this.gapLength = 18;
  }

  run() {
    const edges = this.hypergraph.hyperedges.filter((e) => e.nodes.length > 2);
    edges.forEach((e) => updateCentroid(e));

    const edgeById = new Map<HyperedgeId, Hyperedge>(
      edges.map((e) => [e.id, e]),
    );

    this.computeDepths(edges);
    this.computeHulls(edges);
    this.initAngles(edges);
    this.computePairs(edges);
    this.optimize(edges, edgeById);
    this.buildPolygons(edges);
  }

  // ── Anchor helper ─────────────────────────────────────────────────────────

  private anchor(nodeId: NodeId, edgeId: HyperedgeId): [number, number] {
    const [x, y] = this.layout.get(nodeId)!;
    const θ = this.theta.get(nodeId)!.get(edgeId)!;
    const r = (this.depth.get(nodeId)?.get(edgeId) ?? 1) * this.gapLength;
    return [x + r * Math.cos(θ), y + r * Math.sin(θ)];
  }

  private natAngle(nodeId: NodeId, edge: Hyperedge): number {
    const [x, y] = this.layout.get(nodeId)!;
    const dx = x - (edge.centroidX as number);
    const dy = y - (edge.centroidY as number);
    const len = Math.sqrt(dx * dx + dy * dy);
    return len < 1e-9 ? 0 : Math.atan2(dy, dx);
  }

  // ── 1. Depth assignment ───────────────────────────────────────────────────
  // Group incident edges by angular direction from each node; assign depths
  // 1, 2, 3… within each group sorted by global centroid rank.

  private computeDepths(edges: Hyperedge[]) {
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
      const ids = this.hypergraph.getNodeHyperedges(node.id) ?? [];
      const nodeEdges = edges.filter((e) => ids.includes(e.id));
      if (nodeEdges.length === 0) continue;

      const withAng = nodeEdges.map((e) => ({
        e,
        angle: Math.atan2(
          (e.centroidY as number) - ny,
          (e.centroidX as number) - nx,
        ),
      }));
      withAng.sort((a, b) => a.angle - b.angle);

      const groups: (typeof withAng)[] = [];
      let cur: typeof withAng = [withAng[0]];
      for (let i = 1; i < withAng.length; i++) {
        let diff = Math.abs(withAng[i].angle - withAng[i - 1].angle);
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff < ANGLE_GROUP_THRESHOLD) cur.push(withAng[i]);
        else {
          groups.push(cur);
          cur = [withAng[i]];
        }
      }
      groups.push(cur);

      const depthMap = new Map<HyperedgeId, number>();
      for (const grp of groups) {
        const sorted = [...grp].sort(
          (a, b) => globalRank.get(a.e.id)! - globalRank.get(b.e.id)!,
        );
        sorted.forEach(({ e }, idx) => depthMap.set(e.id, idx + 1));
      }
      this.depth.set(node.id, depthMap);
    }
  }

  // ── 2. Hull computation ───────────────────────────────────────────────────

  private computeHulls(edges: Hyperedge[]) {
    for (const edge of edges) {
      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;
      const pts = edge.nodes.map((n) => this.layout.get(n.id)!) as [
        number,
        number,
      ][];
      const hull = d3.polygonHull(pts);
      if (!hull) continue;

      const hullNodes = edge.nodes.filter((n) =>
        hull.includes(this.layout.get(n.id)!),
      );

      // Sort counterclockwise (increasing angle from centroid)
      hullNodes.sort((a, b) => {
        const [ax, ay] = this.layout.get(a.id)!;
        const [bx, by] = this.layout.get(b.id)!;
        return Math.atan2(ay - cy, ax - cx) - Math.atan2(by - cy, bx - cx);
      });

      const ids = hullNodes.map((n) => n.id);
      this.hullOf.set(edge.id, ids);
      this.hullSetOf.set(edge.id, new Set(ids));
    }
  }

  // ── 3. Angle initialisation ───────────────────────────────────────────────

  private initAngles(edges: Hyperedge[]) {
    for (const edge of edges) {
      for (const nodeId of this.hullOf.get(edge.id) ?? []) {
        if (!this.theta.has(nodeId)) this.theta.set(nodeId, new Map());
        this.theta.get(nodeId)!.set(edge.id, this.natAngle(nodeId, edge));
      }
    }
  }

  // ── 4. Edge-pair analysis ─────────────────────────────────────────────────

  private computePairs(edges: Hyperedge[]) {
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i],
          e2 = edges[j];
        const hull1 = this.hullOf.get(e1.id) ?? [];
        const set2 = this.hullSetOf.get(e2.id) ?? new Set<NodeId>();
        const shared = hull1.filter((id) => set2.has(id));
        if (shared.length < 2) continue;

        const sharedSet = new Set(shared);
        const n = hull1.length;
        const segs: [NodeId, NodeId][] = [];
        for (let k = 0; k < n; k++) {
          const vi = hull1[k],
            vj = hull1[(k + 1) % n];
          if (sharedSet.has(vi) && sharedSet.has(vj)) segs.push([vi, vj]);
        }

        // Also check consecutive pairs in hull2 that both sit in hull1
        const hull2 = this.hullOf.get(e2.id) ?? [];
        const set1 = this.hullSetOf.get(e1.id) ?? new Set<NodeId>();
        const m = hull2.length;
        for (let k = 0; k < m; k++) {
          const vi = hull2[k],
            vj = hull2[(k + 1) % m];
          if (set1.has(vi) && set1.has(vj)) {
            if (!segs.some((s) => s[0] === vi && s[1] === vj)) {
              segs.push([vi, vj]);
            }
          }
        }

        this.pairs.push({ e1, e2, sharedNodes: shared, sharedSegs: segs });
      }
    }
  }

  // ── 5. Energy ─────────────────────────────────────────────────────────────

  private computeEnergy(
    edges: Hyperedge[],
    edgeById: Map<HyperedgeId, Hyperedge>,
  ): number {
    let E = 0;

    // E_natural + E_repulse (per-node)
    for (const [nodeId, tMap] of this.theta) {
      const entries = [...tMap.entries()];

      for (const [edgeId, θ] of entries) {
        const edge = edgeById.get(edgeId);
        if (!edge) continue;
        const d = angDiff(θ, this.natAngle(nodeId, edge));
        E += W_NATURAL * d * d;
      }

      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a1 = this.anchor(nodeId, entries[i][0]);
          const a2 = this.anchor(nodeId, entries[j][0]);
          const dx = a1[0] - a2[0],
            dy = a1[1] - a2[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          const gap = Math.max(0, MIN_ANCHOR_SEP - dist);
          E += W_REPULSE * gap * gap;
        }
      }
    }

    // E_gap + E_parallel (per edge-pair with shared hull)
    for (const { e1, e2, sharedNodes, sharedSegs } of this.pairs) {
      // Gap: distance between anchors at shared nodes = |Δdepth|·gapLength
      for (const nodeId of sharedNodes) {
        const a1 = this.anchor(nodeId, e1.id);
        const a2 = this.anchor(nodeId, e2.id);
        const dx = a1[0] - a2[0],
          dy = a1[1] - a2[1];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const d1 = this.depth.get(nodeId)?.get(e1.id) ?? 1;
        const d2 = this.depth.get(nodeId)?.get(e2.id) ?? 1;
        const target = Math.abs(d1 - d2) * this.gapLength;
        E += W_GAP * (dist - target) * (dist - target);
      }

      // Parallel: normalised cross-product of shared consecutive segments
      for (const [vi, vj] of sharedSegs) {
        const a1i = this.anchor(vi, e1.id),
          a1j = this.anchor(vj, e1.id);
        const a2i = this.anchor(vi, e2.id),
          a2j = this.anchor(vj, e2.id);
        const s1x = a1j[0] - a1i[0],
          s1y = a1j[1] - a1i[1];
        const s2x = a2j[0] - a2i[0],
          s2y = a2j[1] - a2i[1];
        const l1 = Math.sqrt(s1x * s1x + s1y * s1y);
        const l2 = Math.sqrt(s2x * s2x + s2y * s2y);
        if (l1 < 1 || l2 < 1) continue;
        const cross = (s1x / l1) * (s2y / l2) - (s1y / l1) * (s2x / l2);
        E += W_PARALLEL * cross * cross;
      }
    }

    // E_smooth: convexity of each polygon
    for (const edge of edges) {
      const hull = this.hullOf.get(edge.id) ?? [];
      const n = hull.length;
      if (n < 3) continue;
      const anch = hull.map((id) => this.anchor(id, edge.id));
      for (let k = 0; k < n; k++) {
        const prev = anch[(k - 1 + n) % n];
        const curr = anch[k];
        const next = anch[(k + 1) % n];
        const ix = curr[0] - prev[0],
          iy = curr[1] - prev[1];
        const ox = next[0] - curr[0],
          oy = next[1] - curr[1];
        const il = Math.sqrt(ix * ix + iy * iy);
        const ol = Math.sqrt(ox * ox + oy * oy);
        if (il < 1e-9 || ol < 1e-9) continue;
        const cosA = (ix * ox + iy * oy) / (il * ol);
        const cross = ix * oy - iy * ox; // positive = CCW (convex)
        const w = cross < 0 ? W_CONCAVE : 1;
        E += W_SMOOTH * w * (1 - cosA);
      }
    }

    return E;
  }

  // ── 6. Adam optimiser (numerical gradients) ───────────────────────────────

  private optimize(edges: Hyperedge[], edgeById: Map<HyperedgeId, Hyperedge>) {
    const vars: [NodeId, HyperedgeId][] = [];
    for (const [nodeId, tMap] of this.theta)
      for (const edgeId of tMap.keys()) vars.push([nodeId, edgeId]);

    const nv = vars.length;
    const m1 = new Float64Array(nv);
    const m2 = new Float64Array(nv);

    for (let iter = 1; iter <= ITERATIONS; iter++) {
      for (let k = 0; k < nv; k++) {
        const [nodeId, edgeId] = vars[k];
        const θ = this.theta.get(nodeId)!.get(edgeId)!;

        this.theta.get(nodeId)!.set(edgeId, θ + GRAD_H);
        const ep = this.computeEnergy(edges, edgeById);
        this.theta.get(nodeId)!.set(edgeId, θ - GRAD_H);
        const em = this.computeEnergy(edges, edgeById);
        this.theta.get(nodeId)!.set(edgeId, θ);

        const g = (ep - em) / (2 * GRAD_H);
        m1[k] = ADAM_B1 * m1[k] + (1 - ADAM_B1) * g;
        m2[k] = ADAM_B2 * m2[k] + (1 - ADAM_B2) * g * g;
        const mh = m1[k] / (1 - ADAM_B1 ** iter);
        const vh = m2[k] / (1 - ADAM_B2 ** iter);
        const θNew = θ - (ADAM_LR * mh) / (Math.sqrt(vh) + ADAM_EPS);

        // Clamp to ±120° of the natural outward direction so anchors can never
        // drift past the node toward the centroid, which would leave nodes outside
        // the polygon boundary.
        const θNat = this.natAngle(nodeId, edgeById.get(edgeId)!);
        const drift = angDiff(θNew, θNat);
        const MAX_DRIFT = (2 * Math.PI) / 3; // 120°
        this.theta
          .get(nodeId)!
          .set(
            edgeId,
            Math.abs(drift) > MAX_DRIFT
              ? θNat + Math.sign(drift) * MAX_DRIFT
              : θNew,
          );
      }
    }
  }

  // ── 7. Polygon construction ───────────────────────────────────────────────

  buildPolygons(edges: Hyperedge[]) {
    for (const edge of edges) {
      updateCentroid(edge);
      const cx = edge.centroidX as number;
      const cy = edge.centroidY as number;
      const hull = this.hullOf.get(edge.id) ?? [];
      if (hull.length === 0) continue;
      const n = hull.length;

      // For each hull edge (A → B) emit:
      //   • the anchor for A (energy-optimised)
      //   • a midpoint waypoint at the perpendicular outward normal of AB
      //
      // The midpoint waypoint prevents Catmull-Rom from shortcutting through the
      // interior of the hull between two consecutive anchors, which would leave
      // non-hull nodes (interior to the convex hull) outside the closed curve.
      const collected: {
        anchor: [number, number];
        nodePos: [number, number];
      }[] = [];

      for (let k = 0; k < n; k++) {
        const idA = hull[k];
        const idB = hull[(k + 1) % n];
        const [ax, ay] = this.layout.get(idA)! as [number, number];
        const [bx, by] = this.layout.get(idB)! as [number, number];

        collected.push({
          anchor: this.anchor(idA, edge.id),
          nodePos: [ax, ay],
        });

        // Midpoint waypoint
        const mx = (ax + bx) / 2,
          my = (ay + by) / 2;
        const edgeDx = bx - ax,
          edgeDy = by - ay;
        const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
        if (edgeLen < 1e-9) continue;

        // Perpendicular to hull edge AB, forced outward (away from centroid)
        let nmx = -edgeDy / edgeLen,
          nmy = edgeDx / edgeLen;
        if ((mx - cx) * nmx + (my - cy) * nmy < 0) {
          nmx = -nmx;
          nmy = -nmy;
        }

        const dA = this.depth.get(idA)?.get(edge.id) ?? 1;
        const dB = this.depth.get(idB)?.get(edge.id) ?? 1;
        const r = ((dA + dB) / 2) * this.gapLength;

        collected.push({
          anchor: [mx + r * nmx, my + r * nmy],
          nodePos: [mx, my],
        });
      }

      // Sort clockwise around centroid to guarantee non-self-intersecting polygon
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
