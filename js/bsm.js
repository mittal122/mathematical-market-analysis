/* ===================== Black-Scholes-Merton core math ===================== */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function phi(x) {
  // standard normal PDF
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

function normCDF(x) {
  // Abramowitz & Stegun polynomial approximation
  const a1 = 0.31938153, a2 = -0.356563782, a3 = 1.781477937, a4 = -1.821255978, a5 = 1.330274429;
  const absX = Math.abs(x);
  const k = 1 / (1 + 0.2316419 * absX);
  const poly = a1 * k + a2 * k ** 2 + a3 * k ** 3 + a4 * k ** 4 + a5 * k ** 5;
  const approx = 1 - phi(absX) * poly;
  return x >= 0 ? approx : 1 - approx;
}

function d1d2(S, K, T, sigma, r, q) {
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return { d1, d2 };
}

function bsmPrice(S, K, T, sigma, r, q, type) {
  const { d1, d2 } = d1d2(S, K, T, sigma, r, q);
  const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
  const discS = S * Math.exp(-q * T);
  const discK = K * Math.exp(-r * T);
  if (type === 'call') {
    return { price: discS * Nd1 - discK * Nd2, d1, d2, Nd1, Nd2 };
  }
  const NmD1 = normCDF(-d1), NmD2 = normCDF(-d2);
  return { price: discK * NmD2 - discS * NmD1, d1, d2, Nd1, Nd2 };
}

function bsmGreeks(S, K, T, sigma, r, q, type) {
  const { d1, d2 } = d1d2(S, K, T, sigma, r, q);
  const Nd1 = normCDF(d1), Nd2 = normCDF(d2);
  const pdf1 = phi(d1);
  const discS = S * Math.exp(-q * T);
  const discK = K * Math.exp(-r * T);

  let delta, rho, theta;
  if (type === 'call') {
    delta = Math.exp(-q * T) * Nd1;
    rho = K * T * discK * Nd2;
    theta = (-discS * pdf1 * sigma) / (2 * Math.sqrt(T))
            - r * discK * Nd2
            + q * discS * Nd1;
  } else {
    delta = Math.exp(-q * T) * (Nd1 - 1);
    rho = -K * T * Math.exp(-r * T) * normCDF(-d2);
    theta = (-discS * pdf1 * sigma) / (2 * Math.sqrt(T))
            + r * discK * normCDF(-d2)
            - q * discS * normCDF(-d1);
  }
  const gamma = (Math.exp(-q * T) * pdf1) / (S * sigma * Math.sqrt(T));
  const vega = discS * pdf1 * Math.sqrt(T);

  return {
    delta,
    gamma,
    vega: vega / 100,      // per 1% vol change
    theta: theta / 365,    // per calendar day
    rho: rho / 100         // per 1% rate change
  };
}

/* ===================== DOM wiring ===================== */

const $ = (id) => document.getElementById(id);

function readInputs() {
  return {
    type: $('opt-type').value,
    S: parseFloat($('S').value),
    K: parseFloat($('K').value),
    T: parseFloat($('T').value),
    sigma: parseFloat($('sigma').value),
    r: parseFloat($('r').value),
    q: parseFloat($('q').value),
  };
}

function fmt(n, d = 4) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

let payoffChart, deltaChart, gammaChart, vegaChart, thetaChart, smileChart;

const CHART_COLORS = {
  accent: '#3fd0c9',
  accent2: '#7c93ff',
  warn: '#ff8a65',
  grid: 'rgba(255,255,255,0.06)',
  text: '#93a0c2'
};

Chart.defaults.color = CHART_COLORS.text;
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
Chart.defaults.borderColor = CHART_COLORS.grid;

function baseLineOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: CHART_COLORS.grid }, ticks: { maxTicksLimit: 8 } },
      y: { grid: { color: CHART_COLORS.grid }, title: { display: !!yLabel, text: yLabel, color: CHART_COLORS.text } }
    }
  };
}

