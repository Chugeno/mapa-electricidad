#!/usr/bin/env python3
"""
SADI Ingestion, Simplification and Topological Quantization Script.
Downloads real SADI layers from Secretaría de Energía WFS, IGN Provinces,
and computes dual coordinates: Geo (EPSG:4326 projected) and Unifilar (Schematic octolinear SCADA grid).
"""

import urllib.request
import ssl
import json
import os
import math
import sys
from collections import defaultdict

CACHE_DIR = "/home/eugenio/mapa-electricidad/data/cache"
os.makedirs(CACHE_DIR, exist_ok=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

HEADERS = {'User-Agent': 'Mozilla/5.0 (SCADA SADI Ingestion)'}

def fetch_json(url, timeout=90):
    print(f"Fetching: {url[:100]}...")
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return json.loads(resp.read().decode('utf-8'))

def parse_tension(val):
    if not val:
        return 132
    try:
        s = str(val).replace(',', '.').strip()
        nums = [float(n) for n in re_nums(s)]
        if nums:
            max_v = max(nums)
            if max_v >= 400: return 500
            if max_v >= 200: return 220
            if max_v >= 100: return 132
            return int(max_v)
        return 132
    except:
        return 132

def re_nums(s):
    import re
    return re.findall(r'\d+(?:\.\d+)?', s)

def classify_tension(kv):
    if kv >= 500: return "500kV"
    if kv >= 220: return "220kV"
    if kv >= 132: return "132kV"
    return "<132kV"

def classify_technology(tec_label, name):
    t = (tec_label or "").lower() + " " + (name or "").lower()
    if any(k in t for k in ['nuclear', 'atucha', 'embalse']):
        return 'Nuclear'
    if any(k in t for k in ['hidro', 'hidráulica', 'hidraulica', 'chocón', 'chocon', 'yacyreta', 'yacyretá', 'salto grande', 'futaleufú', 'represa']):
        return 'Hidroeléctrica'
    if any(k in t for k in ['solar', 'fotovoltaic']):
        return 'Solar'
    if any(k in t for k in ['eolic', 'eólica', 'eolica', 'viento', 'parque eolico']):
        return 'Eólica'
    if any(k in t for k in ['biomasa', 'biogas', 'biodigest']):
        return 'Biomasa'
    return 'Térmica'

def infer_region(lon, lat, empresa):
    emp = (empresa or "").upper()
    if 'TRANSBA' in emp or 'EDENOR' in emp or 'EDESUR' in emp or 'EDELAP' in emp:
        if -35.2 <= lat <= -34.2 and -58.9 <= lon <= -58.1:
            return 'GBA'
        return 'BAS'
    if 'TRANSNOA' in emp or lat > -29.0 and lon < -63.0:
        return 'NOA'
    if 'TRANSNEA' in emp or (lat > -30.0 and lon >= -63.0):
        return 'NEA'
    if 'DISTROCUYO' in emp or (-37.0 <= lat <= -31.0 and lon < -67.0):
        return 'Cuyo'
    if 'TRANSPA' in emp or lat < -42.0:
        return 'Patagonia'
    if 'TRANSCOMAHUE' in emp or (-42.0 <= lat <= -37.0 and lon < -66.0):
        return 'Comahue'
    if -34.0 <= lat <= -30.0 and -62.0 <= lon <= -57.0:
        return 'Litoral'
    return 'Centro'

# Geographic to Projected Flat Meters (Center: -64.0 Lon, -38.0 Lat)
REF_LON = -64.0
REF_LAT = -38.0
DEG_TO_RAD = math.pi / 180.0

def geo_to_proj(lon, lat):
    # Equirectangular projection around Argentina
    x = (lon - REF_LON) * math.cos(REF_LAT * DEG_TO_RAD) * 111.32
    y = (lat - REF_LAT) * 111.32
    return round(x, 3), round(y, 3)

def quantize_octolinear(x, y, grid_size=35.0):
    """
    Quantize projected coordinates to an orthogonal/octolinear SCADA grid.
    Snaps to coarse steps so unifilar topology aligns with 90° and 45° paths.
    """
    qx = round(x / grid_size) * grid_size
    qy = round(y / grid_size) * grid_size
    return round(qx, 2), round(qy, 2)

def douglas_peucker(pts, tol):
    if len(pts) <= 2:
        return pts
    # find point with max distance from line between first and last
    first, last = pts[0], pts[-1]
    dx = last[0] - first[0]
    dy = last[1] - first[1]
    dist_sq = dx*dx + dy*dy
    max_d = 0.0
    index = 0
    for i in range(1, len(pts) - 1):
        p = pts[i]
        if dist_sq == 0:
            d = math.hypot(p[0] - first[0], p[1] - first[1])
        else:
            # perpendicular distance
            num = abs(dy * p[0] - dx * p[1] + last[0]*first[1] - last[1]*first[0])
            d = num / math.sqrt(dist_sq)
        if d > max_d:
            max_d = d
            index = i
    if max_d > tol:
        left = douglas_peucker(pts[:index+1], tol)
        right = douglas_peucker(pts[index:], tol)
        return left[:-1] + right
    else:
        return [first, last]

def main():
    print("=== SADI Data Ingestion & Topological Processor ===")
    
    # 1. Transmission Lines
    url_lines = "https://sig.energia.gob.ar/mapserv?map=/etc/mapserver/mapase.map&service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:union_cammesa_lineas_transporte&outputFormat=application/json;%20subtype=geojson"
    lines_raw = fetch_json(url_lines)
    
    # 2. Substations (EETT)
    url_eett = "https://sig.energia.gob.ar/mapserv?map=/etc/mapserver/mapase.map&service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:electrica_transporte_visor_eett&outputFormat=application/json;%20subtype=geojson"
    eett_raw = fetch_json(url_eett)
    
    # 3. Power Plants (Centrales)
    url_centrales = "https://sig.energia.gob.ar/mapserv?map=/etc/mapserver/mapase.map&service=WFS&version=2.0.0&request=GetFeature&typeNames=ms:visor_centrales_unificacion&outputFormat=application/json;%20subtype=geojson"
    centrales_raw = fetch_json(url_centrales)

    # 4. Provinces
    url_prov = "https://wms.ign.gob.ar/geoserver/ows?service=wfs&version=1.1.0&request=GetFeature&typeName=ign:provincia&outputFormat=application/json"
    print("Fetching IGN Provinces...")
    prov_raw = fetch_json(url_prov, timeout=120)

    # Process and Simplify Provinces
    processed_provinces = []
    print(f"Processing {len(prov_raw.get('features', []))} province features...")
    for feat in prov_raw.get('features', []):
        props = feat.get('properties', {})
        geom = feat.get('geometry', {})
        name = props.get('nam') or props.get('nombre') or 'Provincia'
        gtype = geom.get('type')
        coords = geom.get('coordinates', [])
        
        simplified_rings = []
        if gtype == 'Polygon':
            coords = [coords]
        
        for poly in coords:
            for ring in poly:
                # filter out very small island artifacts or simplify
                if len(ring) < 3: continue
                # Douglas Peucker with ~0.04 degrees tolerance (~4.4km)
                sim = douglas_peucker(ring, tol=0.035)
                # Convert to proj
                proj_ring = []
                for pt in sim:
                    px, py = geo_to_proj(pt[0], pt[1])
                    proj_ring.append([px, py])
                if len(proj_ring) >= 3:
                    simplified_rings.append(proj_ring)
        
        if simplified_rings:
            processed_provinces.append({
                "nombre": name,
                "rings": simplified_rings
            })

    # Track operators and technologies
    operators = set()
    
    # Process Substations (EETT)
    processed_eett = []
    node_grid_counts = defaultdict(int)

    for f in eett_raw.get('features', []):
        props = f.get('properties', {})
        geom = f.get('geometry', {})
        if geom.get('type') != 'Point': continue
        coords = geom.get('coordinates')
        if not coords or len(coords) < 2: continue
        lon, lat = coords[0], coords[1]
        
        kv_in = parse_tension(props.get('tension_entrada'))
        kv_out = parse_tension(props.get('tension_salida'))
        kv = max(kv_in, kv_out)
        tier = classify_tension(kv)
        empresa = props.get('propiedad') or props.get('concesion') or 'Transener'
        operators.add(empresa.strip())
        
        px, py = geo_to_proj(lon, lat)
        sx, sy = quantize_octolinear(px, py, grid_size=32.0)
        
        # De-clutter overlapping nodes on schematic view
        grid_key = (sx, sy)
        idx = node_grid_counts[grid_key]
        node_grid_counts[grid_key] += 1
        if idx > 0:
            # offset on orthogonal angle (e.g. 10km grid shift)
            angle = (idx * math.pi / 2.0)
            sx += round(math.cos(angle) * 12.0 * idx, 2)
            sy += round(math.sin(angle) * 12.0 * idx, 2)
        
        pot = props.get('potencia_instalada_mv')
        try: pot_mw = float(pot) if pot else 0.0
        except: pot_mw = 0.0

        region = infer_region(lon, lat, empresa)

        processed_eett.append({
            "id": props.get('id') or f"ET_{len(processed_eett)}",
            "nombre": props.get('nombre') or 'ESTACIÓN TRANSFORMADORA',
            "tension_kv": kv,
            "tension_tier": tier,
            "potencia_mw": pot_mw,
            "empresa": empresa.strip(),
            "region": region,
            "geo": [px, py],
            "schem": [sx, sy],
            "lat": lat,
            "lon": lon
        })

    # Process Power Plants (Centrales)
    processed_centrales = []
    tech_counts = defaultdict(int)

    for f in centrales_raw.get('features', []):
        props = f.get('properties', {})
        geom = f.get('geometry', {})
        if geom.get('type') != 'Point': continue
        coords = geom.get('coordinates')
        if not coords or len(coords) < 2: continue
        lon, lat = coords[0], coords[1]
        
        tech = classify_technology(props.get('tecnologia_etiqueta'), props.get('nombre'))
        tech_counts[tech] += 1
        agente = props.get('nombre_agente') or props.get('empresa') or 'Generador'
        operators.add(agente.strip())

        px, py = geo_to_proj(lon, lat)
        sx, sy = quantize_octolinear(px, py, grid_size=32.0)
        
        grid_key = (sx, sy)
        idx = node_grid_counts[grid_key]
        node_grid_counts[grid_key] += 1
        if idx > 0:
            angle = (idx * math.pi / 2.0)
            sx += round(math.cos(angle) * 12.0 * idx, 2)
            sy += round(math.sin(angle) * 12.0 * idx, 2)

        pot = props.get('potencia_instalada_mw') or props.get('potencia_mw')
        try: pot_mw = float(pot) if pot else 0.0
        except: pot_mw = 0.0

        region = infer_region(lon, lat, agente)

        processed_centrales.append({
            "id": props.get('central') or f"GEN_{len(processed_centrales)}",
            "nombre": props.get('nombre') or 'CENTRAL DE GENERACIÓN',
            "agente": agente.strip(),
            "tecnologia": tech,
            "potencia_mw": pot_mw,
            "provincia": props.get('provincia') or '',
            "region": region,
            "geo": [px, py],
            "schem": [sx, sy],
            "lat": lat,
            "lon": lon
        })

    # Process Transmission Lines
    processed_lines = []
    for f in lines_raw.get('features', []):
        props = f.get('properties', {})
        geom = f.get('geometry', {})
        gtype = geom.get('type')
        raw_coords = geom.get('coordinates', [])
        
        if gtype == 'LineString':
            lines_list = [raw_coords]
        elif gtype == 'MultiLineString':
            lines_list = raw_coords
        else:
            continue
            
        kv = parse_tension(props.get('tension_kv'))
        tier = classify_tension(kv)
        empresa = props.get('propiedad') or props.get('concesion') or 'Transener'
        operators.add(empresa.strip())

        for line_seg in lines_list:
            if len(line_seg) < 2: continue
            
            # Simplify line segment slightly with tolerance ~ 0.015 degrees (~1.6km)
            sim_pts = douglas_peucker(line_seg, tol=0.015)
            
            geo_pts = []
            schem_pts = []
            
            for pt in sim_pts:
                px, py = geo_to_proj(pt[0], pt[1])
                geo_pts.append([px, py])
                sx, sy = quantize_octolinear(px, py, grid_size=32.0)
                schem_pts.append([sx, sy])

            # In unifilar SCADA view, consecutive points shouldn't be duplicate
            clean_schem = [schem_pts[0]]
            for p in schem_pts[1:]:
                if p != clean_schem[-1]:
                    clean_schem.append(p)
            if len(clean_schem) < 2:
                # keep at least start and end
                clean_schem = [schem_pts[0], schem_pts[-1]]

            # Ensure geo and schem have exact same vertex count for GPU morphing!
            # If lengths differ, we keep exact 1-to-1 matching from sim_pts
            final_schem = schem_pts

            mid_pt = line_seg[len(line_seg)//2]
            region = infer_region(mid_pt[0], mid_pt[1], empresa)

            processed_lines.append({
                "id": props.get('gid') or f"L_{len(processed_lines)}",
                "nombre": props.get('nombre') or f"LÍNEA {kv} kV",
                "tension_kv": kv,
                "tension_tier": tier,
                "empresa": empresa.strip(),
                "region": region,
                "geo": geo_pts,
                "schem": final_schem
            })

    # Sort operators alphabetically, clean up blanks
    clean_ops = sorted([o for o in operators if o and len(o) > 1 and o != '-'])

    topology_payload = {
        "metadata": {
            "total_lines": len(processed_lines),
            "total_eett": len(processed_eett),
            "total_centrales": len(processed_centrales),
            "total_provincias": len(processed_provinces),
            "technologies": sorted(list(tech_counts.keys())),
            "voltage_tiers": ["500kV", "220kV", "132kV", "<132kV"],
            "operators": clean_ops
        },
        "provinces": processed_provinces,
        "lines": processed_lines,
        "eett": processed_eett,
        "centrales": processed_centrales
    }

    out_file = os.path.join(CACHE_DIR, "sadi_topology.json")
    print(f"Writing topology to {out_file}...")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(topology_payload, f, separators=(',', ':'))

    size_mb = os.path.getsize(out_file) / (1024 * 1024)
    print(f"DONE! Written {size_mb:.2f} MB.")
    print(f"Lines: {len(processed_lines)}, EETT: {len(processed_eett)}, Centrales: {len(processed_centrales)}, Provincias: {len(processed_provinces)}")

if __name__ == "__main__":
    main()
