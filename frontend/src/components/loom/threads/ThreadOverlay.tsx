import React, { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { useHavenStore } from "@/haven/state/havenStore";
import type { Anchor, LoomThread } from "@/haven/model/types";
import type { ThreadType } from "@/haven/model/enums";

export function ThreadOverlay(): React.ReactElement {
  const { state } = useHavenStore();

  const anchors = useMemo(() => Object.values(state.entities.anchors), [state.entities.anchors]);
  const allThreads = useMemo(() => Object.values(state.entities.threads), [state.entities.threads]);

  const threads = useMemo(() => {
    if (state.filters.threadTypes.length === 0) return allThreads;
    return allThreads.filter((t) => state.filters.threadTypes.includes(t.type));
  }, [allThreads, state.filters.threadTypes]);

  const positions = useMemo(() => computeAnchorPositions(anchors), [anchors]);

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 10], zoom: 120 }}
      gl={{ antialias: true, alpha: true }}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        background: "transparent",
      }}
    >
      <color attach="background" args={["rgba(0,0,0,0)"]} />
      <ambientLight intensity={0.8} />
      <ThreadsScene threads={threads} positions={positions} />
    </Canvas>
  );
}

function ThreadsScene(props: {
  threads: LoomThread[];
  positions: Record<string, THREE.Vector3>;
}): React.ReactElement {
  const { state, dispatch } = useHavenStore();

  const byTypeColor = (type: ThreadType): THREE.Color => {
    switch (type) {
      case "link":
        return new THREE.Color("#4F8CFF");
      case "transclusion":
        return new THREE.Color("#2EC4B6");
      case "discussion":
        return new THREE.Color("#FF9F1C");
      default: {
        const _exhaustive: never = type;
        return _exhaustive;
      }
    }
  };

  return (
    <>
      {props.threads.map((t) => {
        const from = props.positions[t.fromAnchorId];
        const to = props.positions[t.toAnchorId];
        if (!from || !to) return null;
        const mid = new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2, 0);
        mid.y += 0.35 + (1 - t.strength) * 0.25;
        const curve = new THREE.CatmullRomCurve3([from, mid, to]);
        const tubularSegments = 48;
        const radius = 0.01 + t.strength * 0.01;
        const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 8, false);
        const baseColor = byTypeColor(t.type);
        const hovered = state.selection.hoveredThreadId === t.id;
        const selected = state.selection.selectedThreadId === t.id;
        const opacity = selected ? 0.95 : hovered ? 0.75 : 0.35;

        return (
          <mesh
            key={t.id}
            geometry={geometry}
            onPointerOver={(e) => {
              e.stopPropagation();
              dispatch({ type: "selection:setHoveredThread", threadId: t.id });
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              dispatch({ type: "selection:setHoveredThread", threadId: null });
            }}
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "selection:setSelectedThread", threadId: t.id });
              dispatch({ type: "selection:setMarginaliaTab", tab: "threads" });
            }}
          >
            <meshBasicMaterial
              transparent
              opacity={opacity}
              color={baseColor}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </>
  );
}

function computeAnchorPositions(anchors: Anchor[]): Record<string, THREE.Vector3> {
  // Deterministic “abstract network” layout:
  // - collection items: left/top
  // - provenance steps: center
  // - artifact timeline: center/left
  // - comments: right
  const positions: Record<string, THREE.Vector3> = {};

  const groups: Record<Anchor["kind"], Anchor[]> = {
    collection_item: [],
    provenance_step: [],
    artifact_timeline: [],
    comment: [],
  };
  anchors.forEach((a) => groups[a.kind].push(a));

  const placeColumn = (items: Anchor[], x: number, yTop: number, yStep: number) => {
    items.forEach((a, idx) => {
      positions[a.id] = new THREE.Vector3(x, yTop - idx * yStep, 0);
    });
  };

  placeColumn(groups.collection_item, -1.35, 0.9, 0.22);
  placeColumn(groups.artifact_timeline, -0.55, 0.75, 0.24);
  placeColumn(groups.provenance_step, 0.35, 0.85, 0.22);
  placeColumn(groups.comment, 1.35, 0.8, 0.26);

  return positions;
}

