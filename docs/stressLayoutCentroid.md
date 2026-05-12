# Hypergraph Stress Layout — Centroid

## Overview

`HypStressLayoutCentroid` is a force-directed layout algorithm for hypergraphs. Unlike classical graph stress layouts that operate on pairwise node distances, this algorithm organizes nodes relative to **hyperedge centroids**, using the hypergraph distance to define ideal geometric distances between every node and every hyperedge.

---

## Energy Function

The layout minimizes a stress energy defined over all (node, hyperedge) pairs:

$$U = \sum_{i=1}^{N} \sum_{e=1}^{E} \frac{k_{i,e}}{2} \left( \|\mathbf{p}_i - \mathbf{c}_e\| - \delta_{i,e} \right)^2$$

where:
- $\mathbf{p}_i$ is the position of node $i$,
- $\mathbf{c}_e$ is the centroid of hyperedge $e$,
- $\delta_{i,e}$ is the **ideal distance** from node $i$ to the centroid of $e$,
- $k_{i,e}$ is a stiffness weight.

---

## Ideal Distances

The ideal distance $\delta_{i,e}$ depends on whether node $i$ belongs to hyperedge $e$.

### Members ($i \in e$)

Nodes that belong to a hyperedge should sit on a circle of radius $R_e$ around its centroid:

$$\delta_{i,e} = R_e, \quad k_{i,e} = 1$$

The radius scales with the size of the hyperedge:

$$R_e = 0.4 \cdot L \cdot \sqrt{|e|}$$

where $L = \sqrt{WH / N}$ is the average area per node.

### Non-members ($i \notin e$)

Nodes outside a hyperedge are pushed away proportionally to their hypergraph distance to it. The hypergraph distance from node $i$ to hyperedge $e$ is:

$$d(i, e) = \min_{j \in e} D_{ij}$$

where $D_{ij}$ is the shortest-path distance between nodes $i$ and $j$ in the hypergraph (counting hyperedge hops). The ideal distance and stiffness are then:

$$\delta_{i,e} = R_e + d(i, e) \cdot L, \quad k_{i,e} = \frac{1}{d(i,e)^2}$$

Nodes unreachable from $e$ are ignored ($k_{i,e} = 0$).

---

## Gradient Descent

The centroid $\mathbf{c}_e$ is treated as fixed within each iteration and recomputed at the start of the next. This yields a closed-form gradient for each node:

$$\frac{\partial U}{\partial \mathbf{p}_i} = \sum_{e} k_{i,e} \left(1 - \frac{\delta_{i,e}}{\|\mathbf{p}_i - \mathbf{c}_e\|}\right)(\mathbf{p}_i - \mathbf{c}_e)$$

### Step Size and Convergence

The update rule is:

$$\mathbf{p}_i \leftarrow \mathbf{p}_i - s \cdot \frac{\partial U}{\partial \mathbf{p}_i}$$

The step size $s$ is clipped so no node moves more than $L/2$ in a single iteration, and cooled each iteration by a factor of $0.995$:

$$s_{\text{next}} = 0.995 \cdot s, \quad s_0 = 0.1 \cdot L$$

The algorithm stops early if the maximum gradient norm falls below $10^{-3}$.

---

## Algorithm

```
Input: Hypergraph G = (V, E), canvas W × H
       L ← sqrt(W·H / |V|)

1. Initialize all node positions uniformly at random.
2. Compute pairwise node distances D via BFS on the node-edge bipartite graph.
3. For each (node i, hyperedge e), compute δ_{i,e} and k_{i,e}.

4. Repeat until convergence (max 500 iterations):
   a. Recompute centroid c_e for each hyperedge e.
   b. For each node i, compute gradient ∂U/∂p_i.
   c. Clip step size so max displacement ≤ L/2.
   d. Update all node positions.
   e. Cool step size by ×0.995.

5. Fit layout to canvas.
```

---

## Comparison with `stressLayout`

| | `stressLayout` | `stressLayoutCentroid` |
|---|---|---|
| Stress pairs | Node–node | Node–hyperedge centroid |
| Ideal distance | $L \cdot D_{ij}$ | $R_e + d(i,e) \cdot L$ |
| Cohesion term | Separate | Unified (members use $\delta = R_e$) |
| Stiffness | $1/D_{ij}^2$ | $1/d(i,e)^2$ (1 for members) |

The key difference is that `stressLayoutCentroid` has a single unified energy term. Member cohesion (nodes sitting at radius $R_e$ from their hyperedge centroid) and inter-hyperedge repulsion (non-members pushed away proportionally to distance) both arise from the same formula with different targets.
