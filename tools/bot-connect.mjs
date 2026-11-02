// ============================================================================
//  bot-connect — hands the bot to the deployed function in one go
// ----------------------------------------------------------------------------
//  node tools/bot-connect.mjs https://collapse-leaderboard.<name>.workers.dev
//
//  Asks for the bot token (not shown, not stored), makes a random webhook secret, puts both
//  into the function's secrets through wrangler and points the bot's webhook at <address>/bot.
//  Neither value is printed. The deploy steps: server/leaderboard/README.md.
// ============================================================================
import crypto from 'node:crypto';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';
import { askHidden, isToken } from './bot-setup.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server', 'leaderboard');
export const WRANGLER = 'wrangler@4.156.0';
export const UPDATES = ['message', 'pre_checkout_query'];

export const isAddress = address => /^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(address);

export function webhookParams(address, secret) {
  return { url: address + '/bot', secret_token: secret, allowed_updates: UPDATES };
}

// `wrangler secret put NAME` reads the value from stdin: it never reaches the command line.
function putSecret(name, value) {
  return new Promise(resolve => {
    const child = spawn('npx', ['--yes', WRANGLER, 'secret', 'put', name, '-c', 'wrangler.local.toml'],
      { cwd: SERVER, shell: process.platform === 'win32', stdio: ['pipe', 'ignore', 'inherit'] });
    child.on('close', code => resolve(code === 0));
    child.stdin.end(value);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const address = (process.argv[2] || '').replace(/\/+$/, '');
  if (!isAddress(address)) {
    console.error('Укажи адрес функции: node tools/bot-connect.mjs https://collapse-leaderboard.<имя>.workers.dev');
    process.exit(1);
  }
  const token = await askHidden('Токен бота (вставь и нажми Enter, на экране он не появится): ');
  if (!isToken(token)) {
    console.error('Это не похоже на токен бота. Ничего не изменено.');
    process.exit(1);
  }
  const secret = crypto.randomBytes(32).toString('hex');
  for (const [name, value] of [['BOT_TOKEN', token], ['BOT_WEBHOOK_SECRET', secret]]) {
    if (!await putSecret(name, value)) {
      console.error('Не удалось сохранить ' + name + ' в Cloudflare.');
      process.exit(1);
    }
    console.log('  готово: ' + name + ' в Cloudflare');
  }
  const answer = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(webhookParams(address, secret)),
  }).then(r => r.json()).catch(e => ({ ok: false, description: e.message }));
  if (!answer.ok) {
    console.error('Telegram отказал в setWebhook: ' + (answer.description || 'нет ответа'));
    process.exit(1);
  }
  console.log('  готово: webhook бота на ' + address + '/bot');
  console.log('Бот подключён к функции.');
}
