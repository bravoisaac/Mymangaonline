import assert from 'node:assert/strict';

const webBaseUrl = (process.env.SMOKE_WEB_URL || 'http://localhost:8081').replace(/\/$/, '');
const apiBaseUrl = (process.env.SMOKE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function main() {
  const readerResponse = await fetchWithTimeout(`${webBaseUrl}/reader`);
  const readerHtml = await readerResponse.text();

  assert.equal(readerResponse.status, 200, 'La ruta web /reader no responde 200');
  assert.match(readerHtml, /<html[^>]+lang=["']es["']/i, 'El documento web no declara lang="es"');
  assert.match(readerHtml, /<title[^>]*>Explorar manga \| MyMangaOnline<\/title>/i, 'Falta el titulo SEO de /reader');
  assert.match(readerHtml, /name=["']description["']/i, 'Falta la descripcion SEO de /reader');

  const healthResponse = await fetchWithTimeout(`${apiBaseUrl}/health`, {
    headers: { Origin: new URL(webBaseUrl).origin },
  });
  const healthPayload = await healthResponse.json();

  assert.equal(healthResponse.status, 200, 'El healthcheck de la API no responde 200');
  assert.equal(healthPayload.ok, true, 'El healthcheck de la API no esta listo');
  assert.equal(
    healthResponse.headers.get('access-control-allow-origin'),
    new URL(webBaseUrl).origin,
    'CORS no permite el origen web configurado',
  );
  assert.equal(healthResponse.headers.get('x-powered-by'), null, 'Express expone X-Powered-By');
  assert.equal(healthResponse.headers.get('x-content-type-options'), 'nosniff');

  const searchStartedAt = performance.now();
  const searchResponse = await fetchWithTimeout(
    `${apiBaseUrl}/manga/search/all?q=${encodeURIComponent('bleach')}&lang=es`,
  );
  const searchDurationMs = Math.round(performance.now() - searchStartedAt);
  const searchPayload = await searchResponse.json();
  const searchItems = (searchPayload.results || []).flatMap((result) => result.items || []);

  assert.equal(searchResponse.status, 200, 'La busqueda agregada no responde 200');
  assert.ok(searchItems.length > 0, 'La busqueda agregada no devolvio resultados');
  assert.ok(searchDurationMs < 12_000, `La busqueda tardo ${searchDurationMs}ms`);

  console.log(JSON.stringify({
    ok: true,
    reader: '/reader',
    searchDurationMs,
    searchItems: searchItems.length,
    sourceErrors: searchPayload.errors?.length || 0,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
