import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateTopIdeas, formatExecutiveIdeas } = require('./engine.cjs');

function buildPayload(result, error = null) {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      holdingsCovered: result.holdings,
      ideasCount: result.ideas.length,
      bullishCount: result.ideas.filter(x => x.stance === 'bullish').length,
      neutralCount: result.ideas.filter(x => x.stance === 'neutral').length,
      bearishCount: result.ideas.filter(x => x.stance === 'bearish').length,
    },
    ideas: result.ideas,
    summaryLines: formatExecutiveIdeas(result.ideas),
    buildStatus: error ? 'degraded' : 'ok',
    error,
  };
}

function demoResult() {
  return {
    holdings: 3,
    ideas: [
      {
        ticker: 'EUNLd_EQ', source: 'ETF trend model', headline: 'EUNLd_EQ trend signal: bullish', stance: 'bullish', signalType: 'analysis',
        entryPrice: 88.93, currentPrice: 112.98, entryDeltaPct: 27.0, priceTarget: null, score: 34.2,
        whyNow: 'Demo data: position remains well above entry; trend support still intact unless macro regime shifts.', url: null
      },
      {
        ticker: 'IS3Nd_EQ', source: 'ETF trend model', headline: 'IS3Nd_EQ trend signal: bullish', stance: 'bullish', signalType: 'analysis',
        entryPrice: 31.21, currentPrice: 42.31, entryDeltaPct: 35.6, priceTarget: null, score: 34.2,
        whyNow: 'Demo data: still well above entry; trend support remains.', url: null
      },
      {
        ticker: 'INTC_US_EQ', source: 'TradingView', headline: 'INTC_US_EQ technical summary: neutral', stance: 'neutral', signalType: 'technical',
        entryPrice: 26.33, currentPrice: 61.74, entryDeltaPct: 134.5, priceTarget: null, score: 20,
        whyNow: 'Demo data: TradingView technical gauge currently reads neutral.', url: 'https://www.tradingview.com/symbols/NASDAQ-INTC/technicals/'
      }
    ]
  };
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'public');
  fs.mkdirSync(outDir, { recursive: true });

  let payload;
  try {
    const result = await generateTopIdeas();
    payload = buildPayload(result, null);
  } catch (error) {
    payload = buildPayload(demoResult(), error.message);
  }

  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
