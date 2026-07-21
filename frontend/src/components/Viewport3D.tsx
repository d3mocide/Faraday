import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { EnclosureMeshes } from '../csg/CsgWorkerClient';
import { bodyGeometry, clamp01, closestFace, faceFrame, faceFromWorld, faceSize } from '../csg/faceFrame';
import { effectiveSplitHeight, featureOnLid } from '../csg/lidSplit';
import { meshDataToBufferGeometry } from '../csg/meshToBufferGeometry';
import { snapValue } from '../csg/snapping';
import type { EnclosureBody, Face, Feature } from '../types/project';

export type BodyResizePatch = Partial<{ length: number; width: number; height: number; diameter: number; splitHeight: number }>;

/** View-only lid presentation — never part of the saved project or undo history. */
export type LidView = 'assembled' | 'ghost' | 'hidden' | 'exploded';

/** How far the lid mesh is lifted in 'exploded' view (world Z, mm). */
function explodeOffset(lidView: LidView, bodyHeight: number): number {
  return lidView === 'exploded' ? Math.max(15, bodyHeight * 0.4) : 0;
}

/** A candidate (face, u, v) an align/mirror inspector control is hovering over, previewed in the
 * viewport before the user commits by clicking -- see AlignMirrorControls in InspectorPanel.tsx. */
export interface PreviewTarget {
  face: Face;
  u: number;
  v: number;
}

interface Viewport3DProps {
  meshes: EnclosureMeshes | null;
  body: EnclosureBody;
  features: Feature[];
  lidView: LidView;
  showHandles?: boolean;
  showGrid?: boolean;
  showGhostBoards?: boolean;
  showMarkers?: boolean;
  placementArmed: boolean;
  onPlaceFeature: (face: Face, u: number, v: number) => void;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, patch: Partial<Feature>) => void;
  onResizeBody: (patch: BodyResizePatch) => void;
  previewTarget: PreviewTarget | null;
}

const FEATURE_MARKER_COLOR = 0xffb454;
const FEATURE_MARKER_SELECTED_COLOR = 0xff5a5a;
const PREVIEW_MARKER_COLOR = 0x6fd3ff;
const HANDLE_COLOR = 0x6fd3ff;
const MIN_DIMENSION = 5; // mm, matches the numeric field mins in InspectorPanel
const SNAP_MM = 2; // mm, feature drag snapping tolerance (edges, center lines, other features)
const CLICK_THRESHOLD_PX = 4;

type DragState =
  | { type: 'none' }
  | { type: 'corner' }
  | { type: 'height' }
  | { type: 'split' }
  | { type: 'feature'; id: string; face: Face };

