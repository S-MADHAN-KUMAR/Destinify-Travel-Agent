"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/**
 * Interactive 3D globe visualising the trip route.
 *
 * Renders a stylised dark-blue earth with a lat/long wireframe, an animated
 * glowing arc from origin → destination, marker pins for both, and small dots
 * for nearby attractions. Auto-rotates slowly; drag to orbit, scroll to zoom.
 */

type Pt = { lat: number; lon: number; label?: string } | null;

const R = 2.15;

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

function Marker({ point, color }: { point: NonNullable<Pt>; color: string }) {
  const pos = useMemo(() => latLonToVector3(point.lat, point.lon, R * 1.01), [point]);
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.18;
      ref.current.scale.setScalar(s);
    }
  });
  return (
    <group position={pos}>
      <mesh ref={ref}>
        <sphereGeometry args={[0.055, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* soft halo */}
      <mesh>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} />
      </mesh>
    </group>
  );
}

function Arc({ from, to }: { from: NonNullable<Pt>; to: NonNullable<Pt> }) {
  const geometry = useMemo(() => {
    const start = latLonToVector3(from.lat, from.lon, R * 1.01);
    const end = latLonToVector3(to.lat, to.lon, R * 1.01);
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(
      R * (1.18 + start.distanceTo(end) * 0.12),
    );
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 48, 0.018, 8, false);
  }, [from, to]);

  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      const m = ref.current.material as THREE.MeshBasicMaterial;
      m.opacity = 0.65 + Math.sin(clock.elapsedTime * 2) * 0.3;
    }
  });

  return (
    <mesh ref={ref} geometry={geometry}>
      <meshBasicMaterial color="#5cccfc" transparent opacity={0.9} />
    </mesh>
  );
}

function PinDots({ points }: { points: { lat: number; lon: number }[] }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const p of points.slice(0, 40)) {
      const v = latLonToVector3(p.lat, p.lon, R * 1.005);
      positions.push(v.x, v.y, v.z);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [points]);
  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.04} color="#d9f99d" sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}

function Spin({ aim = 0, children }: { aim?: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  // Start facing the destination instead of showing the far side of the earth.
  useEffect(() => {
    if (ref.current) ref.current.rotation.y = aim;
  }, [aim]);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

function Scene({ origin, destination, pins }: { origin?: Pt; destination?: Pt; pins: { lat: number; lon: number }[] }) {
  // Rotation that brings the destination (or first pin) to the camera-facing side.
  const aim = useMemo(() => {
    const target = destination ?? (pins[0] ? { lat: pins[0].lat, lon: pins[0].lon } : null);
    if (!target) return 0;
    const v = latLonToVector3(target.lat, target.lon, R);
    return Math.atan2(-v.x, v.z);
  }, [destination, pins]);

  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 3, 5]} intensity={0.8} />
      <Spin aim={aim}>
        {/* earth */}
        <mesh>
          <sphereGeometry args={[R, 64, 64]} />
          <meshStandardMaterial color="#0c2440" roughness={1} metalness={0.05} />
        </mesh>
        {/* lat/long wireframe overlay */}
        <mesh>
          <sphereGeometry args={[R * 1.002, 24, 16]} />
          <meshBasicMaterial color="#1f74b8" wireframe transparent opacity={0.28} />
        </mesh>
        {/* atmosphere */}
        <mesh>
          <sphereGeometry args={[R * 1.14, 32, 32]} />
          <meshBasicMaterial color="#1c91ec" transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>

        {origin && <Marker point={origin} color="#1c91ec" />}
        {destination && <Marker point={destination} color="#34a853" />}
        {origin && destination && <Arc from={origin} to={destination} />}
        {!origin && destination && pins.length > 0 && <PinDots points={pins} />}
      </Spin>
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={(3 * Math.PI) / 4}
        rotateSpeed={0.5}
      />
    </>
  );
}

export type Globe3DProps = {
  origin?: Pt;
  destination?: Pt;
  pins?: { lat: number; lon: number }[];
  className?: string;
};

export function Globe3D({ origin, destination, pins = [], className = "" }: Globe3DProps) {
  return (
    <div className={`relative h-full w-full ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 6.4], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <Scene origin={origin} destination={destination} pins={pins} />
      </Canvas>
      {/* subtle gradient vignette so the globe reads on light cards */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[16px]"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(28,145,236,0.10), transparent 60%)",
        }}
      />
    </div>
  );
}

export default Globe3D;
