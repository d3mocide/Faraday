import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EnclosureMeshes } from '../csg/CsgWorkerClient';
import { clamp01, closestFace, faceFrame, faceFromWorld, type OuterDimensions } from '../csg/faceFrame';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';
import type { Face, Feature } from '../types/project';

interface Viewport3DProps {
  meshes: EnclosureMeshes | null;
  outer: OuterDimensions;
  features: Feature[];
  placementArmed: boolean;
  onPlaceFeature: (face: Face, u: number, v: number) => void;
}

const FEATURE_MARKER_COLOR = 0xffb454;

export function Viewport3D({ meshes, outer, features, placementArmed, onPlaceFeature }: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const baseMeshRef = useRef<THREE.Mesh | null>(null);
  const lidMeshRef = useRef<THREE.Mesh | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);

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
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

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

    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    markerGroupRef.current = markerGroup;

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
      cameraRef.current = null;
      rendererRef.current = null;
      markerGroupRef.current = null;
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

  // Small markers showing where features are already placed.
  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);

    const geometry = new THREE.SphereGeometry(1.2, 12, 12);
    const material = new THREE.MeshStandardMaterial({ color: FEATURE_MARKER_COLOR });
    for (const feature of features) {
      const frame = faceFrame(feature.face, outer);
      const [x, y, z] = frame.toWorld(feature.u, feature.v);
      const [nx, ny, nz] = frame.normal;
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(x + nx * 1.5, y + ny * 1.5, z + nz * 1.5);
      group.add(marker);
    }

    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [features, outer]);

  // Click-to-place: while a feature template is armed, a click (not a camera drag) on the model
  // resolves to a face + normalized (u,v) and reports it via onPlaceFeature.
  useEffect(() => {
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!renderer || !camera || !container) return;

    container.style.cursor = placementArmed ? 'crosshair' : 'default';
    if (!placementArmed) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos: { x: number; y: number } | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      downPos = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = downPos;
      downPos = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;

      const base = baseMeshRef.current;
      const lid = lidMeshRef.current;
      if (!base || !lid) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([base, lid], false)[0];
      if (!hit?.face) return;

      const face = closestFace([hit.face.normal.x, hit.face.normal.y, hit.face.normal.z]);
      const [u, v] = faceFromWorld(face, outer, [hit.point.x, hit.point.y, hit.point.z]);
      onPlaceFeature(face, clamp01(u), clamp01(v));
    };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointerup', handlePointerUp);
    return () => {
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointerup', handlePointerUp);
    };
  }, [placementArmed, onPlaceFeature, outer]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
