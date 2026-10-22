const fs = require('fs');
const path = require('path');

const TOPOLOGY_PATH = path.join(__dirname, '..', 'data', 'cache', 'sadi_topology.json');
const rawTop = JSON.parse(fs.readFileSync(TOPOLOGY_PATH, 'utf8'));

// Known major Argentine power plant capacities (MW) to enrich WFS records that have 0 MW
const KNOWN_MW = [
  { match: /YACYRET/i, mw: 3200, kv: 500 },
  { match: /SALTO GRANDE/i, mw: 1890, kv: 500 },
  { match: /PIEDRA DEL AGUILA|P\.?\s*DEL AGUILA/i, mw: 1400, kv: 500 },
  { match: /EL CHOCON|CHOCON/i, mw: 1200, kv: 500 },
  { match: /ALICURA/i, mw: 1050, kv: 500 },
  { match: /ATUCHA II|ATUCHA 2/i, mw: 745, kv: 500 },
  { match: /ATUCHA/i, mw: 362, kv: 500 },
  { match: /EMBALSE/i, mw: 683, kv: 500 },
  { match: /COSTANERA/i, mw: 2324, kv: 500 },
  { match: /PUERTO|C\.?\s*PUERTO/i, mw: 1779, kv: 500 },
  { match: /GENELBA/i, mw: 1243, kv: 500 },
  { match: /DOCK SUD/i, mw: 870, kv: 220 },
  { match: /TERMOANDES/i, mw: 643, kv: 345 },
  { match: /SAN NICOLAS/i, mw: 675, kv: 500 },
  { match: /BELGRANO|CAMPANA/i, mw: 865, kv: 500 },
  { match: /SAN MARTIN|TIMBUES/i, mw: 865, kv: 500 },
  { match: /VUELTA DE OBLIGADO|OBLIGADO/i, mw: 816, kv: 500 },
  { match: /GUILLERMO BROWN/i, mw: 576, kv: 500 },
  { match: /PIEDRA BUENA/i, mw: 620, kv: 500 },
  { match: /PLANICIE BANDERITA/i, mw: 479, kv: 500 },
  { match: /FUTALEUFU/i, mw: 472, kv: 330 },
  { match: /RIO GRANDE/i, mw: 750, kv: 500 },
  { match: /CERROS COLORADOS/i, mw: 479, kv: 500 },
  { match: /PICHIPICUN|PICUN LEUFU/i, mw: 285, kv: 500 },
  { match: /ARROYITO/i, mw: 128, kv: 132 },
  { match: /CAUCHARI/i, mw: 300, kv: 345 },
  { match: /EL BRACHO|BRACHO/i, mw: 1300, kv: 500 },
  { match: /AGUA DEL CAJON|CAPEX/i, mw: 672, kv: 500 },
  { match: /LOMA DE LA LATA/i, mw: 640, kv: 500 },
  { match: /ENSENADA/i, mw: 840, kv: 220 },
  { match: /PILAR/i, mw: 930, kv: 500 },
  { match: /LUJAN DE CUYO/i, mw: 576, kv: 220 },
  { match: /LOS REYUNOS/i, mw: 224, kv: 220 },
  { match: /AGUA DEL TORO/i, mw: 150, kv: 220 },
  { match: /POTRERILLOS|CACHEUTA/i, mw: 180, kv: 132 },
  { match: /LOS CARACOLES/i, mw: 125, kv: 132 },
  { match: /PUNTA NEGRA/i, mw: 65, kv: 132 },
  { match: /ULLUM/i, mw: 180, kv: 132 },
  { match: /CABRA CORRAL/i, mw: 102, kv: 132 },
  { match: /URUGUAI|URUGUAY-I/i, mw: 120, kv: 132 },
  { match: /MADRYN/i, mw: 220, kv: 500 },
  { match: /RAWSON/i, mw: 108, kv: 132 },
  { match: /MANANTIALES BEHR/i, mw: 99, kv: 132 },
  { match: /ARAUCO/i, mw: 152, kv: 132 },
  { match: /ALUAR/i, mw: 740, kv: 330 },
  { match: /AVELLANEDA|SECCO|MATHEU|EZEIZA|RODRIGUEZ/i, mw: 250, kv: 220 }
];

function deterministicHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function estimateCentralSpecs(c) {
  const name = (c.nombre || '').toUpperCase();
  for (const k of KNOWN_MW) {
    if (k.match.test(name)) {
      return { mw: k.mw, kv: k.kv, isMajor: k.mw >= 250 };
    }
  }
  const h = deterministicHash(c.id + name);
  const tech = c.tecnologia || 'Térmica';
  if (tech === 'Nuclear') return { mw: 680, kv: 500, isMajor: true };
  if (tech === 'Hidroeléctrica') {
    const mw = 18 + (h % 95);
    return { mw, kv: mw >= 60 ? 132 : 33, isMajor: mw >= 100 };
  }
  if (tech === 'Eólica') {
    const mw = 28 + (h % 110);
    return { mw, kv: mw >= 85 ? 220 : 132, isMajor: mw >= 95 };
  }
  if (tech === 'Solar') {
    const mw = 15 + (h % 85);
    return { mw, kv: mw >= 60 ? 132 : 33, isMajor: mw >= 80 };
  }
  if (tech === 'Biomasa') {
    const mw = 5 + (h % 28);
    return { mw, kv: 33, isMajor: false };
  }
  // Térmica
  if (/ENARSA|DISP|MOVIL|GENERACION/i.test(name)) {
    const mw = 12 + (h % 25);
    return { mw, kv: 33, isMajor: false };
  }
  const mw = 35 + (h % 140);
  return { mw, kv: mw >= 110 ? 220 : 132, isMajor: mw >= 140 };
}

// 1. Enrich all 474 Centrales
const centrales = rawTop.centrales.map((c, idx) => {
  const specs = estimateCentralSpecs(c);
  const mw = c.potencia_mw > 0 ? Math.round(c.potencia_mw) : specs.mw;
  const reg = c.region === 'BAS' ? 'GBA' : (c.region || 'Centro');
  return {
    ...c,
    uid: `GEN_${c.id}_${idx}`,
    role: 'GEN',
    potencia_mw: mw,
    tension_kv: specs.kv,
    isMajor: specs.isMajor || mw >= 200,
    region: reg
  };
});

// 2. Enrich all 323 EETT
const eett = rawTop.eett.map((e, idx) => {
  const h = deterministicHash(e.id + (e.nombre || ''));
  const kv = e.tension_kv || 132;
  const role = kv >= 500 ? 'ET500' : 'ET132';
  let mw = e.potencia_mw > 0 ? Math.round(e.potencia_mw) : 0;
  if (mw === 0) {
    mw = kv >= 500 ? (300 + (h % 900)) : kv >= 220 ? (140 + (h % 260)) : (45 + (h % 135));
  }
  const reg = e.region === 'BAS' ? 'GBA' : (e.region || 'Centro');
  return {
    ...e,
    uid: `EETT_${e.id}_${idx}`,
    role,
    potencia_mw: mw,
    tension_kv: kv,
    isMajor: kv >= 500 || mw >= 300,
    region: reg
  };
});

