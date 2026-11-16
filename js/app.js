import { calculate, formatSek } from './calc.js';
import {
  fetchCvLive,
  buildSnapshot,
  analyzeOffer,
  loadGeminiKey,
  saveGeminiKey,
  loadBundledGeminiKey,
  getBundledGeminiKey,
} from './offer-ai.js';

const CAR_FIELDS = [
  { id: 'carLeasing', key: 'leasing', label: 'Leasing', min: 0, max: 12000, step: 100, value: 4500 },
  { id: 'carKmDay', key: 'kmPerDay', label: 'Km / día', min: 0, max: 400, step: 5, value: 60 },
  { id: 'carKmLiter', key: 'kmPerLiter', label: 'Km / litro', min: 5, max: 30, step: 0.5, value: 15 },
  { id: 'carDiesel', key: 'dieselPrice', label: 'Diésel SEK/l', min: 10, max: 30, step: 0.1, value: 18.5 },
  { id: 'carOther', key: 'other', label: 'Otros coche', min: 0, max: 8000, step: 50, value: 500 },
];

const FALLBACK_TAX = {
  meta: { year: 2026, updated: 'embedded', currency: 'SEK' },
  company: {
    bolagsskatt: 0.206,
    arbetsgivaravgift: 0.3142,
    sarskild_loneskatt_pension: 0.2426,
  },
  personal: {
    municipality: 'Göteborg',
    kommunalskatt: 0.326,
    begravningsavgift: 0.00292,
    kyrkoavgift: 0,
    statlig_inkomstskatt: 0.2,
    brytpunkt_annual: 660400,
    brytpunkt_monthly: 55033,
    skiktgrans: 643000,
    k10_dividend_tax: 0.2,
    public_service_rate: 0.01,
    public_service_max: 1299,
  },
  pension: {
    max_pct_of_salary: 0.35,
    prisbasbelopp: 59200,
    inkomstbasbelopp: 83400,
    deductible_cap_sek: 592000,
  },
  work: {
    hours_per_day: 8,
    vacation_days_default: 30,
    extra_days_default: 0,
  },
};

const EXPENSE_KEYS = [
  ['transport', 'Transporte'],
  ['lodging', 'Estadía'],
  ['education', 'Educación'],
  ['equipment', 'Hardware'],
  ['digital', 'Digital / AI'],
  ['telephony', 'Telefonía'],
  ['accounting', 'Contabilidad'],
  ['insurance', 'Seguros'],
  ['other', 'Otros / conferencias'],
];

/** Monthly SEK defaults (annual figures ÷ 12 where noted). */
const DEFAULT_EXPENSES = {
  // Västtrafik 365d zon A Göteborg ~7 500 kr/år (folkbokförd, subvencionado)
  transport: 625,
  // 25 000 kr/año
  lodging: 2083,
  // 25 000 kr/año
  education: 2083,
  // PC potente ~20 000 cada 2 años → ~10 000/año
  equipment: 833,
  // Cursor + Claude + etc. premium stack
  digital: 1200,
  telephony: 499,
  // Accountant once/year ~15 000 → monthly equivalent
  accounting: 1250,
  // Företagsförsäkring + ansvarsförsäkring (placeholder)
  insurance: 600,
  // Conferencias / viajes de trabajo ~10 000 kr/año
  other: 833,
};

const FALLBACK_RATES = {
  meta: { updated: 'embedded' },
  bands: [
    { id: 'lead_architect', label: 'Lead / architect', min: 1200, typical: 1350, max: 1600 },
    { id: 'ai_specialist', label: 'AI / MCP / Cloud specialist', min: 1100, typical: 1250, max: 1450 },
    { id: 'senior', label: 'Senior', min: 1000, typical: 1150, max: 1300 },
    { id: 'mid', label: 'Mid / generalist', min: 850, typical: 950, max: 1050 },
  ],
  scenarios: [
    {
      id: 'ai_premium_local',
      label: 'AI premium local',
      hourly: 1250,
      workload_pct: 90,
      gross_salary: 55033,
      pension_pct: 35,
      max_pension: true,
      max_salary: true,
      expenses: { ...DEFAULT_EXPENSES },
    },
    {
      id: 'goteborg_remote',
      label: 'Göteborg / remoto',
      hourly: 1150,
      workload_pct: 100,
      gross_salary: 55033,
      pension_pct: 35,
      max_pension: true,
      max_salary: true,
      expenses: { ...DEFAULT_EXPENSES },
    },
  ],
};

const state = {
  tax: FALLBACK_TAX,
  rates: FALLBACK_RATES,
  dataStatus: 'fallback',
  lastInput: null,
  lastResult: null,
};

