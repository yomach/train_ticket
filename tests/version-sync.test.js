const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');

test('Versions are synced across package.json, app.js, and build.gradle', (t) => {
  // 1. Read package.json version
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;
  
  assert.ok(version, 'package.json must have a version');

  // 2. Read app.js version
  const appJsPath = path.join(rootDir, 'www', 'app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  const versionMatch = appJs.match(/const VERSION = "([^"]+)";/);
  
  assert.ok(versionMatch, 'app.js must contain VERSION constant');
  assert.strictEqual(versionMatch[1], version, `app.js VERSION (${versionMatch[1]}) must match package.json version (${version})`);

  // 3. Read build.gradle versionName
  const buildGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
  if (fs.existsSync(buildGradlePath)) {
    const gradle = fs.readFileSync(buildGradlePath, 'utf8');
    const nameMatch = gradle.match(/versionName "([^"]+)"/);
    
    assert.ok(nameMatch, 'build.gradle must contain versionName');
    assert.strictEqual(nameMatch[1], version, `build.gradle versionName (${nameMatch[1]}) must match package.json version (${version})`);
  }
});
