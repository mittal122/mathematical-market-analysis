/* ===================== Black-Scholes-Merton core math (shared across all pages) ===================== */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function phi(x) {
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

function fmt(n, d = 4) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function spotRange(K, n = 61) {
  const lo = K * 0.6, hi = K * 1.4;
  const step = (hi - lo) / (n - 1);
  return Array.from({ length: n }, (_, i) => lo + i * step);
}

function heatColor(value, min, max) {
  const t = max > min ? (value - min) / (max - min) : 0.5;
  const stops = [
    [31, 43, 77],   // low - dark navy
    [63, 208, 201], // teal
    [244, 211, 94], // gold
    [255, 107, 107] // high - red
  ];
  const scaled = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.floor(scaled);
  const frac = scaled - i;
  const a = stops[Math.min(i, stops.length - 1)];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const rgb = a.map((c, idx) => Math.round(c + (b[idx] - c) * frac));
  return `rgb(${rgb.join(',')})`;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ===================== Shared state (persisted across pages) ===================== */

const BSM_DEFAULT_STATE = { type: 'call', S: 2000, K: 1900, T: 0.25, sigma: 0.25, r: 0.05, q: 0.02 };
const BSM_STATE_KEY = 'bsm-quant-desk-state';

function getBsmState() {
  try {
    const raw = localStorage.getItem(BSM_STATE_KEY);
    if (!raw) return { ...BSM_DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...BSM_DEFAULT_STATE, ...parsed };
  } catch (e) {
    return { ...BSM_DEFAULT_STATE };
  }
}

function setBsmState(state) {
  try {
    localStorage.setItem(BSM_STATE_KEY, JSON.stringify(state));
  } catch (e) { /* private browsing / storage disabled: state just won't persist */ }
}

/* ===================== App settings (API keys, defaults, monetization) ===================== */

const BSM_DEFAULT_SETTINGS = {
  twelveDataKey: '',
  defaultRiskFreeRate: 0.05,
  defaultDividendYield: 0,
  volatilityLookbackDays: 60,
  adsensePublisherId: ''
};
const BSM_SETTINGS_KEY = 'bsm-quant-desk-settings';

function getSettings() {
  try {
    const raw = localStorage.getItem(BSM_SETTINGS_KEY);
    if (!raw) return { ...BSM_DEFAULT_SETTINGS };
    return { ...BSM_DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...BSM_DEFAULT_SETTINGS };
  }
}

function setSettings(settings) {
  try {
    localStorage.setItem(BSM_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* private browsing / storage disabled */ }
}

/** Injects the Google AdSense Auto Ads loader if the user has configured a publisher ID
 *  on the Settings page. Ad placement itself is handled automatically by Google — this
 *  site never fabricates ad units or slot IDs. No-op until a real ID is set. */
function initAds() {
  const { adsensePublisherId } = getSettings();
  if (!adsensePublisherId || document.getElementById('adsense-loader')) return;
  const script = document.createElement('script');
  script.id = 'adsense-loader';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adsensePublisherId)}`;
  document.head.appendChild(script);
}

/* ===================== Chart.js shared defaults ===================== */

const CHART_COLORS = {
  accent: '#3fd0c9',
  accent2: '#7c93ff',
  warn: '#ff8a65',
  grid: 'rgba(255,255,255,0.06)',
  text: '#93a0c2'
};

function initChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = CHART_COLORS.text;
  Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
  Chart.defaults.borderColor = CHART_COLORS.grid;
}

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

function upsertLineChart(chartRef, canvasId, labels, label, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return chartRef;
  const ctx = canvas.getContext('2d');
  const dataset = {
    labels,
    datasets: [{ label, data, borderColor: color, backgroundColor: color + '22', fill: true, borderWidth: 2, pointRadius: 0, tension: .3 }]
  };
  if (chartRef) { chartRef.data = dataset; chartRef.update(); return chartRef; }
  return new Chart(ctx, { type: 'line', data: dataset, options: baseLineOptions(label) });
}

/* ===================== Nav active-state + mobile-friendly init ===================== */

function initNav(currentPage) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === currentPage);
  });
}
