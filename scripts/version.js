const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '../manifest.json');
const { version } = require('../package.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.version = version;

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Updated manifest.json to version ${version}`);
