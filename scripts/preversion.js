const { execSync } = require('child_process');

// Check that the current branch is "dev"
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

if (branch !== 'dev') {
  console.error(`Error: npm version must be run from the "dev" branch (current branch: "${branch}")`);
  process.exit(1);
}

// Check that local dev is in sync with origin/dev
execSync('git fetch origin dev', { stdio: 'ignore' });
const diff = execSync('git diff dev origin/dev').toString().trim();

if (diff) {
  console.error('Error: Local "dev" branch differs from "origin/dev". Pull or push changes before running npm version.');
  process.exit(1);
}
