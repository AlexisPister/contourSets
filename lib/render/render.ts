import * as d3 from "d3";
import type { Hypergraph } from "../Hypergraph";
import type { Layout } from "../layout";
// routing param kept for API compatibility but not read at runtime

// Tangent at polygon vertex i = 0.5 * (nodePos[i+1] - nodePos[i-1]).
// Using original node positions (not depth-shifted) ensures all depths
// between the same pair of nodes get the same tangent direction → parallel curves.
function hermitePolygon(
  points: [number, number][],
  nodePos: [number, number][],
): string {
  const n = points.length;
  if (n < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const prev = nodePos[(i - 1 + n) % n];
    const next = nodePos[(i + 1) % n];
    const next2 = nodePos[(i + 2) % n];
    const curr = nodePos[i];

    const t1x = (next[0] - prev[0]) * 0.5;
    const t1y = (next[1] - prev[1]) * 0.5;
    const t2x = (next2[0] - curr[0]) * 0.5;
    const t2y = (next2[1] - curr[1]) * 0.5;

    d +=
      ` C ${p1[0] + t1x / 3} ${p1[1] + t1y / 3}` +
      ` ${p2[0] - t2x / 3} ${p2[1] - t2y / 3}` +
      ` ${p2[0]} ${p2[1]}`;
  }
  return d + " Z";
}

function randomColor(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%, 0.2)`;
}

export function renderHypergraph(
  hypergraph: Hypergraph,
  layoutResult: Layout,
  routing: unknown,
  svgEl,
  width = 1000,
  height = 1000,
) {
  let svg;
  if (svgEl) {
    svg = svgEl
      .attr("width", width)
      .attr("height", height)
      .style("background", "#fafafa");
  } else {
    svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", height)
      .style("background", "#fafafa");
  }

  // Hyperedge hulls
  svg
    .selectAll("path.hull")
    .data(hypergraph.hyperedges.filter((d) => d.polygon))
    .join("path")
    .classed("hull", true)
    // .attr("d", (d) =>
    //   hermitePolygon(
    //     d.polygon as [number, number][],
    //     d.polygonNodes as [number, number][],
    //   ),
    // )
    // .attr("d", (d) => d3.line().curve(d3.curveLinearClosed)(d.polygon))
    .attr("d", (d) => d3.line().curve(d3.curveCatmullRomClosed)(d.polygon))
    .attr("fill", () => randomColor())
    .attr("stroke", "black")
    .attr("stroke-width", 1.5);

  // Anchor points (depth 1 only)
  // const anchorPoints: [number, number][] = [];
  // for (const [nodeId, edgeMap] of routing.nodeToHyperedgeToDirection) {
  //   const [nx, ny] = layoutResult.get(nodeId)!;
  //   for (const [edgeId, [dirX, dirY]] of edgeMap) {
  //     const depth =
  //       routing.nodeToHyperedgeToDepth.get(nodeId)?.get(edgeId) ?? 1;
  //     if (depth !== 1) continue;
  //     anchorPoints.push([
  //       nx + dirX * routing.gapLength,
  //       ny + dirY * routing.gapLength,
  //     ]);
  //   }
  // }

  // All anchor points actually used in polygons
  const anchorPoints: [number, number][] = hypergraph.hyperedges.flatMap(
    (e) => (e.polygon as [number, number][]) ?? [],
  );

  svg
    .selectAll("rect.anchor")
    .data(anchorPoints)
    .join("rect")
    .classed("anchor", true)
    .attr("x", (d) => d[0] - 1.5)
    .attr("y", (d) => d[1] - 1.5)
    .attr("width", 3)
    .attr("height", 3)
    .attr("fill", "red");

  // Nodes
  svg
    .selectAll("circle")
    .data(hypergraph.nodes)
    .join("circle")
    .attr("cx", (d) => d.x)
    .attr("cy", (d) => d.y)
    .attr("r", 5)
    .attr("fill", "black");

  // Labels
  svg
    .selectAll("text")
    .data(hypergraph.nodes)
    .join("text")
    .attr("x", (d) => d.x + 12)
    .attr("y", (d) => d.y + 4)
    .text((d) => String(d.id))
    .attr("font-size", 12)
    .attr("fill", "#333");

  svg
    .selectAll("rect.centoid")
    .data(hypergraph.hyperedges)
    .join("rect")
    .classed("centroid", true)
    .attr("x", (d) => d.centroidX - 2)
    .attr("y", (d) => d.centroidY - 2)
    .attr("width", 4)
    .attr("height", 4)
    // .attr("stroke", "red")
    .attr("stroke-width", 1.5);

  return svg.node();
}
