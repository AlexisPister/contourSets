import * as d3 from "d3";
import concaveman from "concaveman";

import { HypForceLayout } from "./lib/forceLayout.ts";
import { Hypergraph } from "./lib/Hypergraph.ts";

import data from "./data/sbm.json";
import {
  computeHypergraphArea,
  computeHypergraphOverlapArea,
} from "./lib/metrics/polygonOverlap.ts";
import { computePolygonCrossings } from "./lib/metrics/polygonCrossing.ts";

import { forceLayoutD3 } from "./lib/forceLayoutD3.ts";
import { renderHypergraph } from "./lib/render/render.ts";
import {
  coreHyperedge,
  coreNode,
  manySameHyperedge,
} from "./lib/generators/examples.ts";
import { prefattachmentHypergraph } from "./lib/generators/random.ts";

import { HyperedgeRoutingOneAnchor } from "./lib/routingOneAnchor.ts";
import { HyperedgeRoutingTwoAnchor } from "./lib/routingTwoAnchor.ts";
import { HyperedgeRoutingEnergy } from "./lib/routingEnergy.ts";
import { HyperedgeRoutingMidpointAnchor } from "./lib/routingMidpointAnchor.ts";
import { HyperedgeRoutingCornerAnchor } from "./lib/routingCornerAnchor.ts";
import { HyperedgeRoutingBoundaryAnchor } from "./lib/routingBoundaryAnchor.ts";
import { HyperedgeRouting } from "./lib/routing.ts";

interface Point {
  x: number;
  y: number;
}

let nodes = [
  { id: "a", x: 100, y: 100 },
  { id: "b", x: 200, y: 100 },
  { id: "c", x: 150, y: 200 },
  { id: "d", x: 250, y: 200 },
  { id: "e", x: 250, y: 200 },
  { id: "f", x: 250, y: 200 },
  // { id: "g", x: 250, y: 200 },
];

let edges = [
  { id: "e1", nodes: ["a", "b", "c"] },
  { id: "e2", nodes: ["a", "b", "c", "d"] },
  { id: "e3", nodes: ["a", "b", "c"] },
  { id: "e4", nodes: ["a", "d", "e"] },
  { id: "e5", nodes: ["a", "d", "e", "f", "l"] },
  // { id: "e2", nodes: ["a", "b", "c", "d", "e"] },
  { id: "e6", nodes: ["a", "e", "f"] },
  { id: "e7", nodes: ["f", "i", "j", "k", "l"] },
];
//
// let edges = [
// { id: "e1", nodes: ["a", "b", "c", "d", "e", "f"] },
// { id: "e2", nodes: ["a", "b", "c", "d", "e", "g"] },
// { id: "e3", nodes: ["a", "b", "c", "d", "e", "h"] },
// ];

// const hypergraph = new Hypergraph(nodes, edges);
// const hypergraph = manySameHyperedge();
// const hypergraph = coreHyperedge();
// const hypergraph = coreNode();
const hypergraph = prefattachmentHypergraph(6, 10, 0.15);

// const hypergraph = Hypergraph.fromJson(data);

console.log(hypergraph);

const width = 1000;
const height = 1000;

// let layout = new HypForceLayout(hypergraph, 1000, 1000);
// let layoutResult = layout.run();

let layoutResult = forceLayoutD3(hypergraph, 1000, 1000);

// let routing = new HyperedgeRouting(hypergraph, layoutResult);
// let routing = new HyperedgeRoutingOneAnchor(hypergraph, layoutResult);
// let routing = new HyperedgeRoutingTwoAnchor(hypergraph, layoutResult);
// let routing = new HyperedgeRoutingEnergy(hypergraph, layoutResult);
// let routing = new HyperedgeRoutingMidpointAnchor(hypergraph, layoutResult);
let routing = new HyperedgeRoutingCornerAnchor(hypergraph, layoutResult);
routing.run();