function recalculate() {
  const inp = readInputs();
  if (!inp.S || !inp.K || !inp.T || !inp.sigma) return;

  const { price, d1, d2, Nd1, Nd2 } = bsmPrice(inp.S, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type);
  const greeks = bsmGreeks(inp.S, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type);

  $('price-label').textContent = (inp.type === 'call' ? 'Call' : 'Put') + ' Price';
  $('price-out').textContent = fmt(price, 2);
  $('d1-out').textContent = fmt(d1);
  $('d2-out').textContent = fmt(d2);
  $('nd1-out').textContent = fmt(Nd1);
  $('nd2-out').textContent = fmt(Nd2);

  $('g-delta').textContent = fmt(greeks.delta, 4);
  $('g-gamma').textContent = fmt(greeks.gamma, 5);
  $('g-vega').textContent = fmt(greeks.vega, 4);
  $('g-theta').textContent = fmt(greeks.theta, 4);
  $('g-rho').textContent = fmt(greeks.rho, 4);

  updatePayoffChart(inp, price);
  updateSensitivityCharts(inp);
  updateSmileChart(inp);
  updateHeatmap(inp);
}

function spotRange(K, n = 61) {
  const lo = K * 0.6, hi = K * 1.4;
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

function updatePayoffChart(inp, currentPrice) {
  const spots = spotRange(inp.K, 81);
  const payoff = spots.map(s => inp.type === 'call' ? Math.max(s - inp.K, 0) : Math.max(inp.K - s, 0));
  const fairValue = spots.map(s => bsmPrice(s, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type).price);

  const ctx = $('payoffChart').getContext('2d');
  const data = {
    labels: spots.map(s => s.toFixed(0)),
    datasets: [
      { label: 'Intrinsic Value at Expiry', data: payoff, borderColor: CHART_COLORS.warn, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: 0 },
      { label: 'Current BSM Fair Value', data: fairValue, borderColor: CHART_COLORS.accent, backgroundColor: 'rgba(63,208,201,0.08)', fill: true, borderWidth: 2, pointRadius: 0, tension: .25 }
    ]
  };
  if (payoffChart) { payoffChart.data = data; payoffChart.update(); }
  else payoffChart = new Chart(ctx, { type: 'line', data, options: baseLineOptions('Option Value') });
}

function updateSensitivityCharts(inp) {
  const spots = spotRange(inp.K, 61);
  const labels = spots.map(s => s.toFixed(0));

  const deltas = spots.map(s => bsmGreeks(s, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type).delta);
  const gammas = spots.map(s => bsmGreeks(s, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type).gamma);
  const vegas = spots.map(s => bsmGreeks(s, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type).vega);
  const thetas = spots.map(s => bsmGreeks(s, inp.K, inp.T, inp.sigma, inp.r, inp.q, inp.type).theta);

  deltaChart = upsertChart(deltaChart, 'deltaChart', labels, 'Delta', deltas, CHART_COLORS.accent);
  gammaChart = upsertChart(gammaChart, 'gammaChart', labels, 'Gamma', gammas, CHART_COLORS.accent2);
  vegaChart = upsertChart(vegaChart, 'vegaChart', labels, 'Vega (per 1%)', vegas, CHART_COLORS.warn);
  thetaChart = upsertChart(thetaChart, 'thetaChart', labels, 'Theta (per day)', thetas, '#f4d35e');
}

function upsertChart(chartRef, canvasId, labels, label, data, color) {
  const ctx = $(canvasId).getContext('2d');
  const dataset = {
    labels,
    datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', fill: true, borderWidth: 2, pointRadius: 0, tension: .3 }]
  };
  if (chartRef) { chartRef.data = dataset; chartRef.update(); return chartRef; }
  return new Chart(ctx, { type: 'line', data: dataset, options: baseLineOptions(label) });
}

function updateSmileChart(inp) {
  const strikes = spotRange(inp.K, 25);
  const baseVol = inp.sigma;
  // Illustrative smile: convex uptick in IV away from ATM
  const ivs = strikes.map(k => {
    const moneyness = Math.log(k / inp.K);
    return baseVol + 0.6 * baseVol * moneyness * moneyness;
  });
  const flat = strikes.map(() => baseVol);

  const ctx = $('smileChart').getContext('2d');
  const data = {
    labels: strikes.map(k => k.toFixed(0)),
    datasets: [
      { label: 'Observed Implied Volatility (illustrative smile)', data: ivs.map(v => v * 100), borderColor: CHART_COLORS.warn, backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0, tension: .35 },
      { label: 'BSM Assumption: Flat σ', data: flat.map(v => v * 100), borderColor: CHART_COLORS.accent2, borderDash: [6, 4], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 0 }
    ]
  };
  if (smileChart) { smileChart.data = data; smileChart.update(); }
  else smileChart = new Chart(ctx, { type: 'line', data, options: baseLineOptions('Implied Volatility (%)') });
}

/* ===================== Delta / ITM / Gamma heat map ===================== */

function heatColor(value, min, max) {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  const stops = [
    [31, 43, 77],   // low - dark navy
    [63, 208, 201], // teal
    [244, 211, 94], // gold
    [255, 107, 107] // red - high
  ];
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const rgb = a.map((c, idx) => Math.round(c + (b[idx] - c) * frac));
  return `rgb(${rgb.join(',')})`;
}

function updateHeatmap(inp) {
  const metric = $('hm-metric').value;
  const strikePcts = [0.85, 0.90, 0.95, 1.00, 1.05, 1.10, 1.15]; // relative to spot
  const times = [0.02, 0.08, 0.17, 0.25, 0.5, 0.75, 1.0]; // years

  const values = [];
  let min = Infinity, max = -Infinity;

  times.forEach(T => {
    strikePcts.forEach(pct => {
      const K = inp.S * pct;
      let v;
      if (metric === 'delta') {
        v = bsmGreeks(inp.S, K, T, inp.sigma, inp.r, inp.q, inp.type).delta;
      } else if (metric === 'itm') {
        const { Nd2 } = bsmPrice(inp.S, K, T, inp.sigma, inp.r, inp.q, inp.type);
        v = inp.type === 'call' ? Nd2 : 1 - Nd2;
      } else {
        v = bsmGreeks(inp.S, K, T, inp.sigma, inp.r, inp.q, inp.type).gamma;
      }
      values.push(v);
      min = Math.min(min, v);
      max = Math.max(max, v);
    });
  });

  const grid = $('heatmap-grid');
  grid.style.gridTemplateColumns = `70px repeat(${strikePcts.length}, 1fr)`;
  grid.innerHTML = '';

  grid.appendChild(el('div', 'hm-col-label', 'T \\ K'));
  strikePcts.forEach(pct => grid.appendChild(el('div', 'hm-col-label', (pct * 100).toFixed(0) + '%')));

  let idx = 0;
  times.forEach(T => {
    grid.appendChild(el('div', 'hm-row-label', T < 1 ? (T * 12).toFixed(1) + 'm' : T.toFixed(2) + 'y'));
    strikePcts.forEach(() => {
      const v = values[idx++];
      const cell = el('div', 'hm-cell', metric === 'gamma' ? v.toFixed(4) : v.toFixed(2));
      cell.style.background = heatColor(v, min, max);
      cell.title = `${metric}: ${v.toFixed(4)}`;
      grid.appendChild(cell);
    });
  });
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ===================== Tabs ===================== */

function initTabs() {
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
      // charts inside newly-visible panels need a resize nudge
      [payoffChart, deltaChart, gammaChart, vegaChart, thetaChart, smileChart].forEach(c => c && c.resize());
    });
  });
}

/* ===================== Init ===================== */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  $('calc-btn').addEventListener('click', recalculate);
  ['opt-type', 'S', 'K', 'T', 'sigma', 'r', 'q'].forEach(id => {
    $(id).addEventListener('change', recalculate);
  });
  $('hm-metric').addEventListener('change', () => recalculate());
  recalculate();
});
