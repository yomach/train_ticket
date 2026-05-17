#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const pkgPath = path.join(rootDir, 'package.json');
const appJsPath = path.join(rootDir, 'www', 'app.js');
const buildGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');

function syncVersion() {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;

  if (!version) {
    console.error('Error: Could not find version in package.json');
    process.exit(1);
  }

  // 1. Sync www/app.js
  let appJs = fs.readFileSync(appJsPath, 'utf8');
  const versionRegex = /const VERSION = "[^"]+";/;
  const newVersionLine = `const VERSION = "${version}";`;

  if (versionRegex.test(appJs)) {
    appJs = appJs.replace(versionRegex, newVersionLine);
    fs.writeFileSync(appJsPath, appJs, 'utf8');
    console.log(`Successfully synced version ${version} to www/app.js`);
  } else {
    console.warn('Warning: Could not find VERSION constant in www/app.js');
  }

  // 2. Sync android/app/build.gradle
  if (fs.existsSync(buildGradlePath)) {
    let gradle = fs.readFileSync(buildGradlePath, 'utf8');
    
    // Update versionName
    const nameRegex = /versionName "[^"]+"/;
    gradle = gradle.replace(nameRegex, `versionName "${version}"`);
    
    // Bump versionCode (simple increment)
    const codeMatch = gradle.match(/versionCode (\d+)/);
    if (codeMatch) {
      const oldCode = parseInt(codeMatch[1], 10);
      gradle = gradle.replace(`versionCode ${oldCode}`, `versionCode ${oldCode + 1}`);
      console.log(`Successfully bumped versionCode to ${oldCode + 1} and synced versionName ${version} to build.gradle`);
    }
    
    fs.writeFileSync(buildGradlePath, gradle, 'utf8');
  }
}

syncVersion();
