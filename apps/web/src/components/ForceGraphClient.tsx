"use client";

// Loaded with next/dynamic (browser only). next/dynamic does not forward refs, so the graph handle comes in as `fgRef`.
import { useEffect, type MutableRefObject } from "react";
import ForceGraph2D, { type ForceGraphMethods, type ForceGraphProps, type LinkObject, type NodeObject } from "react-force-graph-2d";
import type { GraphLink, GraphNode } from "@/lib/graph";

export type FGNode = NodeObject<GraphNode>;
export type FGLink = LinkObject<GraphNode, GraphLink>;
export type FGRef = MutableRefObject<ForceGraphMethods<FGNode, FGLink> | undefined>;

type Props = ForceGraphProps<GraphNode, GraphLink> & {
  fgRef: FGRef;
  /** Repulsion between nodes (more negative = more spread out). */
  charge: number;
  linkDistance: number;
  fitPadding: number;
};

export default function ForceGraphClient({ fgRef, charge, linkDistance, fitPadding, ...props }: Props) {
  const { graphData, width, height } = props;

  // Spread the layout out like Obsidian, then fit it to the box once it has settled.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(charge);
    (fg.d3Force("link") as unknown as { distance?: (d: number) => unknown } | undefined)?.distance?.(linkDistance);
    fg.d3ReheatSimulation();
    const t1 = setTimeout(() => fg.zoomToFit(400, fitPadding), 700);
    const t2 = setTimeout(() => fg.zoomToFit(400, fitPadding), 2200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fgRef, graphData, width, height, charge, linkDistance, fitPadding]);

  return <ForceGraph2D<GraphNode, GraphLink> ref={fgRef} {...props} />;
}
