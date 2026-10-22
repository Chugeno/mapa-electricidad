import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { 
  TopologyData, 
  TelemetryData, 
  FilterState, 
  ViewMode, 
  SelectedEntity,
  TransmissionLine,
  Substation,
  PowerPlant
} from '../types';

interface ScadaCanvasProps {
  topology: TopologyData | null;
  telemetry: TelemetryData | null;
  filters: FilterState;
  viewMode: ViewMode;
  selectedEntity: SelectedEntity;
  onSelectEntity: (entity: SelectedEntity) => void;
}

// Normative SADI Colors
const TENSION_COLORS: Record<string, THREE.Color> = {
  '500kV': new THREE.Color('#ef4444'), // Red
  '220kV': new THREE.Color('#22c55e'), // Green
  '132kV': new THREE.Color('#06b6d4'), // Cyan
  '<132kV': new THREE.Color('#eab308') // Amber
};

const TECH_COLORS: Record<string, THREE.Color> = {
  'Hidroeléctrica': new THREE.Color('#38bdf8'),
  'Térmica': new THREE.Color('#f97316'),
  'Nuclear': new THREE.Color('#c084fc'),
  'Eólica': new THREE.Color('#4ade80'),
  'Solar': new THREE.Color('#facc15'),
  'Biomasa': new THREE.Color('#a3e635')
};

