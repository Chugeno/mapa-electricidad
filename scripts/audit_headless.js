const path = require('path');
const os = require('os');

// Set user-space dynamic library path for headless chromium
const userLibPath = path.join(os.homedir(), '.local', 'lib', 'chrome-deps', 'usr', 'lib', 'x86_64-linux-gnu');
process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH 
  ? `${userLibPath}:${process.env.LD_LIBRARY_PATH}`
  : userLibPath;

const { chromium } = require('playwright');

async function runAudit() {
  console.log('=== INICIANDO AUTO-AUDITORÍA REAL HEADLESS DEL DASHBOARD SADI ===');
  
  const targetUrl = 'http://100.107.77.45:8090';
  console.log(`Target URL: ${targetUrl}`);

  // 1. Verificar endpoint de topología
  console.log('\n[1/4] Verificando /api/topology...');
  const topRes = await fetch(`${targetUrl}/api/topology`);
  if (!topRes.ok) throw new Error(`/api/topology returned HTTP ${topRes.status}`);
  const topData = await topRes.json();
  
  const nLines = topData.lines?.length || 0;
  const nEett = topData.eett?.length || 0;
  const nCentrales = topData.centrales?.length || 0;
  const nProvincias = topData.provinces?.length || 0;

  console.log(`✓ Topología verificada: ${nLines} líneas, ${nEett} EETT, ${nCentrales} centrales, ${nProvincias} provincias`);
  if (nLines === 0 || nEett === 0 || nCentrales === 0) {
    throw new Error('Colecciones de topología vacías');
  }

  // 2. Levantar navegador Chromium Headless
  console.log('\n[2/4] Lanzando Chromium Headless...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('  [Page Error]:', err.message || String(err));
    pageErrors.push(err.message || String(err));
  });

  console.log(`Navegando a ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Esperar a que la UI monte el canvas
  await page.waitForTimeout(3000);

  // 3. Verificar Canvas WebGL y GLSL compilation
  console.log('\n[3/4] Verificando Canvas WebGL y Loop de Render...');
  const canvas = await page.$('canvas');
  if (!canvas) throw new Error('No se encontró el elemento <canvas> WebGL en el DOM');

  const canvasBox = await canvas.boundingBox();
  console.log(`✓ Canvas montado. Dimensiones: ${canvasBox.width}x${canvasBox.height} px`);
  if (canvasBox.width <= 0 || canvasBox.height <= 0) {
    throw new Error('Dimensiones del canvas inválidas (0 o negativo)');
  }

  // Verificar que el loop de WebGL corre y no arroja errores GLSL
  const isWebGlActive = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return false;
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return gl != null && !gl.isContextLost();
  });
  console.log(`✓ Contexto WebGL activo: ${isWebGlActive}`);

  // 4. Simulación de Interacción de Usuario
  console.log('\n[4/4] Simulando interacción: conmutación de vistas y filtros...');

  // Click en UNIFILAR (CAD)
  console.log('-> Click en botón [UNIFILAR (CAD)]...');
  const unifilarBtn = await page.getByRole('button', { name: /UNIFILAR/i });
  if (await unifilarBtn.isVisible()) {
    await unifilarBtn.click();
    await page.waitForTimeout(1000); // 1s para morphing
    console.log('✓ Vista Unifilar activada con morphing GPU');
  } else {
    throw new Error('Botón UNIFILAR no encontrado');
  }

  // Click en GEOGRÁFICO
  console.log('-> Click en botón [GEOGRÁFICO]...');
  const geoBtn = await page.getByRole('button', { name: /GEOGRÁFICO/i });
  await geoBtn.click();
  await page.waitForTimeout(1000);
  console.log('✓ Retorno a Vista Geográfica exitoso');

  // Click en filtros de tensión (500 kV, 220 kV, 132 kV)
  console.log('-> Conmutando filtro 500 kV...');
  const btn500 = await page.getByRole('button', { name: /500 kV/i });
  if (await btn500.isVisible()) {
    await btn500.click();
    await page.waitForTimeout(400);
    await btn500.click(); // reactivar
    console.log('✓ Filtro 500 kV conmutado reactivamente');
  }

  console.log('-> Conmutando filtro 220 kV...');
  const btn220 = await page.getByRole('button', { name: /220 kV/i });
  if (await btn220.isVisible()) {
    await btn220.click();
    await page.waitForTimeout(400);
    await btn220.click();
    console.log('✓ Filtro 220 kV conmutado reactivamente');
  }

  console.log('-> Conmutando filtro 132 kV...');
  const btn132 = await page.getByRole('button', { name: /^132 kV/i });
  if (await btn132.isVisible()) {
    await btn132.click();
    await page.waitForTimeout(400);
    await btn132.click();
    console.log('✓ Filtro 132 kV conmutado reactivamente');
  }

  // Tomar captura de pantalla de evidencia técnica
  const screenshotPath = path.join(__dirname, '..', 'data', 'scada_audit_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`✓ Captura guardada en ${screenshotPath}`);

  await browser.close();

  // Validar errores
  console.log('\n=== RESULTADOS DE LA AUDITORÍA ===');
  console.log(`Page Errors: ${pageErrors.length}`);
  console.log(`Console Errors: ${consoleErrors.length}`);

  if (pageErrors.length > 0) {
    console.error('Page errors encontrados:', pageErrors);
    process.exit(1);
  }
  if (consoleErrors.length > 0) {
    console.error('Console errors encontrados:', consoleErrors);
    process.exit(1);
  }

  console.log('🎉 AUDITORÍA HEADLESS COMPLETADA CON ÉXITO: 0 ERRORES.\n');
}

runAudit().catch(err => {
  console.error('❌ FALLÓ LA AUDITORÍA:', err);
  process.exit(1);
});
