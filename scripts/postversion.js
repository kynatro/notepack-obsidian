const { execSync } = require('child_process');
const readline = require('readline');

const { version: RELEASE_VERSION } = require('../package.json');
const RELEASE_BRANCH = `release/v${RELEASE_VERSION}`;

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
  const confirmed = await confirm(`Push branches dev and ${RELEASE_BRANCH} and create a PR? (y/N) `);

  if (!confirmed) {
    console.log('Push cancelled, cleaning up...');
    rollback();
    return;
  }

  execSync(`git branch ${RELEASE_BRANCH}`);
  console.log(`Created release branch ${RELEASE_BRANCH}`);

  execSync(`git push -u origin dev ${RELEASE_BRANCH}`);
  console.log(`Pushed branches dev, ${RELEASE_BRANCH}`);

  execSync(
    `gh pr create --base main --head "${RELEASE_BRANCH}" --title "Release: v${RELEASE_VERSION}" --fill-verbose`,
    { stdio: 'inherit' }
  );
  console.log(`Created pull request for ${RELEASE_BRANCH}`);

  cleanupTag();
}

run();