function el(id) {
  return document.getElementById(id);
}

function readNumber(id, fallback = 0) {
  const v = parseFloat(el(id).value);
  return Number.isFinite(v) ? v : fallback;
}

function readExpenses() {
  const expenses = {};
  for (const [key] of EXPENSE_KEYS) {
    expenses[key] = readNumber(`exp_${key}`, 0);
  }
  return expenses;
}

function readCar() {
  const enabled = !!el('carDetailToggle')?.checked;
  const car = { enabled };
  for (const field of CAR_FIELDS) {
    car[field.key] = readNumber(field.id, field.value);
  }
  return car;
}

function gatherInput() {
  return {
    hourlyRate: readNumber('hourlyRate', 1000),
    workloadPct: readNumber('workload', 70),
    vacationDays: readNumber('vacationDays', 30),
    extraDays: readNumber('extraDays', 0),
    grossSalary: readNumber('grossSalary', 55000),
    pensionPct: readNumber('pensionRate', 35),
    maxPension: el('maxPension').checked,
    maxSalary: el('maxSalary').checked,
    expenses: readExpenses(),
    car: readCar(),
  };
}

function setVal(id, value) {
  const node = el(id);
  if (!node) return;
  node.value = value;
}

function applyScenario(scenario) {
  setVal('hourlyRate', scenario.hourly);
  setVal('workload', scenario.workload_pct);
  setVal('grossSalary', scenario.gross_salary);
  setVal('pensionRate', scenario.pension_pct);
  el('maxPension').checked = !!scenario.max_pension;
  el('maxSalary').checked = !!scenario.max_salary;

  const expenses = scenario.expenses || {};
  for (const [key] of EXPENSE_KEYS) {
    setVal(`exp_${key}`, expenses[key] ?? 0);
  }
  if (el('carDetailToggle')) {
    el('carDetailToggle').checked = false;
  }
  render();
}

function applyBand(band) {
  setVal('hourlyRate', band.typical);
  render();
}

function syncDependentControls() {
  const maxSalary = el('maxSalary').checked;
  const maxPension = el('maxPension').checked;
  el('grossSalary').disabled = maxSalary;
  el('pensionRate').disabled = maxPension;
  if (maxSalary) {
    const bp =
      state.tax.personal.brytpunkt_monthly ||
      Math.floor((state.tax.personal.brytpunkt_annual || 660400) / 12);
    setVal('grossSalary', bp);
  }
  if (maxPension) {
    setVal('pensionRate', Math.round(state.tax.pension.max_pct_of_salary * 100));
  }

  const carOn = !!el('carDetailToggle')?.checked;
  const panel = el('carDetailPanel');
  if (panel) panel.hidden = !carOn;
  const transportSlider = el('exp_transport');
  if (transportSlider) transportSlider.disabled = carOn;
}

function renderLabels(input, result) {
  const cap = result.capacity;
  el('hourlyRateVal').textContent = `${input.hourlyRate.toLocaleString('sv-SE')} SEK/h`;
  el('workloadVal').textContent = `${input.workloadPct}% (${Math.round(result.billedHours).toLocaleString('sv-SE')} h/año)`;
  el('maxHoursRef').textContent = `100% = ${cap.maxAnnualHours.toLocaleString('sv-SE')} h/año`;
  el('workCapacityHint').textContent =
    `${cap.weekdays.toLocaleString('sv-SE')} lun–vie (${cap.year}) − ${cap.redWeekdays} festivos − ${cap.vacationDays} vacaciones − ${cap.extraDays} libres extra = ${cap.workableDays.toLocaleString('sv-SE')} días × ${cap.hoursPerDay} h = ${cap.maxAnnualHours.toLocaleString('sv-SE')} h/año.`;
  el('vacationDaysVal').textContent = `${cap.vacationDays} días`;
  el('extraDaysVal').textContent = `${cap.extraDays} días`;
  el('redDaysVal').textContent = `${cap.redWeekdays} días`;
  el('redDaysHint').textContent =
    cap.redWeekdayNames?.length
      ? `Automático: ${cap.redWeekdayNames.join(', ')}.`
      : 'Automático según calendario sueco del año.';
  el('grossSalaryVal').textContent = `${result.grossMonthlySalary.toLocaleString('sv-SE')} SEK/mes`;
  el('pensionRateVal').textContent = `${Math.round(result.pensionPct * 100)}%`;

  for (const [key] of EXPENSE_KEYS) {
    const amount =
      key === 'transport' && result.car?.enabled
        ? Math.round(result.car.total)
        : Number(input.expenses?.[key]) || 0;
    const node = el(`exp_${key}Val`);
    if (node) {
      node.textContent = amount.toLocaleString('sv-SE');
    }
  }

  if (result.car?.enabled) {
    setVal('exp_transport', Math.min(25000, Math.round(result.car.total)));
    for (const field of CAR_FIELDS) {
      const node = el(`${field.id}Val`);
      if (!node) continue;
      const raw = readNumber(field.id, field.value);
      node.textContent =
        field.key === 'kmPerLiter' || field.key === 'dieselPrice'
          ? raw.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
          : Math.round(raw).toLocaleString('sv-SE');
    }
    const summary = el('carFuelSummary');
    if (summary) {
      summary.textContent =
        `combustible ~${Math.round(result.car.fuelCost).toLocaleString('sv-SE')} SEK/mes` +
        ` (${result.car.daysPerMonth.toFixed(1)} d × ${Math.round(result.car.monthlyKm).toLocaleString('sv-SE')} km)`;
    }
  }
}