export const ScadaCanvas: React.FC<ScadaCanvasProps> = ({
  topology,
  telemetry,
  filters,
  viewMode,
  selectedEntity,
  onSelectEntity
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<MapControls | null>(null);

  // Shaders and Meshes refs
  const lineMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const nodeMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const lineGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const provinceLinesRef = useRef<THREE.LineSegments | null>(null);
  const nodesMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const nodesMetaRef = useRef<Array<{ type: 'EETT' | 'CENTRAL'; data: Substation | PowerPlant }>>([]);

  // Animation values
  const currentMorphRef = useRef<number>(viewMode === 'SCHEM' ? 1.0 : 0.0);
  const targetMorphRef = useRef<number>(viewMode === 'SCHEM' ? 1.0 : 0.0);
  const animFrameIdRef = useRef<number | null>(null);

  // Sync target morph with viewMode prop
  useEffect(() => {
    targetMorphRef.current = viewMode === 'SCHEM' ? 1.0 : 0.0;
  }, [viewMode]);

  // Initial Scene Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080a);
    sceneRef.current = scene;

    // Argentina is centered roughly around (0, 0)
    // Span: ~2200 km width, ~3600 km height
    const aspect = width / height;
    const frustumSize = 3400; // km
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      1000
    );
    camera.position.set(0, -100, 500);
    camera.lookAt(0, -100, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls: orthographic MapControls (no 3D tilt/rotation)
    const controls = new MapControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.screenSpacePanning = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.minZoom = 0.2;
    controls.maxZoom = 40.0;
    controlsRef.current = controls;

    // Resize handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const asp = w / h;
      camera.left = (-frustumSize * asp) / 2;
      camera.right = (frustumSize * asp) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Render loop
    const clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth Morphing interpolation (500ms ease)
      const diff = targetMorphRef.current - currentMorphRef.current;
      if (Math.abs(diff) > 0.001) {
        currentMorphRef.current += diff * Math.min(1.0, delta * 6.5);
      } else {
        currentMorphRef.current = targetMorphRef.current;
      }
      const morph = currentMorphRef.current;

      // Update uniforms
      if (lineMaterialRef.current) {
        lineMaterialRef.current.uniforms.uMorph.value = morph;
        lineMaterialRef.current.uniforms.uTime.value = elapsed;
      }
      if (nodeMaterialRef.current) {
        nodeMaterialRef.current.uniforms.uMorph.value = morph;
        nodeMaterialRef.current.uniforms.uTime.value = elapsed;
      }
      if (provinceLinesRef.current) {
        // Subtle fade of geography in unifilar mode
        (provinceLinesRef.current.material as THREE.LineBasicMaterial).opacity = Math.max(0.12, 0.45 * (1.0 - morph * 0.75));
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Build Province Vector Contours
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !topology) return;

    if (provinceLinesRef.current) {
      scene.remove(provinceLinesRef.current);
      provinceLinesRef.current.geometry.dispose();
      (provinceLinesRef.current.material as THREE.Material).dispose();
      provinceLinesRef.current = null;
    }

    const segments: number[] = [];
    for (const prov of topology.provinces) {
      for (const ring of prov.rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          segments.push(ring[i][0], ring[i][1], -1.0);
          segments.push(ring[i + 1][0], ring[i + 1][1], -1.0);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.45,
      linewidth: 1
    });

    const lines = new THREE.LineSegments(geom, mat);
    scene.add(lines);
    provinceLinesRef.current = lines;
  }, [topology]);

  // Build Transmission Lines Mesh and Shader
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !topology) return;

    // Clean old lines
    const oldLines = scene.getObjectByName('sadi_lines');
    if (oldLines) {
      scene.remove(oldLines);
      (oldLines as any).geometry?.dispose();
    }

    const posGeo: number[] = [];
    const posSchem: number[] = [];
    const lineDist: number[] = [];
    const colors: number[] = [];
    const params: number[] = []; // x: speed, y: density, z: width, w: active

    let totalPoints = 0;

    topology.lines.forEach((line) => {
      const tier = line.tension_tier;
      const col = TENSION_COLORS[tier] || TENSION_COLORS['<132kV'];

      // Voltage modulated speed and pulse density
      let speed = 1.0;
      let density = 0.015;
      let width = 0.12;

      if (tier === '500kV') {
        speed = 1.6;
        density = 0.018;
        width = 0.16;
      } else if (tier === '220kV') {
        speed = 1.2;
        density = 0.014;
        width = 0.13;
      } else if (tier === '132kV') {
        speed = 0.85;
        density = 0.010;
        width = 0.10;
      } else {
        speed = 0.6;
        density = 0.008;
        width = 0.08;
      }

      // Modulate speed by regional corridor load from CAMMESA telemetry if available
      if (telemetry && telemetry.corridors) {
        if (line.region === 'Comahue' || line.nombre.includes('CHO') || line.nombre.includes('P.AGUILA')) {
          speed *= telemetry.corridors.COMAHUE_GBA?.speed || 1.3;
        } else if (line.region === 'Litoral' || line.region === 'NEA' || line.nombre.includes('YACY') || line.nombre.includes('SALTO')) {
          speed *= telemetry.corridors.LITORAL_GBA?.speed || 1.2;
        }
      }

      // Compute cumulative distances
      let cumDist = 0;
      const dists = [0];
      for (let i = 0; i < line.geo.length - 1; i++) {
        const dx = line.geo[i + 1][0] - line.geo[i][0];
        const dy = line.geo[i + 1][1] - line.geo[i][1];
        cumDist += Math.hypot(dx, dy);
        dists.push(cumDist);
      }

      // Create line segments
      for (let i = 0; i < line.geo.length - 1; i++) {
        const p1_g = line.geo[i];
        const p2_g = line.geo[i + 1];
        const p1_s = line.schem[i] || p1_g;
        const p2_s = line.schem[i + 1] || p2_g;

        const d1 = dists[i];
        const d2 = dists[i + 1];

        // Vertex 1
        posGeo.push(p1_g[0], p1_g[1], 0.0);
        posSchem.push(p1_s[0], p1_s[1], 0.0);
        lineDist.push(d1);
        colors.push(col.r, col.g, col.b);
        params.push(speed, density, width, 1.0);

        // Vertex 2
        posGeo.push(p2_g[0], p2_g[1], 0.0);
        posSchem.push(p2_s[0], p2_s[1], 0.0);
        lineDist.push(d2);
        colors.push(col.r, col.g, col.b);
        params.push(speed, density, width, 1.0);

        totalPoints += 2;
      }
    });

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(posGeo, 3));
    geom.setAttribute('aPosSchem', new THREE.Float32BufferAttribute(posSchem, 3));
    geom.setAttribute('aLineDist', new THREE.Float32BufferAttribute(lineDist, 1));
    geom.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geom.setAttribute('aParams', new THREE.Float32BufferAttribute(params, 4));

    lineGeometryRef.current = geom;

    const lineMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uMorph: { value: currentMorphRef.current },
        uTime: { value: 0 }
      },
      vertexShader: `
        attribute vec3 aPosSchem;
        attribute float aLineDist;
        attribute vec3 aColor;
        attribute vec4 aParams; // x: speed, y: density, z: width, w: active

        uniform float uMorph;
        uniform float uTime;

        varying vec3 vColor;
        varying float vLineDist;
        varying vec4 vParams;

        void main() {
          vec3 pos = mix(position, aPosSchem, uMorph);
          vColor = aColor;
          vLineDist = aLineDist;
          vParams = aParams;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uTime;

        varying vec3 vColor;
        varying float vLineDist;
        varying vec4 vParams;

        void main() {
          if (vParams.w < 0.5) {
            discard;
          }

          float speed = vParams.x;
          float density = vParams.y;
          float width = vParams.z;

          // Pulse traveling along line
          float phase = fract(vLineDist * density - uTime * speed);
          float pulse = smoothstep(0.0, 0.12, phase) * smoothstep(width, 0.12, phase);

          vec3 baseCol = vColor * 0.70;
          vec3 pulseCol = mix(vColor, vec3(1.0, 1.0, 1.0), 0.75);

          vec3 finalColor = mix(baseCol, pulseCol, pulse * 0.9);
          float alpha = 0.50 + pulse * 0.50;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    });

    lineMaterialRef.current = lineMat;

    const lineMesh = new THREE.LineSegments(geom, lineMat);
    lineMesh.name = 'sadi_lines';
    scene.add(lineMesh);
  }, [topology, telemetry]);

  // Build Nodes (EETT and Power Plants)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !topology) return;

    if (nodesMeshRef.current) {
      scene.remove(nodesMeshRef.current);
      nodesMeshRef.current.geometry.dispose();
      (nodesMeshRef.current.material as THREE.Material).dispose();
      nodesMeshRef.current = null;
    }

    const totalNodes = topology.eett.length + topology.centrales.length;
    nodesMetaRef.current = [];

    // Billboard quad geometry
    const planeGeom = new THREE.PlaneGeometry(16.0, 16.0);
    const instGeom = new THREE.InstancedBufferGeometry().copy(planeGeom);
    instGeom.instanceCount = totalNodes;

    const posGeo: number[] = [];
    const posSchem: number[] = [];
    const colors: number[] = [];
    const nodeAttrs: number[] = []; // x: shapeType (0: square, 1: circle, 2: diamond), y: sizeMultiplier, z: isSelected, w: active

    let idx = 0;

    // 1. Substations (EETT)
    topology.eett.forEach((et) => {
      nodesMetaRef.current.push({ type: 'EETT', data: et });
      const col = TENSION_COLORS[et.tension_tier] || TENSION_COLORS['<132kV'];

      posGeo.push(et.geo[0], et.geo[1], 1.0);
      posSchem.push(et.schem[0], et.schem[1], 1.0);
      colors.push(col.r, col.g, col.b);

      const size = et.tension_tier === '500kV' ? 1.6 : (et.tension_tier === '220kV' ? 1.25 : 1.0);
      const isSel = selectedEntity && selectedEntity.data.id === et.id ? 1.0 : 0.0;
      nodeAttrs.push(0.0, size, isSel, 1.0); // shape 0: square
      idx++;
    });

    // 2. Power Plants (Centrales)
    topology.centrales.forEach((cp) => {
      nodesMetaRef.current.push({ type: 'CENTRAL', data: cp });
      const col = TECH_COLORS[cp.tecnologia] || new THREE.Color(0xf59e0b);

      posGeo.push(cp.geo[0], cp.geo[1], 1.0);
      posSchem.push(cp.schem[0], cp.schem[1], 1.0);
      colors.push(col.r, col.g, col.b);

      let shape = 1.0; // circle
      if (cp.tecnologia === 'Nuclear') shape = 2.0; // diamond
      else if (cp.tecnologia === 'Térmica') shape = 0.0; // square
      else if (cp.tecnologia === 'Eólica' || cp.tecnologia === 'Solar') shape = 3.0; // triangle/cross

      const size = Math.min(2.4, Math.max(1.1, Math.sqrt(cp.potencia_mw || 100) / 18.0));
      const isSel = selectedEntity && selectedEntity.data.id === cp.id ? 1.0 : 0.0;
      nodeAttrs.push(shape, size, isSel, 1.0);
      idx++;
    });

    instGeom.setAttribute('aPosGeo', new THREE.InstancedBufferAttribute(new Float32Array(posGeo), 3));
    instGeom.setAttribute('aPosSchem', new THREE.InstancedBufferAttribute(new Float32Array(posSchem), 3));
    instGeom.setAttribute('aColor', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
    instGeom.setAttribute('aNodeAttrs', new THREE.InstancedBufferAttribute(new Float32Array(nodeAttrs), 4));

    const nodeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uMorph: { value: currentMorphRef.current },
        uTime: { value: 0 }
      },
      vertexShader: `
        attribute vec3 aPosGeo;
        attribute vec3 aPosSchem;
        attribute vec3 aColor;
        attribute vec4 aNodeAttrs; // x: shape, y: size, z: isSel, w: active

        uniform float uMorph;
        uniform float uTime;

        varying vec3 vColor;
        varying vec4 vNodeAttrs;
        varying vec2 vUv;

        void main() {
          vColor = aColor;
          vNodeAttrs = aNodeAttrs;
          vUv = uv;

          vec3 center = mix(aPosGeo, aPosSchem, uMorph);
          float size = aNodeAttrs.y * (aNodeAttrs.z > 0.5 ? 1.6 : 1.0);

          // Billboard in 2D
          vec3 pos = center + vec3(position.x * size, position.y * size, 0.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        varying vec4 vNodeAttrs;
        varying vec2 vUv;

        void main() {
          if (vNodeAttrs.w < 0.5) discard;

          vec2 p = vUv * 2.0 - 1.0;
          float dist = 0.0;
          float shape = vNodeAttrs.x;

          if (shape < 0.5) {
            // Square (EETT)
            dist = max(abs(p.x), abs(p.y));
          } else if (shape < 1.5) {
            // Circle (Hidro)
            dist = length(p);
          } else if (shape < 2.5) {
            // Diamond (Nuclear)
            dist = abs(p.x) + abs(p.y);
          } else {
            // Triangle / Star (Renovables)
            dist = length(p);
          }

          if (dist > 1.0) discard;

          // Technical CAD styling: high contrast center, technical border
          float isBorder = smoothstep(0.70, 0.85, dist);
          vec3 col = mix(vColor, vec3(1.0, 1.0, 1.0), isBorder * 0.9);

          // Selection highlight ring
          if (vNodeAttrs.z > 0.5) {
            if (dist > 0.6) col = vec3(0.22, 0.74, 0.97); // #38bdf8
          }

          gl_FragColor = vec4(col, 0.95);
        }
      `
    });

    nodeMaterialRef.current = nodeMat;

    const mesh = new THREE.InstancedMesh(instGeom, nodeMat, totalNodes);
    mesh.name = 'sadi_nodes';
    scene.add(mesh);
    nodesMeshRef.current = mesh;
  }, [topology, selectedEntity]);

  // Update Dynamic Visibility based on Filters
  useEffect(() => {
    // 1. Update lines active attribute
    if (lineGeometryRef.current && topology) {
      const paramsAttr = lineGeometryRef.current.getAttribute('aParams') as THREE.BufferAttribute;
      if (paramsAttr) {
        let ptr = 0;
        topology.lines.forEach((line) => {
          const voltActive = filters.voltages[line.tension_tier] !== false;
          const opActive = !filters.selectedOperator || line.empresa.toLowerCase().includes(filters.selectedOperator.toLowerCase());
          const searchActive = !filters.searchQuery || line.nombre.toLowerCase().includes(filters.searchQuery.toLowerCase()) || line.empresa.toLowerCase().includes(filters.searchQuery.toLowerCase());
          const isActive = voltActive && opActive && searchActive ? 1.0 : 0.0;

          const segCount = (line.geo.length - 1) * 2;
          for (let s = 0; s < segCount; s++) {
            paramsAttr.setW(ptr, isActive);
            ptr++;
          }
        });
        paramsAttr.needsUpdate = true;
      }
    }

    // 2. Update nodes active attribute
    if (nodesMeshRef.current) {
      const attrsAttr = nodesMeshRef.current.geometry.getAttribute('aNodeAttrs') as THREE.InstancedBufferAttribute;
      if (attrsAttr && topology) {
        let i = 0;
        // EETT
        topology.eett.forEach((et) => {
          const voltActive = filters.voltages[et.tension_tier] !== false;
          const opActive = !filters.selectedOperator || et.empresa.toLowerCase().includes(filters.selectedOperator.toLowerCase());
          const searchActive = !filters.searchQuery || et.nombre.toLowerCase().includes(filters.searchQuery.toLowerCase()) || et.id.toLowerCase().includes(filters.searchQuery.toLowerCase());
          const isActive = voltActive && opActive && searchActive ? 1.0 : 0.0;
          attrsAttr.setW(i, isActive);
          i++;
        });
        // Centrales
        topology.centrales.forEach((cp) => {
          const techActive = filters.technologies[cp.tecnologia] !== false;
          const opActive = !filters.selectedOperator || cp.agente.toLowerCase().includes(filters.selectedOperator.toLowerCase());
          const searchActive = !filters.searchQuery || cp.nombre.toLowerCase().includes(filters.searchQuery.toLowerCase()) || cp.agente.toLowerCase().includes(filters.searchQuery.toLowerCase());
          const isActive = techActive && opActive && searchActive ? 1.0 : 0.0;
          attrsAttr.setW(i, isActive);
          i++;
        });
        attrsAttr.needsUpdate = true;
      }
    }
  }, [filters, topology]);

  // Click Raycasting Inspector Handler
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    if (!container || !camera || !topology) return;

    const rect = container.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / container.clientWidth) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / container.clientHeight) * 2 + 1;

    // Unproject to world coordinates
    const vec = new THREE.Vector3(mouseX, mouseY, 0).unproject(camera);
    const wx = vec.x;
    const wy = vec.y;
    const morph = currentMorphRef.current;

    // Dynamic hit threshold based on camera zoom
    const hitRadius = 28.0 / (camera.zoom || 1.0);

    let closestNode: { type: 'EETT' | 'CENTRAL'; data: Substation | PowerPlant } | null = null;
    let minNodeDist = hitRadius;

    // Check EETT
    for (const et of topology.eett) {
      if (filters.voltages[et.tension_tier] === false) continue;
      const px = THREE.MathUtils.lerp(et.geo[0], et.schem[0], morph);
      const py = THREE.MathUtils.lerp(et.geo[1], et.schem[1], morph);
      const d = Math.hypot(wx - px, wy - py);
      if (d < minNodeDist) {
        minNodeDist = d;
        closestNode = { type: 'EETT', data: et };
      }
    }

    // Check Centrales
    for (const cp of topology.centrales) {
      if (filters.technologies[cp.tecnologia] === false) continue;
      const px = THREE.MathUtils.lerp(cp.geo[0], cp.schem[0], morph);
      const py = THREE.MathUtils.lerp(cp.geo[1], cp.schem[1], morph);
      const d = Math.hypot(wx - px, wy - py);
      if (d < minNodeDist) {
        minNodeDist = d;
        closestNode = { type: 'CENTRAL', data: cp };
      }
    }

    if (closestNode) {
      onSelectEntity(closestNode as SelectedEntity);
      return;
    }

    // Check Lines if no node was hit
    let closestLine: TransmissionLine | null = null;
    let minLineDist = hitRadius * 0.75;

    for (const line of topology.lines) {
      if (filters.voltages[line.tension_tier] === false) continue;
      for (let i = 0; i < line.geo.length - 1; i++) {
        const x1 = THREE.MathUtils.lerp(line.geo[i][0], line.schem[i][0], morph);
        const y1 = THREE.MathUtils.lerp(line.geo[i][1], line.schem[i][1], morph);
        const x2 = THREE.MathUtils.lerp(line.geo[i + 1][0], line.schem[i + 1][0], morph);
        const y2 = THREE.MathUtils.lerp(line.geo[i + 1][1], line.schem[i + 1][1], morph);

        // Point-line segment distance
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        let t = l2 === 0 ? 0 : ((wx - x1) * dx + (wy - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        const d = Math.hypot(wx - projX, wy - projY);

        if (d < minLineDist) {
          minLineDist = d;
          closestLine = line;
        }
      }
    }

    if (closestLine) {
      onSelectEntity({ type: 'LINE', data: closestLine });
    }
  }, [topology, filters, onSelectEntity]);

  return (
    <div 
      ref={mountRef} 
      onPointerDown={handlePointerDown}
      className="w-full h-full relative cursor-crosshair overflow-hidden touch-none"
    />
  );
};
