import { Hypergraph } from "../Hypergraph";

export function manySameHyperedge() {
  let nodes = [
    { id: "a", x: 100, y: 100 },
    { id: "b", x: 200, y: 100 },
    { id: "c", x: 150, y: 200 },
    { id: "d", x: 250, y: 200 },
    { id: "e", x: 250, y: 200 },
    { id: "f", x: 250, y: 200 },
  ];

  let edges = [
    { id: "e1", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e2", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e3", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e4", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e5", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e6", nodes: ["a", "b", "c", "d", "e", "f"] },
  ];

  const hypergraph = new Hypergraph(nodes, edges);
  return hypergraph;
}

export function coreHyperedge() {
  let nodes = [
    { id: "a", x: 100, y: 100 },
    { id: "b", x: 200, y: 100 },
    { id: "c", x: 150, y: 200 },
    { id: "d", x: 250, y: 200 },
    { id: "e", x: 250, y: 200 },
    { id: "f", x: 250, y: 200 },
    { id: "g", x: 250, y: 200 },
    { id: "h", x: 250, y: 200 },
    { id: "i", x: 250, y: 200 },
  ];

  let edges = [
    { id: "e1", nodes: ["a", "b", "c", "d", "e"] },
    { id: "e2", nodes: ["a", "b", "c", "d", "e", "f"] },
    { id: "e3", nodes: ["a", "b", "c", "d", "e", "g"] },
    { id: "e4", nodes: ["a", "b", "c", "d", "e", "h"] },
    { id: "e5", nodes: ["a", "b", "c", "d", "e", "i"] },
  ];

  const hypergraph = new Hypergraph(nodes, edges);
  return hypergraph;
}

export function coreNode() {
  let nodes = [
    { id: "a", x: 100, y: 100 },
    { id: "b", x: 200, y: 100 },
    { id: "c", x: 150, y: 200 },
    { id: "d", x: 250, y: 200 },
    { id: "e", x: 250, y: 200 },
    { id: "f", x: 250, y: 200 },
    { id: "g", x: 250, y: 200 },
    { id: "h", x: 250, y: 200 },
    { id: "i", x: 250, y: 200 },
    { id: "j", x: 250, y: 200 },
  ];

  let edges = [
    { id: "e1", nodes: ["a", "b", "c", "d"] },
    { id: "e2", nodes: ["a", "b", "c"] },
    { id: "e3", nodes: ["a", "b", "c", "d"] },
    { id: "e4", nodes: ["e", "f", "g", "d"] },
    { id: "e5", nodes: ["h", "i", "j", "d"] },
    { id: "e6", nodes: ["h", "i", "j", "d"] },
  ];

  const hypergraph = new Hypergraph(nodes, edges);
  return hypergraph;
}
