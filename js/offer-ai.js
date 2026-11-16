/**
 * Live CV fetch (zunigajp via Jina Reader) + Gemini Flash offer analysis.
 */

const CV_SOURCE_URL = 'https://zunigajp.com/english/cv/';
const JINA_CV_URL = `https://r.jina.ai/${CV_SOURCE_URL}`;
const CV_CACHE_KEY = 'cc_cv_live_v1';
const CV_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const GEMINI_KEY_STORAGE = 'cc_gemini_api_key';
const CV_MAX_CHARS = 14000;
// Same stable aliases as zunigajp chat-worker (wrangler GEMINI_MODELS)
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];
const ANALYZE_MAX_ATTEMPTS = 4;
const ANALYZE_BACKOFF_MS = [2000, 5000, 10000, 15000];
const GEMINI_TIMEOUT_MS = 60000;

const SYSTEM_PROMPT = `Eres un advisor estratégico para un consultor independiente con AB en Suecia (Göteborg).
Piensa fuera de la caja y a la vez como calculadora financiera y negociador de mercado.
Responde SOLO en español (aunque la oferta esté en inglés u otro idioma: entiéndela igual).
Usa el CV live, la oferta pegada, el snapshot del simulador y las bandas de mercado.
Sé directo, concreto y accionable. No inventes experiencia que no esté en el CV.
No des asesoría jurídica/fiscal vinculante; razona con los números dados.

Formato de salida EXACTO (sin markdown extra):
VEREDICTO: FUERTE | ACEPTABLE | DEBIL | RECHAZAR
FIT CV-OFERTA: ...
PRECIO vs MERCADO: ...
ECONOMIA AB: ...
RECOMENDACION: ...
CONTRAOFERTA: ... SEK/h @ ...%
ANGULO CREATIVO: ...`;

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[…CV truncado…]`;
}

function readCvCache() {
  try {
    const raw = localStorage.getItem(CV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.text || !parsed?.fetchedAt) return null;
    if (Date.now() - parsed.fetchedAt > CV_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCvCache(text, source) {
  try {
    localStorage.setItem(
      CV_CACHE_KEY,
      JSON.stringify({ text, source, fetchedAt: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

/**
 * Fetch live CV markdown via Jina Reader; fall back to localStorage cache.
 */
export async function fetchCvLive() {
  const cached = readCvCache();
  try {
    const res = await fetch(JINA_CV_URL, {
      headers: { Accept: 'text/plain' },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Jina ${res.status}`);
    const text = truncate((await res.text()).trim(), CV_MAX_CHARS);
    if (text.length < 200) throw new Error('CV vacío o demasiado corto');
    writeCvCache(text, JINA_CV_URL);
    return { text, source: 'live', url: CV_SOURCE_URL };
  } catch (err) {
    if (cached?.text) {
      return {
        text: truncate(cached.text, CV_MAX_CHARS),
        source: 'cache',
        url: CV_SOURCE_URL,
        warning: String(err.message || err),
      };
    }
    throw new Error(
      `No se pudo leer el CV live (${err.message || err}). Sin cache disponible.`
    );
  }
}

/** Key from deploy/local config.local.js (never committed). */
let bundledGeminiKey = '';

export async function loadBundledGeminiKey() {
  try {
    const mod = await import('./config.local.js');
    bundledGeminiKey = (mod.GEMINI_API_KEY || '').trim();
  } catch {
    bundledGeminiKey = '';
  }
  return bundledGeminiKey;
}

export function getBundledGeminiKey() {
  return bundledGeminiKey;
}