// 3. Create all 33 Provincial & Regional Distributors (covering every province of Argentina)
const DISTRIBUIDORAS_RAW = [
  { id: 'DIST_EDENOR', nombre: 'Edenor (AMBA Norte/Oeste)', empresa: 'EDENOR S.A.', provincia: 'BUENOS AIRES', region: 'GBA', lat: -34.52, lon: -58.56, mw: 3150, kv: 13.2 },
  { id: 'DIST_EDESUR', nombre: 'Edesur (AMBA Sur/CABA)', empresa: 'EDESUR S.A.', provincia: 'CIUDAD AUTONOMA DE BUENOS', region: 'GBA', lat: -34.72, lon: -58.39, mw: 2780, kv: 13.2 },
  { id: 'DIST_EDELAP', nombre: 'Edelap (La Plata / Gran LP)', empresa: 'EDELAP S.A.', provincia: 'BUENOS AIRES', region: 'GBA', lat: -34.92, lon: -57.95, mw: 580, kv: 13.2 },
  { id: 'DIST_EDEA', nombre: 'EDEA (Mar del Plata / Costa)', empresa: 'EDEA S.A.', provincia: 'BUENOS AIRES', region: 'GBA', lat: -38.00, lon: -57.55, mw: 640, kv: 33 },
  { id: 'DIST_EDEN', nombre: 'EDEN (Norte y Centro PBA)', empresa: 'EDEN S.A.', provincia: 'BUENOS AIRES', region: 'GBA', lat: -33.75, lon: -60.10, mw: 590, kv: 33 },
  { id: 'DIST_EDES', nombre: 'EDES (Bahía Blanca / Sur PBA)', empresa: 'EDES S.A.', provincia: 'BUENOS AIRES', region: 'GBA', lat: -38.71, lon: -62.26, mw: 420, kv: 33 },
  { id: 'DIST_FEDECOBA', nombre: 'Coop. Eléctricas PBA (200 Coop.)', empresa: 'FEDECOBA / FACE', provincia: 'BUENOS AIRES', region: 'GBA', lat: -36.89, lon: -60.32, mw: 710, kv: 13.2 },
  { id: 'DIST_EPESF_SUR', nombre: 'EPE Santa Fe (Rosario / Sur)', empresa: 'EPE SANTA FE', provincia: 'SANTA FE', region: 'Litoral', lat: -32.95, lon: -60.66, mw: 980, kv: 13.2 },
  { id: 'DIST_EPESF_NORTE', nombre: 'EPE Santa Fe (Centro / Norte)', empresa: 'EPE SANTA FE', provincia: 'SANTA FE', region: 'Litoral', lat: -31.63, lon: -60.70, mw: 690, kv: 33 },
  { id: 'DIST_ENERSA', nombre: 'ENERSA (Entre Ríos)', empresa: 'ENERSA', provincia: 'ENTRE RIOS', region: 'Litoral', lat: -31.74, lon: -60.52, mw: 580, kv: 33 },
  { id: 'DIST_COOP_LIT', nombre: 'Coop. Eléctricas Litoral', empresa: 'FACE SANTA FE / ER', provincia: 'SANTA FE', region: 'Litoral', lat: -31.25, lon: -61.49, mw: 310, kv: 13.2 },
  { id: 'DIST_EPEC_CAP', nombre: 'EPEC Córdoba (Capital y Gran CBA)', empresa: 'EPEC', provincia: 'CORDOBA', region: 'Centro', lat: -31.41, lon: -64.18, mw: 1120, kv: 13.2 },
  { id: 'DIST_FECESCOR', nombre: 'Coop. Interior Córdoba (204 Coop.)', empresa: 'FECESCOR / FACE', provincia: 'CORDOBA', region: 'Centro', lat: -32.41, lon: -63.24, mw: 640, kv: 13.2 },
  { id: 'DIST_EDESAL', nombre: 'EDESAL (San Luis)', empresa: 'EDESAL S.A.', provincia: 'SAN LUIS', region: 'Centro', lat: -33.30, lon: -66.33, mw: 290, kv: 33 },
  { id: 'DIST_EDEMSA', nombre: 'EDEMSA (Gran Mendoza)', empresa: 'EDEMSA', provincia: 'MENDOZA', region: 'Cuyo', lat: -32.89, lon: -68.84, mw: 740, kv: 13.2 },
  { id: 'DIST_EDESTE', nombre: 'EDESTE y Coop. Mendoza (Godoy Cruz)', empresa: 'EDESTE / CEC', provincia: 'MENDOZA', region: 'Cuyo', lat: -33.05, lon: -68.47, mw: 340, kv: 13.2 },
  { id: 'DIST_ESJ', nombre: 'Naturgy San Juan (ESJ)', empresa: 'ENERGÍA SAN JUAN', provincia: 'SAN JUAN', region: 'Cuyo', lat: -31.53, lon: -68.52, mw: 410, kv: 33 },
  { id: 'DIST_EDET', nombre: 'EDET (Tucumán)', empresa: 'EDET S.A.', provincia: 'TUCUMAN', region: 'NOA', lat: -26.82, lon: -65.22, mw: 520, kv: 13.2 },
  { id: 'DIST_EDESA', nombre: 'EDESA (Salta)', empresa: 'EDESA S.A.', provincia: 'SALTA', region: 'NOA', lat: -24.79, lon: -65.41, mw: 410, kv: 33 },
  { id: 'DIST_EJESA', nombre: 'EJESA (Jujuy)', empresa: 'EJESA S.A.', provincia: 'JUJUY', region: 'NOA', lat: -24.18, lon: -65.30, mw: 240, kv: 33 },
  { id: 'DIST_EDESE', nombre: 'EDESE (Santiago del Estero)', empresa: 'EDESE S.A.', provincia: 'SANTIAGO DEL ESTERO', region: 'NOA', lat: -27.79, lon: -64.26, mw: 310, kv: 33 },
  { id: 'DIST_EDELAR', nombre: 'EDELAR (La Rioja)', empresa: 'EDELAR S.A.', provincia: 'LA RIOJA', region: 'NOA', lat: -29.41, lon: -66.85, mw: 230, kv: 33 },
  { id: 'DIST_ECSAPEM', nombre: 'EC SAPEM (Catamarca)', empresa: 'EC SAPEM', provincia: 'CATAMARCA', region: 'NOA', lat: -28.47, lon: -65.78, mw: 195, kv: 33 },
  { id: 'DIST_SECHEEP', nombre: 'SECHEEP (Chaco)', empresa: 'SECHEEP', provincia: 'CHACO', region: 'NEA', lat: -27.45, lon: -58.98, mw: 490, kv: 33 },
  { id: 'DIST_DPEC', nombre: 'DPEC (Corrientes)', empresa: 'DPEC', provincia: 'CORRIENTES', region: 'NEA', lat: -27.47, lon: -58.83, mw: 440, kv: 33 },
  { id: 'DIST_EMSA', nombre: 'Energía de Misiones (EMSA)', empresa: 'EMSA', provincia: 'MISIONES', region: 'NEA', lat: -27.36, lon: -55.89, mw: 380, kv: 33 },
  { id: 'DIST_REFSA', nombre: 'REFSA (Formosa)', empresa: 'REFSA', provincia: 'FORMOSA', region: 'NEA', lat: -26.18, lon: -58.17, mw: 260, kv: 33 },
  { id: 'DIST_EPEN', nombre: 'EPEN y CALF (Neuquén)', empresa: 'EPEN / CALF', provincia: 'NEUQUEN', region: 'Comahue', lat: -38.95, lon: -68.06, mw: 460, kv: 33 },
  { id: 'DIST_EDERSA', nombre: 'EdERSA y CEB (Río Negro)', empresa: 'EdERSA / CEB', provincia: 'RIO NEGRO', region: 'Comahue', lat: -39.03, lon: -67.58, mw: 390, kv: 33 },
  { id: 'DIST_APE', nombre: 'APE y CORPICO (La Pampa)', empresa: 'APE LA PAMPA', provincia: 'LA PAMPA', region: 'Comahue', lat: -36.62, lon: -64.29, mw: 210, kv: 33 },
  { id: 'DIST_CHUBUT', nombre: 'Coop. Chubut (SCPL / Servicoop)', empresa: 'DGSP / COOP CHUBUT', provincia: 'CHUBUT', region: 'Patagonia', lat: -45.86, lon: -67.50, mw: 350, kv: 33 },
  { id: 'DIST_SPSE', nombre: 'SPSE (Santa Cruz)', empresa: 'SPSE', provincia: 'SANTA CRUZ', region: 'Patagonia', lat: -51.62, lon: -69.22, mw: 190, kv: 33 },
  { id: 'DIST_DPE', nombre: 'DPE y Coop. Río Grande (T. del Fuego)', empresa: 'DPE TDF', provincia: 'TIERRA DEL FUEGO', region: 'Patagonia', lat: -54.80, lon: -68.30, mw: 145, kv: 13.2 }
];

