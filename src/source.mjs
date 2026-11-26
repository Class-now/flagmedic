// Reads the application source to point at the line that most likely causes a failed check.
import fs from 'node:fs';
import path from 'node:path';

const EXT = /\.(m?[jt]sx?|cjs)$/;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next']);

export function loadSource(dir) {
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (SKIP.has(ent.name)) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (EXT.test(ent.name)) files.push({ path: p, rel: path.relative(dir, p).replace(/\\/g, '/'), lines: fs.readFileSync(p, 'utf8').split(/\r?\n/) });
    }
  };
  if (dir && fs.existsSync(dir)) walk(dir);
  return files;
}

export function grep(files, re) {
  const hits = [];
  for (const f of files) f.lines.forEach((line, i) => { if (re.test(line)) hits.push({ file: f.rel, line: i + 1, text: line.trim() }); });
  return hits;
}

/** Calls that send a custom event: trackEvent('name' ...). */
export function trackedEvents(files) {
  const hits = [];
  for (const f of files)
    f.lines.forEach((line, i) => {
      for (const m of line.matchAll(/trackEvent\(\s*['"`]([^'"`]+)['"`]/g)) hits.push({ file: f.rel, line: i + 1, event: m[1], text: line.trim() });
    });
  return hits;
}

/** Where the flag is read or its exposure recorded. */
export function exposureSites(files, flag) {
  const esc = flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return grep(files, new RegExp(`(getExperimentFlag|trackExposureEvent|useExperiment|getFeatureValue|getFlag)\\(\\s*['"\`]${esc}['"\`]`));
}

/** Early exits between the start of the enclosing function and the exposure call. */
export function earlyExitsBefore(files, site) {
  const f = files.find((x) => x.rel === site.file);
  if (!f) return [];
  let start = site.line - 1;
  while (start > 0 && !/\b(function|=>)\b|^\s*(export\s+)?(async\s+)?function/.test(f.lines[start])) start--;
  const out = [];
  for (let i = start + 1; i < site.line - 1; i++) {
    const t = f.lines[i].trim();
    if (/\breturn\b|\bthrow\b|\bcontinue\b|\bbreak\b/.test(t) && !t.startsWith('//')) out.push({ file: f.rel, line: i + 1, text: t });
  }
  return out;
}

export function snippet(files, file, line, ctx = 1) {
  const f = files.find((x) => x.rel === file);
  if (!f) return [];
  const out = [];
  for (let i = Math.max(1, line - ctx); i <= Math.min(f.lines.length, line + ctx); i++) out.push({ line: i, text: f.lines[i - 1], hit: i === line });
  return out;
}
