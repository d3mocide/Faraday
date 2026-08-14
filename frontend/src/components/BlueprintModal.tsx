import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { bodyGeometry, faceSize } from '../csg/faceFrame';
import { computeSmartSnap, getFeature2DBounds, type Feature2DBounds } from '../csg/blueprint2d';
import type { Face } from '../types/project';
import { useProjectStore } from '../state/projectStore';
import { findConnector } from '../connectors/library';
import { effectiveSplitHeight } from '../csg/lidSplit';

interface BlueprintModalProps {
  initialFace?: Face;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onClose: () => void;
}

const FACES: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export function BlueprintModal({
  initialFace = 'front',
  selectedFeatureId,
  onSelectFeature,
  onClose,
}: BlueprintModalProps) {
  const project = useProjectStore((s) => s.project);
  const updateFeature = useProjectStore((s) => s.updateFeature);

  const [activeFace, setActiveFace] = useState<Face>(initialFace);
  const [draggingFeatureId, setDraggingFeatureId] = useState<string | null>(null);
  const [smartGuides, setSmartGuides] = useState<{ axis: 'u' | 'v'; posMm: number; label: string }[]>([]);

  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFeatureId) {
          e.preventDefault();
          e.stopPropagation();
          onSelectFeature(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [selectedFeatureId, onSelectFeature, onClose]);

  const geom = bodyGeometry(project.body);
  const [sizeU, sizeV] = faceSize(activeFace, geom);

  const faceFeatures = project.features.filter((f) => f.face === activeFace);
  const featureBounds = faceFeatures.map((f) => getFeature2DBounds(f, sizeU, sizeV));

  // Canvas scaling & dimensions (padding 40px, scale to fit 600px width/height)
  const padding = 50;
  const canvasWidth = 640;
  const canvasHeight = 440;

  const scaleU = (canvasWidth - padding * 2) / sizeU;
  const scaleV = (canvasHeight - padding * 2) / sizeV;
  const scale = Math.min(scaleU, scaleV);

  const originX = canvasWidth / 2;
  const originY = canvasHeight / 2;

  // Convert face mm (u center 0, v center 0) to SVG pixel coordinates
  const mmToSvgX = (mmU: number) => originX + mmU * scale;
  const mmToSvgY = (mmV: number) => originY - mmV * scale; // inverted SVG Y

  const svgToMmU = (svgX: number) => (svgX - originX) / scale;
  const svgToMmV = (svgY: number) => (originY - svgY) / scale;

  const handleCanvasBackgroundMouseDown = (e: MouseEvent<SVGSVGElement>) => {
    if (e.target === e.currentTarget || (e.target as Element).tagName === 'rect' || (e.target as Element).tagName === 'line') {
      onSelectFeature(null);
    }
  };

  const handlePointerDown = (featId: string) => {
    onSelectFeature(featId);
    const feat = project.features.find((f) => f.id === featId);
    if (!feat?.locked) {
      setDraggingFeatureId(featId);
    }
  };

  const handlePointerMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!draggingFeatureId || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const rawMmU = svgToMmU(mouseX);
    const rawMmV = svgToMmV(mouseY);

    const rawU = Math.max(0, Math.min(1, 0.5 + rawMmU / sizeU));
    const rawV = Math.max(0, Math.min(1, 0.5 + rawMmV / sizeV));

    const otherBounds = featureBounds.filter((f) => f.id !== draggingFeatureId);
    const { nextU, nextV, activeGuideLines } = computeSmartSnap(rawU, rawV, sizeU, sizeV, otherBounds, 3.0 / scale);

    setSmartGuides(activeGuideLines);
    updateFeature(draggingFeatureId, { u: nextU, v: nextV });
  };

  const handlePointerUp = () => {
    setDraggingFeatureId(null);
    setSmartGuides([]);
  };

  const selectedFeature = project.features.find((f) => f.id === selectedFeatureId);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="blueprint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="blueprint-header">
          <div className="blueprint-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6fd3ff" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9M15 21V9" />
            </svg>
            <h3>2D Face Blueprint Editor</h3>
            <span className="face-dim-chip">{sizeU.toFixed(1)} × {sizeV.toFixed(1)} mm</span>
          </div>

          <div className="blueprint-face-tabs">
            {FACES.map((f) => (
              <button
                key={f}
                type="button"
                className={`btn-face-tab ${activeFace === f ? 'active' : ''}`}
                onClick={() => setActiveFace(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="blueprint-canvas-area">
          {selectedFeature && selectedFeature.face === activeFace && (
            <div className="blueprint-selected-bar">
              <div className="selected-feat-info">
                <span className="selected-feat-name">{selectedFeature.type}</span>
                {selectedFeature.locked && (
                  <span className="locked-badge">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Locked</span>
                  </span>
                )}
              </div>
              <div className="selected-feat-actions">
                <button
                  type="button"
                  className={`blueprint-action-btn ${selectedFeature.locked ? 'active-locked' : ''}`}
                  onClick={() => updateFeature(selectedFeature.id, { locked: !selectedFeature.locked })}
                  title={selectedFeature.locked ? 'Unlock feature 2D dragging' : 'Lock feature 2D dragging'}
                >
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="6" width="10" height="8" rx="2" />
                    <path d={selectedFeature.locked ? "M5 6V4a3 3 0 016 0v2" : "M5 6V4a3 3 0 016 0"} />
                  </svg>
                  <span>{selectedFeature.locked ? 'Unlock' : 'Lock'}</span>
                </button>
                <button
                  type="button"
                  className="blueprint-action-btn btn-deselect"
                  onClick={() => onSelectFeature(null)}
                  title="Deselect feature (Esc)"
                >
                  <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l10 10M13 3L3 13" />
                  </svg>
                  <span>Deselect</span>
                </button>
              </div>
            </div>
          )}

          <svg
            ref={svgRef}
            className="blueprint-svg"
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
            onMouseDown={handleCanvasBackgroundMouseDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
          >
            {/* Background CAD grid pattern */}
            <defs>
              <pattern id="grid5mm" width={5 * scale} height={5 * scale} patternUnits="userSpaceOnUse">
                <path d={`M ${5 * scale} 0 L 0 0 0 ${5 * scale}`} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="0.5" />
              </pattern>
              <pattern id="grid20mm" width={20 * scale} height={20 * scale} patternUnits="userSpaceOnUse">
                <rect width={20 * scale} height={20 * scale} fill="url(#grid5mm)" />
                <path d={`M ${20 * scale} 0 L 0 0 0 ${20 * scale}`} fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="1" />
              </pattern>
            </defs>

            {/* Grid overlay */}
            <rect width={canvasWidth} height={canvasHeight} fill="#0d1117" />
            <rect width={canvasWidth} height={canvasHeight} fill="url(#grid20mm)" />

            {/* Wall Face Outer Bounds */}
            <rect
              x={mmToSvgX(-sizeU / 2)}
              y={mmToSvgY(sizeV / 2)}
              width={sizeU * scale}
              height={sizeV * scale}
              fill="rgba(111, 211, 255, 0.03)"
              stroke="#6fd3ff"
              strokeWidth="2"
              rx="4"
            />

            {/* Face Centerlines (U=0, V=0) */}
            <line x1={mmToSvgX(-sizeU / 2)} y1={originY} x2={mmToSvgX(sizeU / 2)} y2={originY} stroke="rgba(111, 211, 255, 0.25)" strokeDasharray="4,4" />
            <line x1={originX} y1={mmToSvgY(-sizeV / 2)} x2={originX} y2={mmToSvgY(sizeV / 2)} stroke="rgba(111, 211, 255, 0.25)" strokeDasharray="4,4" />

            {/* Lid Seam Line (splitHeight) on lateral faces */}
            {(activeFace === 'front' || activeFace === 'back' || activeFace === 'left' || activeFace === 'right') && (() => {
              const split = effectiveSplitHeight(project.body);
              const seamV_mm = split - sizeV / 2;
              const seamY_svg = mmToSvgY(seamV_mm);
              return (
                <g key="lid-seam">
                  <line
                    x1={mmToSvgX(-sizeU / 2)}
                    y1={seamY_svg}
                    x2={mmToSvgX(sizeU / 2)}
                    y2={seamY_svg}
                    stroke="#ff007f"
                    strokeWidth="1.5"
                    strokeDasharray="6,4"
                  />
                  <text
                    x={mmToSvgX(sizeU / 2) - 110}
                    y={seamY_svg - 6}
                    fill="#ff007f"
                    fontSize="10"
                    fontWeight="700"
                  >
                    LID SEAM ({split.toFixed(1)} mm)
                  </text>
                </g>
              );
            })()}

            {/* Active Smart Snap Guide Lines */}
            {smartGuides.map((guide, idx) => {
              if (guide.axis === 'u') {
                const x = mmToSvgX(guide.posMm);
                return (
                  <g key={idx}>
                    <line x1={x} y1={mmToSvgY(-sizeV / 2)} x2={x} y2={mmToSvgY(sizeV / 2)} stroke="#00ffff" strokeWidth="1.5" strokeDasharray="3,3" />
                    <text x={x + 4} y={mmToSvgY(sizeV / 2) - 8} fill="#00ffff" fontSize="10" fontWeight="bold">
                      {guide.label}
                    </text>
                  </g>
                );
              }
              const y = mmToSvgY(guide.posMm);
              return (
                <g key={idx}>
                  <line x1={mmToSvgX(-sizeU / 2)} y1={y} x2={mmToSvgX(sizeU / 2)} y2={y} stroke="#00ffff" strokeWidth="1.5" strokeDasharray="3,3" />
                  <text x={mmToSvgX(-sizeU / 2) + 6} y={y - 4} fill="#00ffff" fontSize="10" fontWeight="bold">
                    {guide.label}
                  </text>
                </g>
              );
            })}

            {/* Placed Features 2D Shapes & Sub-CAD Geometry */}
            {featureBounds.map((feat) => {
              if (feat.hidden) return null;
              const isSelected = feat.id === selectedFeatureId;
              const x = mmToSvgX(feat.centerMmU);
              const y = mmToSvgY(feat.centerMmV);
              const h = feat.heightMm * scale;

              return (
                <g key={feat.id}>
                  {/* Selected Feature CAD Extension Dimension Lines */}
                  {isSelected && (() => {
                    const leftEdgeX = mmToSvgX(-sizeU / 2);
                    const bottomEdgeY = mmToSvgY(-sizeV / 2);
                    const distX_mm = (feat.centerMmU + sizeU / 2).toFixed(1);
                    const distY_mm = (feat.centerMmV + sizeV / 2).toFixed(1);

                    return (
                      <g key="dim-callouts">
                        {/* Extension line to left edge */}
                        <line x1={leftEdgeX} y1={y} x2={x} y2={y} stroke="#ffc107" strokeWidth="1" strokeDasharray="3,3" />
                        <rect x={(leftEdgeX + x) / 2 - 24} y={y - 14} width="48" height="14" rx="3" fill="rgba(10, 14, 20, 0.85)" stroke="#ffc107" strokeWidth="0.8" />
                        <text x={(leftEdgeX + x) / 2} y={y - 4} textAnchor="middle" fill="#ffc107" fontSize="9" fontWeight="700">
                          X: {distX_mm}mm
                        </text>

                        {/* Extension line to bottom edge */}
                        <line x1={x} y1={bottomEdgeY} x2={x} y2={y} stroke="#ffc107" strokeWidth="1" strokeDasharray="3,3" />
                        <rect x={x + 6} y={(bottomEdgeY + y) / 2 - 7} width="48" height="14" rx="3" fill="rgba(10, 14, 20, 0.85)" stroke="#ffc107" strokeWidth="0.8" />
                        <text x={x + 30} y={(bottomEdgeY + y) / 2 + 3} textAnchor="middle" fill="#ffc107" fontSize="9" fontWeight="700">
                          Y: {distY_mm}mm
                        </text>
                      </g>
                    );
                  })()}

                  <g
                    transform={`translate(${x}, ${y}) rotate(${feat.rotationDeg})`}
                    style={{ cursor: feat.locked ? 'pointer' : 'move' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handlePointerDown(feat.id);
                    }}
                  >
                    {renderFeatureCadShapes(feat, scale, isSelected)}
                    <circle cx="0" cy="0" r={2.5} fill={isSelected ? '#00ffff' : '#a0aec0'} />
                    <text x="0" y={h / 2 + 12} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600">
                      {feat.label}
                    </text>
                    {feat.locked && (
                      <g transform={`translate(${feat.widthMm * scale / 2 + 6}, -6)`}>
                        <circle cx="0" cy="0" r="7" fill="rgba(10, 14, 20, 0.85)" stroke="#ffaa00" strokeWidth="1" />
                        <path d="M-2.5 -0.5 h5 v4 h-5 z M-1.5 -0.5 v-2 a1.5 1.5 0 0 1 3 0 v2" fill="none" stroke="#ffaa00" strokeWidth="1" />
                      </g>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="blueprint-footer">
          <span className="blueprint-hint">Click &amp; drag features to position. Click canvas or press Esc to deselect.</span>
          <button
            type="button"
            className="btn-done-edit"
            onClick={() => {
              onSelectFeature(null);
              onClose();
            }}
          >
            Done Editing
          </button>
        </div>
      </div>
    </div>
  );
}

function renderFeatureCadShapes(feat: Feature2DBounds, scale: number, isSelected: boolean) {
  const { feature, widthMm, heightMm } = feat;
  const strokeColor = isSelected ? '#00ffff' : 'rgba(255, 255, 255, 0.7)';
  const fillColor = isSelected ? 'rgba(0, 229, 255, 0.18)' : 'rgba(255, 255, 255, 0.05)';

  if (feature.type === 'vent' && feature.vent) {
    const { pattern, areaWidth, areaHeight, slotWidth, slotSpacing } = feature.vent;
    const aw = areaWidth * scale;
    const ah = areaHeight * scale;
    const sw = (slotWidth || 3) * scale;
    const ss = (slotSpacing || 3) * scale;

    if (pattern === 'slots') {
      const pitch = sw + ss;
      const count = Math.max(1, Math.floor((aw + ss) / pitch));
      const totalSpan = count * sw + (count - 1) * ss;
      const startX = -totalSpan / 2;

      const slots = [];
      for (let i = 0; i < count; i++) {
        const sx = startX + i * pitch;
        slots.push(
          <rect
            key={i}
            x={sx}
            y={-ah / 2}
            width={sw}
            height={ah}
            rx={sw / 2}
            fill="rgba(111, 211, 255, 0.25)"
            stroke={strokeColor}
            strokeWidth="1"
          />
        );
      }
      return (
        <g>
          <rect x={-aw / 2} y={-ah / 2} width={aw} height={ah} fill="rgba(0, 229, 255, 0.05)" stroke="rgba(111, 211, 255, 0.4)" strokeDasharray="3,3" rx="3" />
          {slots}
        </g>
      );
    }
  }

  if (feature.type === 'external-mount' && feature.mount) {
    const { width, protrusion, holeDiameter } = feature.mount;
    const w = width * scale;
    const p = protrusion * scale;
    const hd = (holeDiameter || 3.5) * scale;
    return (
      <g>
        <rect x={-w / 2} y={-p / 2} width={w} height={p} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" rx="3" />
        <circle cx="0" cy="0" r={hd / 2} fill="rgba(10, 14, 20, 0.8)" stroke="#ffaa00" strokeWidth="1.5" />
      </g>
    );
  }

  if (feature.type === 'connector-cutout' && feature.connectorId) {
    const entry = findConnector(feature.connectorId);
    const w = widthMm * scale;
    const h = heightMm * scale;
    if (entry?.holeShape === 'circle') {
      return (
        <g>
          <circle cx="0" cy="0" r={w / 2} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
          <line x1={-w / 2} y1="0" x2={w / 2} y2="0" stroke={strokeColor} strokeWidth="0.5" strokeDasharray="2,2" />
          <line x1="0" y1={-w / 2} x2="0" y2={w / 2} stroke={strokeColor} strokeWidth="0.5" strokeDasharray="2,2" />
        </g>
      );
    }
    return (
      <g>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={Math.min(w, h) * 0.15} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
      </g>
    );
  }

  if (feature.type === 'standoff' && feature.standoff) {
    const od = feature.standoff.outerDiameter * scale;
    const id = feature.standoff.screwHoleDiameter * scale;
    return (
      <g>
        <circle cx="0" cy="0" r={od / 2} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" />
        <circle cx="0" cy="0" r={id / 2} fill="rgba(10, 14, 20, 0.9)" stroke="#00ffff" strokeWidth="1" />
      </g>
    );
  }

  if (feature.type === 'fan-mount' && feature.fan) {
    const s = feature.fan.size * scale;
    const pitch = feature.fan.holePitch * scale;
    const hd = feature.fan.screwHoleDiameter * scale;
    return (
      <g>
        <rect x={-s / 2} y={-s / 2} width={s} height={s} fill={fillColor} stroke={strokeColor} strokeWidth="1.5" rx="3" />
        <circle cx="0" cy="0" r={s * 0.4} fill="none" stroke={strokeColor} strokeWidth="1" strokeDasharray="3,3" />
        <circle cx={-pitch / 2} cy={-pitch / 2} r={hd / 2} fill="rgba(10, 14, 20, 0.9)" stroke="#ffaa00" strokeWidth="1" />
        <circle cx={pitch / 2} cy={-pitch / 2} r={hd / 2} fill="rgba(10, 14, 20, 0.9)" stroke="#ffaa00" strokeWidth="1" />
        <circle cx={-pitch / 2} cy={pitch / 2} r={hd / 2} fill="rgba(10, 14, 20, 0.9)" stroke="#ffaa00" strokeWidth="1" />
        <circle cx={pitch / 2} cy={pitch / 2} r={hd / 2} fill="rgba(10, 14, 20, 0.9)" stroke="#ffaa00" strokeWidth="1" />
      </g>
    );
  }

  // Generic CAD bounding rectangle
  const w = widthMm * scale;
  const h = heightMm * scale;
  return (
    <rect
      x={-w / 2}
      y={-h / 2}
      width={w}
      height={h}
      fill={fillColor}
      stroke={strokeColor}
      strokeWidth={isSelected ? 2 : 1}
      rx="3"
    />
  );
}
