const { execSync } = require('child_process');

const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

if (branch !== 'dev') {
  console.error(`Error: npm version must be run from the "dev" branch (current branch: "${branch}")`);
  process.exit(1);
}