function renderVerdict(verdict) {
  el('verdict').innerHTML = `<span class="tag">${verdict.title}</span>\n${verdict.text}`;
}

function renderTable(result) {
  const body = el('breakdownBody');
  body.innerHTML = '';
  for (const row of result.rows) {
    const tr = document.createElement('tr');
    if (row.kind === 'subtotal') tr.className = 'subtotal';
    if (row.kind === 'total') tr.className = 'total';
    const pct =
      result.annualRevenue > 0
        ? ((Math.abs(row.amount) / result.annualRevenue) * 100).toFixed(1) + '%'
        : '—';
    tr.innerHTML = `
      <td>${row.label}</td>
      <td class="num">${formatSek(row.amount)}</td>
      <td class="num">${row.key === 'revenue' ? '100%' : pct}</td>
    `;
    body.appendChild(tr);
  }
}

function render() {
  syncDependentControls();
  const input = gatherInput();
  const result = calculate(input, state.tax);
  state.lastInput = input;
  state.lastResult = result;
  renderLabels(input, result);
  renderVerdict(result.verdict);
  renderTable(result);
}

function setAiStatus(text) {
  const node = el('aiStatus');
  if (node) node.textContent = text || '';
}

async function onAnalyzeOffer() {
  const btn = el('btnAnalyzeOffer');
  const out = el('aiOutput');
  const apiKey = el('geminiKey').value.trim();
  const jobText = el('offerText').value;

  saveGeminiKey(apiKey);

  if (!state.lastResult || !state.lastInput) {
    setAiStatus('Espera a que el simulador termine de calcular.');
    return;
  }

  btn.disabled = true;
  out.textContent = '';
  setAiStatus('Cargando CV live desde zunigajp.com…');

  try {
    const cv = await fetchCvLive();
    setAiStatus(
      cv.source === 'live'
        ? 'CV live OK. Analizando con Gemini…'
        : `CV desde cache (live falló: ${cv.warning || 'red'}). Analizando…`
    );

    const snapshot = buildSnapshot(
      state.lastInput,
      state.lastResult,
      state.rates
    );
    const analysis = await analyzeOffer({
      apiKey,
      jobText,
      cvText: cv.text,
      snapshot,
      cvMeta: { source: cv.source, url: cv.url },
    });
    out.textContent = analysis;
    setAiStatus(`Listo · CV: ${cv.source} · ${cv.url}`);
  } catch (err) {
    out.textContent = '';
    setAiStatus(`Error: ${err.message || err}`);
  } finally {
    btn.disabled = false;
  }
}

function bindOfferAi() {
  const keyInput = el('geminiKey');

  if (keyInput) {
    const bundled = getBundledGeminiKey();
    if (bundled) {
      keyInput.value = bundled;
      keyInput.readOnly = true;
      keyInput.placeholder = 'key cargada desde deploy / config.local.js';
      const label = document.querySelector('label[for="geminiKey"]');
      if (label) {
        label.textContent = 'Gemini API key (desde Secret / config local)';
      }
    } else {
      keyInput.value = loadGeminiKey();
      keyInput.addEventListener('change', () => {
        saveGeminiKey(keyInput.value.trim());
      });
    }
  }
  el('btnAnalyzeOffer')?.addEventListener('click', onAnalyzeOffer);
}

function scenarioIncome(scenario) {
  return (Number(scenario.hourly) || 0) * ((Number(scenario.workload_pct) || 0) / 100);
}

