import * as d3 from "d3";
import type { Hyperedge } from "./Hyperedge";
import type { Hypergraph, Node, NodeId } from "./Hypergraph";
import type { Layout } from "./layout";

// Simulation nodes cover both original graph nodes and one virtual node per hyperedge
interface SimNode extends d3.SimulationNodeDatum {
  id: NodeId;
  isHyperedge: boolean;
}

// Mulberry32 seeded PRNG — fast, good quality, no dependencies
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function forceLayoutD3(
  hypergraph: Hypergraph,
  width: number = 1000,
  height: number = 1000,
  iterations: number = 400,
  seed: number = 42,
): Layout {
  const rand = seededRandom(seed);

  // 1. Build bipartite node list
  const simNodes: SimNode[] = [
    ...hypergraph.nodes.map((n: Node) => ({
      id: n.id,
      isHyperedge: false,
      x: n.x ?? rand() * width,
      y: n.y ?? rand() * height,
    })),
    ...hypergraph.hyperedges.map((e: Hyperedge) => ({
      id: e.id,
      isHyperedge: true,
      x: e.centroidX ?? rand() * width,
      y: e.centroidY ?? rand() * height,
    })),
  ];

  // 2. Build bipartite links: each original node connects to its hyperedge virtual node
  const nodeById = new Map<NodeId, SimNode>(simNodes.map((n) => [n.id, n]));

  const simLinks = hypergraph.hyperedges.flatMap((edge: Hyperedge) =>
    edge.nodes.map((node) => ({
      source: nodeById.get((node as Node).id)!,
      target: nodeById.get(edge.id)!,
    })),
  );

  // 3. Run d3 force simulation
  const simulation = d3
    .forceSimulation<SimNode>(simNodes)
    .force("link", d3.forceLink(simLinks))
    .force("charge", d3.forceManyBody().strength(-1000))
    .force("center", d3.forceCenter(width / 2, height / 2))
    // .force("collision", d3.forceCollide(10))
    .stop();

  for (let i = 0; i < iterations; i++) {
    simulation.tick();
  }

  // 4. Write positions back to hypergraph nodes and build Layout
  const layout: Layout = new Map();
  for (const simNode of simNodes) {
    if (!simNode.isHyperedge) {
      const node = hypergraph.getNode(simNode.id)!;
      node.x = simNode.x!;
      node.y = simNode.y!;
      layout.set(simNode.id, [simNode.x!, simNode.y!]);
    }
  }

  return layout;
}
