import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EnclosureMeshes } from '../csg/CsgWorkerClient';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';

interface Viewport3DProps {
  meshes: EnclosureMeshes | null;
}

export function Viewport3D({ meshes }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const baseMeshRef = useRef<THREE.Mesh | null>(null);
  const lidMeshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e2228);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      5000,
    );
    camera.position.set(120, -160, 140);
    camera.up.set(0, 0, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 15);
    controls.enableDamping = true;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(150, -200, 300);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-150, 100, -100);
    scene.add(fill);

    const grid = new THREE.GridHelper(300, 30, 0x3a3f47, 0x2a2e35);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x9aa5b1,
      roughness: 0.6,
      metalness: 0.05,
    });
    const lidMaterial = new THREE.MeshStandardMaterial({
      color: 0x4fb3a9,
      roughness: 0.6,
      metalness: 0.05,
    });

    const baseMesh = new THREE.Mesh(new THREE.BufferGeometry(), baseMaterial);
    const lidMesh = new THREE.Mesh(new THREE.BufferGeometry(), lidMaterial);
    scene.add(baseMesh, lidMesh);
    baseMeshRef.current = baseMesh;
    lidMeshRef.current = lidMesh;

    let animationFrame: number;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      baseMesh.geometry.dispose();
      lidMesh.geometry.dispose();
      baseMaterial.dispose();
      lidMaterial.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!meshes) return;
    const base = baseMeshRef.current;
    const lid = lidMeshRef.current;
    if (!base || !lid) return;

    const baseGeometry = meshDataToBufferGeometry(meshes.base);
    base.geometry.dispose();
    base.geometry = baseGeometry;

    const lidGeometry = meshDataToBufferGeometry(meshes.lid);
    lid.geometry.dispose();
    lid.geometry = lidGeometry;
  }, [meshes]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