function renderPresets() {
  const box = el('presets');
  box.innerHTML = '';
  const scenarios = [...(state.rates.scenarios || [])].sort(
    (a, b) => scenarioIncome(b) - scenarioIncome(a)
  );
  for (const scenario of scenarios) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `> ${scenario.label}`;
    btn.addEventListener('click', () => applyScenario(scenario));
    box.appendChild(btn);
  }
}

function renderBands() {
  const box = el('rateBands');
  box.innerHTML = '';
  const bands = [...(state.rates.bands || [])].sort(
    (a, b) => (Number(b.typical) || 0) - (Number(a.typical) || 0)
  );
  for (const band of bands) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = `> ${band.label}: ${band.min}–${band.max} (typ ${band.typical})`;
    btn.title = 'Aplicar typical rate';
    btn.addEventListener('click', () => applyBand(band));
    box.appendChild(btn);
  }
}

function buildCarDetailPanel() {
  const wrap = document.createElement('div');
  wrap.className = 'car-detail';

  const toggleRow = document.createElement('label');
  toggleRow.className = 'car-toggle';
  toggleRow.innerHTML =
    '<input type="checkbox" id="carDetailToggle" /> Automóvil (detalle)';
  wrap.appendChild(toggleRow);

  const panel = document.createElement('div');
  panel.id = 'carDetailPanel';
  panel.className = 'car-panel';
  panel.hidden = true;

  for (const field of CAR_FIELDS) {
    const row = document.createElement('div');
    row.className = 'expense-row car-row';

    const lab = document.createElement('label');
    lab.htmlFor = field.id;
    lab.textContent = field.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = field.id;
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = String(field.value);
    input.addEventListener('input', render);

    const val = document.createElement('span');
    val.id = `${field.id}Val`;
    val.className = 'expense-val';
    val.textContent = String(field.value);

    row.appendChild(lab);
    row.appendChild(input);
    row.appendChild(val);
    panel.appendChild(row);
  }

  const summary = document.createElement('p');
  summary.id = 'carFuelSummary';
  summary.className = 'field-hint';
  panel.appendChild(summary);

  wrap.appendChild(panel);
  return wrap;
}

function buildExpenseFields() {
  const grid = el('expenseGrid');
  grid.innerHTML = '';
  for (const [key, label] of EXPENSE_KEYS) {
    const row = document.createElement('div');
    row.className = 'expense-row';

    const lab = document.createElement('label');
    lab.htmlFor = `exp_${key}`;
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `exp_${key}`;
    input.min = '0';
    input.max = key === 'transport' ? '25000' : '15000';
    input.step = '100';
    input.value = '0';
    input.addEventListener('input', render);

    const val = document.createElement('span');
    val.id = `exp_${key}Val`;
    val.className = 'expense-val';
    val.textContent = '0';

    row.appendChild(lab);
    row.appendChild(input);
    row.appendChild(val);
    grid.appendChild(row);

    if (key === 'transport') {
      grid.appendChild(buildCarDetailPanel());
    }
  }
}

function bindControls() {
  const ids = [
    'hourlyRate',
    'workload',
    'vacationDays',
    'extraDays',
    'grossSalary',
    'pensionRate',
  ];
  for (const id of ids) {
    el(id).addEventListener('input', render);
  }
  el('maxPension').addEventListener('change', render);
  el('maxSalary').addEventListener('change', render);
}

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

function updateStatus() {
  const taxMeta = state.tax.meta || {};
  const ratesMeta = state.rates.meta || {};
  el('dataStatus').textContent = `datos: tax ${taxMeta.year || '?'} (${taxMeta.updated || '?'}) · rates (${ratesMeta.updated || '?'}) · ${state.dataStatus}`;
  el('yearLabel').textContent = String(taxMeta.year || 2026);
}

async function init() {
  buildExpenseFields();
  bindControls();
  await loadBundledGeminiKey();
  bindOfferAi();
  el('carDetailToggle')?.addEventListener('change', render);

  try {
    const [tax, rates] = await Promise.all([
      loadJson('./data/tax.json'),
      loadJson('./data/rates.json'),
    ]);
    state.tax = tax;
    state.rates = rates;
    state.dataStatus = 'live json';
  } catch (err) {
    console.warn('Using embedded fallbacks:', err);
    state.dataStatus = 'fallback (fetch failed — open via server / Pages)';
  }

  renderPresets();
  renderBands();
  updateStatus();

  // Standard default: 1000 SEK/h @ 70% + standard cost stack
  setVal('hourlyRate', 1000);
  setVal('workload', 70);
  for (const [key] of EXPENSE_KEYS) {
    setVal(`exp_${key}`, DEFAULT_EXPENSES[key] ?? 0);
  }
  render();
}

init();
