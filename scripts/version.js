const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const manifestPath = path.join(__dirname, '../src/manifest.json');
const { version } = require('../package.json');

const branch = `release/v${version}`;
execSync(`git checkout -b ${branch}`);
console.log(`Created branch ${branch}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Updated manifest.json to version ${version}`);
