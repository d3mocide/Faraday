import { create } from 'zustand';
import type {
  BodyShape,
  CornerStyleType,
  EdgeBevelSpec,
  EnclosureBody,
  EnclosureProject,
  Feature,
  GasketSpec,
  LidType,
  PanelFace,
  PanelSpec,
  ScrewCount,
  ScrewInsertType,
  ScrewColumnShape,
  ScrewHeadStyle,
  ScrewPlacement,
  ScrewSpec,
  ScrewSize,
  Units,
} from '../types/project';
import { loadAutosavedProject } from './autosave';
import { createDefaultProject } from './defaultProject';

export interface BoardPresetBody {
  outer: { length: number; width: number; height: number };
  wallThickness: number;
  splitHeight: number;
  /** Only set by non-board "starter" presets (e.g. the sealed outdoor node) that want the gasket
   * channel on by default -- omitted everywhere else so applying a board preset never clobbers a
   * gasket the user already had enabled (see applyBoardPreset below). */
  gasket?: GasketSpec;
  /** Slide-in end panels, for presets whose case is genuinely multi-part (e.g. the Waveshare CM4
   * base). Unlike `gasket` this one is *replaced* rather than merged: panels change how many
   * pieces the case prints as and which piece each port cutout lands on, so carrying a previous
   * preset's panels into a new one would silently reshape the new case. */
  panels?: PanelSpec;
  /** Presets that model a whole case (rather than just sizing a box around a board) can pin the
   * lid style. Omitted everywhere else, which leaves whatever the user already had. */
  lidType?: LidType;
  /** Forced to 'exterior' by presets whose board fills the interior, leaving no floor for corner
   * bosses -- see ScrewPlacement. */
  screwPlacement?: ScrewPlacement;
}

interface ProjectStore {
  project: EnclosureProject;
  past: EnclosureProject[];
  future: EnclosureProject[];
  setProjectName: (name: string) => void;
  setUnits: (units: Units) => void;
  setBodyShape: (shape: BodyShape) => void;
  setBodyDimension: (
    key: 'length' | 'width' | 'height' | 'diameter' | 'radius' | 'heightFront' | 'heightBack',
    value: number,
  ) => void;
  setWallThickness: (value: number) => void;
  setCornerStyleType: (type: CornerStyleType) => void;
  setCornerRadius: (radius: number) => void;
  setLidType: (type: LidType) => void;
  setSplitHeight: (value: number) => void;
  setWallGap: (value: number) => void;
  setScrewSize: (size: ScrewSize) => void;
  setScrewInsertType: (insertType: ScrewInsertType) => void;
  setScrewCount: (count: ScrewCount) => void;
  setScrewEdgeInset: (edgeInset: number | undefined) => void;
  setScrewPlacement: (placement: ScrewPlacement) => void;
  setScrewColumnShape: (shape: ScrewColumnShape) => void;
  setScrewHeadStyle: (headStyle: ScrewHeadStyle) => void;
  setScrewColumnHeight: (height: number | undefined) => void;
  setScrewFootEnabled: (enabled: boolean) => void;
  setScrewFootAngleDeg: (angle: number) => void;
  setGasketEnabled: (enabled: boolean) => void;
  setGasketWidth: (value: number) => void;
  setGasketDepth: (value: number) => void;
  setPanelsEnabled: (enabled: boolean) => void;
  togglePanelFace: (face: PanelFace) => void;
  setPanelThickness: (value: number) => void;
  setPanelFitClearance: (value: number) => void;
  setPanelGrooveDepth: (value: number) => void;
  setPanelCaptureInLid: (value: boolean) => void;
  setPanelRetainLip: (value: number) => void;
  setLiveSegments: (segments: number) => void;
  setExportSegments: (segments: number) => void;
  setTopEdgeBevel: (spec: EdgeBevelSpec | undefined) => void;
  setBottomEdgeBevel: (spec: EdgeBevelSpec | undefined) => void;
  addFeature: (feature: Feature) => void;
  updateFeature: (id: string, patch: Partial<Feature>) => void;
  removeFeature: (id: string) => void;
  loadProject: (project: EnclosureProject) => void;
  applyBoardPreset: (preset: BoardPresetBody, features?: Feature[]) => void;
  undo: () => void;
  redo: () => void;
}

function touch(project: EnclosureProject): EnclosureProject {
  return { ...project, updatedAt: new Date().toISOString() };
}

const HISTORY_DEBOUNCE_MS = 500; // coalesces a whole drag/typing burst into one undo step
const MAX_HISTORY = 50;

