import assert from 'node:assert/strict';

const webBaseUrl = (process.env.SMOKE_WEB_URL || 'http://localhost:8081').replace(/\/$/, '');
const apiBaseUrl = (process.env.SMOKE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const requireProductionHeaders = process.env.SMOKE_REQUIRE_PRODUCTION_HEADERS === 'true';

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

  if (requireProductionHeaders) {
    const contentSecurityPolicy = readerResponse.headers.get('content-security-policy') || '';

    assert.match(contentSecurityPolicy, /default-src 'self'/, 'El frontend de produccion no entrega CSP');
    assert.match(contentSecurityPolicy, /object-src 'none'/, 'La CSP no bloquea objetos embebidos');
    assert.equal(readerResponse.headers.get('x-content-type-options'), 'nosniff');
  }

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
  assert.ok(Number(searchResponse.headers.get('ratelimit-limit')) > 0, 'La API no anuncia su limite de solicitudes');

  const imageCandidate = searchItems.find(
    (item) => ['mangadex', 'comick'].includes(item.source) && /^https:\/\//.test(item.cover || ''),
  );

  assert.ok(imageCandidate, 'La busqueda no devolvio una portada HTTPS para probar el proxy');

  const imageResponse = await fetchWithTimeout(
    `${apiBaseUrl}/proxy/image?url=${encodeURIComponent(imageCandidate.cover)}`,
    { headers: { Origin: new URL(webBaseUrl).origin, Accept: 'image/*' } },
  );
  const imageBytes = await imageResponse.arrayBuffer();

  assert.equal(imageResponse.status, 200, 'El proxy de portadas no responde 200');
  assert.match(imageResponse.headers.get('content-type') || '', /^image\//, 'El proxy devolvio un recurso que no es imagen');
  assert.ok(imageBytes.byteLength > 1024, 'El proxy devolvio una portada vacia o demasiado pequena');

  console.log(JSON.stringify({
    ok: true,
    reader: '/reader',
    searchDurationMs,
    searchItems: searchItems.length,
    sourceErrors: searchPayload.errors?.length || 0,
    imageSource: imageCandidate.source,
    imageBytes: imageBytes.byteLength,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
