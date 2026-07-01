import { create } from 'zustand';
import type {
  CornerStyleType,
  EnclosureProject,
  LidType,
  ScrewCount,
  ScrewInsertType,
  ScrewSize,
} from '../types/project';
import { createDefaultProject } from './defaultProject';

interface ProjectStore {
  project: EnclosureProject;
  setProjectName: (name: string) => void;
  setUnits: (units: 'mm' | 'in') => void;
  setBodyDimension: (key: 'length' | 'width' | 'height', value: number) => void;
  setWallThickness: (value: number) => void;
  setCornerStyleType: (type: CornerStyleType) => void;
  setCornerRadius: (radius: number) => void;
  setLidType: (type: LidType) => void;
  setSplitHeight: (value: number) => void;
  setWallGap: (value: number) => void;
  setScrewSize: (size: ScrewSize) => void;
  setScrewInsertType: (insertType: ScrewInsertType) => void;
  setScrewCount: (count: ScrewCount) => void;
}

function touch(project: EnclosureProject): EnclosureProject {
  return { ...project, updatedAt: new Date().toISOString() };
}

export const useProjectStore = create<ProjectStore>((set) => ({
  project: createDefaultProject(),

  setProjectName: (name) =>
    set((s) => ({ project: touch({ ...s.project, name }) })),

  setUnits: (units) =>
    set((s) => ({ project: touch({ ...s.project, units }) })),

  setBodyDimension: (key, value) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: {
          ...s.project.body,
          outer: { ...s.project.body.outer, [key]: value },
        },
      }),
    })),

  setWallThickness: (value) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: { ...s.project.body, wallThickness: value },
      }),
    })),

  setCornerStyleType: (type) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: {
          ...s.project.body,
          cornerStyle: { ...s.project.body.cornerStyle, type },
        },
      }),
    })),

  setCornerRadius: (radius) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: {
          ...s.project.body,
          cornerStyle: { ...s.project.body.cornerStyle, radius },
        },
      }),
    })),

  setLidType: (type) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: { ...s.project.body, lid: { ...s.project.body.lid, type } },
      }),
    })),

  setSplitHeight: (value) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: {
          ...s.project.body,
          lid: { ...s.project.body.lid, splitHeight: value },
        },
      }),
    })),

  setWallGap: (value) =>
    set((s) => ({
      project: touch({
        ...s.project,
        body: { ...s.project.body, lid: { ...s.project.body.lid, wallGap: value } },
      }),
    })),

  setScrewSize: (size) =>
    set((s) => {
      const screw = s.project.body.lid.screw ?? {
        size: 'M3' as ScrewSize,
        insertType: 'heat-set' as ScrewInsertType,
        count: 4 as ScrewCount,
      };
      return {
        project: touch({
          ...s.project,
          body: {
            ...s.project.body,
            lid: { ...s.project.body.lid, screw: { ...screw, size } },
          },
        }),
      };
    }),

  setScrewInsertType: (insertType) =>
    set((s) => {
      const screw = s.project.body.lid.screw ?? {
        size: 'M3' as ScrewSize,
        insertType: 'heat-set' as ScrewInsertType,
        count: 4 as ScrewCount,
      };
      return {
        project: touch({
          ...s.project,
          body: {
            ...s.project.body,
            lid: { ...s.project.body.lid, screw: { ...screw, insertType } },
          },
        }),
      };
    }),

  setScrewCount: (count) =>
    set((s) => {
      const screw = s.project.body.lid.screw ?? {
        size: 'M3' as ScrewSize,
        insertType: 'heat-set' as ScrewInsertType,
        count: 4 as ScrewCount,
      };
      return {
        project: touch({
          ...s.project,
          body: {
            ...s.project.body,
            lid: { ...s.project.body.lid, screw: { ...screw, count } },
          },
        }),
      };
    }),
}));