export const useProjectStore = create<ProjectStore>((set, get) => {
  // Gate on the gap since the last *mutation*, not the last *snapshot* -- gating on the
  // snapshot would let the window re-open mid-gesture for any drag longer than the debounce
  // itself (500ms of continuous pointermoves easily exceeds that), splitting one drag into
  // several undo steps. Resetting this on every call, snapshot or not, is what makes an
  // arbitrarily long continuous burst coalesce into a single step, only starting a new one after
  // a genuine pause.
  let lastMutationAt = 0;

  /** Every mutating action goes through this so undo/redo has one choke point to snapshot at. */
  function mutate(updater: (project: EnclosureProject) => EnclosureProject) {
    const state = get();
    const now = Date.now();
    const shouldSnapshot = now - lastMutationAt > HISTORY_DEBOUNCE_MS;
    lastMutationAt = now;
    set({
      project: touch(updater(state.project)),
      past: shouldSnapshot ? [...state.past, state.project].slice(-MAX_HISTORY) : state.past,
      future: [],
    });
  }

  return {
    project: loadAutosavedProject() ?? createDefaultProject(),
    past: [],
    future: [],

    setProjectName: (name) => mutate((p) => ({ ...p, name })),

    setUnits: (units) => mutate((p) => ({ ...p, units })),

    // Switching shape changes which fields `outer`/`cornerStyle` even have, so old feature
    // placements (face + u/v meant for the previous shape's geometry) can't be trusted to still
    // make sense -- cleared here, same precedent as applyBoardPreset.
    setBodyShape: (shape) =>
      mutate((p) => {
        const current = p.body;
        const height =
          current.shape === 'wedge'
            ? current.outer.heightBack
            : current.shape === 'hexagon' || current.shape === 'octagon' || current.shape === 'cylinder'
            ? current.outer.height
            : current.outer.height;
        const wallThickness = current.wallThickness;
        const lid = current.lid;

        let body: EnclosureBody;
        if (shape === 'cylinder') {
          const d = current.shape === 'box' || current.shape === 'stadium' || current.shape === 'wedge' ? Math.min(current.outer.length, current.outer.width) : (current.shape === 'hexagon' || current.shape === 'octagon' ? current.outer.radius * 2 : 50);
          body = { shape: 'cylinder', outer: { diameter: d, height }, wallThickness, lid };
        } else if (shape === 'hexagon') {
          const r = current.shape === 'box' || current.shape === 'stadium' || current.shape === 'wedge' ? Math.min(current.outer.length, current.outer.width) / 2 : (current.shape === 'cylinder' ? current.outer.diameter / 2 : 30);
          body = { shape: 'hexagon', outer: { radius: r, height }, wallThickness, lid };
        } else if (shape === 'octagon') {
          const r = current.shape === 'box' || current.shape === 'stadium' || current.shape === 'wedge' ? Math.min(current.outer.length, current.outer.width) / 2 : (current.shape === 'cylinder' ? current.outer.diameter / 2 : 30);
          body = { shape: 'octagon', outer: { radius: r, height }, wallThickness, lid };
        } else if (shape === 'stadium') {
          const len = current.shape === 'box' || current.shape === 'wedge' ? current.outer.length : 80;
          const wid = current.shape === 'box' || current.shape === 'wedge' ? current.outer.width : 40;
          body = { shape: 'stadium', outer: { length: len, width: wid, height }, wallThickness, cornerStyle: { type: 'rounded', radius: 3 }, lid };
        } else if (shape === 'wedge') {
          const len = current.shape === 'box' || current.shape === 'stadium' ? current.outer.length : 70;
          const wid = current.shape === 'box' || current.shape === 'stadium' ? current.outer.width : 50;
          body = { shape: 'wedge', outer: { length: len, width: wid, heightFront: Math.max(height * 0.4, 15), heightBack: height }, wallThickness, cornerStyle: { type: 'rounded', radius: 3 }, lid };
        } else {
          const len = current.shape === 'stadium' || current.shape === 'wedge' ? current.outer.length : 60;
          const wid = current.shape === 'stadium' || current.shape === 'wedge' ? current.outer.width : 60;
          body = { shape: 'box', outer: { length: len, width: wid, height }, wallThickness, cornerStyle: { type: 'rounded', radius: 3 }, lid };
        }
        return { ...p, body, features: [] };
      }),

    setBodyDimension: (key, value) =>
      mutate((p) => ({
        ...p,
        body: { ...p.body, outer: { ...p.body.outer, [key]: value } } as EnclosureBody,
      })),

    setWallThickness: (value) => mutate((p) => ({ ...p, body: { ...p.body, wallThickness: value } })),

    // box and wedge both have real vertical corners a cornerStyle can round/chamfer/facet (wedgeShell
    // reads it exactly like boxShell). Stadium also carries a cornerStyle field on its type, but it's
    // vestigial: a stadium's ends are already fully rounded by construction (the semicircular caps
    // ARE its corners) and stadiumShell never reads the field, so there's nothing for this control to
    // do there -- same reasoning as cylinder having no cornerStyle at all, just not encoded in the
    // type. No-ops on cylinder/hexagon/octagon/stadium, where the inspector doesn't show this control.
    setCornerStyleType: (type) =>
      mutate((p) =>
        p.body.shape !== 'box' && p.body.shape !== 'wedge'
          ? p
          : { ...p, body: { ...p.body, cornerStyle: { ...p.body.cornerStyle, type } } },
      ),

    setCornerRadius: (radius) =>
      mutate((p) =>
        p.body.shape !== 'box' && p.body.shape !== 'wedge'
          ? p
          : { ...p, body: { ...p.body, cornerStyle: { ...p.body.cornerStyle, radius } } },
      ),

    setLidType: (type) =>
      mutate((p) => ({ ...p, body: { ...p.body, lid: { ...p.body.lid, type } } })),

    setSplitHeight: (value) =>
      mutate((p) => ({ ...p, body: { ...p.body, lid: { ...p.body.lid, splitHeight: value } } })),

    setWallGap: (value) =>
      mutate((p) => ({ ...p, body: { ...p.body, lid: { ...p.body.lid, wallGap: value } } })),

    setScrewSize: (size) =>
      mutate((p) => {
        const screw = p.body.lid.screw ?? defaultScrewSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, screw: { ...screw, size } } } };
      }),

    setScrewInsertType: (insertType) =>
      mutate((p) => {
        const screw = p.body.lid.screw ?? defaultScrewSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, screw: { ...screw, insertType } } } };
      }),

    setScrewCount: (count) =>
      mutate((p) => {
        const screw = p.body.lid.screw ?? defaultScrewSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, screw: { ...screw, count } } } };
      }),

    setScrewEdgeInset: (edgeInset) => mutate(patchScrew((screw) => ({ ...screw, edgeInset }))),

    setScrewPlacement: (placement) => mutate(patchScrew((screw) => ({ ...screw, placement }))),

    setScrewColumnShape: (shape) => mutate(patchScrew((screw) => ({ ...screw, shape }))),

    setScrewHeadStyle: (headStyle) => mutate(patchScrew((screw) => ({ ...screw, headStyle }))),

    // undefined restores the default full-height column (floor to seam).
    setScrewColumnHeight: (height) =>
      mutate(patchScrew((screw) => ({ ...screw, columnHeight: height }))),

    setScrewFootEnabled: (enabled) =>
      mutate(patchScrew((screw) => ({ ...screw, footEnabled: enabled }))),

    setScrewFootAngleDeg: (angle) =>
      mutate(patchScrew((screw) => ({ ...screw, footAngleDeg: angle }))),

    setGasketEnabled: (enabled) =>
      mutate((p) => ({
        ...p,
        body: {
          ...p.body,
          lid: { ...p.body.lid, gasket: enabled ? (p.body.lid.gasket ?? defaultGasketSpec()) : undefined },
        },
      })),

    setGasketWidth: (value) =>
      mutate((p) => {
        const gasket = p.body.lid.gasket ?? defaultGasketSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, gasket: { ...gasket, width: value } } } };
      }),

    setGasketDepth: (value) =>
      mutate((p) => {
        const gasket = p.body.lid.gasket ?? defaultGasketSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, gasket: { ...gasket, depth: value } } } };
      }),

    // Slide-in panels are a box-body property (a cylinder has no flat wall to replace), so all six
    // actions below no-op on a cylinder -- the inspector only shows the controls for a box.
    setPanelsEnabled: (enabled) =>
      mutate((p) =>
        p.body.shape !== 'box'
          ? p
          : {
              ...p,
              body: {
                ...p.body,
                panels: enabled ? (p.body.panels ?? defaultPanelSpec(p.body.wallThickness)) : undefined,
              },
            },
      ),

    togglePanelFace: (face) =>
      mutate((p) => {
        if (p.body.shape !== 'box') return p;
        const panels = p.body.panels ?? defaultPanelSpec(p.body.wallThickness);
        const faces = panels.faces.includes(face)
          ? panels.faces.filter((f) => f !== face)
          : [...panels.faces, face];
        return { ...p, body: { ...p.body, panels: { ...panels, faces } } };
      }),

    setPanelThickness: (value) => mutate(patchPanels((panels) => ({ ...panels, thickness: value }))),

    setPanelFitClearance: (value) =>
      mutate(patchPanels((panels) => ({ ...panels, fitClearance: value }))),

    setPanelGrooveDepth: (value) =>
      mutate(patchPanels((panels) => ({ ...panels, grooveDepth: value }))),

    setPanelCaptureInLid: (value) =>
      mutate(patchPanels((panels) => ({ ...panels, captureInLid: value }))),

    setPanelRetainLip: (value) => mutate(patchPanels((panels) => ({ ...panels, retainLip: value }))),

    setLiveSegments: (segments) =>
      mutate((p) => ({
        ...p,
        tessellation: {
          liveSegments: Math.max(16, Math.min(128, segments)),
          exportSegments: p.tessellation?.exportSegments ?? 64,
        },
      })),

    setExportSegments: (segments) =>
      mutate((p) => ({
        ...p,
        tessellation: {
          liveSegments: p.tessellation?.liveSegments ?? 32,
          exportSegments: Math.max(32, Math.min(256, segments)),
        },
      })),

    setTopEdgeBevel: (spec) =>
      mutate((p) => ({ ...p, body: { ...p.body, topEdgeBevel: spec } })),

    setBottomEdgeBevel: (spec) =>
      mutate((p) => ({ ...p, body: { ...p.body, bottomEdgeBevel: spec } })),

    addFeature: (feature) => mutate((p) => ({ ...p, features: [...p.features, feature] })),

    updateFeature: (id, patch) =>
      mutate((p) => ({
        ...p,
        features: p.features.map((f) => (f.id === id ? ({ ...f, ...patch } as Feature) : f)),
      })),

    removeFeature: (id) => mutate((p) => ({ ...p, features: p.features.filter((f) => f.id !== id) })),

    loadProject: (project) => mutate(() => project),

    // Presets are all rectangular PCBs (BoardPresetBody.outer is length/width/height), so this
    // always yields a box body -- if the project was a cylinder, that's a shape switch, same as
    // setBodyShape, and gets a fresh default cornerStyle since a cylinder body has none to reuse.
    // The preset's features (board-mount + IO cutouts, prebuilt by buildPresetFeatures in
    // featureFactory.ts) replace whatever was placed before.
    applyBoardPreset: (preset, features) =>
      mutate((p) => ({
        ...p,
        body: {
          shape: 'box',
          outer: preset.outer,
          wallThickness: preset.wallThickness,
          cornerStyle: p.body.shape === 'box' ? p.body.cornerStyle : { type: 'rounded', radius: 3 },
          lid: {
            ...p.body.lid,
            splitHeight: preset.splitHeight,
            ...(preset.gasket ? { gasket: preset.gasket } : {}),
            ...(preset.lidType ? { type: preset.lidType } : {}),
            ...(preset.screwPlacement
              ? { screw: { ...(p.body.lid.screw ?? defaultScrewSpec()), placement: preset.screwPlacement } }
              : {}),
          },
          panels: preset.panels,
        },
        features: features ?? [],
      })),

    undo: () => {
      const state = get();
      const prev = state.past[state.past.length - 1];
      if (!prev) return;
      set({
        project: touch(prev),
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future],
      });
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      set({
        project: touch(next),
        past: [...state.past, state.project],
        future: state.future.slice(1),
      });
    },
  };
});

