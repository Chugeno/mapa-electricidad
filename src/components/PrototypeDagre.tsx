import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Node,
  useReactFlow,
  Viewport
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Search, X, ChevronDown, Check } from 'lucide-react';
import { TopologyData, TelemetryData } from '../types';

// ============================================================================
// 1. ESCALAS TÉCNICAS CALIBRADAS Y ORDEN ESTRICTO DE TENSIONES (MAYOR A MENOR)
// ============================================================================
export const VOLTAGE_ORDER: number[] = [500, 220, 132, 33, 13.2];

export const VOLTAGE_CONFIG: Record<number, { color: string; width: number; displayKv: string; label: string }> = {
  500:  { color: '#C04A35', width: 4.6, displayKv: '500 kV',  label: '500 kV · Extra Alta Tensión (Troncal Nacional)' },
  220:  { color: '#3E725C', width: 3.5, displayKv: '220 kV',  label: '220 kV · Alta Tensión Regional' },
  132:  { color: '#356382', width: 2.5, displayKv: '132 kV',  label: '132 kV · Subtransmisión Provincial' },
  33:   { color: '#9C7A3C', width: 1.9, displayKv: '33 kV',   label: '33 kV · Media Tensión Primaria' },
  13.2: { color: '#7A5C61', width: 1.5, displayKv: '13,2 kV', label: '13,2 / 6,6 kV · Distribución Urbana y Rural' }
};

export function normalizeKvKey(kv: number): number {
  if (kv >= 400) return 500;
  if (kv >= 200) return 220;
  if (kv >= 100) return 132;
  if (kv >= 25) return 33;
  return 13.2;
}

export function formatMilesEnteros(val: number): string {
  return Math.round(val || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

export function formatDecimalAr(val: number, decimals = 2): string {
  return (val || 0).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function getAnimationDuration(amperes: number): string {
  const clamped = Math.max(80, Math.min(2400, amperes));
  const ratio = (clamped - 80) / (2400 - 80);
  const seconds = 2.3 - ratio * 1.82;
  return `${seconds.toFixed(2)}s`;
}

export function getSpeedBucket(amperes: number): 'fast' | 'med' | 'slow' {
  if (amperes >= 900) return 'fast';
  if (amperes >= 360) return 'med';
  return 'slow';
}

const SPEED_PX_PER_SEC: Record<'fast' | 'med' | 'slow', number> = {
  fast: 72,
  med: 40,
  slow: 22
};

const MAP_SCALE = 1.85;
const PLANO_LOD_ZOOM = 0.25;
const MAP_LOD_ZOOM = 0.38;

const BOX_SIZE = 124;
const HALF_BOX = 62;
const COL_PITCH = 280; // 124px caja + 156px calle vertical libre entre columnas
const ROW_PITCH = 340; // 124px caja + 216px avenida horizontal libre entre filas

// ============================================================================
// 2. ICONOS VECTORIALES PRE-COMPILADOS EN PATH2D (COORDENADAS 24x24 LUCIDE)
// ============================================================================
export type NodeRole = 'GEN' | 'ET500' | 'ET132' | 'DIST' | 'COOP';
export type IconKind = 'hydro' | 'nuclear' | 'solar' | 'wind' | 'thermal' | 'biomass' | 'et500' | 'et132' | 'dist' | 'coop';

const ICON_SVG_PATHS: Record<IconKind, string> = {
  hydro: 'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  nuclear:
    'M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z M6.3 6.3c3.1-3.1 8.2-3.1 11.4 0 3.1 3.1 3.1 8.2 0 11.4-3.1 3.1-8.2 3.1-11.4 0-3.1-3.1-3.1-8.2 0-11.4z M4 12h16 M12 4v16',
  solar:
    'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41',
  wind: 'M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2 M9.6 4.6A2 2 0 1 1 11 8H2 M12.6 19.4A2 2 0 1 0 14 16H2',
  thermal:
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  biomass:
    'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12',
  et500: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  et132:
    'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4',
  dist: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4',
  coop:
    'M 7.5 3 L 10.5 7.5 H 8.8 L 11.8 12 H 9.8 L 13 17 H 8.5 V 21 H 6.5 V 17 H 2 L 5.2 12 H 3.2 L 6.2 7.5 H 4.5 Z M 16.5 3 L 19.5 7.5 H 17.8 L 20.8 12 H 18.8 L 22 17 H 17.5 V 21 H 15.5 V 17 H 11 L 14.2 12 H 12.2 L 15.2 7.5 H 13.5 Z'
};

let cachedIconPath2D: Record<IconKind, Path2D> | null = null;
function getIconPaths(): Record<IconKind, Path2D> {
  if (!cachedIconPath2D && typeof Path2D !== 'undefined') {
    cachedIconPath2D = {
      hydro: new Path2D(ICON_SVG_PATHS.hydro),
      nuclear: new Path2D(ICON_SVG_PATHS.nuclear),
      solar: new Path2D(ICON_SVG_PATHS.solar),
      wind: new Path2D(ICON_SVG_PATHS.wind),
      thermal: new Path2D(ICON_SVG_PATHS.thermal),
      biomass: new Path2D(ICON_SVG_PATHS.biomass),
      et500: new Path2D(ICON_SVG_PATHS.et500),
      et132: new Path2D(ICON_SVG_PATHS.et132),
      dist: new Path2D(ICON_SVG_PATHS.dist),
      coop: new Path2D(ICON_SVG_PATHS.coop)
    };
  }
  return cachedIconPath2D!;
}

// ============================================================================
// 3. TRAZADOS GEOMÉTRICOS INDIVIDUALES Y PUNTOS PARA HIT-TESTING RÁPIDO
// ============================================================================
function buildCurvedMapGeometry(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  curvatureOffset = 0.15
): { d: string; pts: [number, number][] } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const bend = Math.min(90, len * curvatureOffset);

  const cx1 = x1 + dx * 0.33 + nx * bend;
  const cy1 = y1 + dy * 0.33 + ny * bend;
  const cx2 = x1 + dx * 0.66 + nx * bend;
  const cy2 = y1 + dy * 0.66 + ny * bend;

  const mx = x1 + dx * 0.5 + nx * bend * 0.75;
  const my = y1 + dy * 0.5 + ny * bend * 0.75;

  return {
    d: `M ${x1.toFixed(1)},${y1.toFixed(1)} C ${cx1.toFixed(1)},${cy1.toFixed(1)} ${cx2.toFixed(1)},${cy2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`,
    pts: [
      [x1, y1],
      [mx, my],
      [x2, y2]
    ]
  };
}

// Asignación de canales por coloreo de grafos de intervalos (Left-Edge Algorithm)
// Garantiza matemáticamente 0 superposiciones colineales entre cables paralelos
function assignTracks(
  intervals: { id: string; min: number; max: number }[],
  minGap = 16
): { assignments: Map<string, number>; totalTracks: number } {
  const sorted = [...intervals].sort((a, b) => a.min - b.min || a.max - b.max);
  const trackEnds: number[] = [];
  const assignments = new Map<string, number>();

  for (const item of sorted) {
    let placed = false;
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] + minGap <= item.min) {
        trackEnds[t] = item.max;
        assignments.set(item.id, t);
        placed = true;
        break;
      }
    }
    if (!placed) {
      assignments.set(item.id, trackEnds.length);
      trackEnds.push(item.max);
    }
  }
  return { assignments, totalTracks: trackEnds.length };
}

function buildStreetAvenueGeometry(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  isHorizontal: boolean,
  isAdjacent: boolean,
  bendOrDepCoord: number,
  arrCoord: number,
  streetCoord: number
): { d: string; pts: [number, number][] } {
  if (!isHorizontal) {
    if (isAdjacent) {
      const bendY = bendOrDepCoord;
      const dx = tx - sx;
      if (Math.abs(dx) < 1) {
        return {
          d: `M ${sx.toFixed(1)},${sy.toFixed(1)} L ${tx.toFixed(1)},${ty.toFixed(1)}`,
          pts: [
            [sx, sy],
            [tx, ty]
          ]
        };
      }
      const r = Math.min(6, Math.abs(dx) / 2, Math.abs(bendY - sy) / 2, Math.abs(ty - bendY) / 2);
      const dirX = dx >= 0 ? 1 : -1;
      return {
        d: [
          `M ${sx.toFixed(1)},${sy.toFixed(1)}`,
          `L ${sx.toFixed(1)},${(bendY - r).toFixed(1)}`,
          `Q ${sx.toFixed(1)},${bendY.toFixed(1)} ${(sx + dirX * r).toFixed(1)},${bendY.toFixed(1)}`,
          `L ${(tx - dirX * r).toFixed(1)},${bendY.toFixed(1)}`,
          `Q ${tx.toFixed(1)},${bendY.toFixed(1)} ${tx.toFixed(1)},${(bendY + r).toFixed(1)}`,
          `L ${tx.toFixed(1)},${ty.toFixed(1)}`
        ].join(' '),
        pts: [
          [sx, sy],
          [sx, bendY],
          [tx, bendY],
          [tx, ty]
        ]
      };
    }

    const y1 = bendOrDepCoord;
    const y2 = arrCoord;
    const xs = streetCoord;

    const r1 = Math.min(6, Math.abs(xs - sx) / 2, Math.abs(y1 - sy) / 2);
    const r2 = Math.min(6, Math.abs(xs - sx) / 2, Math.abs(y2 - y1) / 2);
    const r3 = Math.min(6, Math.abs(tx - xs) / 2, Math.abs(y2 - y1) / 2);
    const r4 = Math.min(6, Math.abs(tx - xs) / 2, Math.abs(ty - y2) / 2);

    const dirX1 = xs >= sx ? 1 : -1;
    const dirX2 = tx >= xs ? 1 : -1;
    const dirY = y2 >= y1 ? 1 : -1;
    const dirArr = ty >= y2 ? 1 : -1;

    return {
      d: [
        `M ${sx.toFixed(1)},${sy.toFixed(1)}`,
        `L ${sx.toFixed(1)},${(y1 - r1).toFixed(1)}`,
        `Q ${sx.toFixed(1)},${y1.toFixed(1)} ${(sx + dirX1 * r1).toFixed(1)},${y1.toFixed(1)}`,
        `L ${(xs - dirX1 * r2).toFixed(1)},${y1.toFixed(1)}`,
        `Q ${xs.toFixed(1)},${y1.toFixed(1)} ${xs.toFixed(1)},${(y1 + dirY * r2).toFixed(1)}`,
        `L ${xs.toFixed(1)},${(y2 - dirY * r3).toFixed(1)}`,
        `Q ${xs.toFixed(1)},${y2.toFixed(1)} ${(xs + dirX2 * r3).toFixed(1)},${y2.toFixed(1)}`,
        `L ${(tx - dirX2 * r4).toFixed(1)},${y2.toFixed(1)}`,
        `Q ${tx.toFixed(1)},${y2.toFixed(1)} ${tx.toFixed(1)},${(y2 + dirArr * r4).toFixed(1)}`,
        `L ${tx.toFixed(1)},${ty.toFixed(1)}`
      ].join(' '),
      pts: [
        [sx, sy],
        [sx, y1],
        [xs, y1],
        [xs, y2],
        [tx, y2],
        [tx, ty]
      ]
    };
  } else {
    if (isAdjacent) {
      const bendX = bendOrDepCoord;
      const dy = ty - sy;
      if (Math.abs(dy) < 1) {
        return {
          d: `M ${sx.toFixed(1)},${sy.toFixed(1)} L ${tx.toFixed(1)},${ty.toFixed(1)}`,
          pts: [
            [sx, sy],
            [tx, ty]
          ]
        };
      }
      const r = Math.min(6, Math.abs(dy) / 2, Math.abs(bendX - sx) / 2, Math.abs(tx - bendX) / 2);
      const dirY = dy >= 0 ? 1 : -1;
      return {
        d: [
          `M ${sx.toFixed(1)},${sy.toFixed(1)}`,
          `L ${(bendX - r).toFixed(1)},${sy.toFixed(1)}`,
          `Q ${bendX.toFixed(1)},${sy.toFixed(1)} ${bendX.toFixed(1)},${(sy + dirY * r).toFixed(1)}`,
          `L ${bendX.toFixed(1)},${(ty - dirY * r).toFixed(1)}`,
          `Q ${bendX.toFixed(1)},${ty.toFixed(1)} ${(bendX + r).toFixed(1)},${ty.toFixed(1)}`,
          `L ${tx.toFixed(1)},${ty.toFixed(1)}`
        ].join(' '),
        pts: [
          [sx, sy],
          [bendX, sy],
          [bendX, ty],
          [tx, ty]
        ]
      };
    }

    const x1 = bendOrDepCoord;
    const x2 = arrCoord;
    const ys = streetCoord;

    const r1 = Math.min(6, Math.abs(x1 - sx) / 2, Math.abs(ys - sy) / 2);
    const r2 = Math.min(6, Math.abs(x2 - x1) / 2, Math.abs(ys - sy) / 2);
    const r3 = Math.min(6, Math.abs(x2 - x1) / 2, Math.abs(ty - ys) / 2);
    const r4 = Math.min(6, Math.abs(tx - x2) / 2, Math.abs(ty - ys) / 2);

    const dirY1 = ys >= sy ? 1 : -1;
    const dirY2 = ty >= ys ? 1 : -1;
    const dirX = x2 >= x1 ? 1 : -1;
    const dirArr = tx >= x2 ? 1 : -1;

    return {
      d: [
        `M ${sx.toFixed(1)},${sy.toFixed(1)}`,
        `L ${(x1 - r1).toFixed(1)},${sy.toFixed(1)}`,
        `Q ${x1.toFixed(1)},${sy.toFixed(1)} ${x1.toFixed(1)},${(sy + dirY1 * r1).toFixed(1)}`,
        `L ${x1.toFixed(1)},${(ys - dirY1 * r2).toFixed(1)}`,
        `Q ${x1.toFixed(1)},${ys.toFixed(1)} ${(x1 + dirX * r2).toFixed(1)},${ys.toFixed(1)}`,
        `L ${(x2 - dirX * r3).toFixed(1)},${ys.toFixed(1)}`,
        `Q ${x2.toFixed(1)},${ys.toFixed(1)} ${x2.toFixed(1)},${(ys + dirY2 * r3).toFixed(1)}`,
        `L ${x2.toFixed(1)},${(ty - dirY2 * r4).toFixed(1)}`,
        `Q ${x2.toFixed(1)},${ty.toFixed(1)} ${(x2 + dirArr * r4).toFixed(1)},${ty.toFixed(1)}`,
        `L ${tx.toFixed(1)},${ty.toFixed(1)}`
      ].join(' '),
      pts: [
        [sx, sy],
        [x1, sy],
        [x1, ys],
        [x2, ys],
        [x2, ty],
        [tx, ty]
      ]
    };
  }
}

function distToSegmentSq(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return (px - projX) * (px - projX) + (py - projY) * (py - projY);
}

// ============================================================================
// 4. TIPOS INTERNOS DEL GRAFO SADI
// ============================================================================
export interface GridNodeData extends Record<string, unknown> {
  uid: string;
  label: string;
  shortTitle1: string;
  shortTitle2: string;
  code: string;
  role: NodeRole;
  roleBadge: string;
  roleDesc: string;
  typeName: string;
  tecnologia?: string;
  iconKind: IconKind;
  voltageKv: number;
  kvText: string;
  powerMwNum: number;
  powerMw: string;
  amperes: number;
  region: string;
  provincia: string;
  operator: string;
  mapX: number;
  mapY: number;
  x: number;
  y: number;
  labelSide: 'left' | 'right';
  isDirectMatch?: boolean;
  isDimmed?: boolean;
}

export interface GridEdgeData extends Record<string, unknown> {
  id: string;
  source: string;
  target: string;
  kv: number;
  amperes: number;
  mw: string;
  parallelCount: number;
  fromName: string;
  toName: string;
  empresa: string;
  region: string;
  curvature?: number;
  laneHash?: number;
  isDimmed?: boolean;
}

export interface ComputedCableGeometry {
  edge: GridEdgeData;
  kvKey: number;
  speedBucket: 'fast' | 'med' | 'slow';
  d: string;
  pts: [number, number][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  path2D?: Path2D;
}

// Partir nombres largos en hasta 2 líneas limpias para las cajas de 124x124px en Canvas
function splitStationTitle(label: string): [string, string] {
  const clean = (label || '').trim();
  if (clean.length <= 16) return [clean, ''];
  const words = clean.split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= 16 || !line1) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  if (line2.length > 17) {
    line2 = line2.slice(0, 15) + '…';
  }
  return [line1, line2];
}

