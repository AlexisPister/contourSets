import { Hypergraph } from "./Hypergraph.ts";
import type { Node } from "./Hypergraph.ts";
import type { Layout } from "./layout.ts";

export class HypForceLayout {
  hypergraph: Hypergraph;
  width: number;
  height: number;
  iterations: number;
  K: number;
  T: number;
  nodeToDisplacement: Map<Node, { x: number; y: number }>;

  constructor(
    hypergraph: Hypergraph,
    width: number = 1000,
    height: number = 1000,
  ) {
    this.hypergraph = hypergraph;
    this.width = width;
    this.height = height;
    this.nodeToDisplacement = new Map();
    this.iterations = 1000;

    this.K = Math.sqrt(
      (this.width * this.height) / this.hypergraph.nodes.length,
    );
    this.K = this.K / 4;
    // this.T = 1;
    this.T = Math.min(this.width, this.height) / 10;

    for (let node of this.hypergraph.nodes) {
      this.nodeToDisplacement.set(node, { x: 0, y: 0 });
    }
  }

  run(): Layout {
    let i = 0;
    this.initPositions();
    while (i < this.iterations) {
      // RESET DISPLACEMENTS
      for (let node of this.hypergraph.nodes) {
        this.nodeToDisplacement.set(node, { x: 0, y: 0 });
      }

      this.updateCentroids();
      this.repulsiveForce();
      this.attractiveForce();
      this.gravityForce();

      this.updatePositions();

      i++;
      this.T -= 1 / this.iterations;
      // console.log(999, this.T);
    }

    this.updateCentroids();

    return new Map(
      this.hypergraph.nodes.map((node) => [
        node.id,
        [node.x as number, node.y as number],
      ]),
    );
  }

  initPositions() {
    const padding = 50;

    for (let node of this.hypergraph.nodes) {
      node.x = Math.random() * (this.width - 2 * padding) + padding;
      node.y = Math.random() * (this.height - 2 * padding) + padding;
    }
  }

  repulsiveForce() {
    for (let node of this.hypergraph.nodes) {
      if (node.x == null || node.y == null) continue;

      for (let otherNode of this.hypergraph.nodes) {
        if (node === otherNode) continue;
        if (otherNode.x == null || otherNode.y == null) continue;

        const dx = node.x - otherNode.x;
        const dy = node.y - otherNode.y;
        const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        const force = this.K / distance;

        this.nodeToDisplacement.get(node)!.x += (force * dx) / distance;
        this.nodeToDisplacement.get(node)!.y += (force * dy) / distance;
      }
    }
  }

  attractiveForce() {
    for (let edge of this.hypergraph.hyperedges) {
      for (let node of edge.nodes) {
        if (node.x == null || node.y == null) continue;

        const dx = node.x - edge.centroidX!;
        const dy = node.y - edge.centroidY!;
        const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
        const force = distance / this.K;

        this.nodeToDisplacement.get(node as Node)!.x -= (force * dx) / distance;
        this.nodeToDisplacement.get(node as Node)!.y -= (force * dy) / distance;
      }
    }
  }

  gravityForce() {
    for (let node of this.hypergraph.nodes) {
      const dx = node.x! - this.width / 2;
      const dy = node.y! - this.height / 2;
      const distance = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
      const force = this.K / distance;
      // const force = 1 / distance;

      this.nodeToDisplacement.get(node)!.x -= (force * dx) / distance;
      this.nodeToDisplacement.get(node)!.y -= (force * dy) / distance;
    }
  }

  updatePositions() {
    for (let node of this.hypergraph.nodes) {
      let dx = this.nodeToDisplacement.get(node as Node)!.x;
      let dy = this.nodeToDisplacement.get(node as Node)!.y;

      let distance = Math.sqrt(dx * dx + dy * dy);

      node.x! += (dx / distance) * Math.min(distance, this.T);
      node.y! += (dy / distance) * Math.min(distance, this.T);
    }
  }

  updateCentroids() {
    for (const hyperedge of this.hypergraph.hyperedges) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;

      for (const node of hyperedge.nodes) {
        sumX += node.x!;
        sumY += node.y!;
        count++;
      }

      hyperedge.centroidX = sumX / count;
      hyperedge.centroidY = sumY / count;
    }
  }
}
