// "Am I ready" check. Prints PASS or FAIL for each part and never prints the key.
//   node check.mjs         free: checks the key and credits without calling the model
//   node check.mjs --live  also asks Muse Ember one tiny question (costs a tiny fraction of a cent)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const say = (ok, label, note = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${note ? `  (${note})` : ''}`);
const BASE = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
const MODEL = process.env.MUSE_MODEL || 'meta/muse-ember';

say(existsSync(join(here, 'web/node_modules/next')), 'Starter app installed');

const keyFile = join(homedir(), '.secrets', 'muse-build-day.env');
let key = process.env.OPENROUTER_API_KEY || '';
if (!key && existsSync(keyFile)) key = (readFileSync(keyFile, 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m)?.[1] || '').trim();
say(Boolean(key), 'OpenRouter key saved', key ? (process.env.OPENROUTER_API_KEY ? 'from OPENROUTER_API_KEY' : '~/.secrets/muse-build-day.env') : 'run set-keys.ps1 once you have it');

if (key) {
  try {
    const r = await fetch(`${BASE}/key`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const d = (await r.json().catch(() => ({}))).data || {};
    const money = d.limit_remaining != null ? `$${Number(d.limit_remaining).toFixed(2)} left` : d.usage != null ? `$${Number(d.usage).toFixed(4)} used, no limit set` : '';
    say(r.status === 200, 'OpenRouter accepts the key', `${r.status}${money ? ', ' + money : ''}, nothing spent`);
  } catch (e) { say(false, 'OpenRouter accepts the key', e.message.slice(0, 80)); }

  try {
    const models = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(15000) }).then(r => r.json());
    say(Boolean(models.data?.some(m => m.id === MODEL)), `${MODEL} is listed`);
  } catch (e) { say(false, `${MODEL} is listed`, e.message.slice(0, 80)); }

  if (process.argv.includes('--live')) {
    try {
      const started = Date.now();
      const r = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Muse Build Day' },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 400 }),
        signal: AbortSignal.timeout(60000),
      });
      const d = await r.json().catch(() => ({}));
      const said = (d.choices?.[0]?.message?.content || '').trim().slice(0, 40);
      const cost = typeof d.usage?.cost === 'number' ? `, $${d.usage.cost.toFixed(6)}` : '';
      say(r.status === 200 && Boolean(said), 'Muse Ember answers', `${r.status}, ${Date.now() - started}ms, said "${said || d.error?.message || ''}"${cost}`);
    } catch (e) { say(false, 'Muse Ember answers', e.message.slice(0, 80)); }
  } else console.log('SKIP  Live Muse call (run with --live once credits are on the key)');
}

try {
  say(Boolean(execSync('vercel whoami', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 40000 }).trim()), 'Vercel logged in (only needed to share a link)');
} catch { say(false, 'Vercel logged in (only needed to share a link)'); }