// const overlapArea = computeHypergraphOverlapArea(hypergraph);
// console.log("OVERLAP AREA", overlapArea);
// const area = computeHypergraphArea(hypergraph);
// console.log("AREA", area);
// console.log("AREA NORM", overlapArea / area);
// const nbCrossings = computePolygonCrossings(hypergraph);
// console.log("NB CROSSINGS", nbCrossings);

// ---------------------
// 4️⃣ Render with D3 + SVG
// ---------------------

const svg = d3
  .select("svg")
  .attr("width", width)
  .attr("height", height)
  .style("background", "#fafafa");

renderHypergraph(hypergraph, layoutResult, routing, svg);

// Draw edge node
// svg
//   .selectAll("rect")
//   .data(edges)
//   .join("rect")
//   .attr("x", (d) => d.centroidX - 5)
//   .attr("y", (d) => d.centroidY - 5)
//   .attr("width", 10)
//   .attr("height", 10)
//   .attr("stroke", "#999")
//   .attr("stroke-width", 1.5);

// // Draw edge line
// svg
//   .selectAll(".hyperedge")
//   .data(edges)
//   .join("g")
//   .classed("hyperedge", true)
//   .selectAll("line")
//   .data((d) => d.nodes.map((node) => [node, d]))
//   .join("line")
//   .attr("x1", (d) => d[1].centroidX)
//   .attr("y1", (d) => d[1].centroidY)
//   .attr("x2", (d) => d[0].x)
//   .attr("y2", (d) => d[0].y)
//   .attr("stroke", "#999")
//   .attr("stroke-width", 1.5);

// HULL
// svg
//   .selectAll("path")
//   .data(hypergraph.hyperedges)
//   .join("path")
//   .classed("hull", true)
//   // .attr("d", (d) =>
//   //   d3.line().curve(d3.curveLinearClosed)(
//   //     concaveman(d.nodes.map((node) => [node.x, node.y])),
//   //   ),
//   // )
//   .attr("d", (d) =>
//     d3.line().curve(d3.curveLinearClosed)(
//       hullPadding(concaveman(d.nodes.map((node) => [node.x, node.y]))),
//     ),
//   )
//   .attr("fill", "rgb(40, 40, 40, 0.12)")
//   .attr("stroke", "black")
//   .attr("stroke-width", 1.5);

// svg
//   .selectAll("path")
//   .data(hypergraph.hyperedges)
//   .join("path")
//   .classed("hull", true)
//   .attr("d", (d) => {
//     console.log(d);
//     // return d3.line().curve(d3.curveLinearClosed)(d.polygon);
//     // return d3.line().curve(d3.curveCatmullRomClosed)(d.polygon);
//     return d3.line().curve(d3.curveCardinalClosed)(d.polygon);
//   })
//   .attr("fill", () => randomColor())
//   .attr("stroke", "black")
//   .attr("stroke-width", 1.5);

// // cenroid
// // svg
// //   .selectAll("rect")
// //   .data(hypergraph.hyperedges)
// //   .join("rect")
// //   .classed("centroid", true)
// //   .attr("x", (d) => d.centroidX - 3)
// //   .attr("y", (d) => d.centroidY - 3)
// //   .attr("width", 6)
// //   .attr("height", 6)
// //   // .attr("stroke", "red")
// //   .attr("stroke-width", 1.5);

// // anchor points
// const anchorPoints: [number, number][] = [];
// for (const [nodeId, edgeMap] of routing.nodeToHyperedgeToDirection) {
//   const [nx, ny] = layoutResult.get(nodeId)!;
//   for (const [edgeId, [dirX, dirY]] of edgeMap) {
//     // const depth = routing.nodeToHyperedgeToDepth.get(nodeId)?.get(edgeId) ?? 1;
//     // if (depth !== 1) continue;
//     anchorPoints.push([
//       nx + dirX * routing.gapLength,
//       ny + dirY * routing.gapLength,
//     ]);
//   }
// }

