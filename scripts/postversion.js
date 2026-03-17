const { execSync } = require('child_process');

const { version } = require('../package.json');
const branch = `release/v${version}`;

execSync(`git push -u origin ${branch}`);
console.log(`Pushed branch ${branch}`);

execSync(`git tag -d v${version}`);
console.log(`Deleted local tag v${version}`);