// Nodo fantasma invisible 1x1px para que fitView de ReactFlow encuadre el área exacta con CERO costo DOM
const BoundsMarkerNode: React.FC = () => (
  <div style={{ width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
);
const nodeTypes = { bounds: BoundsMarkerNode };

// ============================================================================
// 5. CONSTRUCCIÓN DEL GRAFO NACIONAL COMPLETO (830 PARTICIPANTES + 1.122 CABLES)
// ============================================================================
const REGION_ORDER: Record<string, number> = {
  NOA: 0,
  NEA: 1,
  Cuyo: 2,
  Centro: 3,
  Litoral: 4,
  GBA: 5,
  BAS: 5,
  Comahue: 6,
  Patagonia: 7
};

function mapTechToIcon(tech?: string): IconKind {
  switch (tech) {
    case 'Hidroeléctrica':
      return 'hydro';
    case 'Nuclear':
      return 'nuclear';
    case 'Solar':
      return 'solar';
    case 'Eólica':
      return 'wind';
    case 'Biomasa':
      return 'biomass';
    default:
      return 'thermal';
  }
}

function buildMasterDataset(topology: TopologyData | null): {
  allNodes: GridNodeData[];
  allEdges: GridEdgeData[];
} {
  if (!topology || !topology.centrales || !topology.eett) {
    return { allNodes: [], allEdges: [] };
  }

  const rawNodes: GridNodeData[] = [];

  topology.centrales.forEach((c, idx) => {
    const uid = c.uid || `GEN_${c.id}_${idx}`;
    const kv = normalizeKvKey(c.tension_kv || 132);
    const mw = Math.round(c.potencia_mw || 45);
    const amp = Math.max(85, Math.round((mw * 1000) / (1.732 * kv * 0.92)));
    const reg = c.region === 'BAS' ? 'GBA' : c.region || 'Centro';
    const [t1, t2] = splitStationTitle(c.nombre);

    const techUpper = (c.tecnologia || '').toUpperCase();
    const roleBadge = techUpper ? `GENERACIÓN · ${techUpper}` : 'GENERACIÓN';
    const roleDesc = `Generación Eléctrica (${c.tecnologia || 'Central'})`;

    rawNodes.push({
      uid,
      label: c.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${c.id} · ${c.tecnologia.toUpperCase()}`,
      role: 'GEN',
      roleBadge,
      roleDesc,
      typeName: `1. Generación (${c.tecnologia})`,
      tecnologia: c.tecnologia,
      iconKind: mapTechToIcon(c.tecnologia),
      voltageKv: kv,
      kvText: VOLTAGE_CONFIG[kv]?.displayKv || `${kv} kV`,
      powerMwNum: mw,
      powerMw: `${formatMilesEnteros(mw)} MW`,
      amperes: amp,
      region: reg,
      provincia: c.provincia || reg,
      operator: c.agente || 'Generador MEM',
      mapX: c.geo[0] * MAP_SCALE,
      mapY: -c.geo[1] * MAP_SCALE,
      x: 0,
      y: 0,
      labelSide: idx % 2 === 0 ? 'right' : 'left'
    });
  });

  topology.eett.forEach((e, idx) => {
    const uid = e.uid || `EETT_${e.id}_${idx}`;
    const kv = normalizeKvKey(e.tension_kv || 132);
    const role: NodeRole = kv >= 500 ? 'ET500' : 'ET132';
    const mw = Math.round(e.potencia_mw || (kv >= 500 ? 450 : 120));
    const amp = Math.max(110, Math.round((mw * 1000) / (1.732 * kv * 0.92)));
    const reg = e.region === 'BAS' ? 'GBA' : e.region || 'Centro';
    const fullLabel = `ET ${e.nombre}`;
    const [t1, t2] = splitStationTitle(fullLabel);
    const roleBadge = role === 'ET500' ? 'EETT TRANSPORTE 500 kV' : 'EETT SUBTRANSMISIÓN';
    const roleDesc = role === 'ET500'
      ? 'Estación Transformadora Troncal (500 kV)'
      : `Estación Transformadora Subtransmisión (${kv} kV)`;

    rawNodes.push({
      uid,
      label: fullLabel,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${e.id} · EETT ${kv}KV`,
      role,
      roleBadge,
      roleDesc,
      typeName: role === 'ET500' ? '2. Transporte 500 kV' : '3. Subestación AT/MT',
      iconKind: role === 'ET500' ? 'et500' : 'et132',
      voltageKv: kv,
      kvText: VOLTAGE_CONFIG[kv]?.displayKv || `${kv} kV`,
      powerMwNum: mw,
      powerMw: `${formatMilesEnteros(mw)} MVA`,
      amperes: amp,
      region: reg,
      provincia: reg,
      operator: e.empresa || 'Transener',
      mapX: e.geo[0] * MAP_SCALE,
      mapY: -e.geo[1] * MAP_SCALE,
      x: 0,
      y: 0,
      labelSide: idx % 2 === 0 ? 'left' : 'right'
    });
  });

  (topology.distribuidoras || []).forEach((d, idx) => {
    const uid = d.uid || d.id;
    const kv = normalizeKvKey(d.tension_kv || 13.2);
    const mw = Math.round(d.potencia_mw || 300);
    const amp = Math.max(180, Math.round((mw * 1000) / (1.732 * 33 * 0.92)));
    const [t1, t2] = splitStationTitle(d.nombre);
    const roleBadge = 'DISTRIBUIDORA PROVINCIAL';
    const roleDesc = 'Distribución Eléctrica Provincial';

    rawNodes.push({
      uid,
      label: d.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${d.id} · DISTRIBUIDORA`,
      role: 'DIST',
      roleBadge,
      roleDesc,
      typeName: '4. Distribución Provincial',
      iconKind: 'dist',
      voltageKv: kv,
      kvText: VOLTAGE_CONFIG[kv]?.displayKv || '13,2 kV',
      powerMwNum: mw,
      powerMw: `${formatMilesEnteros(mw)} MW`,
      amperes: amp,
      region: d.region || 'Centro',
      provincia: d.provincia || d.region,
      operator: d.empresa,
      mapX: d.geo[0] * MAP_SCALE,
      mapY: -d.geo[1] * MAP_SCALE,
      x: 0,
      y: 0,
      labelSide: idx % 2 === 0 ? 'right' : 'left'
    });
  });

  (topology.cooperativas || []).forEach((c, idx) => {
    const uid = c.uid || c.id;
    const kv = normalizeKvKey(c.tension_kv || 13.2);
    const mw = Math.round(c.potencia_mw || 12);
    const amp = Math.max(90, Math.round((mw * 1000) / (1.732 * 13.2 * 0.92)));
    const [t1, t2] = splitStationTitle(c.nombre);
    const roleBadge = 'COOPERATIVA ELÉCTRICA';
    const roleDesc = 'Distribución Cooperativa (Media/Baja Tensión)';

    rawNodes.push({
      uid,
      label: c.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${c.id} · COOP`,
      role: 'COOP',
      roleBadge,
      roleDesc,
      typeName: '5. Cooperativa Eléctrica',
      iconKind: 'coop',
      voltageKv: kv,
      kvText: VOLTAGE_CONFIG[kv]?.displayKv || '13,2 kV',
      powerMwNum: mw,
      powerMw: `${formatMilesEnteros(mw)} MW`,
      amperes: amp,
      region: c.region || 'Centro',
      provincia: c.provincia || c.region,
      operator: c.nombre,
      mapX: c.geo[0] * MAP_SCALE,
      mapY: -c.geo[1] * MAP_SCALE,
      x: 0,
      y: 0,
      labelSide: idx % 2 === 0 ? 'right' : 'left'
    });
  });

  const occupiedCells = new Map<string, number>();
  const CELL = 26;
  rawNodes.forEach((n) => {
    const gx = Math.round(n.mapX / CELL);
    const gy = Math.round(n.mapY / CELL);
    const key = `${gx},${gy}`;
    const count = occupiedCells.get(key) || 0;
    occupiedCells.set(key, count + 1);
    if (count > 0) {
      const angle = count * 1.15;
      const radius = 22 + Math.floor(count / 5) * 18;
      n.mapX += Math.cos(angle) * radius;
      n.mapY += Math.sin(angle) * radius;
    }
  });

  const nodeByUid = new Map(rawNodes.map((n) => [n.uid, n]));

  const rawEdges: GridEdgeData[] = [];
  (topology.deduplicated_edges || []).forEach((e, idx) => {
    const src = nodeByUid.get(e.source);
    const tgt = nodeByUid.get(e.target);
    if (!src || !tgt) return;
    const kv = normalizeKvKey(e.voltageKv || 132);
    const mwEst = Math.min(src.powerMwNum, tgt.powerMwNum);
    const sign = idx % 2 === 0 ? 1 : -1;

    rawEdges.push({
      id: e.id || `E_${idx}`,
      source: src.uid,
      target: tgt.uid,
      kv,
      amperes: e.amperes || 320,
      mw: `${formatMilesEnteros(mwEst)} MW`,
      parallelCount: e.parallelCount || 1,
      fromName: src.label,
      toName: tgt.label,
      empresa: e.empresa || src.operator,
      region: e.region || src.region,
      curvature: sign * (0.1 + (idx % 4) * 0.03),
      laneHash: idx + 1
    });
  });

  return { allNodes: rawNodes, allEdges: rawEdges };
}

// ============================================================================
// 6. MOTOR DE LAYOUT + GEOMETRÍA PRE-CALCULADA PARA CANVAS 2D
// ============================================================================
function computeLayoutAndBatchedCables(
  masterNodes: GridNodeData[],
  masterEdges: GridEdgeData[],
  mode: 'DAGRE_LR' | 'DAGRE_TB' | 'BUSES' | 'MAP',
  filterKv: number[],
  filterRole: string[],
  filterRegion: string | null,
  filterTech: string[],
  searchQuery: string,
  telemetry: TelemetryData | null
) {
  const isMap = mode === 'MAP';
  const isBuses = mode === 'BUSES';
  const isHorizontal = mode === 'DAGRE_LR';
  const q = searchQuery.trim().toLowerCase();

  const getRegionFactor = (regionName: string): number => {
    if (!telemetry?.regions) return 1.0;
    const r = telemetry.regions[regionName];
    if (!r || !r.demanda_mw) return 1.0;
    if (r.demAyer && r.demAyer > 0) {
      return Math.max(0.75, Math.min(1.4, r.demanda_mw / r.demAyer));
    }
    return 1.0;
  };

  const hasKvFilter = filterKv.length > 0;
  const hasRoleFilter = filterRole.length > 0;
  const hasTechFilter = filterTech.length > 0;
  const hasRegionFilter = Boolean(isMap && filterRegion);
  const hasActiveFilter = Boolean(hasKvFilter || hasRoleFilter || hasRegionFilter || hasTechFilter || q);

  const directMatchUids = new Set<string>();
  masterNodes.forEach((n) => {
    if (hasRoleFilter && !filterRole.includes(n.role)) return;
    if (hasRegionFilter && n.region.toUpperCase() !== filterRegion!.toUpperCase()) return;
    if (hasTechFilter && (!n.tecnologia || !filterTech.includes(n.tecnologia))) return;
    if (hasKvFilter && !filterKv.includes(normalizeKvKey(n.voltageKv))) return;
    if (
      q &&
      !n.label.toLowerCase().includes(q) &&
      !n.provincia.toLowerCase().includes(q) &&
      !n.operator.toLowerCase().includes(q) &&
      !n.code.toLowerCase().includes(q)
    ) {
      return;
    }
    directMatchUids.add(n.uid);
  });

  // Determinar qué cables corresponden al filtro activo
  const activeEdgeIds = new Set<string>();
  masterEdges.forEach((e) => {
    const srcId = String(e.source);
    const tgtId = String(e.target);
    const edgeMatchesKv = !hasKvFilter || filterKv.includes(normalizeKvKey(e.kv));

    if (!hasActiveFilter) {
      activeEdgeIds.add(e.id);
      return;
    }

    if (hasKvFilter && !hasRoleFilter && !hasRegionFilter && !hasTechFilter && !q) {
      if (edgeMatchesKv) activeEdgeIds.add(e.id);
    } else {
      if (directMatchUids.has(srcId) || directMatchUids.has(tgtId)) {
        activeEdgeIds.add(e.id);
      }
    }
  });

  // Las estaciones iluminadas son las que coinciden directamente + sus contrapartes de intercambio
  const illuminatedNodeUids = new Set<string>();
  if (!hasActiveFilter) {
    masterNodes.forEach((n) => illuminatedNodeUids.add(n.uid));
  } else {
    directMatchUids.forEach((id) => illuminatedNodeUids.add(id));
    masterEdges.forEach((e) => {
      if (activeEdgeIds.has(e.id)) {
        illuminatedNodeUids.add(String(e.source));
        illuminatedNodeUids.add(String(e.target));
      }
    });
  }

  // POSICIONES PERMANENTES: En modo Plano Unifilar la cuadrícula nacional es FIJA y sagrada.
  // Ninguna estación ni cable se mueve de casillero al filtrar; solo se atenúan los elementos secundarios.
  const positions = new Map<string, { x: number; y: number }>();
  const busPlaques: { id: string; y: number; title: string; subtitle: string; kv: number; color: string }[] = [];

  const cableGeometries: ComputedCableGeometry[] = [];
  const baseDimmedByKv: Record<number, string[]> = { 500: [], 220: [], 132: [], 33: [], 13.2: [] };
  const baseActiveByKv: Record<number, string[]> = { 500: [], 220: [], 132: [], 33: [], 13.2: [] };
  const animActiveByKvSpeed: Record<string, { kv: number; speed: 'fast' | 'med' | 'slow'; paths: string[] }> = {};

  if (isBuses) {
    // ========================================================================
    // MODO PLANO COMPACTO POR BARRAS TRONCALES (BUSES SADI)
    // 4 Pisos estrictos:
    //   1. Generadoras (474 centrales arriba de todo)
    //   2. Transformación y Transporte (323 ETs al centro)
    //   3. Distribuidoras Provinciales (33 empresas)
    //   4. Cooperativas Eléctricas (580 cooperativas abajo de todo)
    // Cada grupo posee su propia Barra Troncal SCADA real, y cada estación
    // (en cualquier fila) posee un conductor continuo que entra o sale de ella.
    // Cero "barritas" muertas y cero cables flotantes en el aire.
    // ========================================================================
    const maxCols = 30;
    const COL_GAP = 26;
    const COL_PITCH = BOX_SIZE + COL_GAP; // 150px
    const ROW_GAP = 54;
    const ROW_PITCH = BOX_SIZE + ROW_GAP; // 178px
    const diagramW = 5100;

    const busYMap = new Map<string, number>();

    const registerSegment = (
      id: string,
      fromId: string,
      toId: string,
      kv: number,
      amperes: number,
      title: string,
      speed: 'fast' | 'med' | 'slow',
      d: string,
      pts: [number, number][],
      isDimmed: boolean
    ) => {
      const minX = Math.min(...pts.map((p) => p[0])) - 5;
      const minY = Math.min(...pts.map((p) => p[1])) - 5;
      const maxX = Math.max(...pts.map((p) => p[0])) + 5;
      const maxY = Math.max(...pts.map((p) => p[1])) + 5;
      const edge: GridEdgeData = {
        id,
        source: fromId,
        target: toId,
        kv,
        amperes,
        mw: title,
        parallelCount: 1,
        fromName: title,
        toName: title,
        empresa: 'SADI',
        region: 'Nacional',
        curvature: 0,
        laneHash: 1,
        isDimmed
      };
      cableGeometries.push({
        edge,
        kvKey: kv,
        speedBucket: speed,
        d,
        pts,
        minX,
        minY,
        maxX,
        maxY,
        path2D: typeof Path2D !== 'undefined' ? new Path2D(d) : undefined
      });
      if (isDimmed) {
        if (!baseDimmedByKv[kv]) baseDimmedByKv[kv] = [];
        baseDimmedByKv[kv].push(d);
      } else {
        if (!baseActiveByKv[kv]) baseActiveByKv[kv] = [];
        baseActiveByKv[kv].push(d);
        const bKey = `${kv}_${speed}`;
        if (!animActiveByKvSpeed[bKey]) animActiveByKvSpeed[bKey] = { kv, speed, paths: [] };
        animActiveByKvSpeed[bKey].paths.push(d);
      }
    };

    let currentY = 50;

    const createTrunkBus = (
      id: string,
      y: number,
      title: string,
      subtitle: string,
      kv: number
    ) => {
      busYMap.set(id, y);
      const cfg = VOLTAGE_CONFIG[kv] || VOLTAGE_CONFIG[132];
      busPlaques.push({ id, y, title, subtitle, kv, color: cfg.color });
      const dTrunk = `M 40,${y.toFixed(1)} L ${(diagramW - 40).toFixed(1)},${y.toFixed(1)}`;
      registerSegment(
        id,
        id,
        id,
        kv,
        1200,
        title,
        'fast',
        dTrunk,
        [
          [40, y],
          [diagramW - 40, y]
        ],
        filterKv.length > 0 && !filterKv.includes(kv)
      );
    };

    const connectBuses = (
      fromBusId: string,
      toBusId: string,
      kv: number,
      label: string,
      xs: number[]
    ) => {
      const fromY = busYMap.get(fromBusId);
      const toY = busYMap.get(toBusId);
      if (fromY === undefined || toY === undefined) return;

      const isDimmed = filterKv.length > 0 && !filterKv.includes(kv);
      const speed: 'fast' | 'med' | 'slow' = kv >= 500 ? 'fast' : kv >= 220 ? 'med' : 'slow';

      xs.forEach((x, idx) => {
        const d = `M ${x.toFixed(1)},${fromY.toFixed(1)} L ${x.toFixed(1)},${toY.toFixed(1)}`;
        const pts: [number, number][] = [
          [x, fromY],
          [x, toY]
        ];
        registerSegment(
          `TIE_${fromBusId}_${toBusId}_${idx}`,
          fromBusId,
          toBusId,
          kv,
          2400,
          label,
          speed,
          d,
          pts,
          isDimmed
        );
      });
    };

    // ------------------------------------------------------------------------
    // PLANO DE BARRAS: CASCADA FÍSICA Y ELÉCTRICA SADI POR NIVELES DE TENSIÓN
    // Organización por niveles reales del sistema:
    //   NIVEL 1 (500 kV): Centrales 500 kV -> BARRA TRONCAL 500 kV -> EETT 500 kV -> BARRA ENLACE
    //   NIVEL 2 (220 kV): Centrales 220 kV -> BARRA TRONCAL 220 kV -> EETT 220 kV -> BARRA ENLACE
    //   NIVEL 3 (132 kV): Centrales 132 kV -> BARRA SUBTRANSMISIÓN 132 kV -> EETT 132 kV -> BARRA ENLACE
    //   NIVEL 4 (33 kV):  Centrales 33 kV -> BARRA DISTRIBUCIÓN 33 kV -> Distribuidoras -> BARRA MEDIA TENSIÓN
    //   NIVEL 5 (13,2 kV): BARRA COOPERATIVAS 13,2 kV -> 580 Cooperativas
    // Cada barra tiene conductores de inyección desde arriba Y conductores de salida hacia abajo.
    // Cero barras muertas, cero extremos huérfanos. Flujo físico y continuo garantizado.
    // ------------------------------------------------------------------------

    // Helper para generar una sección de Generación que inyecta hacia abajo en una barra
    const renderGenSection = (
      nodes: GridNodeData[],
      busId: string,
      busTitle: string,
      busSubtitle: string,
      busKv: number
    ) => {
      if (nodes.length === 0) return;
      const numRows = Math.ceil(nodes.length / maxCols);
      const rowPositions: { rowY: number; offsetLeft: number; startIdx: number; endIdx: number }[] = [];

      for (let sr = 0; sr < numRows; sr++) {
        const startIdx = sr * maxCols;
        const endIdx = Math.min(nodes.length, (sr + 1) * maxCols);
        const count = endIdx - startIdx;
        const rowWidth = count * COL_PITCH - COL_GAP;
        const offsetLeft = Math.floor((diagramW - rowWidth) / 2);
        const rowY = currentY;
        rowPositions.push({ rowY, offsetLeft, startIdx, endIdx });

        for (let i = startIdx; i < endIdx; i++) {
          const n = nodes[i];
          const col = i - startIdx;
          const nodeX = offsetLeft + col * COL_PITCH;
          positions.set(n.uid, { x: nodeX, y: rowY });
        }
        currentY += ROW_PITCH;
      }

      const busY = currentY + 36;
      createTrunkBus(busId, busY, busTitle, busSubtitle, busKv);

      for (let sr = 0; sr < numRows; sr++) {
        const { rowY, offsetLeft, startIdx, endIdx } = rowPositions[sr];
        const isBottomRow = sr === numRows - 1;

        for (let i = startIdx; i < endIdx; i++) {
          const n = nodes[i];
          const col = i - startIdx;
          const nodeX = offsetLeft + col * COL_PITCH;
          const pinX = nodeX + HALF_BOX;
          const outY = rowY + BOX_SIZE;

          const isNodeDimmed = !illuminatedNodeUids.has(n.uid);
          const isDimmed = isNodeDimmed || (filterKv !== null && filterKv !== busKv);
          const factor = getRegionFactor(n.region);
          const liveAmps = Math.round(n.amperes * factor);
          const speed = getSpeedBucket(liveAmps);

          let d = '';
          const pts: [number, number][] = [];

          if (isBottomRow) {
            d = `M ${pinX.toFixed(1)},${outY.toFixed(1)} L ${pinX.toFixed(1)},${busY.toFixed(1)}`;
            pts.push([pinX, outY], [pinX, busY]);
          } else {
            const streetX = nodeX + BOX_SIZE + COL_GAP / 2;
            const midY = outY + 14;
            d = `M ${pinX.toFixed(1)},${outY.toFixed(1)} L ${pinX.toFixed(1)},${midY.toFixed(1)} L ${streetX.toFixed(1)},${midY.toFixed(1)} L ${streetX.toFixed(1)},${busY.toFixed(1)}`;
            pts.push([pinX, outY], [pinX, midY], [streetX, midY], [streetX, busY]);
          }

          registerSegment(
            `FEED_${n.uid}`,
            n.uid,
            busId,
            busKv,
            liveAmps,
            `Inyección ${n.label}`,
            speed,
            d,
            pts,
            isDimmed
          );
        }
      }

      currentY = busY + 70;
    };

    // Helper para generar una sección de Estaciones Transformadoras que recibe del bus superior y entrega al bus inferior
    const renderSubstationSection = (
      nodes: GridNodeData[],
      inBusId: string,
      inKv: number,
      outBusId: string,
      outBusTitle: string,
      outBusSubtitle: string,
      outKv: number
    ) => {
      if (nodes.length === 0) return;
      const numRows = Math.ceil(nodes.length / maxCols);
      const inBusY = busYMap.get(inBusId) || (currentY - 70);

      const rowPositions: { rowY: number; offsetLeft: number; startIdx: number; endIdx: number }[] = [];

      for (let sr = 0; sr < numRows; sr++) {
        const startIdx = sr * maxCols;
        const endIdx = Math.min(nodes.length, (sr + 1) * maxCols);
        const count = endIdx - startIdx;
        const rowWidth = count * COL_PITCH - COL_GAP;
        const offsetLeft = Math.floor((diagramW - rowWidth) / 2);
        const rowY = currentY;
        rowPositions.push({ rowY, offsetLeft, startIdx, endIdx });

        for (let i = startIdx; i < endIdx; i++) {
          const n = nodes[i];
          const col = i - startIdx;
          const nodeX = offsetLeft + col * COL_PITCH;
          positions.set(n.uid, { x: nodeX, y: rowY });
        }
        currentY += ROW_PITCH;
      }

      const outBusY = currentY + 36;
      createTrunkBus(outBusId, outBusY, outBusTitle, outBusSubtitle, outKv);

      for (let sr = 0; sr < numRows; sr++) {
        const { rowY, offsetLeft, startIdx, endIdx } = rowPositions[sr];
        const isTopRow = sr === 0;
        const isBottomRow = sr === numRows - 1;

        for (let i = startIdx; i < endIdx; i++) {
          const n = nodes[i];
          const col = i - startIdx;
          const nodeX = offsetLeft + col * COL_PITCH;
          const pinX = nodeX + HALF_BOX;
          const inY = rowY;
          const outY = rowY + BOX_SIZE;

          const isNodeDimmed = !illuminatedNodeUids.has(n.uid);
          const factor = getRegionFactor(n.region);
          const liveAmps = Math.round(n.amperes * factor);
          const speed = getSpeedBucket(liveAmps);

          // Entrada desde el bus superior
          const isDimmedIn = isNodeDimmed || (filterKv.length > 0 && !filterKv.includes(inKv));
          let dIn = '';
          const ptsIn: [number, number][] = [];

          if (isTopRow) {
            dIn = `M ${pinX.toFixed(1)},${inBusY.toFixed(1)} L ${pinX.toFixed(1)},${inY.toFixed(1)}`;
            ptsIn.push([pinX, inBusY], [pinX, inY]);
          } else {
            const streetX = nodeX + BOX_SIZE + COL_GAP / 2;
            const midY = inY - 14;
            dIn = `M ${streetX.toFixed(1)},${inBusY.toFixed(1)} L ${streetX.toFixed(1)},${midY.toFixed(1)} L ${pinX.toFixed(1)},${midY.toFixed(1)} L ${pinX.toFixed(1)},${inY.toFixed(1)}`;
            ptsIn.push([streetX, inBusY], [streetX, midY], [pinX, midY], [pinX, inY]);
          }

          registerSegment(
            `ET_IN_${n.uid}`,
            inBusId,
            n.uid,
            inKv,
            liveAmps,
            `Alimentación ${inKv} kV ${n.label}`,
            speed,
            dIn,
            ptsIn,
            isDimmedIn
          );

          // Salida hacia el bus inferior
          const isDimmedOut = isNodeDimmed || (filterKv.length > 0 && !filterKv.includes(outKv));
          let dOut = '';
          const ptsOut: [number, number][] = [];

          if (isBottomRow) {
            dOut = `M ${pinX.toFixed(1)},${outY.toFixed(1)} L ${pinX.toFixed(1)},${outBusY.toFixed(1)}`;
            ptsOut.push([pinX, outY], [pinX, outBusY]);
          } else {
            const streetX = nodeX + BOX_SIZE + COL_GAP / 2;
            const midY = outY + 14;
            dOut = `M ${pinX.toFixed(1)},${outY.toFixed(1)} L ${pinX.toFixed(1)},${midY.toFixed(1)} L ${streetX.toFixed(1)},${midY.toFixed(1)} L ${streetX.toFixed(1)},${outBusY.toFixed(1)}`;
            ptsOut.push([pinX, outY], [pinX, midY], [streetX, midY], [streetX, outBusY]);
          }

          registerSegment(
            `ET_OUT_${n.uid}`,
            n.uid,
            outBusId,
            outKv,
            liveAmps,
            `Salida ${outKv} kV ${n.label}`,
            speed,
            dOut,
            ptsOut,
            isDimmedOut
          );
        }
      }

      currentY = outBusY + 80;
    };

    // 1. NIVEL 500 kV: Extra Alta Tensión Troncal
    const nodesGen500 = masterNodes
      .filter((n) => n.role === 'GEN' && n.voltageKv >= 500)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    const nodesEt500 = masterNodes
      .filter((n) => n.role === 'ET500')
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    renderGenSection(
      nodesGen500,
      'BUS_GEN_500',
      '⚡ BARRA COLECTORA DE GENERACIÓN 500 kV (EXTRA ALTA TENSIÓN)',
      'Inyección de Centrales 500 kV (Yacyretá, Atucha II, Salto Grande, Chocón, Costanera)',
      500
    );

    renderSubstationSection(
      nodesEt500,
      'BUS_GEN_500',
      500,
      'BUS_OUT_ET_500',
      '⚡ BARRA DE ENLACE Y TRANSFORMACIÓN 500/220/132 kV',
      'Salida de Reducción desde 500 kV hacia Red Troncal de 220 kV y Subtransmisión de 132 kV',
      220
    );

    // 2. NIVEL 220 kV: Alta Tensión Troncal Regional
    const nodesGen220 = masterNodes
      .filter((n) => n.role === 'GEN' && n.voltageKv >= 220 && n.voltageKv < 500)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    const nodesEt220 = masterNodes
      .filter((n) => n.role === 'ET132' && n.voltageKv >= 220)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    renderGenSection(
      nodesGen220,
      'BUS_GEN_220',
      '⚡ BARRA TRONCAL 220 kV (ALTA TENSIÓN REGIONAL)',
      'Inyección de Centrales Térmicas, Hidroeléctricas y Complejos Renovables 220 kV',
      220
    );

    renderSubstationSection(
      nodesEt220,
      'BUS_GEN_220',
      220,
      'BUS_OUT_ET_220',
      '⚡ BARRA DE ENLACE Y TRANSFORMACIÓN 220/132 kV',
      'Salida de Reducción de Alta Tensión 220 kV a Subtransmisión 132 kV',
      132
    );

    // 3. NIVEL 132 kV: Subtransmisión Provincial
    const nodesGen132 = masterNodes
      .filter((n) => n.role === 'GEN' && n.voltageKv >= 132 && n.voltageKv < 220)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    const nodesEt132 = masterNodes
      .filter((n) => n.role === 'ET132' && n.voltageKv < 220)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    renderGenSection(
      nodesGen132,
      'BUS_GEN_132',
      '⚡ BARRA DE SUBTRANSMISIÓN REGIONAL 132 kV',
      'Inyección de Centrales Térmicas y Renovables Conectadas en Redes de 132 kV',
      132
    );

    renderSubstationSection(
      nodesEt132,
      'BUS_GEN_132',
      132,
      'BUS_OUT_ET_132',
      '⚡ BARRA DE ENLACE Y TRANSFORMACIÓN 132/33 kV',
      'Salida de Reducción 132/33 kV hacia Redes de Distribución Provincial',
      33
    );

    // 4. NIVEL 33 kV: Media Tensión Primaria y Distribuidoras
    const nodesGen33 = masterNodes
      .filter((n) => n.role === 'GEN' && n.voltageKv < 132)
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    const distNodes = masterNodes
      .filter((n) => n.role === 'DIST')
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    renderGenSection(
      nodesGen33,
      'BUS_GEN_33',
      '⚡ BARRA COLECTORA DE GENERACIÓN 33 kV (MEDIA TENSIÓN)',
      'Inyección de Centrales Térmicas Locales y Parques Solares/Eólicos en 33 kV',
      33
    );

    renderSubstationSection(
      distNodes,
      'BUS_GEN_33',
      33,
      'BUS_DIST_OUT_13',
      '⚡ BARRA DE ALIMENTACIÓN A COOPERATIVAS Y REDES RURALES 13,2 kV',
      'Distribución de Media Tensión hacia Redes de Cooperativas Eléctricas',
      13.2
    );

    // 5. NIVEL 13,2 kV: Cooperativas Eléctricas (580 nodos)
    const coopNodes = masterNodes
      .filter((n) => n.role === 'COOP')
      .sort((a, b) => (REGION_ORDER[a.region] ?? 4) - (REGION_ORDER[b.region] ?? 4));

    const busY_coop = currentY + 36;
    createTrunkBus(
      'BUS_COOP_13',
      busY_coop,
      '⚡ BARRA COLECTORA DE COOPERATIVAS ELÉCTRICAS 13,2 kV',
      'Distribución de Media Tensión hacia 580 Cooperativas de Servicios Públicos Urbanos y Rurales',
      13.2
    );
    currentY = busY_coop + 70;

    if (coopNodes.length > 0) {
      const numRows = Math.ceil(coopNodes.length / maxCols);

      for (let sr = 0; sr < numRows; sr++) {
        const startIdx = sr * maxCols;
        const endIdx = Math.min(coopNodes.length, (sr + 1) * maxCols);
        const count = endIdx - startIdx;
        const rowWidth = count * COL_PITCH - COL_GAP;
        const offsetLeft = Math.floor((diagramW - rowWidth) / 2);
        const rowY = currentY;
        const isTopRow = sr === 0;

        for (let i = startIdx; i < endIdx; i++) {
          const n = coopNodes[i];
          const col = i - startIdx;
          const nodeX = offsetLeft + col * COL_PITCH;
          positions.set(n.uid, { x: nodeX, y: rowY });

          const pinX = nodeX + HALF_BOX;
          const inY = rowY;
          const isNodeDimmed = !illuminatedNodeUids.has(n.uid);
          const isDimmed = isNodeDimmed || (filterKv.length > 0 && !filterKv.includes(13.2));
          const factor = getRegionFactor(n.region);
          const liveAmps = Math.round(n.amperes * factor);
          const speed = getSpeedBucket(liveAmps);

          let d = '';
          const pts: [number, number][] = [];

          if (isTopRow) {
            d = `M ${pinX.toFixed(1)},${busY_coop.toFixed(1)} L ${pinX.toFixed(1)},${inY.toFixed(1)}`;
            pts.push([pinX, busY_coop], [pinX, inY]);
          } else {
            const streetX = nodeX + BOX_SIZE + COL_GAP / 2;
            const midY = inY - 14;
            d = `M ${streetX.toFixed(1)},${busY_coop.toFixed(1)} L ${streetX.toFixed(1)},${midY.toFixed(1)} L ${pinX.toFixed(1)},${midY.toFixed(1)} L ${pinX.toFixed(1)},${inY.toFixed(1)}`;
            pts.push([streetX, busY_coop], [streetX, midY], [pinX, midY], [pinX, inY]);
          }

          registerSegment(
            `COOP_IN_${n.uid}`,
            'BUS_COOP_13',
            n.uid,
            13.2,
            liveAmps,
            `Alimentación ${n.label}`,
            speed,
            d,
            pts,
            isDimmed
          );
        }

        currentY += ROW_PITCH;
      }
    }

    // ------------------------------------------------------------------------
    // INTERCONEXIÓN FÍSICA TRONCAL ENTRE NIVELES (LÍNEAS TRONCALES DE ENLACE)
    // Conecta las barras de salida de reducción con las barras troncales del nivel
    // inferior por los corredores protegidos laterales y centrales.
    // ------------------------------------------------------------------------
    // Enlace 500 kV -> 220 kV
    connectBuses(
      'BUS_OUT_ET_500',
      'BUS_GEN_220',
      220,
      'Enlace Transformación 500/220 kV hacia Red Troncal',
      [140, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4960]
    );

    // Enlace 500 kV -> 132 kV
    connectBuses(
      'BUS_OUT_ET_500',
      'BUS_GEN_132',
      132,
      'Enlace Directo 500/132 kV Gran Buenos Aires y Litoral',
      [180, 900, 1500, 2100, 2700, 3300, 3900, 4500, 4920]
    );

    // Enlace 220 kV -> 132 kV
    connectBuses(
      'BUS_OUT_ET_220',
      'BUS_GEN_132',
      132,
      'Enlace Transformación 220/132 kV hacia Subtransmisión',
      [140, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4960]
    );

    // Enlace 132 kV -> 33 kV
    connectBuses(
      'BUS_OUT_ET_132',
      'BUS_GEN_33',
      33,
      'Enlace Transformación 132/33 kV hacia Distribuidoras',
      [140, 600, 1200, 1800, 2400, 3000, 3600, 4200, 4960]
    );

    // Enlace 33 kV -> 13,2 kV
    connectBuses(
      'BUS_DIST_OUT_13',
      'BUS_COOP_13',
      13.2,
      'Enlace Media Tensión hacia Redes de Cooperativas',
      [180, 900, 1500, 2100, 2700, 3300, 3900, 4500, 4920]
    );
  } else {
    // ========================================================================
    // MODOS ORIGINALES 100% INTACTOS (PLANO VERTICAL, HORIZONTAL, MAPA)
    // ========================================================================
    // Regla estricta de separación: paso mínimo de 9.0px entre líneas paralelas
    // Garantiza entre 4.4px y 7.5px de espacio libre visible entre bordes de cables de cualquier nivel de tensión.
    const MIN_CABLE_PITCH = 9.0;
    const BASE_AVE_HEIGHT = 180;
    const BASE_STREET_WIDTH = 156;

    interface LogicalNodeGrid {
      row: number;
      col: number;
      role: NodeRole;
    }
    const logicalGrid = new Map<string, LogicalNodeGrid>();
    let totalGridRows = 0;
    const maxCols = 32;

    if (!isMap) {
      const tiers: NodeRole[] = ['GEN', 'ET500', 'ET132', 'DIST', 'COOP'];

      tiers.forEach((tierRole) => {
        const tierNodes = masterNodes
          .filter((n) => n.role === tierRole)
          .sort((a, b) => {
            const ra = REGION_ORDER[a.region] ?? 4;
            const rb = REGION_ORDER[b.region] ?? 4;
            if (ra !== rb) return ra - rb;
            return a.mapX - b.mapX;
          });

        if (tierNodes.length === 0) return;

        const colsInTier = Math.min(maxCols, tierNodes.length);
        const numSubRows = Math.ceil(tierNodes.length / colsInTier);

        tierNodes.forEach((node, idx) => {
          const subRow = Math.floor(idx / colsInTier);
          const colInRow = idx % colsInTier;
          const itemsInThisSubRow =
            subRow === numSubRows - 1 ? tierNodes.length - subRow * colsInTier : colsInTier;

          const offsetCols = Math.floor((maxCols - itemsInThisSubRow) / 2);
          const finalCol = colInRow + offsetCols;
          const finalRow = totalGridRows + subRow;

          logicalGrid.set(node.uid, { row: finalRow, col: finalCol, role: tierRole });
        });

        totalGridRows += numSubRows;
      });
    } else {
      masterNodes.forEach((n) => {
        positions.set(n.uid, { x: n.mapX - 18, y: n.mapY - 18 });
      });
    }

  // Pre-cálculo de terminales y ruteo determinista libre de colisiones
  interface EdgeRoutingMeta {
    edge: GridEdgeData;
    sGrid: LogicalNodeGrid;
    tGrid: LogicalNodeGrid;
    isAdjacent: boolean;
    streetCol: number;
  }
  const edgeRoutingMetaList: EdgeRoutingMeta[] = [];

  const outBySource = new Map<string, GridEdgeData[]>();
  const inByTarget = new Map<string, GridEdgeData[]>();

  masterEdges.forEach((e) => {
    const s = String(e.source);
    const t = String(e.target);
    if (!outBySource.has(s)) outBySource.set(s, []);
    outBySource.get(s)!.push(e);
    if (!inByTarget.has(t)) inByTarget.set(t, []);
    inByTarget.get(t)!.push(e);
  });

  if (!isMap) {
    for (const list of outBySource.values()) {
      list.sort((a, b) => {
        const ga = logicalGrid.get(String(a.target));
        const gb = logicalGrid.get(String(b.target));
        if (!ga || !gb) return 0;
        return (ga.col - gb.col) || (ga.row - gb.row);
      });
    }
    for (const list of inByTarget.values()) {
      list.sort((a, b) => {
        const ga = logicalGrid.get(String(a.source));
        const gb = logicalGrid.get(String(b.source));
        if (!ga || !gb) return 0;
        return (ga.col - gb.col) || (ga.row - gb.row);
      });
    }

    masterEdges.forEach((e) => {
      const sGrid = logicalGrid.get(String(e.source));
      const tGrid = logicalGrid.get(String(e.target));
      if (!sGrid || !tGrid) return;

      const isAdjacent = tGrid.row - sGrid.row === 1;
      const streetCol = sGrid.col;

      edgeRoutingMetaList.push({
        edge: e,
        sGrid,
        tGrid,
        isAdjacent,
        streetCol
      });
    });
  }

  // 1. Asignación de canales verticales en calles entre columnas
  const streetIntervals = new Map<number, { id: string; min: number; max: number }[]>();
  edgeRoutingMetaList.forEach((m) => {
    if (m.isAdjacent) return;
    const colKey = m.streetCol;
    if (!streetIntervals.has(colKey)) streetIntervals.set(colKey, []);
    const minRow = Math.min(m.sGrid.row, m.tGrid.row);
    const maxRow = Math.max(m.sGrid.row, m.tGrid.row);
    streetIntervals.get(colKey)!.push({ id: m.edge.id, min: minRow, max: maxRow });
  });

  const streetAssignments = new Map<string, number>();
  const streetTrackCounts = new Map<number, number>();
  for (let c = 0; c < maxCols; c++) {
    const intervals = streetIntervals.get(c) || [];
    const { assignments, totalTracks } = assignTracks(intervals, 1);
    assignments.forEach((track, id) => streetAssignments.set(id, track));
    streetTrackCounts.set(c, totalTracks);
  }

  // 2. Asignación unificada de canales horizontales en avenidas entre filas
  const aveIntervals = new Map<number, { id: string; min: number; max: number }[]>();
  edgeRoutingMetaList.forEach((m) => {
    if (m.isAdjacent) {
      const r = m.sGrid.row;
      if (!aveIntervals.has(r)) aveIntervals.set(r, []);
      const minCol = Math.min(m.sGrid.col, m.tGrid.col);
      const maxCol = Math.max(m.sGrid.col, m.tGrid.col);
      aveIntervals.get(r)!.push({ id: `${m.edge.id}_adj`, min: minCol, max: maxCol });
    } else {
      const sR = m.sGrid.row;
      const tR = Math.max(0, m.tGrid.row - 1);
      if (!aveIntervals.has(sR)) aveIntervals.set(sR, []);
      const minDepCol = Math.min(m.sGrid.col, m.streetCol);
      const maxDepCol = Math.max(m.sGrid.col, m.streetCol);
      aveIntervals.get(sR)!.push({ id: `${m.edge.id}_dep`, min: minDepCol, max: maxDepCol });

      if (!aveIntervals.has(tR)) aveIntervals.set(tR, []);
      const minArrCol = Math.min(m.streetCol, m.tGrid.col);
      const maxArrCol = Math.max(m.streetCol, m.tGrid.col);
      aveIntervals.get(tR)!.push({ id: `${m.edge.id}_arr`, min: minArrCol, max: maxArrCol });
    }
  });

  const aveAssignments = new Map<string, number>();
  const aveTrackCounts = new Map<number, number>();
  for (let r = 0; r < totalGridRows; r++) {
    const intervals = aveIntervals.get(r) || [];
    const { assignments, totalTracks } = assignTracks(intervals, 1);
    assignments.forEach((track, id) => aveAssignments.set(id, track));
    aveTrackCounts.set(r, totalTracks);
  }

  // 3. Posicionamiento físico dinámico ("Separar SOLO si es necesario"):
  // Corredores con pocos cables mantienen la distancia compacta base.
  // Corredores con alta densidad de vínculos se expanden lo necesario para garantizar MIN_CABLE_PITCH (9.0px).
  const colCoords: number[] = [0];
  for (let c = 0; c < maxCols; c++) {
    const tracks = streetTrackCounts.get(c) || 0;
    const neededW = Math.max(BASE_STREET_WIDTH, tracks * MIN_CABLE_PITCH + 32);
    colCoords.push(colCoords[c] + BOX_SIZE + neededW);
  }

  const rowCoords: number[] = [0];
  for (let r = 0; r < totalGridRows; r++) {
    const tracks = aveTrackCounts.get(r) || 0;
    const neededH = Math.max(BASE_AVE_HEIGHT, tracks * MIN_CABLE_PITCH + 36);
    rowCoords.push(rowCoords[r] + BOX_SIZE + neededH);
  }

  if (!isMap) {
    logicalGrid.forEach((grid, uid) => {
      const cX = colCoords[grid.col];
      const rY = rowCoords[grid.row];
      if (!isHorizontal) {
        positions.set(uid, { x: cX, y: rY });
      } else {
        positions.set(uid, { x: rY, y: cX });
      }
    });
  }

  masterEdges.forEach((e) => {
    const sPos = positions.get(String(e.source));
    const tPos = positions.get(String(e.target));
    if (!sPos || !tPos) return;

    let sx = 0,
      sy = 0,
      tx = 0,
      ty = 0;

    let geom: { d: string; pts: [number, number][] };

    if (isMap) {
      sx = sPos.x + 18;
      sy = sPos.y + 18;
      tx = tPos.x + 18;
      ty = tPos.y + 18;
      geom = buildCurvedMapGeometry(sx, sy, tx, ty, e.curvature ?? 0.14);
    } else {
      const sGrid = logicalGrid.get(String(e.source));
      const tGrid = logicalGrid.get(String(e.target));
      if (!sGrid || !tGrid) return;

      const sList = outBySource.get(String(e.source)) || [e];
      const tList = inByTarget.get(String(e.target)) || [e];
      const sIdx = sList.indexOf(e);
      const tIdx = tList.indexOf(e);

      const sStep = Math.min(10, 88 / Math.max(1, sList.length));
      const tStep = Math.min(10, 88 / Math.max(1, tList.length));
      const sOff = (sIdx - (sList.length - 1) / 2) * sStep;
      const tOff = (tIdx - (tList.length - 1) / 2) * tStep;

      const sBoxX = !isHorizontal ? colCoords[sGrid.col] : rowCoords[sGrid.row];
      const sBoxY = !isHorizontal ? rowCoords[sGrid.row] : colCoords[sGrid.col];
      const tBoxX = !isHorizontal ? colCoords[tGrid.col] : rowCoords[tGrid.row];
      const tBoxY = !isHorizontal ? rowCoords[tGrid.row] : colCoords[tGrid.col];

      if (!isHorizontal) {
        sx = sBoxX + HALF_BOX + sOff;
        sy = sBoxY + BOX_SIZE;
        tx = tBoxX + HALF_BOX + tOff;
        ty = tBoxY;
      } else {
        sx = sBoxX + BOX_SIZE;
        sy = sBoxY + HALF_BOX + sOff;
        tx = tBoxX;
        ty = tBoxY + HALF_BOX + tOff;
      }

      const isAdjacent = tGrid.row - sGrid.row === 1;

      if (isAdjacent) {
        const track = aveAssignments.get(`${e.id}_adj`) || 0;
        const aveBase = rowCoords[sGrid.row] + BOX_SIZE + 18;
        const bend = aveBase + track * MIN_CABLE_PITCH;
        geom = buildStreetAvenueGeometry(sx, sy, tx, ty, isHorizontal, true, bend, 0, 0);
      } else {
        const depTrack = aveAssignments.get(`${e.id}_dep`) || 0;
        const arrTrack = aveAssignments.get(`${e.id}_arr`) || 0;
        const streetTrack = streetAssignments.get(e.id) || 0;

        const streetCol = sGrid.col;
        const sAveBase = rowCoords[sGrid.row] + BOX_SIZE + 18;
        const arrRowIdx = Math.max(0, tGrid.row - 1);
        const tAveBase = rowCoords[arrRowIdx] + BOX_SIZE + 18;
        const streetBase = colCoords[streetCol] + BOX_SIZE + 16;

        const y1 = sAveBase + depTrack * MIN_CABLE_PITCH;
        const y2 = tAveBase + arrTrack * MIN_CABLE_PITCH;
        const xs = streetBase + streetTrack * MIN_CABLE_PITCH;

        geom = buildStreetAvenueGeometry(sx, sy, tx, ty, isHorizontal, false, y1, y2, xs);
      }
    }

    const factor = getRegionFactor(e.region);
    const liveAmperes = Math.round(e.amperes * factor);
    const kvKey = normalizeKvKey(e.kv);
    const speedBucket = getSpeedBucket(liveAmperes);

    const edgeDimmed = !activeEdgeIds.has(e.id);

    const enrichedEdge: GridEdgeData = {
      ...e,
      amperes: liveAmperes,
      isDimmed: edgeDimmed
    };

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (let p = 0; p < geom.pts.length; p++) {
      const px = geom.pts[p][0];
      const py = geom.pts[p][1];
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }

    cableGeometries.push({
      edge: enrichedEdge,
      kvKey,
      speedBucket,
      d: geom.d,
      pts: geom.pts,
      minX: minX - 20,
      minY: minY - 20,
      maxX: maxX + 20,
      maxY: maxY + 20,
      path2D: typeof Path2D !== 'undefined' ? new Path2D(geom.d) : undefined
    });

    if (edgeDimmed) {
      if (!baseDimmedByKv[kvKey]) baseDimmedByKv[kvKey] = [];
      baseDimmedByKv[kvKey].push(geom.d);
    } else {
      if (!baseActiveByKv[kvKey]) baseActiveByKv[kvKey] = [];
      baseActiveByKv[kvKey].push(geom.d);

      const bucketKey = `${kvKey}_${speedBucket}`;
      if (!animActiveByKvSpeed[bucketKey]) {
        animActiveByKvSpeed[bucketKey] = { kv: kvKey, speed: speedBucket, paths: [] };
      }
      animActiveByKvSpeed[bucketKey].paths.push(geom.d);
    }
  });
  }

  let worldMinX = Infinity,
    worldMinY = Infinity,
    worldMaxX = -Infinity,
    worldMaxY = -Infinity;

  const dimmedNodes: GridNodeData[] = [];
  const activeNodes: GridNodeData[] = [];

  masterNodes.forEach((n) => {
    const pos = positions.get(n.uid) || { x: 0, y: 0 };
    const factor = getRegionFactor(n.region);
    const liveAmperes = Math.round(n.amperes * factor);
    const size = isMap ? 36 : BOX_SIZE;

    if (pos.x < worldMinX) worldMinX = pos.x;
    if (pos.y < worldMinY) worldMinY = pos.y;
    if (pos.x + size > worldMaxX) worldMaxX = pos.x + size;
    if (pos.y + size > worldMaxY) worldMaxY = pos.y + size;

    const isDirect = directMatchUids.has(n.uid);
    const isDimmed = !illuminatedNodeUids.has(n.uid);

    const nodeData: GridNodeData = {
      ...n,
      isDirectMatch: isDirect,
      isDimmed,
      amperes: liveAmperes,
      x: pos.x,
      y: pos.y
    };

    if (isDimmed) {
      dimmedNodes.push(nodeData);
    } else {
      activeNodes.push(nodeData);
    }
  });

  const positionedNodes = [...dimmedNodes, ...activeNodes];

  const dimmedCables: typeof cableGeometries = [];
  const activeCables: typeof cableGeometries = [];
  for (let i = 0; i < cableGeometries.length; i++) {
    if (cableGeometries[i].edge.isDimmed) {
      dimmedCables.push(cableGeometries[i]);
    } else {
      activeCables.push(cableGeometries[i]);
    }
  }

  if (!isFinite(worldMinX)) {
    worldMinX = -500;
    worldMinY = -500;
    worldMaxX = 500;
    worldMaxY = 500;
  }
  const boundsNodes: Node[] = [
    {
      id: '__bounds_tl',
      type: 'bounds',
      position: { x: worldMinX, y: worldMinY },
      data: {}
    },
    {
      id: '__bounds_br',
      type: 'bounds',
      position: { x: worldMaxX, y: worldMaxY },
      data: {}
    }
  ];

  return {
    boundsNodes,
    positionedNodes,
    dimmedNodes,
    activeNodes,
    cableGeometries,
    dimmedCables,
    activeCables,
    batchedDimmedBase: VOLTAGE_ORDER.map((kv) => ({
      kv,
      d: (baseDimmedByKv[kv] || []).join(' ')
    })).filter((b) => b.d.length > 0),
    batchedActiveBase: VOLTAGE_ORDER.map((kv) => ({
      kv,
      d: (baseActiveByKv[kv] || []).join(' ')
    })).filter((b) => b.d.length > 0),
    batchedActiveAnim: Object.values(animActiveByKvSpeed).map((b) => ({
      key: `${b.kv}_${b.speed}`,
      kv: b.kv,
      speed: b.speed,
      d: b.paths.join(' ')
    })),
    visibleCount: hasActiveFilter ? activeNodes.length : masterNodes.length,
    visibleEdgesCount: hasActiveFilter ? activeCables.length : masterEdges.length,
    busPlaques
  };
}

// ============================================================================
// 7. MOTOR 100% CANVAS 2D (DIBUJA PROVINCIAS + 1.122 CABLES + 830 ESTACIONES A 60 FPS)
// ============================================================================
const EMPTY_EDGES: never[] = [];

function cableCrossesViewport(
  cg: ComputedCableGeometry,
  viewMinX: number,
  viewMaxX: number,
  viewMinY: number,
  viewMaxY: number
): boolean {
  if (
    cg.maxX < viewMinX ||
    cg.minX > viewMaxX ||
    cg.maxY < viewMinY ||
    cg.minY > viewMaxY ||
    !cg.path2D
  ) {
    return false;
  }
  if (cg.maxX - cg.minX < 450 && cg.maxY - cg.minY < 450) {
    return true;
  }
  const pts = cg.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const sMinX = p1[0] < p2[0] ? p1[0] : p2[0];
    const sMaxX = p1[0] > p2[0] ? p1[0] : p2[0];
    const sMinY = p1[1] < p2[1] ? p1[1] : p2[1];
    const sMaxY = p1[1] > p2[1] ? p1[1] : p2[1];
    if (sMaxX >= viewMinX && sMinX <= viewMaxX && sMaxY >= viewMinY && sMinY <= viewMaxY) {
      return true;
    }
  }
  return false;
}

const FlowSceneInner: React.FC<{
  layoutMode: 'DAGRE_LR' | 'DAGRE_TB' | 'BUSES' | 'MAP';
  topology: TopologyData | null;
  telemetry: TelemetryData | null;
  filterKv: number[];
  filterRole: string[];
  filterRegion: string | null;
  filterTech: string[];
  searchQuery: string;
  showFullWfs: boolean;
  animateFlow: boolean;
  selectedNode: GridNodeData | null;
  selectedEdge: GridEdgeData | null;
  onToggleFullWfs: () => void;
  onSelectNode: (d: GridNodeData) => void;
  onClearSelectedNode: () => void;
  onSelectEdge: (d: GridEdgeData) => void;
  onClearSelectedEdge: () => void;
  onCountsChange: (nodeCount: number, edgeCount: number) => void;
}> = ({
  layoutMode,
  topology,
  telemetry,
  filterKv,
  filterRole,
  filterRegion,
  filterTech,
  searchQuery,
  showFullWfs,
  animateFlow,
  selectedNode,
  selectedEdge,
  onToggleFullWfs,
  onSelectNode,
  onClearSelectedNode,
  onSelectEdge,
  onClearSelectedEdge,
  onCountsChange
}) => {
  const { fitView, screenToFlowPosition, getViewport } = useReactFlow();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomTextRef = useRef<HTMLSpanElement>(null);
  const vpRef = useRef<Viewport>({ x: 0, y: 0, zoom: 0.14 });
  const isPanningRef = useRef<boolean>(false);
  const panTimerRef = useRef<number | null>(null);
  const dashPhaseRef = useRef<number>(0);
  const isolationCenterRef = useRef<{ x: number; y: number } | null>(null);
  const isolationScaleRef = useRef<number>(1.0);

  useEffect(() => {
    if (!selectedEdge && !selectedNode) {
      isolationCenterRef.current = null;
      isolationScaleRef.current = 1.0;
    }
  }, [selectedEdge, selectedNode]);

  const provinces = topology?.provinces || [];
  const { allNodes, allEdges } = useMemo(() => buildMasterDataset(topology), [topology]);

  const {
    boundsNodes,
    positionedNodes,
    dimmedNodes,
    activeNodes,
    cableGeometries,
    dimmedCables,
    activeCables,
    batchedDimmedBase,
    batchedActiveBase,
    batchedActiveAnim,
    busPlaques,
    visibleCount,
    visibleEdgesCount
  } = useMemo(
    () =>
      computeLayoutAndBatchedCables(
        allNodes,
        allEdges,
        layoutMode,
        filterKv,
        filterRole,
        filterRegion,
        filterTech,
        searchQuery,
        telemetry
      ),
    [
      allNodes,
      allEdges,
      layoutMode,
      filterKv,
      filterRole,
      filterRegion,
      filterTech,
      searchQuery,
      telemetry
    ]
  );

  useEffect(() => {
    onCountsChange(visibleCount, visibleEdgesCount);
  }, [visibleCount, visibleEdgesCount, onCountsChange]);

  const compiledPaths = useMemo(() => {
    let provincePath2D: Path2D | null = null;
    if (layoutMode === 'MAP' && provinces.length > 0) {
      const allProvD = provinces
        .map((prov) => {
          const validRings = prov.rings.filter((ring) =>
            ring.some((pt) => pt[1] > -2100 && pt[0] < 1200)
          );
          return validRings
            .map(
              (ring) =>
                ring
                  .map(
                    (pt, i) =>
                      `${i === 0 ? 'M' : 'L'} ${(pt[0] * MAP_SCALE).toFixed(1)},${(-pt[1] * MAP_SCALE).toFixed(1)}`
                  )
                  .join(' ') + ' Z'
            )
            .join(' ');
        })
        .join(' ');
      if (allProvD) provincePath2D = new Path2D(allProvD);
    }

    const wfsPaths2D: { kv: number; color: string; w: number; path: Path2D }[] = [];
    if (layoutMode === 'MAP' && showFullWfs && topology?.lines) {
      const byKv: Record<number, string[]> = { 500: [], 220: [], 132: [], 33: [] };
      topology.lines.forEach((ln) => {
        const d = ln.geo
          .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${(pt[0] * MAP_SCALE).toFixed(1)},${(-pt[1] * MAP_SCALE).toFixed(1)}`)
          .join(' ');
        const kv = ln.tension_kv >= 500 ? 500 : ln.tension_kv >= 220 ? 220 : ln.tension_kv >= 132 ? 132 : 33;
        byKv[kv].push(d);
      });
      [500, 220, 132, 33].forEach((kv) => {
        if (byKv[kv].length > 0) {
          wfsPaths2D.push({
            kv,
            color: VOLTAGE_CONFIG[kv].color,
            w: kv >= 500 ? 2.4 : kv >= 220 ? 1.8 : 1.2,
            path: new Path2D(byKv[kv].join(' '))
          });
        }
      });
    }

    if (selectedEdge || selectedNode) {
      return {
        provincePath2D: null,
        wfsPaths2D: [],
        dimmedBase2D: [],
        activeBase2D: [],
        activeAnim2D: []
      };
    }

    const dimmedBase2D = batchedDimmedBase.map((b) => ({
      kv: b.kv,
      cfg: VOLTAGE_CONFIG[b.kv] || VOLTAGE_CONFIG[132],
      path: new Path2D(b.d)
    }));

    const activeBase2D = batchedActiveBase.map((b) => ({
      kv: b.kv,
      cfg: VOLTAGE_CONFIG[b.kv] || VOLTAGE_CONFIG[132],
      path: new Path2D(b.d)
    }));

    const activeAnim2D = batchedActiveAnim.map((b) => {
      const cfg = VOLTAGE_CONFIG[b.kv] || VOLTAGE_CONFIG[132];
      const dashLen = Math.max(8, Math.round(cfg.width * 3.1));
      const gapLen = Math.max(6, Math.round(cfg.width * 2.3));
      return {
        key: b.key,
        kv: b.kv,
        speed: b.speed,
        cfg,
        dash: [dashLen, gapLen],
        path: new Path2D(b.d)
      };
    });

    return { provincePath2D, wfsPaths2D, dimmedBase2D, activeBase2D, activeAnim2D };
  }, [
    layoutMode,
    provinces,
    showFullWfs,
    topology,
    batchedDimmedBase,
    batchedActiveBase,
    batchedActiveAnim,
    selectedEdge,
    selectedNode,
    cableGeometries
  ]);

  // Motor unificado de pintado en Canvas 2D:
  // Dibuja Provincias + Cables + Estaciones recortando estrictamente al área visible en pantalla (Viewport Culling)
  const renderCanvasFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const vp = vpRef.current;
    ctx.setTransform(vp.zoom * dpr, 0, 0, vp.zoom * dpr, vp.x * dpr, vp.y * dpr);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    const viewMinX = -vp.x / vp.zoom - 60;
    const viewMinY = -vp.y / vp.zoom - 60;
    const viewMaxX = (rect.width - vp.x) / vp.zoom + 60;
    const viewMaxY = (rect.height - vp.y) / vp.zoom + 60;

    const isMap = layoutMode === 'MAP';
    const isHoriz = layoutMode === 'DAGRE_LR';
    const showDetail = vp.zoom >= (isMap ? MAP_LOD_ZOOM : PLANO_LOD_ZOOM);

    // 1. Provincias de Argentina (Modo Mapa)
    if (!selectedEdge && !selectedNode && compiledPaths.provincePath2D) {
      ctx.fillStyle = '#E5DFD0';
      ctx.strokeStyle = '#8A8173';
      ctx.lineWidth = 1.6 / Math.pow(vp.zoom, 0.55);
      ctx.fill(compiledPaths.provincePath2D);
      ctx.stroke(compiledPaths.provincePath2D);
    }

    // 1b. Trazados paralelos WFS opcionales
    if (!selectedEdge && !selectedNode && compiledPaths.wfsPaths2D.length > 0) {
      ctx.globalAlpha = 0.48;
      for (const w of compiledPaths.wfsPaths2D) {
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.w;
        ctx.stroke(w.path);
      }
    }

    // 1c. Barras Colectoras Troncales Físicas y Carteles SCADA (Modo BUSES)
    const isBuses = layoutMode === 'BUSES';
    if (isBuses && busPlaques && busPlaques.length > 0 && !selectedEdge && !selectedNode) {
      for (let i = 0; i < busPlaques.length; i++) {
        const bp = busPlaques[i];
        if (bp.y < viewMinY - 140 || bp.y > viewMaxY + 140) continue;

        const isDimmed = filterKv.length > 0 && !filterKv.includes(bp.kv);
        ctx.save();
        if (isDimmed) {
          ctx.globalAlpha = 0.22;
        }

        // Barra colectora física (8px cobreado/tensión con alma blanca nítida)
        ctx.fillStyle = bp.color;
        ctx.fillRect(40, bp.y - 4, 5100 - 80, 8);
        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(40, bp.y - 1, 5100 - 80, 2);

        // Cartel SCADA flotante sobre la barra con escala adaptable para vista lejana
        const scale = Math.min(2.5, Math.max(1.0, 0.28 / Math.max(0.08, vp.zoom)));
        const plaqueW = 660 * scale;
        const plaqueH = 34 * scale;
        const px = Math.max(viewMinX + 40, Math.min(viewMaxX - plaqueW - 40, 80));
        const py = bp.y - plaqueH - 10;

        ctx.fillStyle = 'rgba(250, 248, 243, 0.96)';
        ctx.fillRect(px, py, plaqueW, plaqueH);
        ctx.strokeStyle = bp.color;
        ctx.lineWidth = 2.0 * scale;
        ctx.strokeRect(px, py, plaqueW, plaqueH);

        // Barra de color lateral
        ctx.fillStyle = bp.color;
        ctx.fillRect(px, py, 8 * scale, plaqueH);

        // Texto del título
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${(13 * scale).toFixed(1)}px "IBM Plex Sans", sans-serif`;
        ctx.fillStyle = '#222426';
        ctx.fillText(bp.title, px + 18 * scale, py + 11 * scale);

        // Subtítulo técnico
        ctx.font = `600 ${(9.8 * scale).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = '#68655E';
        ctx.fillText(bp.subtitle, px + 18 * scale, py + 23 * scale);

        ctx.restore();
      }
    }

    // 2. CABLES (Trazados unificados en GPU: cables activos nítidos, cables atenuados en fondo)
    // Escala adaptativa de cables: garantiza visibilidad nítida en pantalla a cualquier nivel de zoom.
    // En vista macro (< 0.65x) escala suavemente para que ninguna línea desaparezca por sub-pixel rasterization.
    // En zoom normal/cercano (>= 0.65x) respeta fielmente los grosores físicos base calibrados.
    const cableScale = Math.min(6.5, Math.max(1.0, 1 / Math.pow(Math.max(0.04, vp.zoom), 0.58)));

    // 2a. Cables atenuados (si hay filtro activo): batch de atenuación suave de fondo (máx 5 llamadas)
    if (!selectedEdge && !selectedNode && compiledPaths.dimmedBase2D.length > 0) {
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.20;
      for (let i = 0; i < compiledPaths.dimmedBase2D.length; i++) {
        const b = compiledPaths.dimmedBase2D[i];
        ctx.strokeStyle = b.cfg.color;
        ctx.lineWidth = b.cfg.width * (isMap ? 1.2 : 1.0) * cableScale;
        ctx.stroke(b.path);
      }
    }

    // 2b. Cables activos: trazado base continuo con saturación y contraste total (máx 5 llamadas)
    if (!selectedEdge && !selectedNode && compiledPaths.activeBase2D.length > 0) {
      ctx.setLineDash([]);
      ctx.globalAlpha = animateFlow ? 0.38 : 0.92;
      for (let i = 0; i < compiledPaths.activeBase2D.length; i++) {
        const b = compiledPaths.activeBase2D[i];
        ctx.strokeStyle = b.cfg.color;
        ctx.lineWidth = b.cfg.width * (isMap ? 1.2 : 1.0) * cableScale;
        ctx.stroke(b.path);
      }
    }

    // 2c. Flujo dinámico animado (solo si animateFlow está activo y no hay aislamiento)
    if (!selectedEdge && !selectedNode && animateFlow && compiledPaths.activeAnim2D.length > 0) {
      if (vp.zoom < 0.65) {
        // En vista macro o zoom medio: trazado animado agrupado por tensión y velocidad (máx 15 llamadas de GPU en total)
        ctx.globalAlpha = 0.96;
        for (let i = 0; i < compiledPaths.activeAnim2D.length; i++) {
          const a = compiledPaths.activeAnim2D[i];
          const dashLen = Math.max(8, Math.round(a.dash[0] * cableScale));
          const gapLen = Math.max(6, Math.round(a.dash[1] * cableScale));
          ctx.strokeStyle = a.cfg.color;
          ctx.lineWidth = Math.max(1.8 * cableScale, a.cfg.width * (isMap ? 0.75 : 0.65) * cableScale);
          ctx.setLineDash([dashLen, gapLen]);
          const speedPx = SPEED_PX_PER_SEC[a.speed] * cableScale;
          ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % (Math.max(1, dashLen + gapLen) * 8);
          ctx.stroke(a.path);
        }
      } else {
        // En zoom cercano: viewport culling estricto (solo se animan los ~10-25 cables visibles en la pantalla)
        ctx.globalAlpha = 0.96;
        for (let i = 0; i < activeCables.length; i++) {
          const cg = activeCables[i];
          if (!cableCrossesViewport(cg, viewMinX, viewMaxX, viewMinY, viewMaxY)) {
            continue;
          }
          const cfg = VOLTAGE_CONFIG[cg.kvKey] || VOLTAGE_CONFIG[132];
          const cableWidth = cfg.width * (isMap ? 1.2 : 1.0);
          const dashLen = Math.max(8, Math.round(cableWidth * 2.8));
          const gapLen = Math.max(6, Math.round(cableWidth * 2.0));
          ctx.setLineDash([dashLen, gapLen]);
          const speedPx = SPEED_PX_PER_SEC[cg.speedBucket];
          ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % (dashLen + gapLen);
          ctx.lineWidth = cableWidth;
          ctx.strokeStyle = cfg.color;
          ctx.stroke(cg.path2D);
        }
      }
    }

    // 3. DIBUJAR LAS ESTACIONES EN CANVAS (CON VIEWPORT CULLING + ORDEN DE SUPERPOSICIÓN: ATENUADOS ATRÁS, RESALTADOS ADELANTE)
    ctx.setLineDash([]);
    const iconPaths = getIconPaths();

    const drawStationNode = (
      n: GridNodeData,
      isDimmed: boolean,
      forceDetail = false,
      customPos?: { x: number; y: number; scale?: number }
    ) => {
      if (customPos) {
        const s = customPos.scale || 1.0;
        ctx.save();
        ctx.translate(customPos.x, customPos.y);
        if (s !== 1.0) {
          ctx.scale(s, s);
        }

        const kvKey = normalizeKvKey(n.voltageKv);
        const vCfg = VOLTAGE_CONFIG[kvKey] || VOLTAGE_CONFIG[132];
        const iconPath = iconPaths[n.iconKind] || iconPaths.dist;

        // MODO PLANO UNIFILAR: Caja Cuadrada de 124x124px
        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(0, 0, BOX_SIZE, BOX_SIZE);
        ctx.strokeStyle = '#222426';
        ctx.lineWidth = 1.6;
        ctx.strokeRect(0, 0, BOX_SIZE, BOX_SIZE);

        // Franja superior de tensión (5px)
        ctx.fillStyle = vCfg.color;
        ctx.fillRect(0, 0, BOX_SIZE, 5);

        // 1. Nombre arriba
        ctx.fillStyle = '#222426';
        ctx.font = '700 9.8px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (n.shortTitle2) {
          ctx.fillText(n.shortTitle1, HALF_BOX, 9);
          ctx.fillText(n.shortTitle2, HALF_BOX, 20);
        } else {
          ctx.fillText(n.shortTitle1, HALF_BOX, 13);
        }

        // 2. Caja de ícono al centro (42x42px)
        const ibX = (BOX_SIZE - 42) / 2;
        const ibY = 38;
        ctx.fillStyle = '#EFECE2';
        ctx.fillRect(ibX, ibY, 42, 42);
        ctx.strokeStyle = vCfg.color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(ibX, ibY, 42, 42);

        const ix = ibX + 9;
        const iy = ibY + 9;
        ctx.translate(ix, iy);
        ctx.strokeStyle = vCfg.color;
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.translate(-ix, -iy);

        // 3. Pastilla técnica inferior (Rol/Tipo, Tensión · MW y Amperes · Región)
        const pillX = 6;
        const pillY = 82;
        const pillW = BOX_SIZE - 12;
        const pillH = 37;
        ctx.fillStyle = '#EAE4D7';
        ctx.fillRect(pillX, pillY, pillW, pillH);
        ctx.strokeStyle = '#D1CBBF';
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        // Rol del nodo (Generación, EETT, Distribuidora, Cooperativa)
        ctx.fillStyle = vCfg.color;
        ctx.font = '700 7.2px "IBM Plex Mono", monospace';
        ctx.fillText(n.roleBadge || n.typeName, HALF_BOX, pillY + 3.5);

        ctx.fillStyle = '#222426';
        ctx.font = '700 8.0px "IBM Plex Mono", monospace';
        ctx.fillText(`${n.kvText} · ${n.powerMw}`, HALF_BOX, pillY + 14.5);

        ctx.fillStyle = '#55524B';
        ctx.font = '600 7.8px "IBM Plex Mono", monospace';
        ctx.fillText(`${formatMilesEnteros(n.amperes)} A · ${n.region}`, HALF_BOX, pillY + 25.5);

        // 4. Borneras
        ctx.fillStyle = '#222426';
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = 1;
        ctx.fillRect(-4, HALF_BOX - 4, 8, 8);
        ctx.strokeRect(-4, HALF_BOX - 4, 8, 8);
        ctx.fillRect(BOX_SIZE - 4, HALF_BOX - 4, 8, 8);
        ctx.strokeRect(BOX_SIZE - 4, HALF_BOX - 4, 8, 8);

        ctx.restore();
        return;
      }
      // En el Mapa: tamaño calibrado (-20% adicional = 40px base, icono 22px).
      // El icono y el rectángulo de info tienen EXACTAMENTE el mismo alto (boxH = size)
      // y la tipografía escala linealmente sin pisos artificiales para que nunca desborde.
      const mapScaleFactor = isMap ? Math.min(1.0, 0.95 / Math.max(0.12, vp.zoom)) : 1.0;
      const size = isMap ? 40 * mapScaleFactor : BOX_SIZE;
      const halfSize = size / 2;
      const cx = isMap ? n.x + 18 : n.x + HALF_BOX;
      const cy = isMap ? n.y + 18 : n.y + HALF_BOX;
      const nodeX = cx - halfSize;
      const nodeY = cy - halfSize;

      if (
        !forceDetail && (
          nodeX + size < viewMinX ||
          nodeX > viewMaxX ||
          nodeY + size < viewMinY ||
          nodeY > viewMaxY
        )
      ) {
        return;
      }

      const kvKey = normalizeKvKey(n.voltageKv);
      const vCfg = VOLTAGE_CONFIG[kvKey] || VOLTAGE_CONFIG[132];
      const iconPath = iconPaths[n.iconKind] || iconPaths.dist;

      if (isMap) {
        // Cuadrado de la estación
        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(nodeX, nodeY, size, size);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        // Grosor constante en pantalla (invariante ante el zoom del mapa)
        ctx.lineWidth = 1.6 / vp.zoom;
        ctx.strokeRect(nodeX, nodeY, size, size);

        // Franja superior de tensión
        ctx.fillStyle = isDimmed ? '#A59F91' : vCfg.color;
        ctx.fillRect(nodeX, nodeY, size, Math.max(1.8, 2.5 * mapScaleFactor));

        // Ícono central proporcional (22px base)
        const iconSize = 22 * mapScaleFactor;
        const s = iconSize / 24;
        const ix = nodeX + (size - iconSize) / 2;
        const iy = nodeY + (size - iconSize) / 2 + 0.5;
        ctx.translate(ix, iy);
        ctx.scale(s, s);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        // Grosor del trazo del ícono constante en pantalla (invariante ante el zoom)
        ctx.lineWidth = 1.8 / (vp.zoom * s);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.scale(1 / s, 1 / s);
        ctx.translate(-ix, -iy);

        // Rectángulo de información: EXACTAMENTE EL MISMO ALTO que el icono (boxH = size)
        // y tipografía 100% proporcional sin límites rígidos para que entre perfecto al hacer zoom.
        if (showDetail || forceDetail) {
          const isLeft = n.labelSide === 'left';
          const subText = `${n.kvText} · ${n.powerMw} · ${formatMilesEnteros(n.amperes)} A`;

          const titleFontSize = 12.4 * mapScaleFactor;
          const subFontSize = 10.1 * mapScaleFactor;
          const gapY = 2.6 * mapScaleFactor;

          ctx.font = `700 ${titleFontSize.toFixed(1)}px "IBM Plex Sans", sans-serif`;
          const w1 = ctx.measureText(n.label).width;
          ctx.font = `600 ${subFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
          const w2 = ctx.measureText(subText).width;

          const padX = 8 * mapScaleFactor;
          const barW = Math.max(2, 3 * mapScaleFactor);
          const boxW = Math.max(w1, w2) + padX * 2 + barW;
          const boxH = size; // MISMO ALTO QUE EL ICONO EN TODO MOMENTO
          const gap = 5 * mapScaleFactor;
          const lx = isLeft ? nodeX - gap - boxW : nodeX + size + gap;
          const ly = nodeY; // MISMO TOPE VERTICAL QUE EL ICONO

          ctx.fillStyle = isDimmed ? 'rgba(250, 248, 243, 0.75)' : 'rgba(250, 248, 243, 0.96)';
          ctx.fillRect(lx, ly, boxW, boxH);
          ctx.strokeStyle = isDimmed ? '#A59F91' : '#222426';
          // Borde del cuadro de texto constante en pantalla
          ctx.lineWidth = 1.1 / vp.zoom;
          ctx.strokeRect(lx, ly, boxW, boxH);

          // Barra lateral de tensión (mismo alto)
          ctx.fillStyle = isDimmed ? '#A59F91' : vCfg.color;
          if (isLeft) {
            ctx.fillRect(lx + boxW - barW, ly, barW, boxH);
          } else {
            ctx.fillRect(lx, ly, barW, boxH);
          }

          // Centrado vertical simétrico del texto dentro del rectángulo
          const textBlockH = titleFontSize + subFontSize + gapY;
          const textTop = ly + (boxH - textBlockH) / 2;
          const textLeft = isLeft ? lx + padX : lx + barW + padX;

          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillStyle = '#222426';
          ctx.font = `700 ${titleFontSize.toFixed(1)}px "IBM Plex Sans", sans-serif`;
          ctx.fillText(n.label, textLeft, textTop);

          ctx.fillStyle = '#55524B';
          ctx.font = `600 ${subFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
          ctx.fillText(subText, textLeft, textTop + titleFontSize + gapY);
        }
        return;
      }

      // MODO PLANO UNIFILAR: Caja Cuadrada de 124x124px
      ctx.fillStyle = isDimmed ? '#F3EFE6' : '#FAF8F3';
      ctx.fillRect(n.x, n.y, BOX_SIZE, BOX_SIZE);
      ctx.strokeStyle = isDimmed ? '#B8B2A4' : '#222426';
      ctx.lineWidth = isDimmed ? 1.0 : 1.6;
      ctx.strokeRect(n.x, n.y, BOX_SIZE, BOX_SIZE);

      // Franja superior de tensión (5px)
      ctx.fillStyle = isDimmed ? '#A59F91' : vCfg.color;
      ctx.fillRect(n.x, n.y, BOX_SIZE, 5);

      if (!showDetail && !forceDetail) {
        // VISTA MACRO LEJANA (< 0.25x): Cuadrado limpio y dot de tecnología (ultra liviano para 60fps constantes)
        const ibX = n.x + (BOX_SIZE - 66) / 2;
        const ibY = n.y + (BOX_SIZE - 66) / 2 + 2;
        ctx.fillStyle = isDimmed ? '#ECE8DE' : '#EFECE2';
        ctx.fillRect(ibX, ibY, 66, 66);
        ctx.strokeStyle = isDimmed ? '#B8B2A4' : vCfg.color;
        ctx.lineWidth = isDimmed ? 1.0 : 1.8;
        ctx.strokeRect(ibX, ibY, 66, 66);

        // Centro limpio sin SVG pesado para zoom lejano
        ctx.fillStyle = isDimmed ? '#A59F91' : vCfg.color;
        ctx.fillRect(ibX + 18, ibY + 18, 30, 30);
      } else {
        // VISTA DETALLADA CERCANA (>= 0.25x): Nombre arriba, Ícono 42x42 al centro, Pastilla técnica abajo y Borneras
        // 1. Nombre arriba
        ctx.fillStyle = isDimmed ? '#777268' : '#222426';
        ctx.font = '700 9.8px "IBM Plex Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        if (n.shortTitle2) {
          ctx.fillText(n.shortTitle1, n.x + HALF_BOX, n.y + 9);
          ctx.fillText(n.shortTitle2, n.x + HALF_BOX, n.y + 20);
        } else {
          ctx.fillText(n.shortTitle1, n.x + HALF_BOX, n.y + 13);
        }

        // 2. Caja de ícono al centro (42x42px)
        const ibX = n.x + (BOX_SIZE - 42) / 2;
        const ibY = n.y + 38;
        ctx.fillStyle = isDimmed ? '#ECE8DE' : '#EFECE2';
        ctx.fillRect(ibX, ibY, 42, 42);
        ctx.strokeStyle = isDimmed ? '#B8B2A4' : vCfg.color;
        ctx.lineWidth = isDimmed ? 1.0 : 1.5;
        ctx.strokeRect(ibX, ibY, 42, 42);

        const ix = ibX + 9;
        const iy = ibY + 9;
        ctx.translate(ix, iy);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.translate(-ix, -iy);

        // 3. Pastilla técnica inferior (Rol/Tipo, Tensión · MW y Amperes · Región)
        const pillX = n.x + 6;
        const pillY = n.y + 82;
        const pillW = BOX_SIZE - 12;
        const pillH = 37;
        ctx.fillStyle = isDimmed ? '#E2DDD0' : '#EAE4D7';
        ctx.fillRect(pillX, pillY, pillW, pillH);
        ctx.strokeStyle = isDimmed ? '#C4BEB0' : '#D1CBBF';
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        // Rol del nodo (Generación, EETT, Distribuidora, Cooperativa)
        ctx.fillStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.font = '700 7.2px "IBM Plex Mono", monospace';
        ctx.fillText(n.roleBadge || n.typeName, n.x + HALF_BOX, pillY + 3.5);

        ctx.fillStyle = isDimmed ? '#666258' : '#222426';
        ctx.font = '700 8.0px "IBM Plex Mono", monospace';
        ctx.fillText(`${n.kvText} · ${n.powerMw}`, n.x + HALF_BOX, pillY + 14.5);

        ctx.fillStyle = isDimmed ? '#8A857A' : '#55524B';
        ctx.font = '600 7.8px "IBM Plex Mono", monospace';
        ctx.fillText(`${formatMilesEnteros(n.amperes)} A · ${n.region}`, n.x + HALF_BOX, pillY + 25.5);

        // 4. Borneras de entrada / salida (8x8px)
        const hasInput = n.role !== 'GEN';
        const hasOutput = n.role !== 'DIST' && n.role !== 'COOP';
        ctx.fillStyle = isDimmed ? '#8A857A' : '#222426';
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = 1;
        if (hasInput) {
          const bx = isHoriz ? n.x - 4 : n.x + HALF_BOX - 4;
          const by = isHoriz ? n.y + HALF_BOX - 4 : n.y - 4;
          ctx.fillRect(bx, by, 8, 8);
          ctx.strokeRect(bx, by, 8, 8);
        }
        if (hasOutput) {
          const bx = isHoriz ? n.x + BOX_SIZE - 4 : n.x + HALF_BOX - 4;
          const by = isHoriz ? n.y + HALF_BOX - 4 : n.y + BOX_SIZE - 4;
          ctx.fillRect(bx, by, 8, 8);
          ctx.strokeRect(bx, by, 8, 8);
        }
      }
    };

    const drawBusNodeCard = (
      bp: { id: string; title: string; subtitle: string; kv: number; color: string },
      boxX: number,
      boxY: number,
      scale = 1.0
    ) => {
      ctx.save();
      ctx.translate(boxX, boxY);
      if (scale !== 1.0) {
        ctx.scale(scale, scale);
      }

      ctx.fillStyle = '#FAF8F3';
      ctx.fillRect(0, 0, BOX_SIZE, BOX_SIZE);
      ctx.strokeStyle = '#222426';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(0, 0, BOX_SIZE, BOX_SIZE);

      ctx.fillStyle = bp.color;
      ctx.fillRect(0, 0, BOX_SIZE, 5);

      ctx.fillStyle = '#222426';
      ctx.font = '700 9.5px "IBM Plex Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('BARRA COLECTORA', HALF_BOX, 9);
      ctx.fillText(`${bp.kv} kV SADI`, HALF_BOX, 21);

      const ibX = (BOX_SIZE - 42) / 2;
      const ibY = 38;
      ctx.fillStyle = '#EFECE2';
      ctx.fillRect(ibX, ibY, 42, 42);
      ctx.strokeStyle = bp.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(ibX, ibY, 42, 42);

      ctx.strokeStyle = bp.color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ibX + 7, ibY + 14);
      ctx.lineTo(ibX + 35, ibY + 14);
      ctx.moveTo(ibX + 7, ibY + 21);
      ctx.lineTo(ibX + 35, ibY + 21);
      ctx.moveTo(ibX + 7, ibY + 28);
      ctx.lineTo(ibX + 35, ibY + 28);
      ctx.stroke();

      ctx.fillStyle = '#222426';
      ctx.beginPath();
      ctx.arc(ibX + 14, ibY + 21, 2.5, 0, Math.PI * 2);
      ctx.arc(ibX + 28, ibY + 21, 2.5, 0, Math.PI * 2);
      ctx.fill();

      const pillX = 6;
      const pillY = 86;
      const pillW = BOX_SIZE - 12;
      const pillH = 31;
      ctx.fillStyle = '#EAE4D7';
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.strokeStyle = '#D1CBBF';
      ctx.lineWidth = 1;
      ctx.strokeRect(pillX, pillY, pillW, pillH);

      ctx.fillStyle = '#222426';
      ctx.font = '700 8.2px "IBM Plex Mono", monospace';
      ctx.fillText(`${bp.kv} kV · NODO TRONCAL`, HALF_BOX, pillY + 4);

      ctx.fillStyle = '#55524B';
      ctx.font = '600 7.8px "IBM Plex Mono", monospace';
      const sub = bp.subtitle.length > 20 ? bp.subtitle.slice(0, 18) + '…' : bp.subtitle;
      ctx.fillText(sub, HALF_BOX, pillY + 16.5);

      ctx.fillStyle = '#222426';
      ctx.strokeStyle = '#FAF8F3';
      ctx.lineWidth = 1;
      ctx.fillRect(-4, HALF_BOX - 4, 8, 8);
      ctx.strokeRect(-4, HALF_BOX - 4, 8, 8);
      ctx.fillRect(BOX_SIZE - 4, HALF_BOX - 4, 8, 8);
      ctx.strokeRect(BOX_SIZE - 4, HALF_BOX - 4, 8, 8);

      ctx.restore();
    };

    // PASO 1: DIBUJAR PRIMERO LAS ESTACIONES ATENUADAS (FONDO)
    if (!selectedEdge && !selectedNode && dimmedNodes.length > 0) {
      ctx.globalAlpha = 0.22;
      for (let i = 0; i < dimmedNodes.length; i++) {
        drawStationNode(dimmedNodes[i], true);
      }
    }

    // PASO 2: DIBUJAR ENCIMA LAS ESTACIONES ACTIVAS / RESALTADAS (FRENTE)
    if (!selectedEdge && !selectedNode) {
      ctx.globalAlpha = 1.0;
      for (let i = 0; i < activeNodes.length; i++) {
        drawStationNode(activeNodes[i], false);
      }
    } else if (selectedEdge) {
      // MODO AISLAMIENTO DE VÍNCULO: Se oculta TODO el resto y solo aparecen las dos cosas que conecta ese cable
      // colocadas una al lado de la otra en el centro de la pantalla actual.
      ctx.globalAlpha = 1.0;

      if (!isolationCenterRef.current) {
        const rect = canvas.getBoundingClientRect();
        const screenW = rect.width || window.innerWidth;
        const screenH = rect.height || window.innerHeight;
        isolationCenterRef.current = {
          x: (screenW / 2 - vp.x) / vp.zoom,
          y: (screenH / 2 - vp.y) / vp.zoom
        };
        isolationScaleRef.current = Math.max(1.0, 115 / (BOX_SIZE * vp.zoom));
      }

      const center = isolationCenterRef.current;
      const scale = isolationScaleRef.current || 1.0;
      const boxW = BOX_SIZE * scale;
      const boxH = BOX_SIZE * scale;
      const gap = 180 * scale;
      const totalW = boxW * 2 + gap;
      const leftX = center.x - totalW / 2;
      const leftY = center.y - boxH / 2;
      const rightX = center.x + totalW / 2 - boxW;
      const rightY = center.y - boxH / 2;

      // Buscar entidades origen y destino
      const srcNode = positionedNodes.find(
        (n) => n.uid === selectedEdge.source || n.code === selectedEdge.source || n.label === selectedEdge.source
      );
      const tgtNode = positionedNodes.find(
        (n) => n.uid === selectedEdge.target || n.code === selectedEdge.target || n.label === selectedEdge.target
      );
      const srcBus = !srcNode && busPlaques ? busPlaques.find((b) => b.id === selectedEdge.source) : null;
      const tgtBus = !tgtNode && busPlaques ? busPlaques.find((b) => b.id === selectedEdge.target) : null;

      // 1. Dibujar elemento de la izquierda (Origen)
      if (srcNode) {
        drawStationNode(srcNode, false, true, { x: leftX, y: leftY, scale });
      } else if (srcBus) {
        drawBusNodeCard(srcBus, leftX, leftY, scale);
      }

      // 2. Dibujar elemento de la derecha (Destino)
      if (tgtNode) {
        drawStationNode(tgtNode, false, true, { x: rightX, y: rightY, scale });
      } else if (tgtBus) {
        drawBusNodeCard(tgtBus, rightX, rightY, scale);
      }

      // 3. Dibujar cable directo horizontal entre ambas cajas
      const sx = leftX + boxW;
      const sy = leftY + boxH / 2;
      const tx = rightX;
      const ty = rightY + boxH / 2;

      const vCfg = VOLTAGE_CONFIG[normalizeKvKey(selectedEdge.kv)] || VOLTAGE_CONFIG[132];
      const cableW = Math.max(3.2, vCfg.width * 1.4 * scale);

      // Trazo base
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = vCfg.color;
      ctx.lineWidth = cableW;
      ctx.stroke();

      // Flujo animado
      if (animateFlow) {
        const dashLen = Math.max(10, Math.round(cableW * 2.8));
        const gapLen = Math.max(8, Math.round(cableW * 2.0));
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = vCfg.color;
        ctx.lineWidth = Math.max(2, cableW * 0.85);
        ctx.setLineDash([dashLen, gapLen]);
        const speedPx = (SPEED_PX_PER_SEC[getSpeedBucket(selectedEdge.amperes)] || 40) * scale;
        ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % (dashLen + gapLen);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Flecha direccional en el medio
      const midX = (sx + tx) / 2;
      const midY = sy;
      const arrowSize = 9 * scale;
      ctx.fillStyle = vCfg.color;
      ctx.strokeStyle = '#FAF8F3';
      ctx.lineWidth = 1.5 * scale;
      ctx.beginPath();
      ctx.moveTo(midX + arrowSize, midY);
      ctx.lineTo(midX - arrowSize * 0.7, midY - arrowSize * 0.6);
      ctx.lineTo(midX - arrowSize * 0.3, midY);
      ctx.lineTo(midX - arrowSize * 0.7, midY + arrowSize * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Pastilla técnica sobre el cable
      const ternasTxt = selectedEdge.parallelCount > 1 ? ` · ${selectedEdge.parallelCount} ternas` : '';
      const badgeText = `${selectedEdge.kv} kV · ${formatMilesEnteros(selectedEdge.amperes)} A${ternasTxt}`;
      const badgeFontSize = 9.5 * scale;
      ctx.font = `700 ${badgeFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
      const textW = ctx.measureText(badgeText).width;
      const badgePadX = 8 * scale;
      const badgePadY = 4.5 * scale;
      const badgeW = textW + badgePadX * 2 + 4 * scale;
      const badgeH = badgeFontSize + badgePadY * 2;
      const badgeX = midX - badgeW / 2;
      const badgeY = midY - badgeH - 10 * scale;

      ctx.fillStyle = '#FAF8F3';
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeStyle = '#222426';
      ctx.lineWidth = 1.4 * scale;
      ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

      ctx.fillStyle = vCfg.color;
      ctx.fillRect(badgeX, badgeY, 4 * scale, badgeH);

      ctx.fillStyle = '#222426';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, midX + 2 * scale, badgeY + badgeH / 2);

      // Transportista bajo el cable
      if (selectedEdge.empresa) {
        ctx.font = `600 ${(8 * scale).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = '#68655E';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`TRANSPORTISTA: ${selectedEdge.empresa}`, midX, midY + 12 * scale);
      }
    } else if (selectedNode) {
      // MODO NAVEGACIÓN INTERACTIVA 1-SALTO (ESTACIÓN CENTRAL + ALIMENTADORES + DESTINOS)
      ctx.globalAlpha = 1.0;

      if (!isolationCenterRef.current) {
        const rect = canvas.getBoundingClientRect();
        const screenW = rect.width || window.innerWidth;
        const screenH = rect.height || window.innerHeight;
        isolationCenterRef.current = {
          x: (screenW / 2 - vp.x) / vp.zoom,
          y: (screenH / 2 - vp.y) / vp.zoom
        };
        isolationScaleRef.current = Math.max(1.0, 115 / (BOX_SIZE * vp.zoom));
      }

      const center = isolationCenterRef.current;
      const scale = isolationScaleRef.current || 1.0;
      const boxW = BOX_SIZE * scale;
      const boxH = BOX_SIZE * scale;
      const rowGap = 22 * scale;
      const colGap = 160 * scale;

      const nodeId = selectedNode.uid;
      const inEdges = cableGeometries.filter(
        (cg) => cg.edge.target === nodeId || cg.edge.target === selectedNode.code
      );
      const outEdges = cableGeometries.filter(
        (cg) => cg.edge.source === nodeId || cg.edge.source === selectedNode.code
      );

      interface ConnectedHopItem {
        id: string;
        partnerNode: GridNodeData | null;
        partnerBus: { id: string; title: string; subtitle: string; kv: number; color: string } | null;
        edges: ComputedCableGeometry[];
        totalAmperes: number;
        highestKv: number;
        parallelCount: number;
      }

      const inPartnersMap = new Map<string, ConnectedHopItem>();
      inEdges.forEach((cg) => {
        const partnerId = cg.edge.source;
        if (!inPartnersMap.has(partnerId)) {
          const pNode =
            positionedNodes.find(
              (n) => n.uid === partnerId || n.code === partnerId || n.label === partnerId
            ) || null;
          const pBus =
            !pNode && busPlaques ? busPlaques.find((b) => b.id === partnerId) || null : null;
          inPartnersMap.set(partnerId, {
            id: partnerId,
            partnerNode: pNode,
            partnerBus: pBus,
            edges: [cg],
            totalAmperes: cg.edge.amperes,
            highestKv: cg.edge.kv,
            parallelCount: cg.edge.parallelCount || 1
          });
        } else {
          const item = inPartnersMap.get(partnerId)!;
          item.edges.push(cg);
          item.totalAmperes += cg.edge.amperes;
          item.highestKv = Math.max(item.highestKv, cg.edge.kv);
          item.parallelCount += cg.edge.parallelCount || 1;
        }
      });

      const outPartnersMap = new Map<string, ConnectedHopItem>();
      outEdges.forEach((cg) => {
        const partnerId = cg.edge.target;
        if (inPartnersMap.has(partnerId)) return;
        if (!outPartnersMap.has(partnerId)) {
          const pNode =
            positionedNodes.find(
              (n) => n.uid === partnerId || n.code === partnerId || n.label === partnerId
            ) || null;
          const pBus =
            !pNode && busPlaques ? busPlaques.find((b) => b.id === partnerId) || null : null;
          outPartnersMap.set(partnerId, {
            id: partnerId,
            partnerNode: pNode,
            partnerBus: pBus,
            edges: [cg],
            totalAmperes: cg.edge.amperes,
            highestKv: cg.edge.kv,
            parallelCount: cg.edge.parallelCount || 1
          });
        } else {
          const item = outPartnersMap.get(partnerId)!;
          item.edges.push(cg);
          item.totalAmperes += cg.edge.amperes;
          item.highestKv = Math.max(item.highestKv, cg.edge.kv);
          item.parallelCount += cg.edge.parallelCount || 1;
        }
      });

      const inItems = Array.from(inPartnersMap.values());
      const outItems = Array.from(outPartnersMap.values());

      let centerX = center.x - boxW / 2;
      let leftColX = center.x - boxW / 2 - colGap - boxW;
      let rightColX = center.x + boxW / 2 + colGap;

      if (inItems.length > 0 && outItems.length === 0) {
        centerX = center.x + colGap / 2;
        leftColX = center.x - colGap / 2 - boxW;
      } else if (inItems.length === 0 && outItems.length > 0) {
        centerX = center.x - colGap / 2 - boxW;
        rightColX = center.x + colGap / 2;
      } else if (inItems.length === 0 && outItems.length === 0) {
        centerX = center.x - boxW / 2;
      }

      const centerY = center.y - boxH / 2;

      const totalInH = inItems.length * boxH + Math.max(0, inItems.length - 1) * rowGap;
      const inStartY = center.y - totalInH / 2;

      const totalOutH = outItems.length * boxH + Math.max(0, outItems.length - 1) * rowGap;
      const outStartY = center.y - totalOutH / 2;

      // 1. Cables de Entrada (Alimentadores -> Nodo Central)
      inItems.forEach((item, i) => {
        const inY = inStartY + i * (boxH + rowGap);
        const sx = leftColX + boxW;
        const sy = inY + boxH / 2;

        const inSpread = inItems.length > 1 ? Math.min(boxH * 0.7, (inItems.length - 1) * 16 * scale) : 0;
        const inStep = inItems.length > 1 ? inSpread / (inItems.length - 1) : 0;
        const ty = inItems.length > 1 ? centerY + boxH / 2 - inSpread / 2 + i * inStep : centerY + boxH / 2;
        const tx = centerX;

        const dx = tx - sx;
        const cp1x = sx + dx * 0.45;
        const cp1y = sy;
        const cp2x = tx - dx * 0.45;
        const cp2y = ty;

        const vCfg = VOLTAGE_CONFIG[normalizeKvKey(item.highestKv)] || VOLTAGE_CONFIG[132];
        const cableW = Math.max(3.0, vCfg.width * 1.3 * scale);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);
        ctx.strokeStyle = vCfg.color;
        ctx.lineWidth = cableW;
        ctx.stroke();

        const dashLen = Math.max(10, Math.round(cableW * 2.8));
        const gapLen = Math.max(8, Math.round(cableW * 2.0));
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = Math.max(2, cableW * 0.55);
        ctx.setLineDash([dashLen, gapLen]);
        const speedPx = (SPEED_PX_PER_SEC[getSpeedBucket(item.totalAmperes)] || 40) * scale;
        ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % (dashLen + gapLen);
        ctx.stroke();
        ctx.setLineDash([]);

        // Flecha en el punto medio
        const midX = 0.125 * sx + 0.375 * cp1x + 0.375 * cp2x + 0.125 * tx;
        const midY = 0.125 * sy + 0.375 * cp1y + 0.375 * cp2y + 0.125 * ty;
        const ddx = 0.75 * (cp1x - sx) + 1.5 * (cp2x - cp1x) + 0.75 * (tx - cp2x);
        const ddy = 0.75 * (cp1y - sy) + 1.5 * (cp2y - cp1y) + 0.75 * (ty - cp2y);
        const angle = Math.atan2(ddy, ddx);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        const arrowSize = 8.5 * scale;
        ctx.fillStyle = vCfg.color;
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = 1.4 * scale;
        ctx.beginPath();
        ctx.moveTo(arrowSize, 0);
        ctx.lineTo(-arrowSize * 0.7, -arrowSize * 0.55);
        ctx.lineTo(-arrowSize * 0.3, 0);
        ctx.lineTo(-arrowSize * 0.7, arrowSize * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Pastilla técnica
        const ternasTxt = item.parallelCount > 1 ? ` · ${item.parallelCount}t` : '';
        const badgeText = `${item.highestKv} kV · ${formatMilesEnteros(item.totalAmperes)} A${ternasTxt}`;
        const badgeFontSize = 8.5 * scale;
        ctx.font = `700 ${badgeFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
        const textW = ctx.measureText(badgeText).width;
        const badgePadX = 6 * scale;
        const badgePadY = 3.5 * scale;
        const badgeW = textW + badgePadX * 2 + 4 * scale;
        const badgeH = badgeFontSize + badgePadY * 2;
        const badgeX = midX - badgeW / 2;
        const badgeY = midY - badgeH - 8 * scale;

        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = '#222426';
        ctx.lineWidth = 1.3 * scale;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = vCfg.color;
        ctx.fillRect(badgeX, badgeY, 3.5 * scale, badgeH);

        ctx.fillStyle = '#222426';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, midX + 2 * scale, badgeY + badgeH / 2);
      });

      // 2. Cables de Salida (Nodo Central -> Destinos)
      outItems.forEach((item, j) => {
        const outY = outStartY + j * (boxH + rowGap);
        const outSpread = outItems.length > 1 ? Math.min(boxH * 0.7, (outItems.length - 1) * 16 * scale) : 0;
        const outStep = outItems.length > 1 ? outSpread / (outItems.length - 1) : 0;
        const sy = outItems.length > 1 ? centerY + boxH / 2 - outSpread / 2 + j * outStep : centerY + boxH / 2;
        const sx = centerX + boxW;
        const ty = outY + boxH / 2;
        const tx = rightColX;

        const dx = tx - sx;
        const cp1x = sx + dx * 0.45;
        const cp1y = sy;
        const cp2x = tx - dx * 0.45;
        const cp2y = ty;

        const vCfg = VOLTAGE_CONFIG[normalizeKvKey(item.highestKv)] || VOLTAGE_CONFIG[132];
        const cableW = Math.max(3.0, vCfg.width * 1.3 * scale);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);
        ctx.strokeStyle = vCfg.color;
        ctx.lineWidth = cableW;
        ctx.stroke();

        const dashLen = Math.max(10, Math.round(cableW * 2.8));
        const gapLen = Math.max(8, Math.round(cableW * 2.0));
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = Math.max(2, cableW * 0.55);
        ctx.setLineDash([dashLen, gapLen]);
        const speedPx = (SPEED_PX_PER_SEC[getSpeedBucket(item.totalAmperes)] || 40) * scale;
        ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % (dashLen + gapLen);
        ctx.stroke();
        ctx.setLineDash([]);

        const midX = 0.125 * sx + 0.375 * cp1x + 0.375 * cp2x + 0.125 * tx;
        const midY = 0.125 * sy + 0.375 * cp1y + 0.375 * cp2y + 0.125 * ty;
        const ddx = 0.75 * (cp1x - sx) + 1.5 * (cp2x - cp1x) + 0.75 * (tx - cp2x);
        const ddy = 0.75 * (cp1y - sy) + 1.5 * (cp2y - cp1y) + 0.75 * (ty - cp2y);
        const angle = Math.atan2(ddy, ddx);

        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        const arrowSize = 8.5 * scale;
        ctx.fillStyle = vCfg.color;
        ctx.strokeStyle = '#FAF8F3';
        ctx.lineWidth = 1.4 * scale;
        ctx.beginPath();
        ctx.moveTo(arrowSize, 0);
        ctx.lineTo(-arrowSize * 0.7, -arrowSize * 0.55);
        ctx.lineTo(-arrowSize * 0.3, 0);
        ctx.lineTo(-arrowSize * 0.7, arrowSize * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const ternasTxt = item.parallelCount > 1 ? ` · ${item.parallelCount}t` : '';
        const badgeText = `${item.highestKv} kV · ${formatMilesEnteros(item.totalAmperes)} A${ternasTxt}`;
        const badgeFontSize = 8.5 * scale;
        ctx.font = `700 ${badgeFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
        const textW = ctx.measureText(badgeText).width;
        const badgePadX = 6 * scale;
        const badgePadY = 3.5 * scale;
        const badgeW = textW + badgePadX * 2 + 4 * scale;
        const badgeH = badgeFontSize + badgePadY * 2;
        const badgeX = midX - badgeW / 2;
        const badgeY = midY - badgeH - 8 * scale;

        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
        ctx.strokeStyle = '#222426';
        ctx.lineWidth = 1.3 * scale;
        ctx.strokeRect(badgeX, badgeY, badgeW, badgeH);

        ctx.fillStyle = vCfg.color;
        ctx.fillRect(badgeX, badgeY, 3.5 * scale, badgeH);

        ctx.fillStyle = '#222426';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, midX + 2 * scale, badgeY + badgeH / 2);
      });

      // 3. Dibujar tarjetas de Alimentadores (Entradas)
      if (inItems.length > 0) {
        const inHeaderTxt = `◄ ALIMENTADORES (${inItems.length})`;
        ctx.font = `700 ${(9 * scale).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = '#55524B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(inHeaderTxt, leftColX + boxW / 2, inStartY - 10 * scale);

        inItems.forEach((item, i) => {
          const inY = inStartY + i * (boxH + rowGap);
          if (item.partnerNode) {
            drawStationNode(item.partnerNode, false, true, { x: leftColX, y: inY, scale });
          } else if (item.partnerBus) {
            drawBusNodeCard(item.partnerBus, leftColX, inY, scale);
          }
        });
      }

      // 4. Dibujar tarjetas de Destinos (Salidas)
      if (outItems.length > 0) {
        const outHeaderTxt = `DESTINOS (${outItems.length}) ►`;
        ctx.font = `700 ${(9 * scale).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = '#55524B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(outHeaderTxt, rightColX + boxW / 2, outStartY - 10 * scale);

        outItems.forEach((item, j) => {
          const outY = outStartY + j * (boxH + rowGap);
          if (item.partnerNode) {
            drawStationNode(item.partnerNode, false, true, { x: rightColX, y: outY, scale });
          } else if (item.partnerBus) {
            drawBusNodeCard(item.partnerBus, rightColX, outY, scale);
          }
        });
      }

      // 5. Dibujar Nodo Central
      ctx.strokeStyle = '#222426';
      ctx.lineWidth = 2.4 * scale;
      ctx.strokeRect(centerX - 3 * scale, centerY - 3 * scale, boxW + 6 * scale, boxH + 6 * scale);

      drawStationNode(selectedNode, false, true, { x: centerX, y: centerY, scale });

      const focusBadgeText = '★ NODO EN FOCO';
      const fbFontSize = 9.0 * scale;
      ctx.font = `700 ${fbFontSize.toFixed(1)}px "IBM Plex Mono", monospace`;
      const fbW = ctx.measureText(focusBadgeText).width + 14 * scale;
      const fbH = fbFontSize + 7 * scale;
      const fbX = centerX + (boxW - fbW) / 2;
      const fbY = centerY - fbH - 7 * scale;
      ctx.fillStyle = '#222426';
      ctx.fillRect(fbX, fbY, fbW, fbH);
      ctx.fillStyle = '#FAF8F3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(focusBadgeText, centerX + boxW / 2, fbY + fbH / 2);
    }
  }, [
    compiledPaths,
    cableGeometries,
    positionedNodes,
    dimmedNodes,
    activeNodes,
    dimmedCables,
    activeCables,
    busPlaques,
    layoutMode,
    filterKv,
    filterRegion,
    filterTech,
    filterRole,
    searchQuery,
    animateFlow,
    selectedEdge,
    selectedNode
  ]);

  // Bucle de animación de corriente (pausado automáticamente mientras el dedo arrastra o si el usuario desactivó el flujo)
  useEffect(() => {
    if (!animateFlow) {
      renderCanvasFrame();
      return;
    }

    let animId: number;
    let lastTs = performance.now();
    let lastRenderTs = performance.now();

    const tick = (now: number) => {
      // Limitar a ~38 fps para optimizar GPU y batería en móviles y pantallas de 90/120Hz
      if (now - lastRenderTs < 26) {
        animId = requestAnimationFrame(tick);
        return;
      }
      const dt = (now - lastTs) / 1000;
      lastTs = now;
      lastRenderTs = now;

      if (!isPanningRef.current) {
        dashPhaseRef.current += dt;
        renderCanvasFrame();
      }
      animId = requestAnimationFrame(tick);
    };

    renderCanvasFrame();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvasFrame, animateFlow]);

  // Solo re-encuadrar automáticamente (fitView) si el usuario cambia de modo (Plano vs Mapa)
  // o en la carga inicial.
  // Al tocar filtros (tensión, rol, región, tecnología, búsqueda), se preserva el nivel de zoom y posición actual.
  const prevLayoutModeRef = useRef<string>('');
  useEffect(() => {
    if (positionedNodes.length === 0) return;

    if (prevLayoutModeRef.current === layoutMode) {
      // Si solo cambiaron los filtros o búsqueda, redibujar sin tocar el zoom ni mover la cámara
      renderCanvasFrame();
      return;
    }
    prevLayoutModeRef.current = layoutMode;

    const timer = setTimeout(() => {
      fitView({ padding: 0.08, duration: 240 });
      setTimeout(() => {
        vpRef.current = getViewport();
        renderCanvasFrame();
      }, 260);
    }, 40);
    return () => clearTimeout(timer);
  }, [
    layoutMode,
    filterKv,
    filterRole,
    filterRegion,
    filterTech,
    searchQuery,
    positionedNodes.length,
    fitView,
    getViewport,
    renderCanvasFrame
  ]);

  const handleMoveStart = useCallback(() => {
    isPanningRef.current = true;
  }, []);

  const handleViewportMove = useCallback(
    (_evt: unknown, vp: Viewport) => {
      vpRef.current = vp;
      isPanningRef.current = true;
      renderCanvasFrame();

      const z = vp.zoom;
      const threshold = layoutMode === 'MAP' ? MAP_LOD_ZOOM : PLANO_LOD_ZOOM;
      const isDetail = z >= threshold;

      if (zoomTextRef.current) {
        zoomTextRef.current.textContent = `ZOOM ${formatDecimalAr(z, 2)}x`;
      }

      if (panTimerRef.current) {
        window.clearTimeout(panTimerRef.current);
      }
      panTimerRef.current = window.setTimeout(() => {
        isPanningRef.current = false;
      }, 120);
    },
    [layoutMode, renderCanvasFrame]
  );

  const handleMoveEnd = useCallback(
    (_evt: unknown, vp: Viewport) => {
      vpRef.current = vp;
      isPanningRef.current = false;
      renderCanvasFrame();
    },
    [renderCanvasFrame]
  );

  // Detección matemática instantánea (< 0.1 ms) al tocar cualquier Estación o cualquier Cable
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      const flowPt = screenToFlowPosition({ x: event.clientX, y: event.clientY });

      // Si hay un vínculo aislado, verificar clic en las dos cajas colocadas una al lado de la otra
      if (selectedEdge && isolationCenterRef.current) {
        const center = isolationCenterRef.current;
        const scale = isolationScaleRef.current || 1.0;
        const boxW = BOX_SIZE * scale;
        const boxH = BOX_SIZE * scale;
        const gap = 180 * scale;
        const totalW = boxW * 2 + gap;
        const leftX = center.x - totalW / 2;
        const leftY = center.y - boxH / 2;
        const rightX = center.x + totalW / 2 - boxW;
        const rightY = center.y - boxH / 2;

        const onLeftBox =
          flowPt.x >= leftX - 4 &&
          flowPt.x <= leftX + boxW + 4 &&
          flowPt.y >= leftY - 4 &&
          flowPt.y <= leftY + boxH + 4;

        const onRightBox =
          flowPt.x >= rightX - 4 &&
          flowPt.x <= rightX + boxW + 4 &&
          flowPt.y >= rightY - 4 &&
          flowPt.y <= rightY + boxH + 4;

        if (onLeftBox) {
          const srcNode = positionedNodes.find(
            (n) => n.uid === selectedEdge.source || n.code === selectedEdge.source || n.label === selectedEdge.source
          );
          if (srcNode) {
            isolationCenterRef.current = null;
            onSelectNode(srcNode);
          }
          return;
        }

        if (onRightBox) {
          const tgtNode = positionedNodes.find(
            (n) => n.uid === selectedEdge.target || n.code === selectedEdge.target || n.label === selectedEdge.target
          );
          if (tgtNode) {
            isolationCenterRef.current = null;
            onSelectNode(tgtNode);
          }
          return;
        }

        // Clic en cualquier otra parte fuera de las dos cajas -> volver al plano original
        onClearSelectedEdge();
        return;
      }

      // Si hay una estación aislada en navegación 1-salto, comprobar clics en centro o nodos adyacentes
      if (selectedNode && isolationCenterRef.current) {
        const center = isolationCenterRef.current;
        const scale = isolationScaleRef.current || 1.0;
        const boxW = BOX_SIZE * scale;
        const boxH = BOX_SIZE * scale;
        const rowGap = 22 * scale;
        const colGap = 160 * scale;

        const nodeId = selectedNode.uid;
        const inEdges = cableGeometries.filter(
          (cg) => cg.edge.target === nodeId || cg.edge.target === selectedNode.code
        );
        const outEdges = cableGeometries.filter(
          (cg) => cg.edge.source === nodeId || cg.edge.source === selectedNode.code
        );

        const inPartnersMap = new Map<string, GridNodeData | null>();
        inEdges.forEach((cg) => {
          const partnerId = cg.edge.source;
          if (!inPartnersMap.has(partnerId)) {
            const pNode =
              positionedNodes.find(
                (n) => n.uid === partnerId || n.code === partnerId || n.label === partnerId
              ) || null;
            inPartnersMap.set(partnerId, pNode);
          }
        });

        const outPartnersMap = new Map<string, GridNodeData | null>();
        outEdges.forEach((cg) => {
          const partnerId = cg.edge.target;
          if (inPartnersMap.has(partnerId)) return;
          if (!outPartnersMap.has(partnerId)) {
            const pNode =
              positionedNodes.find(
                (n) => n.uid === partnerId || n.code === partnerId || n.label === partnerId
              ) || null;
            outPartnersMap.set(partnerId, pNode);
          }
        });

        const inItemsList = Array.from(inPartnersMap.values());
        const outItemsList = Array.from(outPartnersMap.values());

        let centerX = center.x - boxW / 2;
        let leftColX = center.x - boxW / 2 - colGap - boxW;
        let rightColX = center.x + boxW / 2 + colGap;

        if (inItemsList.length > 0 && outItemsList.length === 0) {
          centerX = center.x + colGap / 2;
          leftColX = center.x - colGap / 2 - boxW;
        } else if (inItemsList.length === 0 && outItemsList.length > 0) {
          centerX = center.x - colGap / 2 - boxW;
          rightColX = center.x + colGap / 2;
        } else if (inItemsList.length === 0 && outItemsList.length === 0) {
          centerX = center.x - boxW / 2;
        }

        const centerY = center.y - boxH / 2;
        const totalInH = inItemsList.length * boxH + Math.max(0, inItemsList.length - 1) * rowGap;
        const inStartY = center.y - totalInH / 2;
        const totalOutH = outItemsList.length * boxH + Math.max(0, outItemsList.length - 1) * rowGap;
        const outStartY = center.y - totalOutH / 2;

        // Clic en el nodo central
        if (
          flowPt.x >= centerX - 4 &&
          flowPt.x <= centerX + boxW + 4 &&
          flowPt.y >= centerY - 4 &&
          flowPt.y <= centerY + boxH + 4
        ) {
          return;
        }

        // Clic en algún nodo alimentador (Entrada) -> saltar y seguir camino
        for (let i = 0; i < inItemsList.length; i++) {
          const pNode = inItemsList[i];
          const y_i = inStartY + i * (boxH + rowGap);
          if (
            flowPt.x >= leftColX - 4 &&
            flowPt.x <= leftColX + boxW + 4 &&
            flowPt.y >= y_i - 4 &&
            flowPt.y <= y_i + boxH + 4
          ) {
            if (pNode) {
              isolationCenterRef.current = null;
              onSelectNode(pNode);
            }
            return;
          }
        }

        // Clic en algún nodo destino (Salida) -> saltar y seguir camino
        for (let j = 0; j < outItemsList.length; j++) {
          const pNode = outItemsList[j];
          const y_j = outStartY + j * (boxH + rowGap);
          if (
            flowPt.x >= rightColX - 4 &&
            flowPt.x <= rightColX + boxW + 4 &&
            flowPt.y >= y_j - 4 &&
            flowPt.y <= y_j + boxH + 4
          ) {
            if (pNode) {
              isolationCenterRef.current = null;
              onSelectNode(pNode);
            }
            return;
          }
        }

        // Clic fuera -> restaurar plano completo
        onClearSelectedNode();
        return;
      }

      // 1. Verificar primero si el usuario tocó una estación (icono o rectángulo de datos)
      const isMap = layoutMode === 'MAP';
      const mapScaleFactor = isMap ? Math.min(1.0, 0.95 / Math.max(0.12, vpRef.current.zoom)) : 1.0;
      const size = isMap ? 40 * mapScaleFactor : BOX_SIZE;
      const halfSize = size / 2;
      const showDetail = vpRef.current.zoom >= (isMap ? MAP_LOD_ZOOM : PLANO_LOD_ZOOM);

      for (let i = positionedNodes.length - 1; i >= 0; i--) {
        const n = positionedNodes[i];
        const cx = isMap ? n.x + 18 : n.x + HALF_BOX;
        const cy = isMap ? n.y + 18 : n.y + HALF_BOX;
        const nx = cx - halfSize;
        const ny = cy - halfSize;

        // Clic sobre el icono
        const onIcon = (
          flowPt.x >= nx - 4 &&
          flowPt.x <= nx + size + 4 &&
          flowPt.y >= ny - 4 &&
          flowPt.y <= ny + size + 4
        );

        // Clic sobre el rectángulo de información (mismo alto)
        let onLabel = false;
        if (isMap && showDetail) {
          const isLeft = n.labelSide === 'left';
          const inY = flowPt.y >= ny - 2 && flowPt.y <= ny + size + 2;
          if (inY) {
            onLabel = isLeft
              ? flowPt.x >= nx - 240 * mapScaleFactor && flowPt.x <= nx
              : flowPt.x >= nx + size && flowPt.x <= nx + size + 240 * mapScaleFactor;
          }
        }

        if (onIcon || onLabel) {
          isolationCenterRef.current = null;
          onSelectNode(n);
          return;
        }
      }

      // 2. Si no tocó una estación, verificar si tocó un cable (radio táctil 18px)
      let bestEdge: GridEdgeData | null = null;
      let bestDistSq = 18 * 18;

      for (let i = 0; i < cableGeometries.length; i++) {
        const cg = cableGeometries[i];
        const pts = cg.pts;
        for (let j = 0; j < pts.length - 1; j++) {
          const dSq = distToSegmentSq(
            flowPt.x,
            flowPt.y,
            pts[j][0],
            pts[j][1],
            pts[j + 1][0],
            pts[j + 1][1]
          );
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestEdge = cg.edge;
          }
        }
      }

      if (bestEdge) {
        isolationCenterRef.current = null;
        onSelectEdge(bestEdge);
      } else if (selectedEdge) {
        onClearSelectedEdge();
      } else if (selectedNode) {
        onClearSelectedNode();
      }
    },
    [
      positionedNodes,
      cableGeometries,
      layoutMode,
      screenToFlowPosition,
      onSelectNode,
      onClearSelectedNode,
      onSelectEdge,
      selectedEdge,
      selectedNode,
      onClearSelectedEdge
    ]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* LIENZO CANVAS 2D UNIFICADO (Dibuja Provincias + 1.122 Cables + 830 Estaciones con Culling instantáneo) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 1
        }}
      />

      {/* Indicador sutil de nivel de zoom en la esquina inferior izquierda */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 20,
          backgroundColor: 'rgba(250, 248, 243, 0.92)',
          border: '1px solid #C8C2B4',
          padding: '4px 8px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '11px',
          fontWeight: 600,
          color: '#55524B',
          pointerEvents: 'none',
          borderRadius: '3px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}
      >
        <span ref={zoomTextRef}>ZOOM 1,00x</span>
      </div>

      <ReactFlow
        nodes={boundsNodes}
        edges={EMPTY_EDGES}
        nodeTypes={nodeTypes}
        onMoveStart={handleMoveStart}
        onMove={handleViewportMove}
        onMoveEnd={handleMoveEnd}
        onPaneClick={handlePaneClick}
        fitView
        minZoom={0.04}
        maxZoom={3.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'transparent', zIndex: 2 }}
      >
        <Background color="#DED8CA" gap={28} size={1} style={{ zIndex: 0 }} />
        <Controls showInteractive={false} style={{ border: '1px solid #222426', background: '#FAF8F3' }} />
      </ReactFlow>
    </div>
  );
};

// ============================================================================
// 8. COMPONENTE PRINCIPAL SADI (830 PARTICIPANTES + TELEMETRÍA EN VIVO)
// ============================================================================
export const PrototypeDagre: React.FC = () => {
  // Detección inicial: celulares/tablets en vertical (< 768px o touch con pantalla alta)
  const isMobileInitial = typeof window !== 'undefined'
    ? (window.innerWidth < 768 || (window.innerWidth < 1024 && window.innerHeight > window.innerWidth))
    : false;

  const [layoutMode, setLayoutMode] = useState<'DAGRE_LR' | 'DAGRE_TB' | 'BUSES' | 'MAP'>(
    isMobileInitial ? 'DAGRE_TB' : 'DAGRE_LR'
  );
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [filterKv, setFilterKv] = useState<number[]>([]);
  const [filterRole, setFilterRole] = useState<string[]>([]);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterTech, setFilterTech] = useState<string[]>([]);
  const [openDropdown, setOpenDropdown] = useState<'kv' | 'role' | 'tech' | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFullWfs, setShowFullWfs] = useState<boolean>(false);
  const [animateFlow, setAnimateFlow] = useState<boolean>(!isMobileInitial);
  const [counts, setCounts] = useState<{ nodes: number; edges: number }>({ nodes: 830, edges: 1122 });
  const [selectedNode, setSelectedNode] = useState<GridNodeData | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GridEdgeData | null>(null);

  useEffect(() => {
    fetch('/api/topology')
      .then((r) => r.json())
      .then((data: TopologyData) => {
        if (data) setTopology(data);
      })
      .catch((err) => console.warn('Error loading topology:', err));
  }, []);

  useEffect(() => {
    const fetchTelemetry = () => {
      fetch('/api/telemetry')
        .then((r) => r.json())
        .then((data: TelemetryData) => {
          if (data) setTelemetry(data);
        })
        .catch((err) => console.warn('Error loading telemetry:', err));
    };
    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectNode = useCallback((nodeData: GridNodeData) => {
    setSelectedEdge(null);
    setSelectedNode(nodeData);
  }, []);

  const handleSelectEdge = useCallback((edgeData: GridEdgeData) => {
    setSelectedNode(null);
    setSelectedEdge(edgeData);
  }, []);

  const handleCountsChange = useCallback((n: number, e: number) => {
    setCounts({ nodes: n, edges: e });
  }, []);

  const closeModal = () => {
    setSelectedNode(null);
    setSelectedEdge(null);
    setOpenDropdown(null);
  };

  const resetAllFilters = () => {
    setFilterKv([]);
    setFilterRole([]);
    setFilterRegion(null);
    setFilterTech([]);
    setSearchQuery('');
  };

  const toggleKv = (kvNum: number) => {
    setFilterKv((prev) =>
      prev.includes(kvNum) ? prev.filter((k) => k !== kvNum) : [...prev, kvNum]
    );
  };

  const toggleRole = (rId: string) => {
    setFilterRole((prev) =>
      prev.includes(rId) ? prev.filter((r) => r !== rId) : [...prev, rId]
    );
  };

  const toggleTech = (tId: string) => {
    setFilterTech((prev) =>
      prev.includes(tId) ? prev.filter((t) => t !== tId) : [...prev, tId]
    );
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100dvh',
        backgroundColor: '#F3EFE6',
        color: '#222426',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '"IBM Plex Sans", sans-serif'
      }}
    >
      <header
        style={{
          backgroundColor: '#EAE4D7',
          borderBottom: '1px solid #C8C2B4',
          padding: '7px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          zIndex: 30
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              backgroundColor: '#222426',
              color: '#FAF8F3',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '10px',
              fontWeight: 700,
              padding: '4px 8px'
            }}
          >
            SADI // RED COMPLETA ({counts.nodes} NODOS · {counts.edges} VÍNCULOS)
          </span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>
              Sistema Argentino de Interconexión — 474 Generadoras · 323 EETT · 33 Distribuidoras · 580 Cooperativas
            </div>
            <div
              style={{
                fontSize: '10.5px',
                color: '#55524B',
                fontFamily: '"IBM Plex Mono", monospace'
              }}
            >
              {telemetry?.sadi_total_mw ? (
                <>
                  DEMANDA SADI: <strong>{formatMilesEnteros(telemetry.sadi_total_mw)} MW</strong> · FREC:{' '}
                  <strong>{formatDecimalAr(telemetry.frequency_hz || 50.0, 2)} Hz</strong> ·{' '}
                  <span style={{ color: '#3E725C', fontWeight: 700 }}>{telemetry.status || 'ONLINE 5M'}</span>
                  <span style={{ color: '#78736A', marginLeft: '8px' }}>
                    (Punto = miles · Coma = decimal)
                  </span>
                </>
              ) : (
                '474 Centrales + 323 Estaciones + 33 Distribuidoras + 580 Cooperativas · (Punto = miles · Coma = decimal)'
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', border: '1.5px solid #222426', backgroundColor: '#FAF8F3' }}>
          <button
            onClick={() => {
              closeModal();
              setLayoutMode('DAGRE_TB');
            }}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              borderRight: '1px solid #C8C2B4',
              cursor: 'pointer',
              backgroundColor: layoutMode === 'DAGRE_TB' ? '#222426' : 'transparent',
              color: layoutMode === 'DAGRE_TB' ? '#FAF8F3' : '#222426'
            }}
          >
            🌳 PLANO VERTICAL
          </button>
          <button
            onClick={() => {
              closeModal();
              setLayoutMode('BUSES');
            }}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              borderRight: '1px solid #C8C2B4',
              cursor: 'pointer',
              backgroundColor: layoutMode === 'BUSES' ? '#222426' : 'transparent',
              color: layoutMode === 'BUSES' ? '#FAF8F3' : '#222426'
            }}
          >
            ⚡ PLANO BARRAS
          </button>
          <button
            onClick={() => {
              closeModal();
              setLayoutMode('DAGRE_LR');
            }}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              borderRight: '1px solid #C8C2B4',
              cursor: 'pointer',
              backgroundColor: layoutMode === 'DAGRE_LR' ? '#222426' : 'transparent',
              color: layoutMode === 'DAGRE_LR' ? '#FAF8F3' : '#222426'
            }}
          >
            📐 PLANO HORIZONTAL
          </button>
          <button
            onClick={() => {
              closeModal();
              setLayoutMode('MAP');
            }}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              borderRight: '1px solid #C8C2B4',
              cursor: 'pointer',
              backgroundColor: layoutMode === 'MAP' ? '#222426' : 'transparent',
              color: layoutMode === 'MAP' ? '#FAF8F3' : '#222426'
            }}
          >
            🗺️ MAPA ARGENTINA
          </button>
          <button
            onClick={() => setAnimateFlow((v) => !v)}
            title="Activar o pausar la animación de flujo en cables"
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: animateFlow ? '#222426' : 'transparent',
              color: animateFlow ? '#FAF8F3' : '#68655E',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>{animateFlow ? '⚡ ANIMACIÓN: ON' : '⏸️ ANIMACIÓN: OFF'}</span>
          </button>
        </div>
      </header>

      {/* BARRA DE BÚSQUEDA SUPERIOR (FILA 1) */}
      <div
        style={{
          backgroundColor: '#FAF8F3',
          borderBottom: '1px solid #E2DDD0',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '10px',
          flexShrink: 0,
          zIndex: 41
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #222426',
            padding: '4px 8px',
            flex: 1,
            borderRadius: '2px'
          }}
        >
          <Search className="w-3.5 h-3.5" style={{ color: '#68655E', flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar central, estación, empresa o provincia..."
            style={{
              border: 'none',
              outline: 'none',
              backgroundColor: 'transparent',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              width: '100%',
              color: '#222426'
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X className="w-3.5 h-3.5" style={{ color: '#222426' }} />
            </button>
          )}
        </div>

        {/* BOTÓN LIMPIAR FILTROS (con posición fija y estable para no mover los botones) */}
        {(filterKv.length > 0 || filterRole.length > 0 || filterTech.length > 0 || filterRegion || searchQuery) && (
          <button
            onClick={resetAllFilters}
            style={{
              backgroundColor: '#C04A35',
              color: '#FAF8F3',
              border: '1px solid #222426',
              padding: '4px 8px',
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: '2px',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            ✕ LIMPIAR
          </button>
        )}
      </div>

      {/* BARRA DE FILTROS DESPLEGABLES (FILA 2) - Botones estables sin saltos verticales */}
      <div
        style={{
          backgroundColor: '#F3EFE6',
          borderBottom: '1px solid #D5CFC2',
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '9.5px',
          flexShrink: 0,
          position: 'relative',
          zIndex: 40,
          whiteSpace: 'nowrap'
        }}
      >
        {/* 1. DROPDOWN TENSIÓN */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown((prev) => (prev === 'kv' ? null : 'kv'))}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '4px 7px',
              border: filterKv.length > 0 ? '1.5px solid #222426' : '1px solid #C8C2B4',
              backgroundColor: filterKv.length > 0 ? '#222426' : '#FAF8F3',
              color: filterKv.length > 0 ? '#FAF8F3' : '#222426',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '2px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>⚡ TENSIÓN{filterKv.length > 0 ? ` (${filterKv.length})` : ''}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {openDropdown === 'kv' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                backgroundColor: '#FAF8F3',
                border: '1.5px solid #222426',
                boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 50,
                minWidth: '150px'
              }}
            >
              {VOLTAGE_ORDER.map((kvNum) => {
                const cfg = VOLTAGE_CONFIG[kvNum];
                const active = filterKv.includes(kvNum);
                return (
                  <button
                    key={kvNum}
                    onClick={() => toggleKv(kvNum)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '4px 7px',
                      backgroundColor: active ? '#EAE4D7' : 'transparent',
                      border: '1px solid',
                      borderColor: active ? '#222426' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: '10px',
                      fontWeight: active ? 700 : 500,
                      color: '#222426',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '12px',
                          height: '4px',
                          backgroundColor: cfg.color
                        }}
                      />
                      <span>{cfg.displayKv}</span>
                    </div>
                    {active && <Check className="w-3 h-3" style={{ color: '#222426' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. DROPDOWN ESLABÓN */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown((prev) => (prev === 'role' ? null : 'role'))}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '4px 7px',
              border: filterRole.length > 0 ? '1.5px solid #222426' : '1px solid #C8C2B4',
              backgroundColor: filterRole.length > 0 ? '#222426' : '#FAF8F3',
              color: filterRole.length > 0 ? '#FAF8F3' : '#222426',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '2px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>🏭 ESLABÓN{filterRole.length > 0 ? ` (${filterRole.length})` : ''}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {openDropdown === 'role' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                backgroundColor: '#FAF8F3',
                border: '1.5px solid #222426',
                boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 50,
                minWidth: '185px'
              }}
            >
              {[
                { id: 'GEN', label: '1. GENERACIÓN (474)' },
                { id: 'ET500', label: '2. EETT 500kV (59)' },
                { id: 'ET132', label: '3. SUBTRANSMISIÓN (264)' },
                { id: 'DIST', label: '4. DISTRIBUCIÓN (33)' },
                { id: 'COOP', label: '5. COOPERATIVAS (580)' }
              ].map((r) => {
                const active = filterRole.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => toggleRole(r.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '4px 7px',
                      backgroundColor: active ? '#EAE4D7' : 'transparent',
                      border: '1px solid',
                      borderColor: active ? '#222426' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: '9.8px',
                      fontWeight: active ? 700 : 500,
                      color: '#222426',
                      textAlign: 'left'
                    }}
                  >
                    <span>{r.label}</span>
                    {active && <Check className="w-3 h-3" style={{ color: '#222426' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. DROPDOWN TECNOLOGÍA */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpenDropdown((prev) => (prev === 'tech' ? null : 'tech'))}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '9.5px',
              fontWeight: 700,
              padding: '4px 7px',
              border: filterTech.length > 0 ? '1.5px solid #222426' : '1px solid #C8C2B4',
              backgroundColor: filterTech.length > 0 ? '#222426' : '#FAF8F3',
              color: filterTech.length > 0 ? '#FAF8F3' : '#222426',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              borderRadius: '2px',
              whiteSpace: 'nowrap'
            }}
          >
            <span>⚙️ TECNOLOGÍA{filterTech.length > 0 ? ` (${filterTech.length})` : ''}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {openDropdown === 'tech' && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                backgroundColor: '#FAF8F3',
                border: '1.5px solid #222426',
                boxShadow: '0 6px 16px rgba(0,0,0,0.18)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                zIndex: 50,
                minWidth: '175px'
              }}
            >
              {[
                { id: 'Hidroeléctrica', label: '💧 Hidroeléctrica (62)' },
                { id: 'Nuclear', label: '☢️ Nuclear (2)' },
                { id: 'Térmica', label: '🔥 Térmica (205)' },
                { id: 'Eólica', label: '💨 Eólica (71)' },
                { id: 'Solar', label: '☀️ Solar (84)' },
                { id: 'Biomasa', label: '🌱 Biomasa (50)' }
              ].map((t) => {
                const active = filterTech.includes(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTech(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '4px 7px',
                      backgroundColor: active ? '#EAE4D7' : 'transparent',
                      border: '1px solid',
                      borderColor: active ? '#222426' : 'transparent',
                      cursor: 'pointer',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: '9.8px',
                      fontWeight: active ? 700 : 500,
                      color: '#222426',
                      textAlign: 'left'
                    }}
                  >
                    <span>{t.label}</span>
                    {active && <Check className="w-3 h-3" style={{ color: '#222426' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* LIENZO INTERACTIVO */}
      <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
        <ReactFlowProvider>
          <FlowSceneInner
            layoutMode={layoutMode}
            topology={topology}
            telemetry={telemetry}
            filterKv={filterKv}
            filterRole={filterRole}
            filterRegion={filterRegion}
            filterTech={filterTech}
            searchQuery={searchQuery}
            showFullWfs={showFullWfs}
            animateFlow={animateFlow}
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onToggleFullWfs={() => setShowFullWfs((v) => !v)}
            onSelectNode={handleSelectNode}
            onClearSelectedNode={() => setSelectedNode(null)}
            onSelectEdge={handleSelectEdge}
            onClearSelectedEdge={() => setSelectedEdge(null)}
            onCountsChange={handleCountsChange}
          />
        </ReactFlowProvider>

        {/* BOTÓN DISCRETO PARA VOLVER A LA VISTA TOTAL (SIN MODAL DE INFORMACIÓN) */}
        {(selectedEdge || selectedNode) && (
          <button
            onClick={() => {
              setSelectedEdge(null);
              setSelectedNode(null);
            }}
            title="Volver a la vista total (Esc)"
            style={{
              position: 'absolute',
              top: 14,
              right: 14,
              backgroundColor: '#222426',
              color: '#FAF8F3',
              border: '1px solid #FAF8F3',
              borderRadius: '4px',
              padding: '7px 12px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: '"IBM Plex Mono", monospace',
              boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
              zIndex: 1000
            }}
          >
            <span>✕</span> VOLVER A LA VISTA TOTAL
          </button>
        )}
      </div>

      {/* BARRA INFERIOR DE TELEMETRÍA REGIONAL CAMMESA */}
      {telemetry?.regions && (
        <footer
          style={{
            backgroundColor: '#EAE4D7',
            borderTop: '1px solid #C8C2B4',
            padding: '5px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            overflowX: 'auto',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '10px',
            flexShrink: 0,
            zIndex: 25
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, color: '#222426', whiteSpace: 'nowrap' }}>
              DESPACHO REGIONAL CAMMESA:
            </span>
            {Object.entries(telemetry.regions).map(([regKey, reg]) => {
              const active = layoutMode === 'MAP' && filterRegion?.toUpperCase() === regKey.toUpperCase();
              return (
                <div
                  key={regKey}
                  onClick={() => {
                    if (layoutMode === 'MAP') {
                      setFilterRegion(active ? null : regKey === 'SADI' ? null : regKey);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: active ? '#222426' : '#FAF8F3',
                    color: active ? '#FAF8F3' : '#222426',
                    border: '1px solid #C8C2B4',
                    padding: '2px 6px',
                    whiteSpace: 'nowrap',
                    cursor: layoutMode === 'MAP' ? 'pointer' : 'default',
                    fontFamily: '"IBM Plex Mono", monospace',
                    fontSize: '9.8px'
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{regKey.toUpperCase()}:</span>
                  <span style={{ fontWeight: 700 }}>
                    {formatMilesEnteros(reg?.demanda_mw || 0)} MW
                  </span>
                  {typeof reg?.temperatura === 'number' && (
                    <span style={{ opacity: 0.75 }}>({Math.round(reg.temperatura)}°C)</span>
                  )}
                </div>
              );
            })}
          </div>

          {telemetry.renovables && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderLeft: '1px solid #C8C2B4',
                paddingLeft: '10px',
                flexShrink: 0
              }}
            >
              <span style={{ color: '#3E725C', fontWeight: 700 }}>
                EÓLICA: {formatMilesEnteros(telemetry.renovables.eolica || 0)} MW
              </span>
              <span style={{ color: '#9C7A3C', fontWeight: 700 }}>
                SOLAR: {formatMilesEnteros(telemetry.renovables.fotovoltaica || 0)} MW
              </span>
              <span
                style={{
                  backgroundColor: '#222426',
                  color: '#FAF8F3',
                  padding: '2px 6px',
                  fontWeight: 700
                }}
              >
                RENOVABLES: {formatDecimalAr(telemetry.renovables.cubrimientoDem || 0, 1)}%
              </span>
            </div>
          )}
        </footer>
      )}

    </div>
  );
};
export default PrototypeDagre;
