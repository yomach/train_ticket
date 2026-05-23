const test = require("node:test");
const assert = require("node:assert/strict");

const { compareVersions, isSignificantUpdate } = require("../www/version-helpers.js");

const sign = (n) => (n == null ? null : n === 0 ? 0 : n < 0 ? -1 : 1);

test("major/minor/patch numeric compare", () => {
  assert.equal(sign(compareVersions("0.5.0", "0.4.0")), 1);
  assert.equal(sign(compareVersions("0.4.0", "0.5.0")), -1);
  assert.equal(sign(compareVersions("1.0.0", "0.99.0")), 1);
  assert.equal(sign(compareVersions("0.4.1", "0.4.0")), 1);
  assert.equal(sign(compareVersions("0.4.0", "0.4.0")), 0);
});

test("leading 'v' is stripped on both sides", () => {
  assert.equal(sign(compareVersions("v0.4.0", "0.4.0")), 0);
  assert.equal(sign(compareVersions("0.4.0", "v0.4.0")), 0);
  assert.equal(sign(compareVersions("v0.5.0", "v0.4.0")), 1);
});

test("stable beats prerelease at the same X.Y.Z", () => {
  assert.equal(sign(compareVersions("0.4.0", "0.4.0rc1")), 1);
  assert.equal(sign(compareVersions("0.4.0rc1", "0.4.0")), -1);
});

test("natural-sort suffix so rc10 > rc2", () => {
  assert.equal(sign(compareVersions("0.4.0rc10", "0.4.0rc2")), 1);
  assert.equal(sign(compareVersions("0.4.0rc2", "0.4.0rc10")), -1);
  assert.equal(sign(compareVersions("0.4.0rc1", "0.4.0rc1")), 0);
});

test("standard semver prerelease format also natural-sorts", () => {
  assert.equal(sign(compareVersions("0.4.0-rc.2", "0.4.0-rc.10")), -1);
  assert.equal(sign(compareVersions("0.4.0-rc.10", "0.4.0-rc.2")), 1);
});

test("higher version always wins regardless of prerelease on the other side", () => {
  // A higher X.Y.Z prerelease still beats a lower X.Y.Z stable.
  assert.equal(sign(compareVersions("0.5.0rc1", "0.4.0")), 1);
  assert.equal(sign(compareVersions("0.4.0", "0.5.0rc1")), -1);
});

test("unparseable input returns null on both sides", () => {
  assert.equal(compareVersions("weird", "0.4.0"), null);
  assert.equal(compareVersions("0.4.0", "weird"), null);
  assert.equal(compareVersions("", "0.4.0"), null);
  assert.equal(compareVersions(null, "0.4.0"), null);
  assert.equal(compareVersions(undefined, "0.4.0"), null);
});

test("regression: 0.4.0rc1 should not flag 0.3.0 as newer", () => {
  // The exact bug the helper was added to fix.
  assert.equal(sign(compareVersions("0.3.0", "0.4.0rc1")), -1);
});

// ── isSignificantUpdate ──────────────────────────────────────────────────────

test("isSignificantUpdate: patch-only bump is NOT significant", () => {
  assert.equal(isSignificantUpdate("0.4.2", "0.4.3"), false);
  assert.equal(isSignificantUpdate("0.4.0", "0.4.99"), false);
});

test("isSignificantUpdate: minor bump IS significant", () => {
  assert.equal(isSignificantUpdate("0.4.2", "0.5.0"), true);
  assert.equal(isSignificantUpdate("0.4.2", "0.5.1"), true);
});

test("isSignificantUpdate: major bump IS significant", () => {
  assert.equal(isSignificantUpdate("0.4.2", "1.0.0"), true);
  assert.equal(isSignificantUpdate("0.4.2", "2.0.0"), true);
});

test("isSignificantUpdate: same version is NOT significant", () => {
  assert.equal(isSignificantUpdate("0.4.2", "0.4.2"), false);
});

test("isSignificantUpdate: handles v-prefix", () => {
  assert.equal(isSignificantUpdate("v0.4.2", "v0.5.0"), true);
  assert.equal(isSignificantUpdate("v0.4.2", "v0.4.3"), false);
});

test("isSignificantUpdate: unparseable returns false", () => {
  assert.equal(isSignificantUpdate("weird", "0.5.0"), false);
  assert.equal(isSignificantUpdate("0.4.0", "weird"), false);
  assert.equal(isSignificantUpdate(null, "0.5.0"), false);
  assert.equal(isSignificantUpdate(undefined, "0.5.0"), false);
});

test("isSignificantUpdate: downgrade is NOT significant", () => {
  assert.equal(isSignificantUpdate("0.5.0", "0.4.0"), false);
  assert.equal(isSignificantUpdate("1.0.0", "0.9.0"), false);
});
