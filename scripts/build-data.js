import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateTopIdeas, formatExecutiveIdeas } = require('../../portfolio-analyst-engine.js');

async function main() {
  const outDir = path.resolve(process.cwd(), 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const result = await generateTopIdeas();

  const payload = {
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
  };

  fs.writeFileSync(path.join(outDir, 'data.json'), JSON.stringify(payload, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
