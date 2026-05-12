import type { Hyperedge, HyperedgeId } from "./Hyperedge";

export type NodeId = String | Number;

export interface Node {
  id: NodeId;
  x?: number;
  y?: number;
  [key: string]: any;
}

export interface HyperedgeInput {
  id: HyperedgeId;
  centroidX?: number;
  centroidY?: number;
  nodes: Iterable<NodeId>;
  [key: string]: any;
}

export function hyperedgeToPoints(hyperedge: Hyperedge): [number, number][] {
  const nodes = Array.from(hyperedge.nodes);
  const points = nodes.map((node) => [node.x!, node.y!] as [number, number]);
  return points;
}

export class Hypergraph {
  nodes: Node[];
  hyperedges: Hyperedge[];
  nodeIdToHyperedges: Map<NodeId, HyperedgeId[]>;

  counter: number;

  constructor(nodes: Iterable<Node>, hyperedges: Iterable<HyperedgeInput>) {
    this.nodes = Array.from(nodes);
    this.hyperedges = [];
    this.nodeIdToHyperedges = new Map();
    this.counter = 0;

    for (let node of this.nodes) {
      this.nodeIdToHyperedges.set(node.id, []);
    }

    for (const hyperedge of hyperedges) {
      let nodesIds = this.nodesIds();

      for (let nodeId of hyperedge.nodes) {
        if (!nodesIds.includes(nodeId as NodeId)) {
          this.addNode({ id: nodeId as NodeId });
        }
      }

      for (let nodeId of hyperedge.nodes) {
        this.nodeIdToHyperedges.get(nodeId)?.push(hyperedge.id);
      }

      let resolvedNodes = (hyperedge.nodes as NodeId[]).map((nodeId: NodeId) =>
        this.nodeIdToNode(nodeId),
      );

      hyperedge.nodes = resolvedNodes as Node[];
      this.hyperedges.push(hyperedge as unknown as Hyperedge);
    }
  }

  getNode(nodeId: NodeId): Node | undefined {
    return this.nodes.find((node) => node.id === nodeId);
  }

  nodesIds(): NodeId[] {
    return this.nodes.map((node) => node.id);
  }

  nodeIdToNode(nodeId: NodeId): Node | undefined {
    return this.nodes.find((node) => nodeId === node.id);
  }

  addNode(node: Node): void {
    if (!this.nodes.some((n) => n.id === node.id)) {
      this.nodes.push(node);
      this.nodeIdToHyperedges.set(node.id, []);
    }
  }

  addHyperedge(hyperedge: Hyperedge): void {
    for (const nodeId of hyperedge.nodes) {
      if (!this.nodesIds().includes(nodeId as unknown as NodeId)) {
        this.addNode({ id: nodeId as unknown as NodeId });
      }

      this.nodeIdToHyperedges
        .get(nodeId as unknown as NodeId)!
        .push(hyperedge.id);
    }

    this.hyperedges.push(hyperedge);
  }

  getHyperedgeNodes(hyperedgeId: HyperedgeId): Hyperedge | undefined {
    return this.hyperedges.find((he) => he.id === hyperedgeId);
  }

  getNodeHyperedges(nodeId: NodeId): HyperedgeId[] | undefined {
    return this.nodeIdToHyperedges.get(nodeId);
  }

  // removeNode(node: Node): void {
  //   const idx = this.nodes.findIndex((n) => n.id === node.id);
  //   if (idx !== -1) {
  //     this.nodes.splice(idx, 1);
  //     const hyperedgesToRemove = this.nodeIdToHyperedges.get(node.id)!;
  //     for (const hyperedgeId of hyperedgesToRemove) {
  //       this.hyperedges = this.hyperedges.filter((he) => he.id !== hyperedgeId);
  //     }
  //     this.nodeIdToHyperedges.delete(node.id);
  //   }
  // }

  removeHyperedge(hyperedge: Hyperedge): void {
    const idx = this.hyperedges.findIndex((he) => he.id === hyperedge.id);
    if (idx !== -1) {
      const nodes = hyperedge.nodes;
      for (const node of nodes) {
        const arr = this.nodeIdToHyperedges.get((node as Node).id)!;
        arr.splice(arr.indexOf(hyperedge.id), 1);
      }
      this.hyperedges.splice(idx, 1);
    }
  }

  toJson(): { nodes: Node[]; hyperedges: HyperedgeInput[] } {
    return {
      nodes: this.nodes.map((n) => ({ ...n })),
      hyperedges: this.hyperedges.map((he) => ({
        ...he,
        nodes: Array.from(he.nodes).map((n) => (n as Node).id),
      })),
    };
  }

  static fromJson(data: {
    nodes: Node[];
    hyperedges: HyperedgeInput[];
  }): Hypergraph {
    return new Hypergraph(data.nodes, data.hyperedges);
  }

  static fromPaohJson(data: any): Hypergraph {
    const nodes: Node[] = [];
    const hyperedgesMap: Map<HyperedgeId, HyperedgeInput> = new Map();

    // 1️⃣ separate nodes and hyperedges
    for (const n of data.nodes) {
      if (n.type === "node") {
        nodes.push({
          id: n.id,
          ...n,
        });
      }

      if (n.type === "hyperedge") {
        hyperedgesMap.set(n.id, {
          id: n.id,
          nodes: [],
          ...n,
        });
      }
    }

    // 2️⃣ build membership via links
    for (const link of data.links) {
      const nodeId = link.source;
      const hyperedgeId = link.target;

      const hyperedge = hyperedgesMap.get(hyperedgeId);

      if (!hyperedge) continue;

      (hyperedge.nodes as NodeId[]).push(nodeId);
    }

    // 3️⃣ construct hypergraph
    return new Hypergraph(nodes, Array.from(hyperedgesMap.values()));
  }
}
