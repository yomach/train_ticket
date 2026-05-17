#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const { version } = require("../package.json");

const appJsPath = path.join(__dirname, "../www/app.js");
const src = fs.readFileSync(appJsPath, "utf8");

const pattern = /^const VERSION = ".*?";/m;
if (!pattern.test(src)) {
  console.error("sync-version: VERSION constant not found in www/app.js");
  process.exit(1);
}

const updated = src.replace(pattern, `const VERSION = "${version}";`);
fs.writeFileSync(appJsPath, updated);
console.log(`sync-version: set VERSION to ${version} in www/app.js`);
