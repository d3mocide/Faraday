import { create } from 'zustand';
import type {
  BodyShape,
  CornerStyleType,
  EnclosureBody,
  EnclosureProject,
  Feature,
  GasketSpec,
  LidType,
  PanelFace,
  PanelSpec,
  ScrewCount,
  ScrewInsertType,
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
}

interface ProjectStore {
  project: EnclosureProject;
  past: EnclosureProject[];
  future: EnclosureProject[];
  setProjectName: (name: string) => void;
  setUnits: (units: Units) => void;
  setBodyShape: (shape: BodyShape) => void;
  setBodyDimension: (key: 'length' | 'width' | 'height' | 'diameter', value: number) => void;
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
  setGasketEnabled: (enabled: boolean) => void;
  setGasketWidth: (value: number) => void;
  setGasketDepth: (value: number) => void;
  setPanelsEnabled: (enabled: boolean) => void;
  togglePanelFace: (face: PanelFace) => void;
  setPanelThickness: (value: number) => void;
  setPanelFitClearance: (value: number) => void;
  setPanelGrooveDepth: (value: number) => void;
  setPanelCaptureInLid: (value: boolean) => void;
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
        if (shape === current.shape) return p;
        const { wallThickness, lid } = current;
        const height = current.outer.height;
        const body: EnclosureBody =
          shape === 'cylinder'
            ? {
                shape: 'cylinder',
                outer: {
                  diameter: current.shape === 'box' ? Math.min(current.outer.length, current.outer.width) : 50,
                  height,
                },
                wallThickness,
                lid,
              }
            : {
                shape: 'box',
                outer: {
                  length: current.shape === 'cylinder' ? current.outer.diameter : 50,
                  width: current.shape === 'cylinder' ? current.outer.diameter : 50,
                  height,
                },
                wallThickness,
                cornerStyle: { type: 'rounded', radius: 3 },
                lid,
              };
        return { ...p, body, features: [] };
      }),

    setBodyDimension: (key, value) =>
      mutate((p) => ({
        ...p,
        body: { ...p.body, outer: { ...p.body.outer, [key]: value } } as EnclosureBody,
      })),

    setWallThickness: (value) => mutate((p) => ({ ...p, body: { ...p.body, wallThickness: value } })),

    // No-ops on a cylinder body (it has no cornerStyle) -- the inspector only shows these controls
    // for a box body, so this should never actually be called in that state.
    setCornerStyleType: (type) =>
      mutate((p) => (p.body.shape !== 'box' ? p : { ...p, body: { ...p.body, cornerStyle: { ...p.body.cornerStyle, type } } })),

    setCornerRadius: (radius) =>
      mutate((p) => (p.body.shape !== 'box' ? p : { ...p, body: { ...p.body, cornerStyle: { ...p.body.cornerStyle, radius } } })),

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

    setScrewEdgeInset: (edgeInset) =>
      mutate((p) => {
        const screw = p.body.lid.screw ?? defaultScrewSpec();
        return { ...p, body: { ...p.body, lid: { ...p.body.lid, screw: { ...screw, edgeInset } } } };
      }),

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

function defaultScrewSpec(): { size: ScrewSize; insertType: ScrewInsertType; count: ScrewCount } {
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
