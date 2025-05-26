const fs = require('fs');
const path = require('path');

// Read the bundle.json file
const bundlePath = path.join(__dirname, '../src/bundle.json');
const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));

// Get the current version
const currentVersion = bundle['edgeworker-version'];
console.log(`Current version: ${currentVersion}`);

// Split version into parts
const versionParts = currentVersion.split('.');
if (versionParts.length !== 3) {
  throw new Error(`Invalid version format: ${currentVersion}`);
}

// Increment the last part
const lastPart = parseInt(versionParts[2], 10);
if (isNaN(lastPart)) {
  throw new Error(`Invalid version number: ${currentVersion}`);
}

versionParts[2] = (lastPart + 1).toString();
const newVersion = versionParts.join('.');

// Update the bundle.json
bundle['edgeworker-version'] = newVersion;
fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2) + '\n');

console.log(`Version updated to: ${newVersion}`); 