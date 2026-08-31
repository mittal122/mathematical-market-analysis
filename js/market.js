/* ===================== Live market data (Twelve Data) ===================== */

const TWELVE_DATA_BASE = 'https://api.twelvedata.com';

class MarketDataError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code; // 'no-key' | 'rate-limit' | 'not-found' | 'network' | 'api'
  }
}

function requireApiKey() {
  const s = getSettings();
  if (!s.twelveDataKey) {
    throw new MarketDataError('No Twelve Data API key set. Add one on the Settings page.', 'no-key');
  }
  return s.twelveDataKey;
}

async function td(path, params) {
  const key = requireApiKey();
  const url = new URL(TWELVE_DATA_BASE + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('apikey', key);

  let res;
  try {
    res = await fetch(url.toString());
  } catch (e) {
    throw new MarketDataError('Network request to Twelve Data failed. Check your connection.', 'network');
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new MarketDataError('Twelve Data returned an unreadable response.', 'network');
  }

  if (json.status === 'error' || json.code >= 400) {
    if (json.code === 429) throw new MarketDataError('Twelve Data rate limit reached. Wait a minute and try again.', 'rate-limit');
    if (json.code === 401 || json.code === 403) throw new MarketDataError('Twelve Data rejected the API key. Check it on the Settings page.', 'no-key');
    throw new MarketDataError(json.message || 'Twelve Data returned an error.', 'api');
  }
  return json;
}

/** Search for a symbol by company name or ticker. Returns [{symbol, instrument_name, exchange, country, currency}] */
async function searchSymbol(query) {
  if (!query || query.trim().length < 1) return [];
  const json = await td('/symbol_search', { symbol: query });
  return (json.data || []).slice(0, 8);
}

/** Live/delayed quote for a symbol. */
async function getQuote(symbol) {
  const json = await td('/quote', { symbol });
  if (!json.symbol) throw new MarketDataError(`No quote found for "${symbol}".`, 'not-found');
  return json;
}

/** Daily close history, oldest first. */
async function getDailyHistory(symbol, outputsize = 120) {
  const json = await td('/time_series', { symbol, interval: '1day', outputsize });
  if (!json.values) throw new MarketDataError(`No price history found for "${symbol}".`, 'not-found');
  return json.values
    .map(v => ({ date: v.datetime, close: parseFloat(v.close) }))
    .reverse(); // API returns newest-first; we want oldest-first
}

/** Annualized realized volatility from daily closes (log-return stdev * sqrt(252)). */
function historicalVolatility(closes, lookbackDays = 60) {
  const series = closes.slice(-Math.min(lookbackDays + 1, closes.length));
  const logReturns = [];
  for (let i = 1; i < series.length; i++) {
    logReturns.push(Math.log(series[i].close / series[i - 1].close));
  }
  if (logReturns.length < 2) return null;
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/** Round a spot price to a "clean" nearest strike, the way listed option chains are spaced. */
function nearestCleanStrike(price) {
  let step = 1;
  if (price >= 1000) step = 50;
  else if (price >= 200) step = 10;
  else if (price >= 50) step = 5;
  else if (price >= 25) step = 2.5;
  else if (price >= 5) step = 1;
  else step = 0.5;
  return Math.round(price / step) * step;
}