export function loadGeminiKey() {
  if (bundledGeminiKey) return bundledGeminiKey;
  try {
    return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function saveGeminiKey(key) {
  // Si la key viene del deploy, no hace falta guardar otra en localStorage
  if (bundledGeminiKey) return;
  try {
    if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key);
    else localStorage.removeItem(GEMINI_KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function buildSnapshot(input, result, rates) {
  const expenses = result.expenses || input.expenses || {};
  const monthlyCosts = Object.values(expenses).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );
  const bands = (rates?.bands || []).map((b) => ({
    label: b.label,
    min: b.min,
    typical: b.typical,
    max: b.max,
  }));

  return {
    hourlyRate: input.hourlyRate,
    workloadPct: input.workloadPct,
    billedHours: Math.round(result.billedHours),
    maxAnnualHours: result.capacity?.maxAnnualHours,
    annualRevenue: Math.round(result.annualRevenue),
    monthlyCosts: Math.round(monthlyCosts),
    annualOperatingExpenses: Math.round(result.totalOperatingExpenses),
    grossMonthlySalary: result.grossMonthlySalary,
    pensionPct: Math.round((result.pensionPct || 0) * 100),
    annualPension: Math.round(result.annualPension),
    ebit: Math.round(result.ebit),
    netProfitAB: Math.round(result.netProfitAB),
    netAnnualSalary: Math.round(result.netAnnualSalary),
    netDividend: Math.round(result.netDividend),
    totalPersonalWealth: Math.round(result.totalPersonalWealth),
    verdict: result.verdict,
    marketBands: bands,
  };
}

export function buildPrompt({ cvText, jobText, snapshot, cvMeta }) {
  const user = [
    '## CV (live desde zunigajp.com/english/cv/)',
    `Fuente: ${cvMeta?.url || CV_SOURCE_URL} (${cvMeta?.source || 'unknown'})`,
    cvText,
    '',
    '## Oferta / job description (puede estar en inglés u otro idioma)',
    jobText.trim(),
    '',
    '## Snapshot del simulador financiero AB (SEK)',
    JSON.stringify(snapshot, null, 2),
    '',
    'Analiza fit, precio (timpris) vs mercado, economía del AB con estos números, y recomienda aceptar / negociar / rechazar con contraoferta concreta.',
  ].join('\n');

  return { system: SYSTEM_PROMPT, user };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableGeminiError(status, message) {
  const msg = String(message || '');
  if (status === 429 || status === 503 || status === 500) return true;
  return /high demand|try again later|unavailable|resource.?exhausted|overloaded|quota/i.test(
    msg
  );
}

async function callGeminiOnce({ apiKey, model, system, user }) {
  // Match zunigajp chat-worker: header auth + system_instruction + generateContent
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim(),
      },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || `Gemini error HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.retryable = isRetryableGeminiError(res.status, msg);
      throw err;
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ||
      '';
    if (!text.trim()) {
      const err = new Error('Gemini devolvió respuesta vacía.');
      err.retryable = true;
      throw err;
    }
    return text.trim();
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(
        `Gemini tardó demasiado (>${Math.round(GEMINI_TIMEOUT_MS / 1000)}s). Reintentando…`
      );
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Call Gemini with long patience: retries + backoff + model fallback.
 * onStatus(msg) optional UI callback.
 */
export async function analyzeOffer({
  apiKey,
  jobText,
  cvText,
  snapshot,
  cvMeta,
  onStatus,
}) {
  if (!apiKey?.trim()) {
    throw new Error('Falta API key de Gemini (gratis en Google AI Studio).');
  }
  if (!jobText?.trim()) {
    throw new Error('Pega la oferta / job description en el textarea.');
  }
  if (!cvText?.trim()) {
    throw new Error('No hay CV disponible para el análisis.');
  }

  const { system, user } = buildPrompt({ cvText, jobText, snapshot, cvMeta });
  let lastError = null;
  let modelIndex = 0;

  for (let attempt = 0; attempt < ANALYZE_MAX_ATTEMPTS; attempt += 1) {
    const model = GEMINI_MODELS[modelIndex] || GEMINI_MODELS[0];
    const waitMs = ANALYZE_BACKOFF_MS[attempt] || 15000;

    if (attempt === 0) {
      onStatus?.(`Pensando con ${model}…`);
    } else {
      onStatus?.(
        `Esperando ${Math.round(waitMs / 1000)}s… reintento ${attempt + 1}/${ANALYZE_MAX_ATTEMPTS} (${model})`
      );
      await sleep(waitMs);
      onStatus?.(`Reintento ${attempt + 1}/${ANALYZE_MAX_ATTEMPTS}…`);
    }

    try {
      return await callGeminiOnce({ apiKey, model, system, user });
    } catch (err) {
      lastError = err;
      const msg = String(err.message || '');
      // Retired / unknown model → advance alias list (same as chat-worker)
      if (/no longer available|not found|is not found|not supported/i.test(msg)) {
        modelIndex = Math.min(modelIndex + 1, GEMINI_MODELS.length - 1);
        continue;
      }
      if (!err.retryable) throw err;
      // On overload, also rotate model on next try
      if (modelIndex < GEMINI_MODELS.length - 1) modelIndex += 1;
    }
  }

  throw lastError || new Error('Gemini no respondió tras varios intentos.');
}
