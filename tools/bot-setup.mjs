// ============================================================================
//  bot-setup — the bot's name, Russian card and menu button through the Bot API
// ----------------------------------------------------------------------------
//  node tools/bot-setup.mjs        # asks for the token: it is not shown and not stored
//  node tools/bot-setup.mjs --dry  # prints the calls, needs no token and no network
//
//  BotFather edits only the default language, the Russian card needs the Bot API. A long
//  text in curl breaks on the Windows console codepage, so the calls live here. The
//  English card stays the default set in BotFather. Texts: docs/bot-welcome.md.
// ============================================================================
import path from 'node:path';
import url from 'node:url';

export const GAME_URL = 'https://dobriydc.github.io/RailCollaps/';
export const NAME = 'Rail Link: Collapse';
export const DESCRIPTION_RU = 'Тоннель рушится за спиной, впереди лава, провалы и демоны. Стреляй по рычагам, меняй путь и уходи от обвала как можно дальше.\n\n' +
  'Один тап — одно решение. Рейс длится около минуты.\n\nПоезд уже под парами. Жми кнопку внизу.';
export const ABOUT_RU = 'Аркада про паровоз в рушащемся тоннеле. Рейс на минуту, рекорд в метрах.';

export const CALLS = [
  ['setMyName', { name: NAME }],
  ['setMyDescription', { description: DESCRIPTION_RU, language_code: 'ru' }],
  ['setMyShortDescription', { short_description: ABOUT_RU, language_code: 'ru' }],
  ['setChatMenuButton', { menu_button: { type: 'web_app', text: 'Играть', web_app: { url: GAME_URL } } }],
];

export const isToken = token => /^\d+:[\w-]{20,}$/.test(token);

// Sends every call, stops at the first refusal. Answers carry no token: the address is never printed.
export async function send(token, calls = CALLS, post = fetch) {
  for (const [method, params] of calls) {
    const res = await post('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params),
    });
    const answer = await res.json();
    if (!answer.ok) return { ok: false, method, why: answer.description || 'нет ответа' };
    console.log('  готово: ' + method);
  }
  return { ok: true };
}

// The console does not echo: a pasted token stays off the screen and out of the shell history.
function askHidden(question) {
  return new Promise(resolve => {
    const { stdin } = process;
    let value = '';
    process.stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(value.trim());
    };
    const onData = chunk => {
      for (const c of chunk) {
        if (c === '\r' || c === '\n') return finish();
        if (c === '\u0003') process.exit(130);
        if (c === '\b' || c === '\u007f') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--dry')) {
    for (const [method, params] of CALLS) console.log(method, JSON.stringify(params));
    process.exit(0);
  }
  const token = await askHidden('Токен бота (вставь и нажми Enter, на экране он не появится): ');
  if (!isToken(token)) {
    console.error('Это не похоже на токен бота. Ничего не изменено.');
    process.exit(1);
  }
  const result = await send(token).catch(e => ({ ok: false, method: 'сеть', why: e.message }));
  if (!result.ok) {
    console.error('Telegram отказал в ' + result.method + ': ' + result.why);
    process.exit(1);
  }
  console.log('Бот настроен.');
}