const REF_LON = -64.0;
const REF_LAT = -38.0;
const DEG_TO_RAD = Math.PI / 180.0;
function geoToProj(lon, lat) {
  const x = (lon - REF_LON) * Math.cos(REF_LAT * DEG_TO_RAD) * 111.32;
  const y = (lat - REF_LAT) * 111.32;
  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
}

const distribuidoras = DISTRIBUIDORAS_RAW.map((d) => {
  const geo = geoToProj(d.lon, d.lat);
  return {
    ...d,
    uid: d.id,
    role: 'DIST',
    potencia_mw: d.mw,
    tension_kv: d.kv,
    isMajor: true,
    geo
  };
});

// 4. Build Deduplicated Connections (1 edge per pair A-B) ensuring 100% of participants are connected
// Role hierarchy order: GEN (0) -> ET500 (1) -> ET132 (2) -> DIST (3)
const ROLE_RANK = { GEN: 0, ET500: 1, ET132: 2, DIST: 3 };
const allStations = [...centrales, ...eett, ...distribuidoras];
const stationByUid = new Map(allStations.map(s => [s.uid, s]));

const edgeMap = new Map(); // canonicalPairKey -> edge object
const connectedAsSource = new Set();
const connectedAsTarget = new Set();

function addDeduplicatedEdge(nodeA, nodeB, kv, rawName, empresa) {
  if (!nodeA || !nodeB || nodeA.uid === nodeB.uid) return;
  // Determine electrical flow direction: higher hierarchy rank is target (GEN -> ET500 -> ET132 -> DIST)
  let src = nodeA;
  let tgt = nodeB;
  const rA = ROLE_RANK[nodeA.role];
  const rB = ROLE_RANK[nodeB.role];
  if (rA > rB) {
    src = nodeB;
    tgt = nodeA;
  } else if (rA === rB) {
    // Between two EETT of same role, flow goes from higher voltage/power or towards GBA/East
    if ((nodeB.tension_kv || 0) > (nodeA.tension_kv || 0)) {
      src = nodeB;
      tgt = nodeA;
    } else if (nodeA.uid > nodeB.uid) {
      src = nodeB;
      tgt = nodeA;
    }
  }
  // Never allow GEN to be a target or DIST to be a source!
  if (tgt.role === 'GEN') {
    if (src.role === 'GEN') return; // Two generators don't feed each other directly
    const tmp = src; src = tgt; tgt = tmp;
  }
  if (src.role === 'DIST') {
    if (tgt.role === 'DIST') return;
    const tmp = src; src = tgt; tgt = tmp;
  }

  const pairKey = [src.uid, tgt.uid].sort().join('__');
  if (edgeMap.has(pairKey)) {
    const existing = edgeMap.get(pairKey);
    existing.parallelCount += 1;
    if (kv > existing.voltageKv) existing.voltageKv = kv;
    return;
  }

  const mwEst = Math.min(src.potencia_mw || 120, tgt.potencia_mw || 180);
  const vKv = kv || Math.min(src.tension_kv || 132, tgt.tension_kv || 132);
  const amperes = Math.max(85, Math.min(2800, Math.round((mwEst * 1000) / (1.732 * vKv * 0.92))));

  edgeMap.set(pairKey, {
    id: `E_${edgeMap.size + 1}`,
    source: src.uid,
    target: tgt.uid,
    voltageKv: vKv,
    parallelCount: 1,
    amperes,
    nombre: rawName || `${src.nombre} ➔ ${tgt.nombre}`,
    empresa: empresa || src.empresa || src.agente || 'SADI',
    region: src.region || tgt.region || 'Centro'
  });
  connectedAsSource.add(src.uid);
  connectedAsTarget.add(tgt.uid);
}

