// Builds the demo video: scene PNGs (headless Chromium) + English TTS (edge-tts) -> ffmpeg -> video/out/flagmedic-demo.mp4
// Usage: node video/build.mjs   (needs playwright, edge-tts and ffmpeg on PATH)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// FM_SCENES=scenes-short.mjs FM_OUT=flagmedic-demo-short.mp4 builds the under-3-minute cut into video/out/short/.
const { scenes, VOICE, RATE = '+10%' } = await import(`./${process.env.FM_SCENES || 'scenes.mjs'}`);

const here = path.dirname(fileURLToPath(import.meta.url));
const cap = path.join(here, 'cap');
const outRoot = path.join(here, 'out');
const out = process.env.FM_SCENES ? path.join(outRoot, 'short') : outRoot;
fs.mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const COLORS = { 31: '#ff6b6b', 32: '#5fd68a', 33: '#f5c451' };
function ansi(text) {
  let html = '';
  let open = 0;
  for (const part of text.split(/(\x1b\[[0-9;]*m)/)) {
    const m = part.match(/^\x1b\[([0-9;]*)m$/);
    if (!m) { html += esc(part); continue; }
    const code = Number(m[1] || 0);
    if (code === 0) { html += '</span>'.repeat(open); open = 0; continue; }
    const style = COLORS[code] ? `color:${COLORS[code]}` : code === 1 ? 'font-weight:700;color:#fff' : code === 2 ? 'color:#7d8590' : '';
    html += `<span style="${style}">`; open++;
  }
  return html + '</span>'.repeat(open);
}
// PowerShell strips ANSI when redirecting, so re-apply the CLI's own colour rules (bin/flagmedic.mjs render/printProposal).
function cliColor(text) {
  const sp = (c, s) => `<span style="color:${c}">${s}</span>`;
  const B = (s) => `<span style="font-weight:700;color:#fff">${s}</span>`;
  const R = '#ff6b6b', G = '#5fd68a', Y = '#f5c451', D = '#7d8590';
  return text.split('\n').map((raw, i) => {
    let l = esc(raw);
    if (i === 0 && raw.startsWith('FlagMedic')) return B(l);
    if (i === 1 && raw.startsWith('https://')) return sp(D, l);
    if (raw.startsWith('HEALTH: OK')) return l.replace(/^(HEALTH: OK)(.*)$/, (_, a, b) => `<b>${sp(G, a)}</b>${sp(D, b)}`);
    if (raw.startsWith('HEALTH:')) return `<b>${sp(R, l)}</b>`;
    if (/^  D\d /.test(raw)) return l.replace(/^  (D\d) (.*)$/, (_, a, b) => `  ${sp(R, a)} ${B(b)}`);
    if (/^\s+cause /.test(raw)) return l.replace('cause', sp(Y, 'cause'));
    if (/^\s+fix /.test(raw)) return l.replace('fix', sp(G, 'fix'));
    if (/^\s+&gt;?\s+\d+ \|/.test(l)) return sp(D, l);
    if (raw.startsWith('DECISION:')) {
      return l.replace(/^DECISION: (SHIP \w+|FIX|STOP|CONTINUE)/, (_, v) => `${B('DECISION:')} <b>${sp(v.startsWith('SHIP') ? G : v === 'FIX' ? R : Y, v)}</b>`);
    }
    if (/^\s+(variation\s+identities|needed per arm)/.test(raw)) return sp(D, l);
    if (/^p-\d+\s+(APPLIED|REJECTED|PENDING)/.test(raw)) return l.replace(/(APPLIED|REJECTED|PENDING)/, (v) => `<b>${sp(v === 'APPLIED' ? G : v === 'REJECTED' ? R : Y, v)}</b>`);
    if (/^\s+ok\s/.test(raw)) return l.replace('ok', sp(G, 'ok'));
    if (raw.startsWith('PROPOSAL')) return B(l);
    return l;
  }).join('\n');
}
function diffColor(text) {
  return text.split('\n').map((l) => {
    const c = /^\+(?!\+\+)/.test(l) ? '#5fd68a' : /^-(?!--)/.test(l) ? '#ff6b6b' : /^@@/.test(l) ? '#79c0ff' : null;
    return c ? `<span style="color:${c}">${esc(l)}</span>` : esc(l);
  }).join('\n');
}

const CSS = `body{margin:0;width:1920px;height:1080px;background:#0d1117;color:#c9d1d9;font-family:'Segoe UI',Arial,sans-serif;overflow:hidden}
.term{position:absolute;inset:60px 70px 90px 70px;background:#010409;border:1px solid #30363d;border-radius:12px;padding:26px 32px;box-sizing:border-box}
.bar{position:absolute;top:0;left:0;right:0;height:38px;background:#161b22;border-radius:12px 12px 0 0;border-bottom:1px solid #30363d}
.bar i{display:inline-block;width:13px;height:13px;border-radius:50%;margin:12px 0 0 14px}
pre{margin:34px 0 0;font-family:Consolas,'Cascadia Mono',monospace;line-height:1.42;white-space:pre-wrap;word-break:break-all}
.cmd{color:#79c0ff}.brand{position:absolute;left:70px;bottom:28px;font-size:24px;color:#7d8590}.brand b{color:#5fd68a}
.slide{padding:150px 170px}.slide h1{font-size:84px;margin:0 0 18px;color:#fff}.slide h2{font-size:40px;font-weight:400;color:#5fd68a;margin:0 0 60px}
.slide li{font-size:40px;margin:0 0 30px;line-height:1.3}.slide .foot{position:absolute;bottom:70px;left:170px;font-size:28px;color:#7d8590}`;

function html(s) {
  if (s.slide) {
    const t = s.slide;
    return `<style>${CSS}</style><div class="slide"><h1>${esc(t.title)}</h1>${t.sub ? `<h2>${esc(t.sub)}</h2>` : '<div style="height:40px"></div>'}<ul>${t.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><div class="foot">${esc(t.foot)}</div></div>`;
  }
  let body = fs.readFileSync(path.join(cap, s.file), 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  body = body.split('\n').filter((l) => !/^\(node:\d+\) Warning|^\(Use `node --trace/.test(l)).join('\n').trimEnd();
  let inner = s.file === 'prdiff.txt' ? diffColor(body) : body.includes('\x1b[') ? ansi(body) : cliColor(body);
  if (s.file === 'setup.txt') inner = inner.replace(/^(\$ .*)$/gm, '<span class="cmd">$1</span>');
  const lines = body.split('\n').length + (s.cmd ? 2 : 0);
  const longest = Math.max(...body.split('\n').map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length), s.cmd ? s.cmd.length + 2 : 0);
  const size = Math.max(17, Math.min(30, Math.floor(1700 / (longest * 0.55)), Math.floor(860 / (lines * 1.42))));
  return `<style>${CSS}</style><div class="term"><div class="bar"><i style="background:#ff5f56"></i><i style="background:#ffbd2e"></i><i style="background:#27c93f"></i></div><pre style="font-size:${size}px">${s.cmd ? `<span class="cmd">$ ${esc(s.cmd)}</span>\n\n` : ''}${inner}</pre></div><div class="brand"><b>FlagMedic</b>  ·  real output on Flagsmith Cloud  ·  synthetic traffic</div>`;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const parts = [];
for (const s of scenes) {
  const png = path.join(out, `${s.id}.png`);
  const mp3 = path.join(out, `${s.id}.mp3`);
  const mp4 = path.join(out, `${s.id}.mp4`);
  await page.setContent(html(s));
  await page.screenshot({ path: png });
  execFileSync('edge-tts', ['--voice', VOICE, '--rate', RATE, '--text', s.say, '--write-media', mp3], { stdio: 'ignore' });
  const said = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3], { encoding: 'utf8' }).trim());
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-i', png, '-i', mp3,
    '-af', 'adelay=300|300,apad', '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', (said + 0.9).toFixed(2), mp4]);
  parts.push(mp4);
  console.log('scene', s.id);
}
await browser.close();
const list = path.join(out, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n'));
const final = path.join(outRoot, process.env.FM_OUT || 'flagmedic-demo.mp4');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final], { encoding: 'utf8' }).trim();
console.log(final, `${Number(dur).toFixed(1)}s`);
