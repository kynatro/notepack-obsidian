const { execSync } = require('child_process');
const readline = require('readline');

const { version: RELEASE_VERSION } = require('../package.json');

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

function cleanupTag() {
  execSync(`git tag -d v${RELEASE_VERSION}`);
  console.log(`Deleted local tag v${RELEASE_VERSION}`);
}

function rollback() {
  cleanupTag();

  execSync(`git reset --hard origin/dev`);
  console.log(`Reset dev to origin/dev`);
}

async function run() {
  const confirmed = await confirm(`Merge dev@${RELEASE_VERSION} to main and push to origin? (y/N) `);

  if (!confirmed) {
    console.log('Push cancelled, cleaning up...');
    rollback();
    return;
  }

  execSync(`get fetch origin main`);
  execSync(`git checkout main`);
  execSync(`get reset --hard origin/main`);
  execSync(`git merge dev`);
  // execSync(`git push -u origin dev main`);
  console.log(`Pushed branches dev, main`);
  execSync(`git checkout dev`);

  cleanupTag();
}

run();