export function Viewport3D({
  meshes,
  body,
  features,
  lidView,
  showHandles = true,
  showGrid = true,
  showGhostBoards = true,
  showMarkers = true,
  placementArmed,
  onPlaceFeature,
  selectedFeatureId,
  onSelectFeature,
  onUpdateFeature,
  onResizeBody,
  previewTarget,
}: Viewport3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const baseMeshRef = useRef<THREE.Mesh | null>(null);
  const lidMeshRef = useRef<THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null>(null);
  const markerGroupRef = useRef<THREE.Group | null>(null);
  const ghostBoardGroupRef = useRef<THREE.Group | null>(null);
  const handleGroupRef = useRef<THREE.Group | null>(null);
  const highlightMeshRef = useRef<THREE.Mesh | null>(null);
  const previewMarkerRef = useRef<THREE.Mesh | null>(null);
  const gridGroupRef = useRef<THREE.Group | null>(null);

  // Latest-value refs so the pointer handlers (set up once, in the mount effect) always see
  // current props without needing to re-attach DOM listeners on every render.
  const bodyRef = useRef(body);
  const featuresRef = useRef(features);
  const lidViewRef = useRef(lidView);
  const showMarkersRef = useRef(showMarkers);
  const placementArmedRef = useRef(placementArmed);
  const callbacksRef = useRef({ onPlaceFeature, onSelectFeature, onUpdateFeature, onResizeBody });

  useEffect(() => {
    bodyRef.current = body;
  }, [body]);
  useEffect(() => {
    featuresRef.current = features;
  }, [features]);
  useEffect(() => {
    lidViewRef.current = lidView;
  }, [lidView]);
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

    // Grid + the on-plane axes helper toggle together (one "floor reference" visual).
    const gridGroup = new THREE.Group();
    const grid = new THREE.GridHelper(300, 30, 0x3a3f47, 0x2a2e35);
    grid.rotation.x = Math.PI / 2;
    gridGroup.add(grid);
    const axesHelper = new THREE.AxesHelper(40);
    axesHelper.position.set(-135, -135, 0);
    gridGroup.add(axesHelper);
    scene.add(gridGroup);
    gridGroupRef.current = gridGroup;

    // --- Orientation gizmo: a camera-synced axes triad rendered into a small scissored
    // viewport in the lower-right corner, so the current X/Y/Z orientation is readable at all
    // times regardless of where the in-scene AxesHelper has orbited to. Same renderer, second
    // scene + ortho camera; the gizmo camera copies the main camera's direction each frame. ---
    const gizmoScene = new THREE.Scene();
    const gizmoCamera = new THREE.OrthographicCamera(-1.9, 1.9, 1.9, -1.9, 0.1, 10);
    gizmoCamera.up.set(0, 0, 1);

    const makeGizmoSprite = (draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.Sprite => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      draw(canvas.getContext('2d')!, size);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
      return new THREE.Sprite(material);
    };

    // Translucent disc behind the triad so it stays readable over any model color.
    const gizmoBackdrop = makeGizmoSprite((ctx, size) => {
      ctx.fillStyle = 'rgba(26, 30, 37, 0.75)';
      ctx.strokeStyle = 'rgba(111, 211, 255, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    gizmoBackdrop.scale.setScalar(3.8);
    gizmoBackdrop.renderOrder = -1;
    gizmoScene.add(gizmoBackdrop);

    // Axis colors match the top-right legend badge (.axis-dot in App.css).
    const gizmoAxes = [
      { dir: new THREE.Vector3(1, 0, 0), color: 0xff5555, css: '#ff5555', label: 'X' },
      { dir: new THREE.Vector3(0, 1, 0), color: 0x50fa7b, css: '#50fa7b', label: 'Y' },
      { dir: new THREE.Vector3(0, 0, 1), color: 0x8be9fd, css: '#8be9fd', label: 'Z' },
    ];
    for (const axis of gizmoAxes) {
      gizmoScene.add(new THREE.ArrowHelper(axis.dir, new THREE.Vector3(), 1.05, axis.color, 0.3, 0.16));
      // Dim stub for the negative half, so "which way is minus" reads too (Blender-style).
      const negGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        axis.dir.clone().multiplyScalar(-0.65),
      ]);
      gizmoScene.add(new THREE.Line(negGeo, new THREE.LineBasicMaterial({ color: axis.color, transparent: true, opacity: 0.35 })));
      const label = makeGizmoSprite((ctx, size) => {
        ctx.font = 'bold 40px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = axis.css;
        ctx.fillText(axis.label, size / 2, size / 2 + 2);
      });
      label.scale.setScalar(0.55);
      label.position.copy(axis.dir).multiplyScalar(1.5);
      gizmoScene.add(label);
    }

    const GIZMO_SIZE = 104; // CSS px, square viewport in the corner
    const GIZMO_MARGIN = 12; // right-edge margin
    // Bottom-edge clearance is taller than GIZMO_MARGIN so the axis-key badge
    // (.viewport-orientation-badge in App.css) fits below the gizmo, docked at the
    // viewport's own bottom edge, instead of overlapping it.
    const GIZMO_MARGIN_BOTTOM = 46;
    const rendererSize = new THREE.Vector2();

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

    const ghostBoardGroup = new THREE.Group();
    scene.add(ghostBoardGroup);
    ghostBoardGroupRef.current = ghostBoardGroup;

    const handleGroup = new THREE.Group();
    scene.add(handleGroup);
    handleGroupRef.current = handleGroup;

    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: 0x6fd3ff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const highlightMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      highlightMaterial,
    );
    highlightMesh.visible = false;
    scene.add(highlightMesh);
    highlightMeshRef.current = highlightMesh;

    // Ghost marker for an align/mirror control's hover preview (see AlignMirrorControls in
    // InspectorPanel.tsx) -- larger and translucent so it reads as "not committed yet" next to
    // the solid feature markers. Never added to markerGroup, so it's never a raycast/selection
    // target.
    const previewMaterial = new THREE.MeshBasicMaterial({
      color: PREVIEW_MARKER_COLOR,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    const previewMarker = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), previewMaterial);
    previewMarker.visible = false;
    previewMarker.renderOrder = 1;
    scene.add(previewMarker);
    previewMarkerRef.current = previewMarker;

    let animationFrame: number;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);

      // Gizmo overlay pass: scissor to the lower-right corner, aim the ortho camera along the
      // main camera's current view direction (relative to the orbit target, so panning doesn't
      // skew it), and draw the triad on top of the already-rendered frame.
      renderer.getSize(rendererSize);
      const gx = rendererSize.x - GIZMO_SIZE - GIZMO_MARGIN;
      const gy = GIZMO_MARGIN_BOTTOM; // WebGL viewport origin is bottom-left
      gizmoCamera.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(5);
      gizmoCamera.lookAt(0, 0, 0);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(gx, gy, GIZMO_SIZE, GIZMO_SIZE);
      renderer.setViewport(gx, gy, GIZMO_SIZE, GIZMO_SIZE);
      renderer.render(gizmoScene, gizmoCamera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, rendererSize.x, rendererSize.y);
      renderer.autoClear = true;

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

    // Which meshes pointer rays may hit: a hidden lid must be excluded explicitly (three's
    // raycaster does not skip invisible meshes), and a ghost lid is see-through for interaction
    // too — clicks land on the interior so features can be placed inside while it's shown as
    // context. Only assembled/exploded lids take hits.
    const raycastTargets = (): THREE.Mesh[] => {
      const view = lidViewRef.current;
      const targets: THREE.Mesh[] = [baseMesh];
      if (view === 'assembled' || view === 'exploded') targets.push(lidMesh);
      return targets;
    };

    /** Raycast hit point in model space: hits on an exploded lid shift back down by its offset. */
    const modelPoint = (hit: THREE.Intersection): [number, number, number] => {
      const offset =
        hit.object === lidMesh
          ? explodeOffset(lidViewRef.current, bodyRef.current.outer.height)
          : 0;
      return [hit.point.x, hit.point.y, hit.point.z - offset];
    };

    // Hiding/ghosting the lid exposes *interior* surfaces to clicks, and an interior surface's
    // normal points away from the wall it belongs to: the inside of the back wall faces front,
    // the interior floor faces up, etc. Remap by where the point physically sits — side walls by
    // which half of the footprint the point is in, floor/ceiling by which side of the split
    // plane. This is what lets standoffs be placed on the interior floor from a normal top-down
    // view instead of orbiting underneath the model. (u,v) stays correct: faceFromWorld's
    // mapping for the remapped face reads the same world coordinates.
    const resolveInteriorFace = (face: Face, [x, y, z]: [number, number, number]): Face => {
      if (face === 'front' && y > 0) return 'back';
      if (face === 'back' && y < 0) return 'front';
      if (face === 'left' && x > 0) return 'right';
      if (face === 'right' && x < 0) return 'left';
      const split = effectiveSplitHeight(bodyRef.current);
      if (face === 'top' && z < split - 0.01) return 'bottom';
      if (face === 'bottom' && z > split + 0.01) return 'top';
      return face;
    };

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

    // PlaneGeometry's default normal is +Z. Three.js Euler 'XYZ' builds R = Rx(x)*Ry(y)*Rz(z),
    // so the ry (middle) component, not rz, is what pivots a plane from the XZ into the YZ plane.
    // front/back only need Rx(±π/2) to swing the plane up from XY into XZ; left/right additionally
    // need Ry(±π/2) to swing it from XZ into YZ. The overlay is double-sided, so normal sign is
    // irrelevant -- only which world plane the geometry ends up in matters.
    const HIGHLIGHT_ROTATION: Partial<Record<Face, [number, number, number]>> = {
      top: [0, 0, 0],
      bottom: [Math.PI, 0, 0],
      front: [Math.PI / 2, 0, 0],
      back: [-Math.PI / 2, 0, 0],
      left: [Math.PI / 2, -Math.PI / 2, 0],
      right: [Math.PI / 2, Math.PI / 2, 0],
    };

    // A cylinder's curved lateral wall has no single tangent plane, so 'side' highlights the
    // whole lateral surface as an open cylindrical band -- the direct analogue of how a box's
    // hover highlight already covers its whole (flat) face rather than a local patch.
    const updateHighlight = (face: Face | null, hitOnLid = false) => {
      const geom = bodyGeometry(bodyRef.current);
      if (!face) {
        highlightMesh.visible = false;
        return;
      }
      highlightMesh.visible = true;
      highlightMesh.geometry.dispose();

      const outerHeight = geom.height;
      const isExploded = lidViewRef.current === 'exploded';
      const explodeZ = explodeOffset(lidViewRef.current, outerHeight);
      const split = effectiveSplitHeight(bodyRef.current);

      if (geom.shape === 'cylinder' && face === 'side') {
        const { diameter } = geom;
        const sideH = isExploded ? (hitOnLid ? outerHeight - split : split) : outerHeight;
        const zCenter = isExploded
          ? hitOnLid
            ? split + sideH / 2 + explodeZ
            : split / 2
          : outerHeight / 2;

        highlightMesh.geometry = new THREE.CylinderGeometry(
          diameter / 2 + 0.2,
          diameter / 2 + 0.2,
          sideH,
          48,
          1,
          true,
        );
        highlightMesh.position.set(0, 0, zCenter);
        highlightMesh.rotation.set(Math.PI / 2, 0, 0);
        return;
      }

      if (geom.shape === 'cylinder') {
        const { diameter } = geom;
        highlightMesh.geometry = new THREE.CircleGeometry(diameter / 2, 48);
        const z = face === 'top' ? outerHeight + 0.2 + explodeZ : -0.2;
        highlightMesh.position.set(0, 0, z);
        highlightMesh.rotation.set(face === 'top' ? 0 : Math.PI, 0, 0);
        return;
      }

      if (face === 'top' || face === 'bottom') {
        const { length, width } = geom;
        const z = face === 'top' ? outerHeight + 0.2 + explodeZ : -0.2;
        highlightMesh.position.set(0, 0, z);
        highlightMesh.geometry = new THREE.PlaneGeometry(length, width);
        highlightMesh.rotation.set(...(HIGHLIGHT_ROTATION[face] ?? [0, 0, 0]));
        return;
      }

      // Side faces (front, back, left, right)
      // Small vertical inset (EDGE_INSET on each end) keeps the plane's bottom/top edges from
      // being exactly coplanar with Z=0 (the grid) and Z=outerHeight (the enclosure top face),
      // which prevents a polygon-offset depth artifact that makes the bottom appear to dip below
      // the floor from shallow viewing angles.
      const EDGE_INSET = 0.5;
      const sideH = isExploded ? (hitOnLid ? outerHeight - split : split) : outerHeight;
      const sv = Math.max(1, sideH - EDGE_INSET * 2);
      const zCenter = isExploded
        ? hitOnLid
          ? split + EDGE_INSET + sv / 2 + explodeZ
          : EDGE_INSET + sv / 2
        : EDGE_INSET + sv / 2;

      const su = face === 'front' || face === 'back' ? geom.length : geom.width;
      highlightMesh.geometry = new THREE.PlaneGeometry(su, sv);

      const frame = faceFrame(face, geom);
      const [x, y] = frame.toWorld(0.5, 0.5);
      const [nx, ny] = frame.normalAt(0.5, 0.5);
      highlightMesh.position.set(x + nx * 0.2, y + ny * 0.2, zCenter);
      highlightMesh.rotation.set(...(HIGHLIGHT_ROTATION[face] ?? [0, 0, 0]));
    };

    const handlePointerDown = (event: PointerEvent) => {
      downPos = { x: event.clientX, y: event.clientY };

      if (placementArmedRef.current) return; // click-to-place is resolved on pointerup, unchanged

      toNDC(event);
      raycaster.setFromCamera(pointer, camera);

      const handleHit = raycaster.intersectObjects(handleGroup.children, false)[0];
      if (handleHit) {
        const handleType = handleHit.object.userData.handleType as 'corner' | 'height' | 'split';
        dragState.current = { type: handleType };
        setControlsEnabled(false);
        return;
      }

      // Hidden markers must not be pickable (three's raycaster doesn't skip invisible meshes).
      const markerHit = showMarkersRef.current
        ? raycaster.intersectObjects(markerGroup.children, false)[0]
        : undefined;
      if (markerHit) {
        const featureId = markerHit.object.userData.featureId as string;
        const face = markerHit.object.userData.face as Face;
        const targetFeature = featuresRef.current.find((f) => f.id === featureId);
        callbacksRef.current.onSelectFeature(featureId);

        if (targetFeature?.locked) {
          // Locked feature: select in inspector, but gate/prevent 3D dragging
          dragState.current = { type: 'none' };
          return;
        }

        dragState.current = { type: 'feature', id: featureId, face };
        setControlsEnabled(false);
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

      if (dragState.current.type === 'split') {
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(heightDragPlane(), scratchVec)) {
          const body = bodyRef.current;
          const outerH = body.shape === 'box' ? body.outer.height : body.outer.height;
          // Keep split within [wallThickness+1, outerHeight-wallThickness-1] so both lid and
          // body retain at least 1mm of interior room.
          const minSplit = body.wallThickness + 1;
          const maxSplit = outerH - body.wallThickness - 1;
          const splitHeight = Math.min(Math.max(scratchVec.z, minSplit), maxSplit);
          callbacksRef.current.onResizeBody({ splitHeight });
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
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(raycastTargets(), false)[0];
        if (!hit) return;

        let [u, v] = faceFromWorld(face, geom, modelPoint(hit));
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
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(raycastTargets(), false)[0];
      if (!hit?.face) {
        updateHighlight(null);
        return;
      }
      const face = closestFace(
        [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z],
        bodyRef.current.shape,
      );
      // Highlight the face placement would actually target (interior floor -> 'bottom', etc.).
      updateHighlight(resolveInteriorFace(face, modelPoint(hit)), hit.object === lidMeshRef.current);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = downPos;
      downPos = null;
      const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_THRESHOLD_PX : true;

      if (placementArmedRef.current) {
        if (moved) return;
        toNDC(event);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(raycastTargets(), false)[0];
        if (!hit?.face) return;
        const geom = bodyGeometry(bodyRef.current);
        const rawFace = closestFace([hit.face.normal.x, hit.face.normal.y, hit.face.normal.z], geom.shape);
        const point = modelPoint(hit);
        const face = resolveInteriorFace(rawFace, point);
        const [u, v] = faceFromWorld(face, geom, point);
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
      previewMarker.geometry.dispose();
      previewMaterial.dispose();
      gizmoScene.traverse((obj) => {
        // Sprites (and ArrowHelper parts) share static library geometries -- only dispose the
        // per-instance materials/textures we created, plus the negative-stub line geometries.
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose();
          obj.material.dispose();
        } else if (obj instanceof THREE.Line) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      container.removeChild(renderer.domElement);
      cameraRef.current = null;
      rendererRef.current = null;
      markerGroupRef.current = null;
      ghostBoardGroupRef.current = null;
      handleGroupRef.current = null;
      highlightMeshRef.current = null;
      previewMarkerRef.current = null;
      gridGroupRef.current = null;
    };
  }, []);

  // View-only visibility toggles (grid/floor axes, ghost boards, feature markers) -- same
  // non-persisted precedent as lidView.
  useEffect(() => {
    if (gridGroupRef.current) gridGroupRef.current.visible = showGrid;
  }, [showGrid]);
  useEffect(() => {
    if (ghostBoardGroupRef.current) ghostBoardGroupRef.current.visible = showGhostBoards;
  }, [showGhostBoards]);
  useEffect(() => {
    if (markerGroupRef.current) markerGroupRef.current.visible = showMarkers;
    showMarkersRef.current = showMarkers;
  }, [showMarkers]);

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

  // Lid presentation (view-only): visibility, ghost transparency, exploded lift.
  useEffect(() => {
    const lid = lidMeshRef.current;
    if (!lid) return;
    lid.visible = lidView !== 'hidden';
    lid.material.transparent = lidView === 'ghost';
    lid.material.opacity = lidView === 'ghost' ? 0.3 : 1;
    lid.material.depthWrite = lidView !== 'ghost';
    lid.material.needsUpdate = true;
    lid.position.z = explodeOffset(lidView, body.outer.height);
  }, [lidView, body]);

  // Markers showing where features are already placed; the selected one is highlighted.
  useEffect(() => {
    const group = markerGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);

    const geom = bodyGeometry(body);
    const geometry = new THREE.SphereGeometry(1.2, 12, 12);
    const normalMaterial = new THREE.MeshStandardMaterial({ color: FEATURE_MARKER_COLOR });
    const selectedMaterial = new THREE.MeshStandardMaterial({ color: FEATURE_MARKER_SELECTED_COLOR });
    const lidOffset = explodeOffset(lidView, body.outer.height);
    for (const feature of features) {
      if (feature.hidden) continue;
      const onLid = featureOnLid(feature, body);
      // Markers ride their piece: lifted with an exploded lid, gone with a hidden one.
      if (onLid && lidView === 'hidden') continue;
      const frame = faceFrame(feature.face, geom);
      const [x, y, z] = frame.toWorld(feature.u, feature.v);
      const [nx, ny, nz] = frame.normalAt(feature.u, feature.v);
      const marker = new THREE.Mesh(geometry, feature.id === selectedFeatureId ? selectedMaterial : normalMaterial);
      let markerX = x + nx * 1.5;
      let markerY = y + ny * 1.5;
      let markerZ = z + nz * 1.5 + (onLid ? lidOffset : 0);

      if (feature.type === 'standoff' && feature.standoff) {
        markerZ = body.wallThickness + feature.standoff.height + 1.2;
      } else if (feature.type === 'board-mount' && feature.board) {
        markerZ = body.wallThickness + feature.board.standoff.height + 1.2;
      }

      marker.position.set(markerX, markerY, markerZ);
      marker.userData.featureId = feature.id;
      marker.userData.face = feature.face;
      group.add(marker);
    }

    return () => {
      geometry.dispose();
      normalMaterial.dispose();
      selectedMaterial.dispose();
    };
  }, [features, body, selectedFeatureId, lidView]);

  // Align/mirror hover preview -- see PreviewTarget. Positioned the same way a feature marker is
  // (toWorld + a small offset along the face normal), but it isn't tied to any real Feature, so it
  // doesn't participate in featureOnLid/lid-offset bookkeeping: it's only ever shown while hovering
  // an inspector control for the currently selected feature, and callers only ever preview a
  // target on that feature's own face.
  useEffect(() => {
    const marker = previewMarkerRef.current;
    if (!marker) return;
    if (!previewTarget) {
      marker.visible = false;
      return;
    }
    const geom = bodyGeometry(body);
    const frame = faceFrame(previewTarget.face, geom);
    const [x, y, z] = frame.toWorld(previewTarget.u, previewTarget.v);
    const [nx, ny, nz] = frame.normalAt(previewTarget.u, previewTarget.v);
    marker.position.set(x + nx * 1.5, y + ny * 1.5, z + nz * 1.5);
    marker.visible = true;
  }, [previewTarget, body]);

  // Ghost boards: a translucent PCB volume floating on its standoffs for every board-mount
  // feature. Display-only -- never part of the raycast targets or the exported geometry -- so
  // clearance to walls, lid, and connectors can be judged by eye before printing.
  useEffect(() => {
    const group = ghostBoardGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);

    const boards = features.filter((f) => f.type === 'board-mount' && f.board);
    if (boards.length === 0) return;

    const geom = bodyGeometry(body);
    const material = new THREE.MeshStandardMaterial({
      color: 0x1f7a3d,
      roughness: 0.5,
      metalness: 0.1,
      transparent: true,
      opacity: 0.55,
    });
    const geometries: THREE.BufferGeometry[] = [];
    for (const feature of boards) {
      const board = feature.board!;
      const [x, y] = faceFrame('bottom', geom).toWorld(feature.u, feature.v);
      const boxGeom = new THREE.BoxGeometry(board.boardWidth, board.boardDepth, board.boardThickness);
      geometries.push(boxGeom);
      const mesh = new THREE.Mesh(boxGeom, material);
      mesh.position.set(x, y, body.wallThickness + board.standoff.height + board.boardThickness / 2);
      mesh.rotation.z = (feature.rotationDeg * Math.PI) / 180;
      group.add(mesh);
    }

    return () => {
      material.dispose();
      for (const g of geometries) g.dispose();
    };
  }, [features, body]);

  // Plan-view resize handle(s) (box: 4 corner cubes; cylinder: 1 radius cube), height cone,
  // and split-height handle (diamond disc at the lid seam), repositioned whenever body resizes.
  useEffect(() => {
    const group = handleGroupRef.current;
    if (!group) return;

    for (const child of [...group.children]) group.remove(child);
    if (!showHandles) return;

    const cornerGeometry = new THREE.BoxGeometry(3, 3, 3);
    const cornerMaterial = new THREE.MeshStandardMaterial({ color: HANDLE_COLOR });
    const split = effectiveSplitHeight(body);
    const effectiveHeight = lidView === 'hidden' ? split : body.outer.height;

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
      handle.position.set(x, y, effectiveHeight);
      handle.userData.handleType = 'corner';
      group.add(handle);
    }

    const heightGeometry = new THREE.ConeGeometry(2, 5, 12);
    const heightMaterial = new THREE.MeshStandardMaterial({ color: HANDLE_COLOR });
    const heightHandle = new THREE.Mesh(heightGeometry, heightMaterial);
    heightHandle.rotation.x = Math.PI / 2;
    heightHandle.position.set(0, 0, effectiveHeight + 4);
    heightHandle.userData.handleType = 'height';
    group.add(heightHandle);

    // Split-height handle: a small diamond (OctahedronGeometry) sitting on the seam between
    // lid and body, colour-coded amber so it's visually distinct from the resize handles.
    // Only shown in assembled/exploded views where the seam is meaningful to interact with.
    const SPLIT_COLOR = 0xffa040;
    if (lidView === 'assembled' || lidView === 'exploded') {
      const splitGeo = new THREE.OctahedronGeometry(2.5, 0);
      const splitMat = new THREE.MeshStandardMaterial({ color: SPLIT_COLOR });
      const splitHandle = new THREE.Mesh(splitGeo, splitMat);
      // Place it at the right-front corner of the footprint so it's always visible and reachable.
      const edgeX = body.shape === 'box' ? body.outer.length / 2 + 3 : body.outer.diameter / 2 + 3;
      const edgeY = body.shape === 'box' ? -body.outer.width / 2 : 0;
      splitHandle.position.set(edgeX, edgeY, split);
      splitHandle.userData.handleType = 'split';
      group.add(splitHandle);

      // Two small arrow-cones above/below the diamond to hint at vertical draggability.
      const arrowGeo = new THREE.ConeGeometry(1.2, 3, 8);
      const arrowMat = new THREE.MeshStandardMaterial({ color: SPLIT_COLOR });
      const arrowUp = new THREE.Mesh(arrowGeo, arrowMat);
      arrowUp.rotation.x = Math.PI / 2;
      arrowUp.position.set(edgeX, edgeY, split + 4.5);
      arrowUp.userData.handleType = 'split';
      group.add(arrowUp);
      const arrowDown = new THREE.Mesh(arrowGeo, arrowMat);
      arrowDown.rotation.x = -Math.PI / 2;
      arrowDown.position.set(edgeX, edgeY, split - 4.5);
      arrowDown.userData.handleType = 'split';
      group.add(arrowDown);

      return () => {
        cornerGeometry.dispose(); cornerMaterial.dispose();
        heightGeometry.dispose(); heightMaterial.dispose();
        splitGeo.dispose(); splitMat.dispose();
        arrowGeo.dispose(); arrowMat.dispose();
      };
    }

    return () => {
      cornerGeometry.dispose();
      cornerMaterial.dispose();
      heightGeometry.dispose();
      heightMaterial.dispose();
    };
  }, [body, lidView, showHandles]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div className="viewport-orientation-badge">
        <span className="axis-dot red"></span><span>X (Length)</span>
        <span className="axis-dot green"></span><span>Y (Width)</span>
        <span className="axis-dot blue"></span><span>Z (Height)</span>
      </div>
    </div>
  );
}
