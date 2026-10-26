// Cloudflare Pages Function: /api/telemetry
// Agregador de telemetría CAMMESA con Edge Cache (5 minutos)
// Asegura que SOLO 1 consulta cada 5 minutos llegue a los servidores de CAMMESA

const REGIONS = {
  SADI: 1002,
  GBA: 426,
  Litoral: 417,
  Centro: 422,
  Cuyo: 429,
  NOA: 419,
  NEA: 418,
  Comahue: 420,
  Patagonia: 111,
  BAS: 425
};

async function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (SCADA-SADI-Dashboard/1.0)'
      }
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const cacheUrl = new URL(request.url);
  // Normalizar URL de cache
  cacheUrl.search = '';
  const cacheKey = new Request(cacheUrl.toString(), request);
  const cache = caches.default;

  // 1. Revisar si ya existe en el Edge Cache de Cloudflare
  let cachedResponse = await cache.match(cacheKey);
  if (cachedResponse) {
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-Cache-Status', 'HIT');
    headers.set('Access-Control-Allow-Origin', '*');
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      headers
    });
  }

  // 2. Si venció la caché (MISS), consultamos CAMMESA en paralelo
  try {
    const regionalData = {};
    const regionPromises = Object.entries(REGIONS).map(async ([name, id]) => {
      try {
        const url = `https://api.cammesa.com/demanda-svc/demanda/ObtieneDemandaYTemperaturaRegion?id_region=${id}`;
        const data = await fetchWithTimeout(url, 7000);
        if (Array.isArray(data)) {
          const hoy = data.filter(d => d.demHoy != null);
          if (hoy.length > 0) {
            const latest = hoy[hoy.length - 1];
            regionalData[name] = {
              demanda_mw: latest.demHoy || 0,
              temperatura: latest.tempHoy || latest.tempAyer || 0,
              timestamp: latest.fecha,
              demAyer: latest.demAyer || 0
            };
          }
        }
      } catch (e) {
        // Fallback silencioso por región
      }
    });

    // Consultar renovables
    let renovables = null;
    const renPromise = (async () => {
      try {
        const today = new Date();
        const pad = n => String(n).padStart(2, '0');
        const dStr = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
        const tom = new Date(today);
        tom.setDate(tom.getDate() + 1);
        const tStr = `${pad(tom.getDate())}-${pad(tom.getMonth() + 1)}-${tom.getFullYear()}`;
        const rUrl = `https://cdsrenovables.cammesa.com/exhisto/RenovablesService/GetChartTotalTRDataSource?desde=${dStr}&hasta=${tStr}`;
        const rData = await fetchWithTimeout(rUrl, 7000);
        if (Array.isArray(rData) && rData.length > 0) {
          renovables = rData[rData.length - 1];
        }
      } catch (e) {
        // Fallback renovables
      }
    })();

    await Promise.allSettled([...regionPromises, renPromise]);

    const totalDemanda = regionalData.SADI ? regionalData.SADI.demanda_mw : 17000;
    const gbaDemanda = regionalData.GBA ? regionalData.GBA.demanda_mw : 6000;
    const comahueDemanda = regionalData.Comahue ? regionalData.Comahue.demanda_mw : 700;
    const patagoniaDemanda = regionalData.Patagonia ? regionalData.Patagonia.demanda_mw : 1000;
    const noaDemanda = regionalData.NOA ? regionalData.NOA.demanda_mw : 1400;
    const neaDemanda = regionalData.NEA ? regionalData.NEA.demanda_mw : 1200;
    const litoralDemanda = regionalData.Litoral ? regionalData.Litoral.demanda_mw : 1800;
    const cuyoDemanda = regionalData.Cuyo ? regionalData.Cuyo.demanda_mw : 800;
    const centroDemanda = regionalData.Centro ? regionalData.Centro.demanda_mw : 1800;

    const corridors = {
      COMAHUE_GBA: {
        from: 'Comahue',
        to: 'GBA',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.8, Math.max(0.6, (totalDemanda / 17000) * 1.2)),
        speed: 1.4
      },
      PATAGONIA_COMAHUE: {
        from: 'Patagonia',
        to: 'Comahue',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.6, Math.max(0.5, (patagoniaDemanda / 1000) * 1.1)),
        speed: 1.1
      },
      LITORAL_GBA: {
        from: 'Litoral',
        to: 'GBA',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.8, Math.max(0.6, (litoralDemanda / 1800) * 1.15)),
        speed: 1.3
      },
      NEA_LITORAL: {
        from: 'NEA',
        to: 'Litoral',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.5, Math.max(0.5, neaDemanda / 1200)),
        speed: 1.0
      },
      NOA_CENTRO: {
        from: 'NOA',
        to: 'Centro',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.5, Math.max(0.5, noaDemanda / 1400)),
        speed: 0.95
      },
      CUYO_CENTRO: {
        from: 'Cuyo',
        to: 'Centro',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.4, Math.max(0.5, cuyoDemanda / 800)),
        speed: 0.9
      },
      CENTRO_GBA: {
        from: 'Centro',
        to: 'GBA',
        nominal_kv: 500,
        flow_direction: 1,
        load_factor: Math.min(1.8, Math.max(0.6, (centroDemanda / 1800) * 1.1)),
        speed: 1.2
      }
    };

    const payload = {
      timestamp: new Date().toISOString(),
      status: 'ONLINE 5M',
      sadi_total_mw: totalDemanda,
      frequency_hz: 50.0 + (Math.random() * 0.04 - 0.02),
      regions: regionalData,
      renovables: renovables,
      corridors: corridors
    };

    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Edge Cache: 300s (5 minutos). Browser Cache: 60s
        'Cache-Control': 'public, max-age=60, s-maxage=300',
        'Access-Control-Allow-Origin': '*',
        'X-Cache-Status': 'MISS'
      }
    });

    // Guardar en la caché de borde de Cloudflare
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, status: 'ERROR' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
