// Pure helpers shared between the browser app and the test runner.
// Loaded in the browser via <script src="version-helpers.js"> and exposed
// on globalThis.VersionHelpers. Imported from Node tests via require().
(function (root) {
  // Returns -1/0/+1 if a<b/a==b/a>b, or null if either side can't be parsed.
  // Accepts "[v]MAJOR.MINOR.PATCH[suffix]". At the same X.Y.Z, no-suffix
  // beats any suffix (stable > prerelease); among prereleases, natural-sort
  // the suffix so "rc2" < "rc10".
  function compareVersions(a, b) {
    const parse = (v) => {
      const m = String(v).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
      return m ? { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || "" } : null;
    };
    const tokenize = (s) => (s.match(/\d+|\D+/g) || []).map((t) => /^\d+$/.test(t) ? +t : t);
    const pa = parse(a), pb = parse(b);
    if (!pa || !pb) return null;
    for (const k of ["major", "minor", "patch"]) {
      if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
    }
    if (!pa.pre && !pb.pre) return 0;
    if (!pa.pre) return 1;
    if (!pb.pre) return -1;
    const ta = tokenize(pa.pre), tb = tokenize(pb.pre);
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      const xa = ta[i], xb = tb[i];
      if (xa === undefined) return -1;
      if (xb === undefined) return 1;
      if (typeof xa !== typeof xb) return typeof xa === "number" ? -1 : 1;
      if (xa !== xb) return xa < xb ? -1 : 1;
    }
    return 0;
  }

  /**
   * Returns true if upgrading from `current` to `latest` involves a
   * major or minor bump — i.e. it's NOT a patch-only change.
   * Used to suppress intrusive update prompts for schedule-only patches.
   * @param {string} current
   * @param {string} latest
   * @returns {boolean}
   */
  function isSignificantUpdate(current, latest) {
    const parse = (v) => {
      const m = String(v).replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
      return m ? { major: +m[1], minor: +m[2] } : null;
    };
    const pc = parse(current), pl = parse(latest);
    if (!pc || !pl) return false;
    return pl.major > pc.major || (pl.major === pc.major && pl.minor > pc.minor);
  }

  const api = { compareVersions, isSignificantUpdate };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.VersionHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