// Helper to find nearest station from a subset
function findNearest(pt, candidates, maxDistKm = Infinity, excludeUid = null) {
  let best = null;
  let bestD = maxDistKm;
  for (const c of candidates) {
    if (c.uid === excludeUid) continue;
    const d = Math.hypot(c.geo[0] - pt[0], c.geo[1] - pt[1]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// Step A: Match the 1,365 WFS lines to EETT / GEN endpoints (within 28 km)
const eettAndGen = [...eett, ...centrales];
for (const l of rawTop.lines) {
  if (!l.geo || l.geo.length < 2) continue;
  const pStart = l.geo[0];
  const pEnd = l.geo[l.geo.length - 1];
  const n1 = findNearest(pStart, eettAndGen, 28);
  const n2 = findNearest(pEnd, eettAndGen, 28, n1 ? n1.uid : null);
  if (n1 && n2 && n1.uid !== n2.uid) {
    // Avoid GEN-to-GEN direct lines
    if (n1.role === 'GEN' && n2.role === 'GEN') continue;
    addDeduplicatedEdge(n1, n2, l.tension_kv || 132, l.nombre, l.empresa);
  }
}

// Step B: Ensure EVERY ONE of the 474 Centrales Generadoras has an outgoing connection to an EETT
const et500List = eett.filter(e => e.role === 'ET500');
const et132List = eett.filter(e => e.role === 'ET132');

for (const gen of centrales) {
  if (!connectedAsSource.has(gen.uid)) {
    // Big generators (>= 200 MW or 500 kV) connect to nearest ET500 or nearby EETT
    const pool = gen.tension_kv >= 500 || gen.potencia_mw >= 250 ? et500List : eett;
    const targetEt = findNearest(gen.geo, pool, Infinity);
    if (targetEt) {
      const kv = gen.tension_kv >= 500 ? 500 : (targetEt.tension_kv >= 220 && gen.potencia_mw >= 80 ? 220 : (gen.potencia_mw >= 30 ? 132 : 33));
      addDeduplicatedEdge(gen, targetEt, kv, `Vínculo Gen. ${gen.nombre}`, gen.agente);
    }
  }
}

// Step C: Ensure EVERY ET500 has both incoming (from GEN or another ET500) and outgoing (to ET132 or ET500)
for (const st500 of et500List) {
  if (!connectedAsTarget.has(st500.uid)) {
    // Connect from nearest GEN or nearest already-fed ET500
    const nearGen = findNearest(st500.geo, centrales, 120);
    const near500 = findNearest(st500.geo, et500List, Infinity, st500.uid);
    if (nearGen) addDeduplicatedEdge(nearGen, st500, 500, `Aporte 500kV ${nearGen.nombre}`, st500.empresa);
    else if (near500) addDeduplicatedEdge(near500, st500, 500, `Troncal 500kV ${near500.nombre}-${st500.nombre}`, st500.empresa);
  }
  if (!connectedAsSource.has(st500.uid)) {
    const nearSub = findNearest(st500.geo, et132List, Infinity);
    if (nearSub) addDeduplicatedEdge(st500, nearSub, 132, `Bajada 500/132kV ${st500.nombre}`, st500.empresa);
  }
}

// Step D: Ensure EVERY ET132 (264 substations) has an incoming feed from an ET500 or upstream ET132
for (const sub of et132List) {
  if (!connectedAsTarget.has(sub.uid)) {
    const near500 = findNearest(sub.geo, et500List, 220);
    if (near500) {
      addDeduplicatedEdge(near500, sub, sub.tension_kv >= 220 ? 220 : 132, `Alimentador AT ${near500.nombre} ➔ ${sub.nombre}`, sub.empresa);
    } else {
      const fedSubs = et132List.filter(x => x.uid !== sub.uid && connectedAsTarget.has(x.uid));
      const nearSub = findNearest(sub.geo, fedSubs.length ? fedSubs : et500List, Infinity, sub.uid);
      if (nearSub) {
        addDeduplicatedEdge(nearSub, sub, 132, `Subtransmisión 132kV ${nearSub.nombre} ➔ ${sub.nombre}`, sub.empresa);
      }
    }
  }
}

// Step E: Connect EVERY ET132 that has no outgoing edge (or nearest substations) down to its Provincial Distributor (DIST)
for (const dist of distribuidoras) {
  // Connect top 4 nearest substations in the same region to this distributor
  const regSubs = et132List.filter(s => s.region === dist.region);
  const pool = regSubs.length >= 2 ? regSubs : et132List;
  const sorted = [...pool].sort((a, b) =>
    Math.hypot(a.geo[0] - dist.geo[0], a.geo[1] - dist.geo[1]) -
    Math.hypot(b.geo[0] - dist.geo[0], b.geo[1] - dist.geo[1])
  );
  for (const sub of sorted.slice(0, 4)) {
    addDeduplicatedEdge(sub, dist, dist.tension_kv || 33, `Distribución ${sub.nombre} ➔ ${dist.nombre}`, dist.empresa);
  }
}

// Also for any ET132 that still has no outgoing link, connect it to its nearest distributor so energy flows all the way to consumption
for (const sub of et132List) {
  if (!connectedAsSource.has(sub.uid)) {
    const nearDist = findNearest(sub.geo, distribuidoras, Infinity);
    if (nearDist) {
      addDeduplicatedEdge(sub, nearDist, nearDist.tension_kv || 33, `Entrega Media Tensión ${sub.nombre}`, nearDist.empresa);
    }
  }
}

const deduplicatedEdges = Array.from(edgeMap.values());

rawTop.centrales = centrales;
rawTop.eett = eett;
rawTop.distribuidoras = distribuidoras;
rawTop.deduplicated_edges = deduplicatedEdges;
rawTop.metadata = {
  ...rawTop.metadata,
  total_centrales: centrales.length,
  total_eett: eett.length,
  total_distribuidoras: distribuidoras.length,
  total_participants: centrales.length + eett.length + distribuidoras.length,
  total_deduplicated_edges: deduplicatedEdges.length
};

fs.writeFileSync(TOPOLOGY_PATH, JSON.stringify(rawTop));
console.log('Successfully updated sadi_topology.json:', rawTop.metadata);
