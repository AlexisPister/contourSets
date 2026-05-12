import { Hypergraph } from "../Hypergraph.ts";
import type { Node } from "../Hypergraph.ts";

// Implementation of the class of random hypergraph models from:
// Barthelemy, "A class of models for random hypergraphs", Phys. Rev. E 106, 064310 (2022)
//
// General framework: N nodes, E hyperedges.
// The fundamental quantity is p_{i,μ} = probability that node i belongs to hyperedge μ.
// Memberships are drawn independently for each (i, μ) pair.
//
// Four model variants are implemented:
//   erHypergraph       – Erdős-Rényi:      p_{i,μ} = p  (uniform constant)
//   fitnessHypergraph  – Fitness-based:    p_{i,μ} = kAvg · η_i / Σ η_j
//   paHypergraph       – Preferential att: p_{i,μ} ∝ size_μ + δ  (nodes outer, hyperedges inner)
//   spatialHypergraph  – Geometric:        p_{i,μ} = 1 iff dist(i, center_μ) < r

// ---------------------------------------------------------------------------
// Erdős-Rényi random hypergraph
// ---------------------------------------------------------------------------
// Each node joins each hyperedge independently with constant probability p.
// Expected hyperedge size: ⟨k⟩ = N·p
// Connectivity phase transition at p* ~ 1/√(E·N)
export function randomHypergraph(N: number, E: number, p: number): Hypergraph {
  const nodes: Node[] = Array.from({ length: N }, (_, i) => ({ id: i }));
  const hyperedges: HyperedgeInput[] = [];

  for (let mu = 0; mu < E; mu++) {
    const members: number[] = [];
    for (let i = 0; i < N; i++) {
      if (Math.random() < p) members.push(i);
    }
    if (members.length >= 2) {
      hyperedges.push({ id: `e${mu}`, nodes: members });
    }
  }

  return new Hypergraph(nodes, hyperedges);
}

// ---------------------------------------------------------------------------
// Preferential-attachment random hypergraph
// ---------------------------------------------------------------------------
// Each of the E hyperedges is seeded with one random node (size = 1).
// Nodes are then processed one by one (outer loop). For each node i and each
// hyperedge μ (inner loop), the joining probability is:
//   p_{i,μ} = p · (size_μ + δ) / (1 + δ)   (clamped to [0, 1])
// where size_μ is the current number of members of μ, δ > 0 keeps every
// hyperedge reachable, and p is the base probability when size_μ = 1.
// Larger hyperedges attract disproportionately more nodes ("rich get richer").
export function prefattachmentHypergraph(
  N: number,
  E: number,
  p: number,
  delta: number = 1,
): Hypergraph {
  const nodes: Node[] = Array.from({ length: N }, (_, i) => ({ id: i }));

  // Each hyperedge starts with one random seed node (size = 1)
  const sizes = new Array<number>(E).fill(1);
  const memberSets: Set<number>[] = Array.from(
    { length: E },
    () => new Set([Math.floor(Math.random() * N)]),
  );

  // First loop: nodes; second loop: hyperedges
  // p_{i,μ} = p · (size_μ + δ) / (1 + δ) — larger hyperedges attract more nodes
  for (let i = 0; i < N; i++) {
    for (let mu = 0; mu < E; mu++) {
      if (memberSets[mu].has(i)) continue;
      const prob = Math.min((p * (sizes[mu] + delta)) / (1 + delta), 1);
      if (Math.random() < prob) {
        memberSets[mu].add(i);
        sizes[mu]++;
      }
    }
  }

  const hyperedges: HyperedgeInput[] = [];
  for (let mu = 0; mu < E; mu++) {
    if (memberSets[mu].size >= 2) {
      hyperedges.push({ id: `e${mu}`, nodes: Array.from(memberSets[mu]) });
    }
  }

  return new Hypergraph(nodes, hyperedges);
}

// ---------------------------------------------------------------------------
// Spatial (random geometric) random hypergraph
// ---------------------------------------------------------------------------
// N nodes are placed uniformly at random in [0, width] × [0, height].
// Each hyperedge has a random center drawn from the same domain; node i is
// included if its Euclidean distance to the center is less than r.
// p_{i,μ} = 1{dist(node_i, center_μ) < r}   (hard threshold)
// Percolation phase transition at r* ~ 1/√E (in 2D).
export function spatialHypergraph(
  N: number,
  E: number,
  r: number,
  width: number = 1,
  height: number = 1,
): Hypergraph {
  const nodes: Node[] = Array.from({ length: N }, (_, i) => ({
    id: i,
    x: Math.random() * width,
    y: Math.random() * height,
  }));
  const hyperedges: HyperedgeInput[] = [];

  for (let mu = 0; mu < E; mu++) {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const members: number[] = [];

    for (let i = 0; i < N; i++) {
      const dx = (nodes[i].x as number) - cx;
      const dy = (nodes[i].y as number) - cy;
      if (dx * dx + dy * dy < r * r) members.push(i);
    }

    if (members.length >= 2) {
      hyperedges.push({ id: `e${mu}`, nodes: members });
    }
  }

  return new Hypergraph(nodes, hyperedges);
}