// svg
//   .selectAll("rect")
//   .data(anchorPoints)
//   .join("rect")
//   .classed("anchor", true)
//   .attr("x", (d) => d[0] - 4)
//   .attr("y", (d) => d[1] - 4)
//   .attr("width", 8)
//   .attr("height", 8)
//   .attr("fill", "red")
//   .attr("stroke-width", 1.5);

// // Draw nodes
// svg
//   .selectAll("circle")
//   .data(hypergraph.nodes)
//   .join("circle")
//   .attr("cx", (d) => d.x)
//   .attr("cy", (d) => d.y)
//   .attr("r", 5)
//   .attr("fill", "black");

// // Optional labels
// svg
//   .selectAll("text")
//   .data(hypergraph.nodes)
//   .enter()
//   .append("text")
//   .attr("x", (d) => d.x + 12)
//   .attr("y", (d) => d.y + 4)
//   .text((d) => d.id)
//   .attr("font-size", 12)
//   .attr("fill", "#333");

// function randomColor(): string {
//   const hue = Math.floor(Math.random() * 360);
//   return `hsl(${hue}, 70%, 60%, 0.2)`;
// }

// function hullPadding(h: number[][], padding: number = 20) {
//   h.pop();
//   const n = h.length;
//   const EPS = 1e-9;

//   return h.map((_, i1) => {
//     const i0 = (i1 + n - 1) % n;
//     const i2 = (i1 + 1) % n;

//     const [x0, y0] = h[i0];
//     const [x1, y1] = h[i1];
//     const [x2, y2] = h[i2];

//     // edge directions
//     let dx1 = x1 - x0,
//       dy1 = y1 - y0;
//     let dx2 = x2 - x1,
//       dy2 = y2 - y1;

//     const l1 = Math.hypot(dx1, dy1);
//     const l2 = Math.hypot(dx2, dy2);

//     dx1 /= l1;
//     dy1 /= l1;
//     dx2 /= l2;
//     dy2 /= l2;

//     // outward normals
//     const nx1 = -dy1,
//       ny1 = dx1;
//     const nx2 = -dy2,
//       ny2 = dx2;

//     // angle bisector direction
//     let bx = nx1 + nx2;
//     let by = ny1 + ny2;

//     const bl = Math.hypot(bx, by);

//     // handle straight line case
//     if (bl < EPS) {
//       return [x1 + nx1 * padding, y1 + ny1 * padding];
//     }

//     bx /= bl;
//     by /= bl;

//     return [x1 + bx * padding, y1 + by * padding];
//   });
// }

// function hullPadding(h, padding: number = 30) {
//   h.pop();
//   const n = h.length;
//   if (padding > 0) {
//     let hullPadded = h.map((p, i1) => {
//       const i0 = (i1 + n - 1) % n,
//         i2 = (i1 + 1) % n;
//       const [x0, y0] = h[i0],
//         [x1, y1] = h[i1],
//         [x2, y2] = h[i2];
//       let dx1 = x1 - x0,
//         dy1 = y1 - y0,
//         dx2 = x2 - x1,
//         dy2 = y2 - y1,
//         r1 = 1 / Math.hypot(dx1, dy1),
//         r2 = 1 / Math.hypot(dx2, dy2);
//       ((dx1 *= r1), (dy1 *= r1)); // unit vectors
//       ((dx2 *= r2), (dy2 *= r2));

//       const dot = dx1 * dx2 + dy1 * dy2;

//       // prevent denominator from approaching zero
//       const denom = Math.max(1 + dot, 1);

//       // const r = padding / denom;

//       const r = 10;
//       // const r = padding / (1 + dx1 * dx2 + dy1 * dy2);

//       return [x1 - (dy1 + dy2) * r, y1 + (dx1 + dx2) * r];
//     });

//     return hullPadded;
//   }
// }
