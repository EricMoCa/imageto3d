import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid } from "@react-three/drei";

interface Props {
  url: string;
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

export function Viewer3D({ url }: Props) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 420,
        borderRadius: 12,
        overflow: "hidden",
        background: "#0d1117",
        border: "1px solid #374151",
      }}
    >
      <Canvas
        camera={{ position: [0, 1.5, 3], fov: 45 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-5, 3, -5]} intensity={0.4} />

        <Suspense fallback={null}>
          <Model url={url} />
          <Environment preset="city" />
        </Suspense>

        <Grid
          position={[0, -0.01, 0]}
          args={[10, 10]}
          cellColor="#374151"
          sectionColor="#4b5563"
          fadeDistance={8}
        />
        <OrbitControls makeDefault enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}
