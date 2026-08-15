import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../src/state/projectStore';
import { createDefaultProject } from '../src/state/defaultProject';
import type { BodyShape } from '../src/types/project';

// The store is a module-level singleton (zustand's create() outside React), so every test resets
// it to a known default box project first -- otherwise state leaks between tests in file order.
beforeEach(() => {
  useProjectStore.getState().loadProject(createDefaultProject());
});

describe('setBodyShape: switching produces a body with the right outer fields', () => {
  const shapes: BodyShape[] = ['box', 'cylinder', 'hexagon', 'octagon', 'stadium', 'wedge'];

  for (const shape of shapes) {
    it(`switching to ${shape} produces a valid ${shape} body`, () => {
      useProjectStore.getState().setBodyShape(shape);
      const { body } = useProjectStore.getState().project;
      expect(body.shape).toBe(shape);
      if (shape === 'box' || shape === 'stadium' || shape === 'wedge') {
        expect(typeof body.outer.length).toBe('number');
        expect(typeof body.outer.width).toBe('number');
        expect(body.outer.length).toBeGreaterThan(0);
        expect(body.outer.width).toBeGreaterThan(0);
      }
      if (shape === 'hexagon' || shape === 'octagon') {
        expect(typeof body.outer.radius).toBe('number');
        expect(body.outer.radius).toBeGreaterThan(0);
      }
      if (shape === 'cylinder') {
        expect(typeof body.outer.diameter).toBe('number');
        expect(body.outer.diameter).toBeGreaterThan(0);
      }
      if (shape === 'wedge') {
        expect(body.outer.heightFront).toBeGreaterThan(0);
        expect(body.outer.heightBack).toBeGreaterThan(0);
      } else if (shape !== 'wedge') {
        expect(body.outer.height).toBeGreaterThan(0);
      }
    });
  }

  it('switching shape clears placed features (old (face,u,v) placements are meaningless on a new footprint)', () => {
    useProjectStore.getState().addFeature({
      id: 'f1',
      type: 'standoff',
      face: 'bottom',
      u: 0.5,
      v: 0.5,
      rotationDeg: 0,
      standoff: { outerDiameter: 6, screwHoleDiameter: 2.5, height: 10 },
    });
    expect(useProjectStore.getState().project.features.length).toBe(1);
    useProjectStore.getState().setBodyShape('hexagon');
    expect(useProjectStore.getState().project.features.length).toBe(0);
  });
});

describe('setBodyDimension: writes the right key on the current shape', () => {
  it('sets radius on a hexagon body', () => {
    useProjectStore.getState().setBodyShape('hexagon');
    useProjectStore.getState().setBodyDimension('radius', 42);
    const body = useProjectStore.getState().project.body;
    expect(body.shape).toBe('hexagon');
    expect((body as { outer: { radius: number } }).outer.radius).toBe(42);
  });

  it('sets heightFront/heightBack independently on a wedge body', () => {
    useProjectStore.getState().setBodyShape('wedge');
    useProjectStore.getState().setBodyDimension('heightFront', 12);
    useProjectStore.getState().setBodyDimension('heightBack', 55);
    const body = useProjectStore.getState().project.body;
    expect(body.shape).toBe('wedge');
    if (body.shape === 'wedge') {
      expect(body.outer.heightFront).toBe(12);
      expect(body.outer.heightBack).toBe(55);
    }
  });

  it('sets length/width on a stadium body', () => {
    useProjectStore.getState().setBodyShape('stadium');
    useProjectStore.getState().setBodyDimension('length', 120);
    useProjectStore.getState().setBodyDimension('width', 60);
    const body = useProjectStore.getState().project.body;
    if (body.shape === 'stadium') {
      expect(body.outer.length).toBe(120);
      expect(body.outer.width).toBe(60);
    }
  });

  it('sets diameter on a cylinder body', () => {
    useProjectStore.getState().setBodyShape('cylinder');
    useProjectStore.getState().setBodyDimension('diameter', 77);
    const body = useProjectStore.getState().project.body;
    if (body.shape === 'cylinder') expect(body.outer.diameter).toBe(77);
  });
});

describe('setCornerStyleType / setCornerRadius: box and wedge only', () => {
  it('applies to a box body', () => {
    useProjectStore.getState().setBodyShape('box');
    useProjectStore.getState().setCornerStyleType('chamfered');
    useProjectStore.getState().setCornerRadius(5);
    const body = useProjectStore.getState().project.body;
    if (body.shape === 'box') {
      expect(body.cornerStyle.type).toBe('chamfered');
      expect(body.cornerStyle.radius).toBe(5);
    }
  });

  it('applies to a wedge body (wedgeShell reads cornerStyle just like boxShell)', () => {
    useProjectStore.getState().setBodyShape('wedge');
    useProjectStore.getState().setCornerStyleType('faceted');
    useProjectStore.getState().setCornerRadius(4);
    const body = useProjectStore.getState().project.body;
    if (body.shape === 'wedge') {
      expect(body.cornerStyle.type).toBe('faceted');
      expect(body.cornerStyle.radius).toBe(4);
    }
  });

  it('is a no-op on a hexagon body (no meaningful corner to style)', () => {
    useProjectStore.getState().setBodyShape('hexagon');
    const before = useProjectStore.getState().project.body;
    useProjectStore.getState().setCornerStyleType('chamfered');
    useProjectStore.getState().setCornerRadius(5);
    const after = useProjectStore.getState().project.body;
    expect(after).toBe(before); // mutate() bails out entirely -- same object reference
  });

  it('is a no-op on a cylinder body', () => {
    useProjectStore.getState().setBodyShape('cylinder');
    const before = useProjectStore.getState().project.body;
    useProjectStore.getState().setCornerStyleType('rounded');
    const after = useProjectStore.getState().project.body;
    expect(after).toBe(before);
  });

  it('is a no-op on a stadium body (vestigial cornerStyle field, ends are already fully round)', () => {
    useProjectStore.getState().setBodyShape('stadium');
    const before = useProjectStore.getState().project.body;
    useProjectStore.getState().setCornerRadius(5);
    const after = useProjectStore.getState().project.body;
    expect(after).toBe(before);
  });
});
