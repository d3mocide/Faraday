import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EnclosureMeshes } from '../csg/CsgWorkerClient';
import { bodyGeometry, clamp01, closestFace, faceFrame, faceFromWorld, faceSize } from '../csg/faceFrame';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';
import { snapValue } from '../csg/snapping';
import type { EnclosureBody, Face, Feature } from '../types/project';

export type BodyResizePatch = Partial<{ length: number; width: number; height: number; diameter: number }>;

interface Viewport3DProps {
  meshes: EnclosureMeshes | null;
  body: EnclosureBody;
  features: Feature[];
  placementArmed: boolean;
  onPlaceFeature: (face: Face, u: number, v: number) => void;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onResizeBody: (patch: BodyResizePatch) => void;
}

const FEATURE_MARKER_COLOR = 0xffb454;
const FEATURE_MARKER_SELECTED_COLOR = 0xff5a5a;
const HANDLE_COLOR = 0x6fd3ff;
const MIN_DIMENSION = 5; // mm, matches the numeric field mins in InspectorPanel
const SNAP_MM = 2; // mm, feature drag snapping tolerance (edges, center lines, other features)
const CLICK_THRESHOLD_PX = 4;

type DragState =
  | { type: 'none' }
  | { type: 'corner' }
  | { type: 'height' }
  | { type: 'feature'; id: string; face: Face };