function defaultScrewSpec(): ScrewSpec {
  return { size: 'M3', insertType: 'heat-set', count: 4 };
}

function defaultGasketSpec(): { width: number; depth: number } {
  return { width: 1.5, depth: 1 };
}

/** Left + right end plates: the common case (a connector panel at each end of a board). */
function defaultPanelSpec(wallThickness: number): PanelSpec {
  return {
    faces: ['left', 'right'],
    thickness: Math.max(wallThickness, 1.2),
    fitClearance: 0.3,
    grooveDepth: 1.2,
    captureInLid: true,
  };
}

/** Shared shape of the "edit one field of the screw spec" actions above. Fills in the default spec
 * first, so the controls work even on a project whose lid type never carried one. */
function patchScrew(
  update: (screw: ScrewSpec) => ScrewSpec,
): (project: EnclosureProject) => EnclosureProject {
  return (p) => ({
    ...p,
    body: { ...p.body, lid: { ...p.body.lid, screw: update(p.body.lid.screw ?? defaultScrewSpec()) } },
  });
}

/** Shared shape of the "edit one field of the panel spec" actions above. */
function patchPanels(
  update: (panels: PanelSpec) => PanelSpec,
): (project: EnclosureProject) => EnclosureProject {
  return (p) => {
    if (p.body.shape !== 'box') return p;
    const panels = p.body.panels ?? defaultPanelSpec(p.body.wallThickness);
    return { ...p, body: { ...p.body, panels: update(panels) } };
  };
}
