const { execSync } = require('child_process');

const { version } = require('../package.json');
const branch = `release/v${version}`;

execSync(`git branch ${branch}`);
console.log(`Created branch ${branch}`);

execSync(`git push -u origin dev ${branch}`);
console.log(`Pushed branches dev, ${branch}`);

execSync(
  `gh pr create --base main --head "${branch}" --title "Release: v${version}" --fill-verbose`,
  { stdio: 'inherit' }
);
console.log(`Created pull request for ${branch}`);

execSync(`git tag -d v${version}`);
console.log(`Deleted local tag v${version}`);
