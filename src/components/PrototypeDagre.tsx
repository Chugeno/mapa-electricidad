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
import { Search, X } from 'lucide-react';
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
const COL_PITCH = 192; // 124px caja + 68px calle vertical libre entre columnas
const ROW_PITCH = 228; // 124px caja + 104px avenida horizontal libre entre filas

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
  coop: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75'
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

function buildStreetAvenueGeometry(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  isHorizontal: boolean,
  sLane: number,
  tLane: number,
  xStreet: number,
  adjLane: number
): { d: string; pts: [number, number][] } {
  const TRACK_PITCH = 10.0; // Espaciado ampliado a 10px para garantizar separación visible en líneas de 500 kV

  if (!isHorizontal) {
    const dy = ty - sy;
    const dx = tx - sx;

    if (dy > 10 && dy <= ROW_PITCH * 1.6 - BOX_SIZE + 24) {
      if (Math.abs(dx) < 1 && adjLane === 0) {
        return {
          d: `M ${sx.toFixed(1)},${sy.toFixed(1)} L ${tx.toFixed(1)},${ty.toFixed(1)}`,
          pts: [
            [sx, sy],
            [tx, ty]
          ]
        };
      }
      const bendY = sy + 18 + (adjLane % 8) * TRACK_PITCH;
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

    const y1 = sy + 16 + (sLane % 8) * TRACK_PITCH;
    const y2 = ty - 16 - (tLane % 8) * TRACK_PITCH;
    const xs = xStreet;

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
    const dx = tx - sx;
    const dy = ty - sy;

    if (dx > 10 && dx <= ROW_PITCH * 1.6 - BOX_SIZE + 24) {
      if (Math.abs(dy) < 1 && adjLane === 0) {
        return {
          d: `M ${sx.toFixed(1)},${sy.toFixed(1)} L ${tx.toFixed(1)},${ty.toFixed(1)}`,
          pts: [
            [sx, sy],
            [tx, ty]
          ]
        };
      }
      const bendX = sx + 18 + (adjLane % 8) * TRACK_PITCH;
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

    const x1 = sx + 16 + (sLane % 8) * TRACK_PITCH;
    const x2 = tx - 16 - (tLane % 8) * TRACK_PITCH;
    const ys = xStreet;

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
        `L ${x2.toFixed(1)},${(ty - dirArr * r4).toFixed(1)}`,
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

    rawNodes.push({
      uid,
      label: c.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${c.id} · ${c.tecnologia.toUpperCase()}`,
      role: 'GEN',
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

    rawNodes.push({
      uid,
      label: fullLabel,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${e.id} · EETT ${kv}KV`,
      role,
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

    rawNodes.push({
      uid,
      label: d.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${d.id} · DISTRIBUIDORA`,
      role: 'DIST',
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

    rawNodes.push({
      uid,
      label: c.nombre,
      shortTitle1: t1,
      shortTitle2: t2,
      code: `${c.id} · COOP`,
      role: 'COOP',
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
  mode: 'DAGRE_LR' | 'DAGRE_TB' | 'MAP',
  filterKv: number | null,
  filterRole: string | null,
  filterRegion: string | null,
  filterTech: string | null,
  searchQuery: string,
  telemetry: TelemetryData | null
) {
  const isMap = mode === 'MAP';
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

  const hasActiveFilter = Boolean(filterKv !== null || filterRole || filterRegion || filterTech || q);

  const directMatchUids = new Set<string>();
  masterNodes.forEach((n) => {
    if (filterRole && n.role !== filterRole) return;
    if (filterRegion && n.region.toUpperCase() !== filterRegion.toUpperCase()) return;
    if (filterTech && n.tecnologia !== filterTech) return;
    if (filterKv !== null && normalizeKvKey(n.voltageKv) !== filterKv) return;
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

  const activeEdgesRaw = masterEdges.filter((e) => {
    const srcId = String(e.source);
    const tgtId = String(e.target);
    if (filterKv !== null && normalizeKvKey(e.kv) !== filterKv) return false;
    if (!hasActiveFilter) return true;
    if (filterKv !== null && !filterRole && !filterRegion && !filterTech && !q) {
      return true;
    }
    return directMatchUids.has(srcId) || directMatchUids.has(tgtId);
  });

  const visibleNodeUids = new Set<string>();
  if (!hasActiveFilter) {
    masterNodes.forEach((n) => visibleNodeUids.add(n.uid));
  } else {
    directMatchUids.forEach((id) => visibleNodeUids.add(id));
    activeEdgesRaw.forEach((e) => {
      visibleNodeUids.add(String(e.source));
      visibleNodeUids.add(String(e.target));
    });
  }

  const visibleNodes = masterNodes
    .filter((n) => visibleNodeUids.has(n.uid))
    .map((n) => {
      const isDirect = directMatchUids.has(n.uid);
      const isDimmed = hasActiveFilter && !isDirect;
      return {
        ...n,
        isDirectMatch: isDirect,
        isDimmed
      };
    });
  const positions = new Map<string, { x: number; y: number }>();

  if (!isMap) {
    const tiers: NodeRole[] = ['GEN', 'ET500', 'ET132', 'DIST', 'COOP'];
    const totalCount = visibleNodes.length;
    const maxCols = totalCount > 400 ? 32 : totalCount > 150 ? 20 : totalCount > 50 ? 12 : 8;

    let currentRowCursor = 0;

    tiers.forEach((tierRole) => {
      const tierNodes = visibleNodes
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
        const finalRow = currentRowCursor + subRow;

        const cx = finalCol * COL_PITCH;
        const cy = finalRow * ROW_PITCH;

        if (!isHorizontal) {
          positions.set(node.uid, { x: cx - HALF_BOX, y: cy - HALF_BOX });
        } else {
          positions.set(node.uid, { x: cy - HALF_BOX, y: cx - HALF_BOX });
        }
      });

      currentRowCursor += numSubRows + 0.45;
    });
  } else {
    visibleNodes.forEach((n) => {
      positions.set(n.uid, { x: n.mapX - 18, y: n.mapY - 18 });
    });
  }

  const outBySource = new Map<string, GridEdgeData[]>();
  const inByTarget = new Map<string, GridEdgeData[]>();

  activeEdgesRaw.forEach((e) => {
    const s = String(e.source);
    const t = String(e.target);
    if (!outBySource.has(s)) outBySource.set(s, []);
    outBySource.get(s)!.push(e);
    if (!inByTarget.has(t)) inByTarget.set(t, []);
    inByTarget.get(t)!.push(e);
  });

  // En modo plano: ordenar pines terminales de salida y entrada para que los cables salgan y lleguen paralelos
  if (!isMap) {
    for (const list of outBySource.values()) {
      list.sort((a, b) => {
        const pa = positions.get(String(a.target));
        const pb = positions.get(String(b.target));
        if (!pa || !pb) return 0;
        return isHorizontal ? pa.y - pb.y : pa.x - pb.x;
      });
    }
    for (const list of inByTarget.values()) {
      list.sort((a, b) => {
        const pa = positions.get(String(a.source));
        const pb = positions.get(String(b.source));
        if (!pa || !pb) return 0;
        return isHorizontal ? pa.y - pb.y : pa.x - pb.x;
      });
    }
  }

  // Pre-agrupar líneas por corredor de avenida y calle vertical con asignación determinista libre de colisiones
  const unifiedAvenueUsage = new Map<number, GridEdgeData[]>();
  const unifiedArrivalUsage = new Map<number, GridEdgeData[]>();
  const streetColUsage = new Map<number, GridEdgeData[]>();

  if (!isMap) {
    activeEdgesRaw.forEach((e) => {
      const sPos = positions.get(String(e.source));
      const tPos = positions.get(String(e.target));
      if (!sPos || !tPos) return;

      const sRow = !isHorizontal ? Math.round(sPos.y / ROW_PITCH) : Math.round(sPos.x / ROW_PITCH);
      const tRow = !isHorizontal ? Math.round(tPos.y / ROW_PITCH) : Math.round(tPos.x / ROW_PITCH);

      if (!unifiedAvenueUsage.has(sRow)) unifiedAvenueUsage.set(sRow, []);
      unifiedAvenueUsage.get(sRow)!.push(e);

      if (!unifiedArrivalUsage.has(tRow)) unifiedArrivalUsage.set(tRow, []);
      unifiedArrivalUsage.get(tRow)!.push(e);

      const deltaMain = !isHorizontal
        ? tPos.y - (sPos.y + BOX_SIZE)
        : tPos.x - (sPos.x + BOX_SIZE);

      if (deltaMain <= 10 || deltaMain > ROW_PITCH * 1.6 - BOX_SIZE + 24) {
        const streetCol = !isHorizontal
          ? Math.round(tPos.x / COL_PITCH)
          : Math.round(tPos.y / COL_PITCH);
        if (!streetColUsage.has(streetCol)) streetColUsage.set(streetCol, []);
        streetColUsage.get(streetCol)!.push(e);
      }
    });
  }

  const cableGeometries: ComputedCableGeometry[] = [];
  const baseByKv: Record<number, string[]> = { 500: [], 220: [], 132: [], 33: [], 13.2: [] };
  const animByKvSpeed: Record<string, { kv: number; speed: 'fast' | 'med' | 'slow'; paths: string[] }> = {};

  activeEdgesRaw.forEach((e, idx) => {
    const sPos = positions.get(String(e.source));
    const tPos = positions.get(String(e.target));
    if (!sPos || !tPos) return;

    const sList = outBySource.get(String(e.source)) || [e];
    const tList = inByTarget.get(String(e.target)) || [e];
    const sIdx = sList.indexOf(e);
    const tIdx = tList.indexOf(e);

    const sStep = Math.min(14, 96 / Math.max(1, sList.length));
    const tStep = Math.min(14, 96 / Math.max(1, tList.length));
    const sOff = (sIdx - (sList.length - 1) / 2) * sStep;
    const tOff = (tIdx - (tList.length - 1) / 2) * tStep;

    let sx = 0,
      sy = 0,
      tx = 0,
      ty = 0;

    if (isMap) {
      sx = sPos.x + 18;
      sy = sPos.y + 18;
      tx = tPos.x + 18;
      ty = tPos.y + 18;
    } else if (!isHorizontal) {
      sx = sPos.x + HALF_BOX + sOff;
      sy = sPos.y + BOX_SIZE;
      tx = tPos.x + HALF_BOX + tOff;
      ty = tPos.y;
    } else {
      sx = sPos.x + BOX_SIZE;
      sy = sPos.y + HALF_BOX + sOff;
      tx = tPos.x;
      ty = tPos.y + HALF_BOX + tOff;
    }

    const sRow = !isHorizontal ? Math.round(sPos.y / ROW_PITCH) : Math.round(sPos.x / ROW_PITCH);
    const tRow = !isHorizontal ? Math.round(tPos.y / ROW_PITCH) : Math.round(tPos.x / ROW_PITCH);

    const aveList = unifiedAvenueUsage.get(sRow) || [e];
    const aveLane = aveList.indexOf(e);

    const arrList = unifiedArrivalUsage.get(tRow) || [e];
    const arrLane = arrList.indexOf(e);

    const streetCol = !isHorizontal ? Math.round(tPos.x / COL_PITCH) : Math.round(tPos.y / COL_PITCH);
    const stList = streetColUsage.get(streetCol) || [e];
    const stIdx = stList.indexOf(e);
    const stCount = stList.length;
    const tgtCenter = !isHorizontal ? tPos.x + HALF_BOX : tPos.y + HALF_BOX;
    const streetCenter = tgtCenter + COL_PITCH / 2;
    const streetTrack = streetCenter + (stIdx - (stCount - 1) / 2) * 10.0;

    const geom = isMap
      ? buildCurvedMapGeometry(sx, sy, tx, ty, e.curvature ?? 0.14)
      : buildStreetAvenueGeometry(
          sx, sy, tx, ty,
          isHorizontal,
          aveLane,
          arrLane,
          streetTrack,
          aveLane
        );

    const factor = getRegionFactor(e.region);
    const liveAmperes = Math.round(e.amperes * factor);
    const kvKey = normalizeKvKey(e.kv);
    const speedBucket = getSpeedBucket(liveAmperes);

    const srcDimmed = hasActiveFilter && !directMatchUids.has(String(e.source));
    const tgtDimmed = hasActiveFilter && !directMatchUids.has(String(e.target));
    const edgeDimmed = srcDimmed && tgtDimmed;

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

    if (!baseByKv[kvKey]) baseByKv[kvKey] = [];
    baseByKv[kvKey].push(geom.d);

    const bucketKey = `${kvKey}_${speedBucket}`;
    if (!animByKvSpeed[bucketKey]) {
      animByKvSpeed[bucketKey] = { kv: kvKey, speed: speedBucket, paths: [] };
    }
    animByKvSpeed[bucketKey].paths.push(geom.d);
  });

  let worldMinX = Infinity,
    worldMinY = Infinity,
    worldMaxX = -Infinity,
    worldMaxY = -Infinity;

  const positionedNodes: GridNodeData[] = visibleNodes.map((n) => {
    const pos = positions.get(n.uid) || { x: 0, y: 0 };
    const factor = getRegionFactor(n.region);
    const liveAmperes = Math.round(n.amperes * factor);
    const size = isMap ? 36 : BOX_SIZE;

    if (pos.x < worldMinX) worldMinX = pos.x;
    if (pos.y < worldMinY) worldMinY = pos.y;
    if (pos.x + size > worldMaxX) worldMaxX = pos.x + size;
    if (pos.y + size > worldMaxY) worldMaxY = pos.y + size;

    return {
      ...n,
      amperes: liveAmperes,
      x: pos.x,
      y: pos.y
    };
  });

  if (!isFinite(worldMinX)) {
    worldMinX = -500;
    worldMinY = -500;
    worldMaxX = 500;
    worldMaxY = 500;
  }

  // Solo 2 nodos fantasma 1x1px en el DOM para que fitView encuadre el mundo al instante sin montar 830 tarjetas DOM
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
    cableGeometries,
    batchedBase: VOLTAGE_ORDER.map((kv) => ({
      kv,
      d: (baseByKv[kv] || []).join(' ')
    })).filter((b) => b.d.length > 0),
    batchedAnim: Object.values(animByKvSpeed).map((b) => ({
      key: `${b.kv}_${b.speed}`,
      kv: b.kv,
      speed: b.speed,
      d: b.paths.join(' ')
    })),
    visibleCount: positionedNodes.length,
    visibleEdgesCount: cableGeometries.length
  };
}

// ============================================================================
// 7. MOTOR 100% CANVAS 2D (DIBUJA PROVINCIAS + 1.122 CABLES + 830 ESTACIONES A 60 FPS)
// ============================================================================
const EMPTY_EDGES: never[] = [];

const FlowSceneInner: React.FC<{
  layoutMode: 'DAGRE_LR' | 'DAGRE_TB' | 'MAP';
  topology: TopologyData | null;
  telemetry: TelemetryData | null;
  filterKv: number | null;
  filterRole: string | null;
  filterRegion: string | null;
  filterTech: string | null;
  searchQuery: string;
  showFullWfs: boolean;
  onToggleFullWfs: () => void;
  onSelectNode: (d: GridNodeData) => void;
  onSelectEdge: (d: GridEdgeData) => void;
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
  onToggleFullWfs,
  onSelectNode,
  onSelectEdge,
  onCountsChange
}) => {
  const { fitView, screenToFlowPosition, getViewport } = useReactFlow();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomTextRef = useRef<HTMLSpanElement>(null);
  const vpRef = useRef<Viewport>({ x: 0, y: 0, zoom: 0.14 });
  const isPanningRef = useRef<boolean>(false);
  const panTimerRef = useRef<number | null>(null);
  const dashPhaseRef = useRef<number>(0);

  const provinces = topology?.provinces || [];
  const { allNodes, allEdges } = useMemo(() => buildMasterDataset(topology), [topology]);

  const {
    boundsNodes,
    positionedNodes,
    cableGeometries,
    batchedBase,
    batchedAnim,
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

    const base2D = batchedBase.map((b) => ({
      kv: b.kv,
      cfg: VOLTAGE_CONFIG[b.kv] || VOLTAGE_CONFIG[132],
      path: new Path2D(b.d)
    }));

    const anim2D = batchedAnim.map((b) => {
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

    return { provincePath2D, wfsPaths2D, base2D, anim2D };
  }, [layoutMode, provinces, showFullWfs, topology, batchedBase, batchedAnim]);

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

    // 1. Provincias de Argentina (Modo Mapa)
    if (compiledPaths.provincePath2D) {
      ctx.fillStyle = '#E5DFD0';
      ctx.strokeStyle = '#8A8173';
      ctx.lineWidth = 1.6 / Math.pow(vp.zoom, 0.55);
      ctx.fill(compiledPaths.provincePath2D);
      ctx.stroke(compiledPaths.provincePath2D);
    }

    // 1b. Trazados paralelos WFS opcionales
    if (compiledPaths.wfsPaths2D.length > 0) {
      ctx.globalAlpha = 0.48;
      for (const w of compiledPaths.wfsPaths2D) {
        ctx.strokeStyle = w.color;
        ctx.lineWidth = w.w;
        ctx.stroke(w.path);
      }
    }

    // 2. CABLES (En zoom cercano recorta los tramos fuera de pantalla; en zoom lejano usa Path2D batcheados)
    if (vp.zoom >= 0.25 && layoutMode !== 'MAP') {
      const baseOpacity = 0.28;
      for (const kv of VOLTAGE_ORDER) {
        const cfg = VOLTAGE_CONFIG[kv];
        const dashLen = Math.max(8, Math.round(cfg.width * 3.1));
        const gapLen = Math.max(6, Math.round(cfg.width * 2.3));
        const period = dashLen + gapLen;

        for (const speed of ['fast', 'med', 'slow'] as const) {
          ctx.beginPath();
          let hasVisibleSeg = false;

          for (let i = 0; i < cableGeometries.length; i++) {
            const cg = cableGeometries[i];
            if (cg.kvKey !== kv || cg.speedBucket !== speed) continue;
            if (
              cg.maxX < viewMinX ||
              cg.minX > viewMaxX ||
              cg.maxY < viewMinY ||
              cg.minY > viewMaxY
            ) {
              continue;
            }

            const pts = cg.pts;
            for (let j = 0; j < pts.length - 1; j++) {
              let x1 = pts[j][0];
              let y1 = pts[j][1];
              let x2 = pts[j + 1][0];
              let y2 = pts[j + 1][1];

              if (
                (x1 < viewMinX && x2 < viewMinX) ||
                (x1 > viewMaxX && x2 > viewMaxX) ||
                (y1 < viewMinY && y2 < viewMinY) ||
                (y1 > viewMaxY && y2 > viewMaxY)
              ) {
                continue;
              }

              if (Math.abs(y1 - y2) < 1) {
                if (x2 >= x1) {
                  if (x1 < viewMinX) {
                    const steps = Math.floor((viewMinX - x1) / period);
                    x1 += steps * period;
                  }
                  if (x2 > viewMaxX) x2 = viewMaxX + period;
                } else {
                  if (x1 > viewMaxX) {
                    const steps = Math.floor((x1 - viewMaxX) / period);
                    x1 -= steps * period;
                  }
                  if (x2 < viewMinX) x2 = viewMinX - period;
                }
              } else if (Math.abs(x1 - x2) < 1) {
                if (y2 >= y1) {
                  if (y1 < viewMinY) {
                    const steps = Math.floor((viewMinY - y1) / period);
                    y1 += steps * period;
                  }
                  if (y2 > viewMaxY) y2 = viewMaxY + period;
                } else {
                  if (y1 > viewMaxY) {
                    const steps = Math.floor((y1 - viewMaxY) / period);
                    y1 -= steps * period;
                  }
                  if (y2 < viewMinY) y2 = viewMinY - period;
                }
              }

              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              hasVisibleSeg = true;
            }
          }

          if (hasVisibleSeg) {
            ctx.setLineDash([]);
            ctx.globalAlpha = baseOpacity;
            ctx.strokeStyle = cfg.color;
            ctx.lineWidth = cfg.width;
            ctx.stroke();

            ctx.setLineDash([dashLen, gapLen]);
            ctx.globalAlpha = 0.96;
            const speedPx = SPEED_PX_PER_SEC[speed];
            ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % 240;
            ctx.stroke();
          }
        }
      }
    } else if (vp.zoom >= 0.25 && layoutMode === 'MAP') {
      for (let i = 0; i < cableGeometries.length; i++) {
        const cg = cableGeometries[i];
        if (
          cg.maxX < viewMinX ||
          cg.minX > viewMaxX ||
          cg.maxY < viewMinY ||
          cg.minY > viewMaxY ||
          !cg.path2D
        ) {
          continue;
        }
        const cfg = VOLTAGE_CONFIG[cg.kvKey] || VOLTAGE_CONFIG[132];
        const cableWidth = cfg.width * 1.2;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = cableWidth;
        ctx.stroke(cg.path2D);

        const dashLen = Math.max(8, Math.round(cableWidth * 2.8));
        const gapLen = Math.max(6, Math.round(cableWidth * 2.0));
        ctx.setLineDash([dashLen, gapLen]);
        ctx.globalAlpha = 0.96;
        const speedPx = SPEED_PX_PER_SEC[cg.speedBucket];
        ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % 240;
        ctx.lineWidth = cableWidth;
        ctx.stroke(cg.path2D);
      }
    } else {
      // MODO MACRO LEJANO (vp.zoom < 0.25)
      ctx.setLineDash([]);
      ctx.globalAlpha = layoutMode === 'MAP' ? 0.36 : 0.28;
      for (const b of compiledPaths.base2D) {
        ctx.strokeStyle = b.cfg.color;
        ctx.lineWidth = b.cfg.width;
        ctx.stroke(b.path);
      }

      const hasFilter = Boolean(filterKv || filterRegion || filterTech || filterRole || searchQuery);
      for (const a of compiledPaths.anim2D) {
        if (!hasFilter && a.kv < 220) {
          ctx.setLineDash([]);
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = a.cfg.color;
          ctx.lineWidth = a.cfg.width;
          ctx.stroke(a.path);
          continue;
        }
        ctx.globalAlpha = 0.96;
        ctx.strokeStyle = a.cfg.color;
        ctx.lineWidth = a.cfg.width;
        ctx.setLineDash(a.dash);
        const speedPx = SPEED_PX_PER_SEC[a.speed];
        ctx.lineDashOffset = -(dashPhaseRef.current * speedPx) % 240;
        ctx.stroke(a.path);
      }
    }

    // 3. DIBUJAR LAS ESTACIONES EN CANVAS (CON VIEWPORT CULLING + ORDEN DE SUPERPOSICIÓN: ATENUADOS ATRÁS, RESALTADOS ADELANTE)
    ctx.setLineDash([]);
    const iconPaths = getIconPaths();
    const isMap = layoutMode === 'MAP';
    const isHoriz = layoutMode === 'DAGRE_LR';
    const showDetail = vp.zoom >= (isMap ? MAP_LOD_ZOOM : PLANO_LOD_ZOOM);

    const drawStationNode = (n: GridNodeData, isDimmed: boolean) => {
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
        nodeX + size < viewMinX ||
        nodeX > viewMaxX ||
        nodeY + size < viewMinY ||
        nodeY > viewMaxY
      ) {
        return;
      }

      ctx.save();
      if (isDimmed) {
        ctx.globalAlpha = 0.22;
      } else {
        ctx.globalAlpha = 1.0;
      }

      const kvKey = normalizeKvKey(n.voltageKv);
      const vCfg = VOLTAGE_CONFIG[kvKey] || VOLTAGE_CONFIG[132];
      const iconPath = iconPaths[n.iconKind] || iconPaths.dist;

      if (isMap) {
        // Cuadrado de la estación
        ctx.fillStyle = '#FAF8F3';
        ctx.fillRect(nodeX, nodeY, size, size);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.lineWidth = Math.max(1.2, (isDimmed ? 1.4 : 2.0) * mapScaleFactor);
        ctx.strokeRect(nodeX, nodeY, size, size);

        // Franja superior de tensión
        ctx.fillStyle = isDimmed ? '#A59F91' : vCfg.color;
        ctx.fillRect(nodeX, nodeY, size, Math.max(1.8, 2.5 * mapScaleFactor));

        // Ícono central proporcional (22px base)
        const iconSize = 22 * mapScaleFactor;
        ctx.save();
        ctx.translate(nodeX + (size - iconSize) / 2, nodeY + (size - iconSize) / 2 + 0.5);
        ctx.scale((iconSize / 24), (iconSize / 24));
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.lineWidth = Math.max(1.4, 2.0 * mapScaleFactor);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.restore();

        // Rectángulo de información: EXACTAMENTE EL MISMO ALTO que el icono (boxH = size)
        // y tipografía 100% proporcional sin límites rígidos para que entre perfecto al hacer zoom.
        if (showDetail) {
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
          ctx.lineWidth = Math.max(0.9, 1.1 * mapScaleFactor);
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
        ctx.restore();
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

      if (!showDetail) {
        // VISTA MACRO LEJANA (< 0.25x): Cuadrado limpio con ícono grande central de 66x66px (cero textos)
        const ibX = n.x + (BOX_SIZE - 66) / 2;
        const ibY = n.y + (BOX_SIZE - 66) / 2 + 2;
        ctx.fillStyle = isDimmed ? '#ECE8DE' : '#EFECE2';
        ctx.fillRect(ibX, ibY, 66, 66);
        ctx.strokeStyle = isDimmed ? '#B8B2A4' : vCfg.color;
        ctx.lineWidth = isDimmed ? 1.0 : 1.8;
        ctx.strokeRect(ibX, ibY, 66, 66);

        ctx.save();
        ctx.translate(ibX + 15, ibY + 15);
        ctx.scale(36 / 24, 36 / 24);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.restore();
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

        ctx.save();
        ctx.translate(ibX + 9, ibY + 9);
        ctx.scale(24 / 24, 24 / 24);
        ctx.strokeStyle = isDimmed ? '#8A857A' : vCfg.color;
        ctx.lineWidth = 1.9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.restore();

        // 3. Pastilla técnica inferior (Tensión · MW y Amperes · Región)
        const pillX = n.x + 6;
        const pillY = n.y + 86;
        const pillW = BOX_SIZE - 12;
        const pillH = 31;
        ctx.fillStyle = isDimmed ? '#E2DDD0' : '#EAE4D7';
        ctx.fillRect(pillX, pillY, pillW, pillH);
        ctx.strokeStyle = isDimmed ? '#C4BEB0' : '#D1CBBF';
        ctx.lineWidth = 1;
        ctx.strokeRect(pillX, pillY, pillW, pillH);

        ctx.fillStyle = isDimmed ? '#666258' : '#222426';
        ctx.font = '700 8.2px "IBM Plex Mono", monospace';
        ctx.fillText(`${n.kvText} · ${n.powerMw}`, n.x + HALF_BOX, pillY + 4);

        ctx.fillStyle = isDimmed ? '#8A857A' : '#55524B';
        ctx.font = '600 8px "IBM Plex Mono", monospace';
        ctx.fillText(`${formatMilesEnteros(n.amperes)} A · ${n.region}`, n.x + HALF_BOX, pillY + 16.5);

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
      ctx.restore();
    };

    // PASO 1: DIBUJAR PRIMERO LAS ESTACIONES ATENUADAS (FONDO)
    for (let i = 0; i < positionedNodes.length; i++) {
      const n = positionedNodes[i];
      if (n.isDimmed) drawStationNode(n, true);
    }

    // PASO 2: DIBUJAR ENCIMA LAS ESTACIONES ACTIVAS / RESALTADAS (FRENTE)
    for (let i = 0; i < positionedNodes.length; i++) {
      const n = positionedNodes[i];
      if (!n.isDimmed) drawStationNode(n, false);
    }
  }, [
    compiledPaths,
    cableGeometries,
    positionedNodes,
    layoutMode,
    filterKv,
    filterRegion,
    filterTech,
    filterRole,
    searchQuery
  ]);

  // Bucle de animación de corriente (pausado automáticamente mientras el dedo arrastra)
  useEffect(() => {
    let animId: number;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTs) / 1000;
      if (!isPanningRef.current && dt >= 0.032) {
        dashPhaseRef.current += dt;
        lastTs = now;
        renderCanvasFrame();
      }
      animId = requestAnimationFrame(tick);
    };

    renderCanvasFrame();
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [renderCanvasFrame]);

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
        onSelectEdge(bestEdge);
      }
    },
    [positionedNodes, cableGeometries, layoutMode, screenToFlowPosition, onSelectNode, onSelectEdge]
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
  const [layoutMode, setLayoutMode] = useState<'DAGRE_LR' | 'DAGRE_TB' | 'MAP'>('DAGRE_TB');
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [filterKv, setFilterKv] = useState<number | null>(null);
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [filterTech, setFilterTech] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFullWfs, setShowFullWfs] = useState<boolean>(false);
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
  };

  const resetAllFilters = () => {
    setFilterKv(null);
    setFilterRole(null);
    setFilterRegion(null);
    setFilterTech(null);
    setSearchQuery('');
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
            onClick={() => setLayoutMode('DAGRE_TB')}
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
            onClick={() => setLayoutMode('DAGRE_LR')}
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
            onClick={() => setLayoutMode('MAP')}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '11px',
              fontWeight: 700,
              padding: '6px 11px',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: layoutMode === 'MAP' ? '#222426' : 'transparent',
              color: layoutMode === 'MAP' ? '#FAF8F3' : '#222426'
            }}
          >
            🗺️ MAPA ARGENTINA
          </button>
        </div>
      </header>

      {/* FILA 1 DE FILTROS: TENSIONES ORDENADAS (500 -> 220 -> 132 -> 33 -> 13,2 kV) Y ESLABÓN */}
      <div
        style={{
          backgroundColor: '#FAF8F3',
          borderBottom: '1px solid #D5CFC2',
          padding: '4px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          overflowX: 'auto',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '10px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#68655E' }}>TENSIÓN (kV):</span>
          <button
            onClick={() => setFilterKv(null)}
            style={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 7px',
              border: '1px solid #222426',
              cursor: 'pointer',
              backgroundColor: filterKv === null ? '#222426' : 'transparent',
              color: filterKv === null ? '#FAF8F3' : '#222426'
            }}
          >
            TODAS
          </button>
          {VOLTAGE_ORDER.map((kvNum) => {
            const cfg = VOLTAGE_CONFIG[kvNum];
            const active = filterKv === kvNum;
            return (
              <button
                key={kvNum}
                onClick={() => setFilterKv(active ? null : kvNum)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  border: active ? '1.5px solid #222426' : '1px solid #D1CBBF',
                  backgroundColor: active ? '#EAE4D7' : 'transparent',
                  cursor: 'pointer'
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '16px',
                    height: `${cfg.width}px`,
                    backgroundColor: cfg.color
                  }}
                />
                <strong>{cfg.displayKv}</strong>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#68655E' }}>ESLABÓN:</span>
          {[
            { id: null, label: 'TODOS (1.410)' },
            { id: 'GEN', label: '1. GENERACIÓN (474)' },
            { id: 'ET500', label: '2. EETT 500kV (59)' },
            { id: 'ET132', label: '3. SUBTRANSMISIÓN (264)' },
            { id: 'DIST', label: '4. DISTRIBUCIÓN (33)' },
            { id: 'COOP', label: '5. COOPERATIVAS (580)' }
          ].map((r) => {
            const active = filterRole === r.id;
            return (
              <button
                key={r.label}
                onClick={() => setFilterRole(active ? null : r.id)}
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '9.8px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  border: '1px solid #222426',
                  cursor: 'pointer',
                  backgroundColor: active ? '#222426' : 'transparent',
                  color: active ? '#FAF8F3' : '#222426'
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* FILA 2 DE FILTROS: REGIÓN CAMMESA, TECNOLOGÍA DE GENERACIÓN Y BUSCADOR */}
      <div
        style={{
          backgroundColor: '#F3EFE6',
          borderBottom: '1px solid #C8C2B4',
          padding: '4px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          overflowX: 'auto',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '9.8px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#68655E' }}>REGIÓN:</span>
          {[
            { id: null, label: '🇦🇷 TODAS' },
            { id: 'GBA', label: 'GBA / PBA' },
            { id: 'Litoral', label: 'LITORAL' },
            { id: 'Centro', label: 'CENTRO' },
            { id: 'Cuyo', label: 'CUYO' },
            { id: 'NOA', label: 'NOA' },
            { id: 'NEA', label: 'NEA' },
            { id: 'Comahue', label: 'COMAHUE' },
            { id: 'Patagonia', label: 'PATAGONIA' }
          ].map((reg) => {
            const active = filterRegion === reg.id;
            return (
              <button
                key={reg.label}
                onClick={() => setFilterRegion(active ? null : reg.id)}
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  border: active ? '1.5px solid #222426' : '1px solid #C8C2B4',
                  backgroundColor: active ? '#222426' : '#FAF8F3',
                  color: active ? '#FAF8F3' : '#222426',
                  cursor: 'pointer'
                }}
              >
                {reg.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700, color: '#68655E' }}>TECNOLOGÍA:</span>
          {[
            { id: null, label: 'TODAS' },
            { id: 'Hidroeléctrica', label: '💧 Hidro (62)' },
            { id: 'Nuclear', label: '☢️ Nuclear (2)' },
            { id: 'Térmica', label: '🔥 Térmica (205)' },
            { id: 'Eólica', label: '💨 Eólica (71)' },
            { id: 'Solar', label: '☀️ Solar (84)' },
            { id: 'Biomasa', label: '🌱 Biomasa (50)' }
          ].map((t) => {
            const active = filterTech === t.id;
            return (
              <button
                key={t.label}
                onClick={() => setFilterTech(active ? null : t.id)}
                style={{
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  border: active ? '1.5px solid #222426' : '1px solid #C8C2B4',
                  backgroundColor: active ? '#222426' : '#FAF8F3',
                  color: active ? '#FAF8F3' : '#222426',
                  cursor: 'pointer'
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: '#FAF8F3',
              border: '1px solid #222426',
              padding: '1px 6px'
            }}
          >
            <Search className="w-3 h-3" style={{ color: '#68655E' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar central, ET, prov..."
              style={{
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '10px',
                width: '145px',
                color: '#222426'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {(filterKv !== null || filterRole || filterRegion || filterTech || searchQuery) && (
            <button
              onClick={resetAllFilters}
              style={{
                backgroundColor: '#C04A35',
                color: '#FAF8F3',
                border: '1px solid #222426',
                padding: '2px 6px',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '9.5px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              LIMPIAR FILTROS
            </button>
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
            onToggleFullWfs={() => setShowFullWfs((v) => !v)}
            onSelectNode={handleSelectNode}
            onSelectEdge={handleSelectEdge}
            onCountsChange={handleCountsChange}
          />
        </ReactFlowProvider>
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
              const active = filterRegion?.toUpperCase() === regKey.toUpperCase();
              return (
                <button
                  key={regKey}
                  onClick={() =>
                    setFilterRegion(active ? null : regKey === 'SADI' ? null : regKey)
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    backgroundColor: active ? '#222426' : '#FAF8F3',
                    color: active ? '#FAF8F3' : '#222426',
                    border: '1px solid #C8C2B4',
                    padding: '2px 6px',
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
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
                </button>
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

      {/* MODAL FIJO EN PANTALLA INDEPENDIENTE DEL ZOOM */}
      {(selectedNode || selectedEdge) && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(22, 24, 26, 0.52)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px',
            zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              maxHeight: '86dvh',
              backgroundColor: '#FAF8F3',
              border: '2px solid #222426',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                backgroundColor: '#EAE4D7',
                borderBottom: '1px solid #C8C2B4',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px'
              }}
            >
              <span
                style={{
                  backgroundColor: '#222426',
                  color: '#FAF8F3',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '3px 7px',
                  textTransform: 'uppercase'
                }}
              >
                {selectedNode
                  ? selectedNode.typeName
                  : `VÍNCULO ${VOLTAGE_CONFIG[normalizeKvKey(selectedEdge?.kv || 132)]?.displayKv}`}
              </span>
              <button
                onClick={closeModal}
                style={{
                  backgroundColor: '#FAF8F3',
                  border: '1.5px solid #222426',
                  padding: '4px 10px',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <X className="w-4 h-4" /> CERRAR
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto' }}>
              {selectedNode && (
                <>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#222426' }}>
                    {selectedNode.label}
                  </h3>
                  <div
                    style={{
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: '11px',
                      color: '#68655E',
                      marginTop: '2px',
                      marginBottom: '14px'
                    }}
                  >
                    {selectedNode.code} · {selectedNode.provincia.toUpperCase()} ({selectedNode.region})
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontFamily: '"IBM Plex Mono", monospace'
                    }}
                  >
                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>
                        {selectedNode.role === 'GEN'
                          ? 'POTENCIA INSTALADA'
                          : selectedNode.role === 'DIST' || selectedNode.role === 'COOP'
                          ? 'DEMANDA LOCAL ESTIMADA'
                          : 'POTENCIA DE TRANSFORMACIÓN'}
                      </span>
                      <strong style={{ fontSize: '14px', color: '#222426' }}>{selectedNode.powerMw}</strong>
                    </div>

                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>CORRIENTE EN VIVO</span>
                      <strong style={{ fontSize: '14px', color: '#222426' }}>
                        {formatMilesEnteros(selectedNode.amperes)} A
                      </strong>
                    </div>

                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>TENSIÓN NOMINAL</span>
                      <strong style={{ fontSize: '14px', color: '#222426' }}>{selectedNode.kvText}</strong>
                    </div>

                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>AGENTE / EMPRESA</span>
                      <strong style={{ fontSize: '12px', color: '#222426' }}>{selectedNode.operator}</strong>
                    </div>
                  </div>
                </>
              )}

              {selectedEdge && (
                <>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#222426' }}>
                    {selectedEdge.fromName} ➔ {selectedEdge.toName}
                  </h3>
                  <div
                    style={{
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: '11px',
                      color: '#68655E',
                      marginTop: '3px',
                      marginBottom: '14px'
                    }}
                  >
                    {VOLTAGE_CONFIG[normalizeKvKey(selectedEdge.kv)]?.label}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontFamily: '"IBM Plex Mono", monospace'
                    }}
                  >
                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>CORRIENTE EN LÍNEA</span>
                      <strong style={{ fontSize: '14px', color: '#222426' }}>
                        {formatMilesEnteros(selectedEdge.amperes)} A
                      </strong>
                    </div>
                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>TERNADO / PARALELAS</span>
                      <strong style={{ fontSize: '14px', color: '#222426' }}>
                        {selectedEdge.parallelCount > 1
                          ? `${selectedEdge.parallelCount} líneas unificadas`
                          : '1 línea simple'}
                      </strong>
                    </div>
                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>TENSIÓN NOMINAL</span>
                      <strong style={{ fontSize: '13px', color: '#222426' }}>
                        {VOLTAGE_CONFIG[normalizeKvKey(selectedEdge.kv)]?.displayKv}
                      </strong>
                    </div>
                    <div style={{ backgroundColor: '#F3EFE6', border: '1px solid #C8C2B4', padding: '8px 10px' }}>
                      <span style={{ fontSize: '9.5px', color: '#68655E', display: 'block' }}>OPERADOR / REGIÓN</span>
                      <strong style={{ fontSize: '12px', color: '#222426' }}>
                        {selectedEdge.empresa} ({selectedEdge.region})
                      </strong>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ padding: '10px 14px', backgroundColor: '#EAE4D7', borderTop: '1px solid #C8C2B4' }}>
              <button
                onClick={closeModal}
                style={{
                  width: '100%',
                  padding: '9px',
                  backgroundColor: '#222426',
                  color: '#FAF8F3',
                  border: 'none',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                CERRAR VENTANA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PrototypeDagre;
