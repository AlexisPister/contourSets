import * as d3 from "d3";
import concaveman from "concaveman";

import { Hypergraph } from "../Hypergraph";

export function renderTest() {
  console.log(22);
}

export function renderHypergraph(
  hypergraph: Hypergraph,
  width = 1000,
  height = 1000,
) {
  const svg = d3
    .select("svg")
    .attr("width", width)
    .attr("height", height)
    .style("background", "#fafafa");

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
  svg
    .selectAll("path")
    .data(hypergraph.hyperedges)
    .join("path")
    .classed("hull", true)
    // .attr("d", (d) =>
    //   d3.line().curve(d3.curveLinearClosed)(
    //     concaveman(d.nodes.map((node) => [node.x, node.y])),
    //   ),
    // )
    .attr("d", (d) =>
      d3.line().curve(d3.curveLinearClosed)(
        hullPadding(concaveman(d.nodes.map((node) => [node.x, node.y]))),
      ),
    )
    .attr("fill", "rgb(40, 40, 40, 0.0)")
    .attr("stroke", "black")
    .attr("stroke-width", 1.5);

  // cenroid
  svg
    .selectAll("rect")
    .data(hypergraph.hyperedges)
    .join("rect")
    .classed("centroid", true)
    .attr("x", (d) => d.centroidX - 3)
    .attr("y", (d) => d.centroidY - 3)
    .attr("width", 6)
    .attr("height", 6)
    // .attr("stroke", "red")
    .attr("stroke-width", 1.5);

  // Draw nodes
  svg
    .selectAll("circle")
    .data(hypergraph.nodes)
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", 8)
    .attr("fill", "#4f46e5");

  // Optional labels
  svg
    .selectAll("text")
    .data(hypergraph.nodes)
    .enter()
    .append("text")
    .attr("x", (d) => d.x + 12)
    .attr("y", (d) => d.y + 4)
    .text((d) => d.id)
    .attr("font-size", 12)
    .attr("fill", "#333");

  return svg.node();
}

export function hullPadding(h: number[][], padding: number = 8) {
  h.pop();
  const n = h.length;
  const EPS = 1e-9;

  return h.map((_, i1) => {
    const i0 = (i1 + n - 1) % n;
    const i2 = (i1 + 1) % n;

    const [x0, y0] = h[i0];
    const [x1, y1] = h[i1];
    const [x2, y2] = h[i2];

    // edge directions
    let dx1 = x1 - x0,
      dy1 = y1 - y0;
    let dx2 = x2 - x1,
      dy2 = y2 - y1;

    const l1 = Math.hypot(dx1, dy1);
    const l2 = Math.hypot(dx2, dy2);

    dx1 /= l1;
    dy1 /= l1;
    dx2 /= l2;
    dy2 /= l2;

    // outward normals
    const nx1 = -dy1,
      ny1 = dx1;
    const nx2 = -dy2,
      ny2 = dx2;

    // angle bisector direction
    let bx = nx1 + nx2;
    let by = ny1 + ny2;

    const bl = Math.hypot(bx, by);

    // handle straight line case
    if (bl < EPS) {
      return [x1 + nx1 * padding, y1 + ny1 * padding];
    }

    bx /= bl;
    by /= bl;

    return [x1 + bx * padding, y1 + by * padding];
  });
}
