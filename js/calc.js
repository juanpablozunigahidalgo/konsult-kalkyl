/**
 * Swedish AB consultant profitability model (approx. fiscal rules).
 * Pure functions — no DOM.
 */

export function formatSek(num) {
  return `${Math.round(num).toLocaleString('sv-SE')} kr`;
}

export function formatPct(num, digits = 1) {
  return `${num.toFixed(digits)}%`;
}

/** Count Monday–Friday days in a calendar year. */
export function countWeekdays(year) {
  let count = 0;
  const d = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function ymd(year, monthIndex, day) {
  return new Date(year, monthIndex, day);
}

/** Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function isWeekday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Swedish red days / helgdagar (+ common aftnar treated as non-working).
 * Returns unique dates; caller filters weekdays.
 */
export function swedishRedDays(year) {
  const easter = easterSunday(year);
  const midsummerEve = (() => {
    // Friday between 19–25 June
    for (let day = 19; day <= 25; day += 1) {
      const d = ymd(year, 5, day);
      if (d.getDay() === 5) return d;
    }
    return ymd(year, 5, 19);
  })();
  const allSaints = (() => {
    // Saturday between 31 Oct – 6 Nov; the red weekday is often Friday before
    for (let day = 31; day <= 37; day += 1) {
      const d = ymd(year, 9, day); // Oct=9; day 32 → Nov 1, etc.
      if (d.getDay() === 6) return d;
    }
    return ymd(year, 10, 1);
  })();

  const list = [
    { name: 'Nyårsdagen', date: ymd(year, 0, 1) },
    { name: 'Trettondedag jul', date: ymd(year, 0, 6) },
    { name: 'Långfredagen', date: addDays(easter, -2) },
    { name: 'Annandag påsk', date: addDays(easter, 1) },
    { name: 'Första maj', date: ymd(year, 4, 1) },
    { name: 'Kristi himmelsfärdsdag', date: addDays(easter, 39) },
    { name: 'Nationaldagen', date: ymd(year, 5, 6) },
    { name: 'Midsommarafton', date: midsummerEve },
    { name: 'Midsommardagen', date: addDays(midsummerEve, 1) },
    { name: 'Alla helgons dag', date: allSaints },
    { name: 'Julafton', date: ymd(year, 11, 24) },
    { name: 'Juldagen', date: ymd(year, 11, 25) },
    { name: 'Annandag jul', date: ymd(year, 11, 26) },
    { name: 'Nyårsafton', date: ymd(year, 11, 31) },
  ];

  const seen = new Set();
  const unique = [];
  for (const item of list) {
    const key = dateKey(item.date);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

/** Röda dagar that fall on Monday–Friday (reduce workable days). */
export function swedishRedWeekdays(year) {
  return swedishRedDays(year).filter((item) => isWeekday(item.date));
}

/**
 * Workable capacity:
 * weekdays − röda dagar (lun–vie) − vacation − klämdagar, × hours/day.
 */
export function workCapacity(tax, input = {}) {
  const work = tax.work || {};
  const year = tax.meta?.year || new Date().getFullYear();
  const hoursPerDay = Number(work.hours_per_day) || 8;
  const vacationDays =
    input.vacationDays != null
      ? Number(input.vacationDays)
      : Number(work.vacation_days_default) || 30;
  const extraDays =
    input.extraDays != null
      ? Number(input.extraDays)
      : Number(work.extra_days_default) || 0;

  const weekdays = countWeekdays(year);
  const redWeekdayList = swedishRedWeekdays(year);
  const redWeekdays = redWeekdayList.length;
  const workableDays = Math.max(
    0,
    weekdays - redWeekdays - vacationDays - extraDays
  );
  const maxAnnualHours = workableDays * hoursPerDay;
  const workingWeeks = workableDays / 5;

  return {
    year,
    weekdays,
    redWeekdays,
    redWeekdayNames: redWeekdayList.map((r) => r.name),
    vacationDays,
    extraDays,
    hoursPerDay,
    workableDays,
    maxAnnualHours,
    workingWeeks,
  };
}

/**
 * Grundavdrag for persons under 66 (inkomstskattelagen-style brackets vs PBB).
 * Coefficients aligned to 2026 PBB scale used by Skatteverket tables.
 */
export function grundavdragUnder66(income, pbb) {
  const P = pbb;
  const X = Math.max(0, income);
  let ga;
  if (X <= 0.99 * P) {
    ga = 0.423 * P;
  } else if (X <= 2.72 * P) {
    ga = 0.423 * P - 0.2 * (X - 0.99 * P);
  } else if (X <= 3.11 * P) {
    ga = 0.077 * P;
  } else if (X <= 7.88 * P) {
    ga = 0.077 * P; // floor region before high-income taper in older rules
  } else {
    ga = Math.max(0.077 * P - 0.1 * (X - 7.88 * P), 0);
  }
  // Practical floor/ceiling seen in 2026 wage tables near consultant salaries
  ga = Math.min(Math.max(ga, 0.293 * P), 0.77 * P);
  return Math.round(ga);
}

/**
 * Jobbskatteavdrag (earned income credit) under 66 — closed-form approx.
 * Uses kommunalskatt only (credit is based on municipal tax rate).
 */
export function jobbskatteavdragUnder66(workIncome, municipalRate, pbb) {
  const AI = Math.max(0, workIncome);
  const KI = municipalRate;
  const P = pbb;

  let credit;
  if (AI <= 0.91 * P) {
    credit = (AI - 0.01 * P) * KI;
  } else if (AI <= 3.24 * P) {
    credit = (0.91 * P - 0.01 * P) * KI + (AI - 0.91 * P) * 0.332 * KI;
  } else if (AI <= 8.08 * P) {
    credit =
      (0.91 * P - 0.01 * P) * KI +
      (3.24 * P - 0.91 * P) * 0.332 * KI +
      (AI - 3.24 * P) * 0.111 * KI;
  } else {
    credit =
      (0.91 * P - 0.01 * P) * KI +
      (3.24 * P - 0.91 * P) * 0.332 * KI +
      (8.08 * P - 3.24 * P) * 0.111 * KI;
  }
  return Math.max(0, Math.round(credit));
}

/**
 * Personal income tax for Göteborg (no church), under 66.
 * Returns breakdown + total annual tax.
 */
export function personalIncomeTax(annualGross, tax) {
  const p = tax.personal;
  const pbb = tax.pension.prisbasbelopp;
  const municipalRate =
    (p.kommunalskatt || 0.326) +
    (p.begravningsavgift || 0) +
    (p.kyrkoavgift || 0);

  const ga = grundavdragUnder66(annualGross, pbb);
  const taxable = Math.max(0, annualGross - ga);
  const municipalTax = taxable * municipalRate;
  const stateTax =
    Math.max(0, taxable - (p.skiktgrans || 643000)) *
    (p.statlig_inkomstskatt || 0.2);
  const jsa = jobbskatteavdragUnder66(annualGross, p.kommunalskatt || 0.326, pbb);
  const publicService = Math.min(
    p.public_service_max || 1299,
    taxable * (p.public_service_rate || 0.01)
  );

  const total = Math.max(0, municipalTax + stateTax + publicService - jsa);
  return {
    grundavdrag: ga,
    taxable,
    municipalTax,
    stateTax,
    jobbskatteavdrag: jsa,
    publicService,
    total,
  };
}

/**
 * Monthly car transport cost from leasing + fuel + other.
 * Fuel uses workable days scaled by workload (days driven / month).
 */
export function carTransportMonthly(car, capacity, workloadPct) {
  if (!car?.enabled) {
    return {
      enabled: false,
      daysPerMonth: 0,
      fuelLiters: 0,
      fuelCost: 0,
      leasing: 0,
      other: 0,
      total: 0,
    };
  }

  const leasing = Number(car.leasing) || 0;
  const kmPerDay = Number(car.kmPerDay) || 0;
  const kmPerLiter = Math.max(Number(car.kmPerLiter) || 0, 0.1);
  const dieselPrice = Number(car.dieselPrice) || 0;
  const other = Number(car.other) || 0;

  const daysPerMonth =
    ((capacity.workableDays || 0) * ((Number(workloadPct) || 0) / 100)) / 12;
  const monthlyKm = kmPerDay * daysPerMonth;
  const fuelLiters = monthlyKm / kmPerLiter;
  const fuelCost = fuelLiters * dieselPrice;
  const total = leasing + fuelCost + other;

  return {
    enabled: true,
    daysPerMonth,
    monthlyKm,
    fuelLiters,
    fuelCost,
    leasing,
    other,
    total,
  };
}

/**
 * @param {object} input
 * @param {object} tax  — contents of data/tax.json
 */
export function calculate(input, tax) {
  const company = tax.company;
  const personal = tax.personal;
  const pensionRules = tax.pension;
  const capacity = workCapacity(tax, input);

  const hourlyRate = Number(input.hourlyRate) || 0;
  const workloadPct = Number(input.workloadPct) || 0;

  // Monthly cost buckets (SEK)
  const expenses = { ...(input.expenses || {}) };
  const car = carTransportMonthly(input.car, capacity, workloadPct);
  if (car.enabled) {
    expenses.transport = Math.round(car.total);
  }

  const monthlyCosts =
    (Number(expenses.transport) || 0) +
    (Number(expenses.lodging) || 0) +
    (Number(expenses.education) || 0) +
    (Number(expenses.equipment) || 0) +
    (Number(expenses.digital) || 0) +
    (Number(expenses.telephony) || 0) +
    (Number(expenses.accounting) || 0) +
    (Number(expenses.insurance) || 0) +
    (Number(expenses.other) || 0);

  const brytpunktMonthly =
    personal.brytpunkt_monthly ||
    Math.floor((personal.brytpunkt_annual || 660400) / 12);

  let grossMonthlySalary = Number(input.grossSalary) || 0;
  let pensionPct = (Number(input.pensionPct) || 0) / 100;

  if (input.maxSalary) {
    grossMonthlySalary = brytpunktMonthly;
  }
  if (input.maxPension) {
    pensionPct = pensionRules.max_pct_of_salary;
  }

  const billedHours = capacity.maxAnnualHours * (workloadPct / 100);
  const annualRevenue = billedHours * hourlyRate;

  const annualOverhead = monthlyCosts * 12;
  const totalOperatingExpenses = annualOverhead;

  const annualGrossSalary = grossMonthlySalary * 12;
  const annualArbetsgivaravgift =
    annualGrossSalary * company.arbetsgivaravgift;
  const totalSalaryCost = annualGrossSalary + annualArbetsgivaravgift;

  const rawPension = annualGrossSalary * pensionPct;
  const annualPension = Math.min(rawPension, pensionRules.deductible_cap_sek);
  const annualLoneskatt =
    annualPension * company.sarskild_loneskatt_pension;
  const totalPensionCost = annualPension + annualLoneskatt;

  const ebit =
    annualRevenue -
    totalOperatingExpenses -
    totalSalaryCost -
    totalPensionCost;
  const corporateTax = ebit > 0 ? ebit * company.bolagsskatt : 0;
  const netProfitAB = ebit - corporateTax;

  const incomeTax = personalIncomeTax(annualGrossSalary, tax);
  const annualIncomeTax = incomeTax.total;
  const netAnnualSalary = annualGrossSalary - annualIncomeTax;
  const netDividend =
    netProfitAB > 0
      ? netProfitAB * (1 - personal.k10_dividend_tax)
      : 0;
  const totalPersonalWealth =
    netAnnualSalary + netDividend + annualPension;

  const rows = [
    {
      key: 'revenue',
      label: 'Ingresos facturados (Omsättning)',
      amount: annualRevenue,
      kind: 'income',
    },
    {
      key: 'overhead',
      label: 'Costes operativos (transporte, estadía, AB, etc.)',
      amount: -annualOverhead,
      kind: 'expense',
    },
    {
      key: 'salary',
      label: `Salario bruto (${grossMonthlySalary.toLocaleString('sv-SE')} kr/mes)`,
      amount: -annualGrossSalary,
      kind: 'salary',
    },
    {
      key: 'avgift',
      label: `Arbetsgivaravgifter (${formatPct(company.arbetsgivaravgift * 100, 2)})`,
      amount: -annualArbetsgivaravgift,
      kind: 'salary',
    },
    {
      key: 'pension',
      label: `Tjänstepension (${Math.round(pensionPct * 100)}%)`,
      amount: -annualPension,
      kind: 'pension',
    },
    {
      key: 'loneskatt',
      label: `Särskild löneskatt (${formatPct(company.sarskild_loneskatt_pension * 100, 2)})`,
      amount: -annualLoneskatt,
      kind: 'pension',
    },
    {
      key: 'ebit',
      label: 'Resultado antes de impuestos (EBIT)',
      amount: ebit,
      kind: 'subtotal',
    },
    {
      key: 'bolagsskatt',
      label: `Bolagsskatt (${formatPct(company.bolagsskatt * 100, 1)})`,
      amount: -corporateTax,
      kind: 'tax',
    },
    {
      key: 'profit',
      label: 'Profit neto AB (disponible utdelning)',
      amount: netProfitAB,
      kind: 'total',
    },
  ];

  const outflowBase = Math.max(
    annualRevenue,
    totalOperatingExpenses + totalSalaryCost + totalPensionCost + corporateTax
  );

  const segments = [
    {
      id: 'expenses',
      label: 'Viajes + gastos',
      amount: totalOperatingExpenses,
      pct: (totalOperatingExpenses / outflowBase) * 100,
    },
    {
      id: 'salary',
      label: 'Salario + avgifter',
      amount: totalSalaryCost,
      pct: (totalSalaryCost / outflowBase) * 100,
    },
    {
      id: 'pension',
      label: 'Pensión + löneskatt',
      amount: totalPensionCost,
      pct: (totalPensionCost / outflowBase) * 100,
    },
    {
      id: 'corpTax',
      label: 'Bolagsskatt',
      amount: corporateTax,
      pct: (corporateTax / outflowBase) * 100,
    },
    {
      id: 'profit',
      label: 'Profit AB',
      amount: Math.max(netProfitAB, 0),
      pct: netProfitAB > 0 ? (netProfitAB / outflowBase) * 100 : 0,
    },
  ];

  const hoursLabel = Math.round(billedHours).toLocaleString('sv-SE');
  let conclusion;
  if (ebit < 0) {
    conclusion = `Conclusión: el AB entra en pérdidas (${formatSek(ebit)}); no alcanza para el salario planteado más pensión, y no hay margen para utdelning K10.`;
  } else if (netProfitAB < 150000) {
    conclusion = `Conclusión: cubres salario y pensión, pero el margen es estrecho — solo ${formatSek(netProfitAB)} netos en el AB para dividendos o colchón entre proyectos.`;
  } else {
    conclusion = `Conclusión: escenario sólido — cubres brytpunkt y pensión, y el AB retiene ${formatSek(netProfitAB)} disponibles para utdelning K10 al 20%.`;
  }

  const verdict = {
    level: ebit < 0 ? 'alert' : netProfitAB < 150000 ? 'warn' : 'ok',
    title: 'Resumen Ejecutivo',
    text: `Con ${hourlyRate.toLocaleString('sv-SE')} SEK/h al ${workloadPct}% (${hoursLabel} h/año) facturas ${formatSek(annualRevenue)}. Tras gastos operativos (${formatSek(totalOperatingExpenses)}), salario neto en mano ${formatSek(netAnnualSalary)}, tjänstepension ${formatSek(annualPension)} y dividendo neto ${formatSek(netDividend)}, tu patrimonio combinado llega a ${formatSek(totalPersonalWealth)}. ${conclusion}`,
  };

  return {
    capacity,
    car,
    expenses,
    billedHours,
    annualRevenue,
    annualOverhead,
    totalOperatingExpenses,
    annualGrossSalary,
    annualArbetsgivaravgift,
    totalSalaryCost,
    pensionPct,
    annualPension,
    annualLoneskatt,
    totalPensionCost,
    ebit,
    corporateTax,
    netProfitAB,
    annualIncomeTax,
    personalTax: incomeTax,
    netAnnualSalary,
    netDividend,
    totalPersonalWealth,
    grossMonthlySalary,
    brytpunktMonthly,
    rows,
    segments,
    verdict,
  };
}
