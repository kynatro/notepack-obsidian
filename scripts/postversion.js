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

function rollback() {
  execSync(`git reset --hard origin/dev`);
  console.log(`Reset dev to origin/dev`);
  execSync(`git tag -d v${RELEASE_VERSION}`);
  console.log(`Deleted local tag v${RELEASE_VERSION}`);
}

async function run() {
  const confirmed = await confirm(`Merge dev@${RELEASE_VERSION} to main and push to origin? (y/N) `);

  if (!confirmed) {
    console.log('Push cancelled, cleaning up...');
    rollback();
    return;
  }

  execSync('git fetch origin main');
  execSync('git checkout main');
  execSync('git reset --hard origin/main');
  execSync('git merge dev');
  console.log('Merged dev into main');
  execSync('git push -u origin dev main');
  console.log('Pushed branches dev, main');
  execSync(`git tag ${RELEASE_VERSION} v${RELEASE_VERSION}`);
  execSync(`git tag -d v${RELEASE_VERSION}`);
  console.log(`Rename tag v${RELEASE_VERSION} to ${RELEASE_VERSION}`);
  execSync('git push --tags origin');
  console.log('Pushed tags to origin');
  execSync('git checkout dev');
}

run();
