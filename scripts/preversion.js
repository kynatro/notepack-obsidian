const { execSync } = require('child_process');

// Check that the GitHub CLI is installed
try {
  execSync('gh --version', { stdio: 'ignore' });
} catch {
  console.error('Error: GitHub CLI (gh) is not installed. Install it from https://cli.github.com before running npm version.');
  process.exit(1);
}

// Check that the user is logged into the GitHub CLI
try {
  execSync('gh auth status', { stdio: 'ignore' });
} catch {
  console.error('Error: Not logged into GitHub CLI. Run "gh auth login" before running npm version.');
  process.exit(1);
}

// Check that the current branch is "dev"
const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

if (branch !== 'dev') {
  console.error(`Error: npm version must be run from the "dev" branch (current branch: "${branch}")`);
  process.exit(1);
}
