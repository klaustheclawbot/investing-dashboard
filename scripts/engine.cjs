function normalizeHolding(raw) {
  return {
    ticker: raw.ticker,
    quantity: Number(raw.quantity || 0),
    entryPrice: Number(raw.averagePrice || raw.entryPrice || 0),
    currentPrice: Number(raw.currentPrice || 0),
    ppl: Number(raw.ppl || 0),
  };
}

function matchSignalsToHoldings(holdings, signals) {
  const holdingsByTicker = new Map(holdings.map(h => [h.ticker, h]));
  return signals
    .filter(signal => holdingsByTicker.has(signal.ticker))
    .map(signal => ({ signal, holding: holdingsByTicker.get(signal.ticker) }));
}

function computeIdeaScore({ holding, signal }) {
  let score = 0;
  if (signal.stance === 'bullish') score += 20;
  if (signal.stance === 'bearish') score += 8;
  if (signal.signalType === 'technical') score += 8;
  if (signal.signalType === 'company') score += 7;
  if (signal.signalType === 'analysis') score += 6;
  score += (signal.confidence || 0) * 10;
  score += (signal.freshness || 0) * 10;
  return score;
}

function rankTopIdeas(matches, limit = 3) {
  return matches.map(({ holding, signal }) => {
    const entryDeltaPct = holding.entryPrice > 0 ? ((holding.currentPrice - holding.entryPrice) / holding.entryPrice) * 100 : null;
    return {
      ticker: holding.ticker,
      source: signal.source,
      headline: signal.headline,
      stance: signal.stance,
      signalType: signal.signalType,
      entryPrice: holding.entryPrice,
      currentPrice: holding.currentPrice,
      entryDeltaPct,
      priceTarget: signal.priceTarget || null,
      score: computeIdeaScore({ holding, signal }),
      whyNow: signal.summary,
      url: signal.url || null,
    };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}

function extractTradingViewStates(html) {
  return [...html.matchAll(/container-[A-Za-z0-9_-]+ container-(strong-buy|buy|neutral|sell|strong-sell)-[A-Za-z0-9_-]+/g)].map(m => m[1]).slice(0, 3);
}

function parseTradingViewTechnicalText(text, { ticker, url }) {
  const states = extractTradingViewStates(text);
  const primary = states[0] || 'neutral';
  const stance = (primary === 'buy' || primary === 'strong-buy') ? 'bullish' : (primary === 'sell' || primary === 'strong-sell') ? 'bearish' : 'neutral';
  const confidence = (primary === 'strong-buy' || primary === 'strong-sell') ? 0.85 : (primary === 'buy' || primary === 'sell') ? 0.7 : 0.4;
  return {
    ticker,
    source: 'TradingView',
    sourceType: 'web',
    signalType: 'technical',
    stance,
    headline: `${ticker} technical summary: ${primary}`,
    summary: `TradingView technical gauge state: ${states.join(', ') || 'unavailable'}`,
    url,
    confidence,
    freshness: 0.8,
  };
}

function inferEtfSignal(holding) {
  const deltaPct = holding.entryPrice > 0 ? ((holding.currentPrice - holding.entryPrice) / holding.entryPrice) * 100 : 0;
  if (deltaPct >= 15) {
    return {
      ticker: holding.ticker,
      source: 'ETF trend model',
      signalType: 'analysis',
      stance: 'bullish',
      headline: `${holding.ticker} trend signal: bullish`,
      summary: 'Position remains well above entry; trend support still intact unless macro regime shifts.',
      confidence: 0.72,
      freshness: 0.7,
    };
  }
  return {
    ticker: holding.ticker,
    source: 'ETF trend model',
    signalType: 'analysis',
    stance: 'neutral',
    headline: `${holding.ticker} trend signal: neutral`,
    summary: 'Broad-market ETF signal inferred from positive trend vs entry price.',
    confidence: 0.55,
    freshness: 0.7,
  };
}

function inferCompanySignal(holding) {
  const deltaPct = holding.entryPrice > 0 ? ((holding.currentPrice - holding.entryPrice) / holding.entryPrice) * 100 : 0;
  if (deltaPct >= 25) {
    return {
      ticker: holding.ticker,
      source: 'Company catalyst model',
      signalType: 'company',
      stance: 'bullish',
      headline: `${holding.ticker} company signal: bullish`,
      summary: 'Name remains materially above entry; trend and catalyst follow-through matter more than fresh initiation.',
      confidence: 0.68,
      freshness: 0.7,
    };
  }
  return {
    ticker: holding.ticker,
    source: 'Company catalyst model',
    signalType: 'company',
    stance: 'neutral',
    headline: `${holding.ticker} company signal: neutral`,
    summary: 'No fresh verified company catalyst captured; maintain watch posture.',
    confidence: 0.58,
    freshness: 0.7,
  };
}

function mapTickerToTradingViewUrl(ticker) {
  const map = {
    'AMD_US_EQ': 'https://www.tradingview.com/symbols/NASDAQ-AMD/technicals/',
    'INTC_US_EQ': 'https://www.tradingview.com/symbols/NASDAQ-INTC/technicals/',
    'NVDA_US_EQ': 'https://www.tradingview.com/symbols/NASDAQ-NVDA/technicals/',
  };
  return map[ticker] || null;
}

function isEtfTicker(ticker) {
  return ['EUNLd_EQ', 'IS3Nd_EQ', 'EUNAd_EQ', 'SXR8d_EQ'].includes(ticker);
}

function isCompanyTicker(ticker) {
  return ['AMD_US_EQ', 'INTC_US_EQ', 'NVDA_US_EQ'].includes(ticker);
}

async function fetchTradingViewSignal(ticker) {
  const url = mapTickerToTradingViewUrl(ticker);
  if (!url) return null;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  if (!response.ok) return null;
  const html = await response.text();
  return parseTradingViewTechnicalText(html, { ticker, url });
}

async function fetchPortfolio() {
  const apiKey = process.env.T212_API_KEY;
  const apiSecret = process.env.T212_API_SECRET;
  const baseUrl = process.env.T212_BASE_URL || 'https://live.trading212.com/api/v0';
  if (!apiKey || !apiSecret) throw new Error('T212 credentials not found');
  const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
  const response = await fetch(baseUrl + '/equity/portfolio', {
    headers: {
      'Authorization': `Basic ${credentials}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
  });
  if (!response.ok) throw new Error(`T212 HTTP ${response.status}`);
  return await response.json();
}

async function generateTopIdeas() {
  const portfolio = await fetchPortfolio();
  const holdings = portfolio.map(normalizeHolding).sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl));
  const candidates = holdings.slice(0, 10);
  const signals = await Promise.all(candidates.map(async h => {
    const tv = await fetchTradingViewSignal(h.ticker).catch(() => null);
    if (tv) return tv;
    if (isEtfTicker(h.ticker)) return inferEtfSignal(h);
    if (isCompanyTicker(h.ticker)) return inferCompanySignal(h);
    return null;
  }));
  const matches = matchSignalsToHoldings(holdings, signals.filter(Boolean));
  const ideas = rankTopIdeas(matches, 3);
  return { holdings: holdings.length, ideas, generatedAt: new Date().toISOString() };
}

function formatExecutiveIdeas(ideas) {
  return ideas.map((idea, idx) => {
    const entry = idea.entryPrice != null ? idea.entryPrice.toFixed(2) : 'n/a';
    const current = idea.currentPrice != null ? idea.currentPrice.toFixed(2) : 'n/a';
    const delta = idea.entryDeltaPct != null ? `${idea.entryDeltaPct >= 0 ? '+' : ''}${idea.entryDeltaPct.toFixed(1)}%` : 'n/a';
    let action = 'Watch';
    if (idea.stance === 'bullish') action = 'Hold / add on strength';
    else if (idea.stance === 'bearish') action = 'Reduce / reassess';
    return `${idx + 1}. ${idea.ticker} — ${action} | entry ${entry} | current ${current} | vs entry ${delta}\n   ${idea.whyNow}`;
  });
}

module.exports = { generateTopIdeas, formatExecutiveIdeas };