export function Viewport3D({
  meshes,
  body,
  features,
  placementArmed,
  onPlaceFeature,
  selectedFeatureId,
  onSelectFeature,
  onUpdateFeature,
  onResizeBody,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const baseMeshRef = useRef<THREE.Mesh | null>(null);
  const lidMeshRef = useRef<THREE.Mesh | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const handleGroupRef = useRef<THREE.Group | null>(null);
  const highlightMeshRef = useRef<THREE.Mesh | null>(null);

  // Latest-value refs so the pointer handlers (set up once, in the mount effect) always see
  // current props without needing to re-attach DOM listeners on every render.
  const bodyRef = useRef(body);
  const featuresRef = useRef(features);
  const placementArmedRef = useRef(placementArmed);
  const callbacksRef = useRef({ onPlaceFeature, onSelectFeature, onUpdateFeature, onResizeBody });

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);
  useEffect(() => {
    featuresRef.current = features;
  }, [features]);
  useEffect(() => {
    placementArmedRef.current = placementArmed;
  }, [placementArmed]);
  useEffect(() => {
    callbacksRef.current = { onPlaceFeature, onSelectFeature, onUpdateFeature, onResizeBody };
  }, [onPlaceFeature, onSelectFeature, onUpdateFeature, onResizeBody]);

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

    const handleGroup = new THREE.Group();
    scene.add(handleGroup);
    handleGroupRef.current = handleGroup;

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x6fd3ff,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthTest: true,
    });
    const highlightMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      highlightMaterial,
    );
    highlightMesh.visible = false;
    scene.add(highlightMesh);
    highlightMeshRef.current = highlightMesh;

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

    // --- Pointer interaction (click-to-place, hover highlight, feature select/drag, resize
    // handles) is set up once here so it always closes over the up-to-date camera/controls/
    // scene objects above without re-attaching listeners; changing props are read from refs. ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragState: { current: DragState } = { current: { type: 'none' } };
    let downPos: { x: number; y: number } | null = null;

    const toNDC = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const groundPlane = new THREE.Plane();
    const heightAxisPoint = new THREE.Vector3(0, 0, 0);
    const heightAxisDir = new THREE.Vector3(0, 0, 1);
    const scratchVec = new THREE.Vector3();

    /** A plane containing the vertical axis through (0,0,*) and facing the camera, for dragging the height handle. */
    const heightDragPlane = (): THREE.Plane => {
      const camToAxis = camera.position.clone().sub(heightAxisPoint);
      const perp = camToAxis.sub(
        heightAxisDir.clone().multiplyScalar(camToAxis.dot(heightAxisDir)),
      );
      const normal = perp.lengthSq() < 1e-6 ? new THREE.Vector3(1, 0, 0) : perp.normalize();
      return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, heightAxisPoint);
    };

    const setControlsEnabled = (enabled: boolean) => {
      controls.enabled = enabled;
    };

    // PlaneGeometry's default normal is +Z; these are the rotations that lay it flush against
    // each box face's plane. (Using lookAt() here instead would gimbal-lock on front/back, whose
    // normal is parallel to the default up vector.) The overlay material is double-sided, so the
    // exact sign of each rotation doesn't matter -- only which world plane it ends up in does.
    const HIGHLIGHT_ROTATION: Partial<Record<Face, [number, number, number]>> = {
      top: [0, 0, 0],
      bottom: [Math.PI, 0, 0],
      front: [Math.PI / 2, 0, 0],
      back: [-Math.PI / 2, 0, 0],
      left: [0, -Math.PI / 2, 0],
      right: [0, Math.PI / 2, 0],
    };

    // A cylinder's curved lateral wall has no single tangent plane, so 'side' highlights the
    // whole lateral surface as an open cylindrical band -- the direct analogue of how a box's
    // hover highlight already covers its whole (flat) face rather than a local patch.
    const updateHighlight = (face: Face | null) => {
      const geom = bodyGeometry(bodyRef.current);
      if (!face) {
        highlightMesh.visible = false;
        return;
      }
      highlightMesh.visible = true;
      highlightMesh.geometry.dispose();

      if (geom.shape === 'cylinder' && face === 'side') {
        const { diameter, height } = geom;
        highlightMesh.geometry = new THREE.CylinderGeometry(
          diameter / 2 + 0.2,
          diameter / 2 + 0.2,
          height,
          48,
          1,
          true,
        );
        highlightMesh.position.set(0, 0, height / 2);
        highlightMesh.rotation.set(Math.PI / 2, 0, 0);
        return;
      }

      if (geom.shape === 'cylinder') {
        const { diameter, height } = geom;
        highlightMesh.geometry = new THREE.CircleGeometry(diameter / 2, 48);
        const z = face === 'top' ? height + 0.2 : -0.2;
        highlightMesh.position.set(0, 0, z);
        highlightMesh.rotation.set(face === 'top' ? 0 : Math.PI, 0, 0);
        return;
      }

      const frame = faceFrame(face, geom);
      const [su, sv] = faceSize(face, geom);
      const [x, y, z] = frame.toWorld(0.5, 0.5);
      const [nx, ny, nz] = frame.normalAt(0.5, 0.5);
      highlightMesh.position.set(x + nx * 0.2, y + ny * 0.2, z + nz * 0.2);
      highlightMesh.geometry = new THREE.PlaneGeometry(su, sv);
      highlightMesh.rotation.set(...(HIGHLIGHT_ROTATION[face] ?? [0, 0, 0]));
    };

    const handlePointerDown = (event: PointerEvent) => {
      downPos = { x: event.clientX, y: event.clientY };

      if (placementArmedRef.current) return; // click-to-place is resolved on pointerup, unchanged

      toNDC(event);
      raycaster.setFromCamera(pointer, camera);

      const handleHit = raycaster.intersectObjects(handleGroup.children, false)[0];
      if (handleHit) {
        const handleType = handleHit.object.userData.handleType as 'corner' | 'height';
        dragState.current = { type: handleType };
        setControlsEnabled(false);
        return;
      }

      const markerHit = raycaster.intersectObjects(markerGroup.children, false)[0];
      if (markerHit) {
        const featureId = markerHit.object.userData.featureId as string;
        const face = markerHit.object.userData.face as Face;
        dragState.current = { type: 'feature', id: featureId, face };
        setControlsEnabled(false);
        callbacksRef.current.onSelectFeature(featureId);
        return;
      }

      dragState.current = { type: 'none' };
    };

    const handlePointerMove = (event: PointerEvent) => {
      toNDC(event);

      if (dragState.current.type === 'corner') {
        raycaster.setFromCamera(pointer, camera);
        const geom = bodyGeometry(bodyRef.current);
        groundPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(0, 0, geom.height),
        );
        if (raycaster.ray.intersectPlane(groundPlane, scratchVec)) {
          if (geom.shape === 'cylinder') {
            const diameter = Math.max(Math.hypot(scratchVec.x, scratchVec.y) * 2, MIN_DIMENSION);
            callbacksRef.current.onResizeBody({ diameter });
          } else {
            const length = Math.max(Math.abs(scratchVec.x) * 2, MIN_DIMENSION);
            const width = Math.max(Math.abs(scratchVec.y) * 2, MIN_DIMENSION);
            callbacksRef.current.onResizeBody({ length, width });
          }
        }
        return;
      }

      if (dragState.current.type === 'height') {
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(heightDragPlane(), scratchVec)) {
          const height = Math.max(scratchVec.z, MIN_DIMENSION);
          callbacksRef.current.onResizeBody({ height });
        }
        return;
      }

      if (dragState.current.type === 'feature') {
        const { id, face } = dragState.current;
        const geom = bodyGeometry(bodyRef.current);
        // Drag against the rendered mesh (not an infinite face plane): a plane raycast blows up
        // near the silhouette edge under perspective (a few screen px can map to a huge world
        // distance on a steeply-angled plane), so the mesh's actual bounds naturally clamp the
        // drag to something sane. `face` stays fixed from pickup and the hit point is
        // reinterpreted through that face's own (u,v) mapping, regardless of which triangle of
        // the mesh was actually struck.
        const base = baseMeshRef.current;
        const lid = lidMeshRef.current;
        if (!base || !lid) return;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([base, lid], false)[0];
        if (!hit) return;

        let [u, v] = faceFromWorld(face, geom, [hit.point.x, hit.point.y, hit.point.z]);
        const [sizeU, sizeV] = faceSize(face, geom);
        const thresholdU = SNAP_MM / sizeU;
        const thresholdV = SNAP_MM / sizeV;
        const others = featuresRef.current.filter((f) => f.id !== id && f.face === face);
        u = snapValue(u, [0, 0.5, 1, ...others.map((f) => f.u)], thresholdU);
        v = snapValue(v, [0, 0.5, 1, ...others.map((f) => f.v)], thresholdV);
        callbacksRef.current.onUpdateFeature(id, { u: clamp01(u), v: clamp01(v) });
        return;
      }

      // Not dragging anything -- hover face highlight (skipped while armed; click-to-place's
      // own crosshair cursor is enough feedback there).
      if (placementArmedRef.current) return;
      const base = baseMeshRef.current;
      const lid = lidMeshRef.current;
      if (!base || !lid) return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([base, lid], false)[0];
      updateHighlight(
        hit?.face
          ? closestFace([hit.face.normal.x, hit.face.normal.y, hit.face.normal.z], bodyRef.current.shape)
          : null,
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = downPos;
      downPos = null;
      const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_THRESHOLD_PX : true;

      if (placementArmedRef.current) {
        if (moved) return;
        const base = baseMeshRef.current;
        const lid = lidMeshRef.current;
        if (!base || !lid) return;
        toNDC(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects([base, lid], false)[0];
        if (!hit?.face) return;
        const geom = bodyGeometry(bodyRef.current);
        const face = closestFace([hit.face.normal.x, hit.face.normal.y, hit.face.normal.z], geom.shape);
        const [u, v] = faceFromWorld(face, geom, [hit.point.x, hit.point.y, hit.point.z]);
        callbacksRef.current.onPlaceFeature(face, clamp01(u), clamp01(v));
        return;
      }

      const wasDragging = dragState.current.type !== 'none';
      dragState.current = { type: 'none' };
      setControlsEnabled(true);

      if (!wasDragging && !moved) {
        // A plain click that hit nothing selectable (pointerdown already selects on a marker
        // hit) -- clear the selection.
        callbacksRef.current.onSelectFeature(null);
      }
    };

    const handlePointerLeave = () => updateHighlight(null);

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', handlePointerDown);
    dom.addEventListener('pointermove', handlePointerMove);
    dom.addEventListener('pointerup', handlePointerUp);
    dom.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', handlePointerDown);
      dom.removeEventListener('pointermove', handlePointerMove);
      dom.removeEventListener('pointerup', handlePointerUp);
      dom.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      renderer.dispose();
      baseMesh.geometry.dispose();
      lidMesh.geometry.dispose();
      baseMaterial.dispose();
      lidMaterial.dispose();
      highlightMesh.geometry.dispose();
      highlightMaterial.dispose();
      container.removeChild(renderer.domElement);
      cameraRef.current = null;
      rendererRef.current = null;
      markerGroupRef.current = null;
      handleGroupRef.current = null;
      highlightMeshRef.current = null;
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

  // Markers showing where features are already placed; the selected one is highlighted.
  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);

    const geom = bodyGeometry(body);
    const geometry = new THREE.SphereGeometry(1.2, 12, 12);
    const normalMaterial = new THREE.MeshStandardMaterial({ color: FEATURE_MARKER_COLOR });
    const selectedMaterial = new THREE.MeshStandardMaterial({ color: FEATURE_MARKER_SELECTED_COLOR });
    for (const feature of features) {
      const frame = faceFrame(feature.face, geom);
      const [x, y, z] = frame.toWorld(feature.u, feature.v);
      const [nx, ny, nz] = frame.normalAt(feature.u, feature.v);
      const marker = new THREE.Mesh(geometry, feature.id === selectedFeatureId ? selectedMaterial : normalMaterial);
      marker.position.set(x + nx * 1.5, y + ny * 1.5, z + nz * 1.5);
      marker.userData.featureId = feature.id;
      marker.userData.face = feature.face;
      group.add(marker);
    }

    return () => {
      geometry.dispose();
      normalMaterial.dispose();
      selectedMaterial.dispose();
    };
  }, [features, body, selectedFeatureId]);

  // Plan-view resize handle(s) (box: 4 corner cubes; cylinder: 1 radius cube) and the height
  // cone, repositioned whenever the body resizes.
  useEffect(() => {
    const group = handleGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);

    const cornerGeometry = new THREE.BoxGeometry(3, 3, 3);
    const cornerMaterial = new THREE.MeshStandardMaterial({ color: HANDLE_COLOR });
    const { height } = body.outer;

    const positions: Array<[number, number]> =
      body.shape === 'box'
        ? [
            [body.outer.length / 2, body.outer.width / 2],
            [body.outer.length / 2, -body.outer.width / 2],
            [-body.outer.length / 2, body.outer.width / 2],
            [-body.outer.length / 2, -body.outer.width / 2],
          ]
        : [[body.outer.diameter / 2, 0]];

    for (const [x, y] of positions) {
      const handle = new THREE.Mesh(cornerGeometry, cornerMaterial);
      handle.position.set(x, y, height);
      handle.userData.handleType = 'corner';
      group.add(handle);
    }

    const heightGeometry = new THREE.ConeGeometry(2, 5, 12);
    const heightMaterial = new THREE.MeshStandardMaterial({ color: HANDLE_COLOR });
    const heightHandle = new THREE.Mesh(heightGeometry, heightMaterial);
    heightHandle.position.set(0, 0, height + 4);
    heightHandle.userData.handleType = 'height';
    group.add(heightHandle);

    return () => {
      cornerGeometry.dispose();
      cornerMaterial.dispose();
      heightGeometry.dispose();
      heightMaterial.dispose();
    };
  }, [body]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
