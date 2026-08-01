/**
 * Приём заявок с сайта и отправка в Telegram.
 * Среда: Yandex Cloud Functions, Node.js 18+.
 *
 * Точка входа в настройках функции:  index.handler
 *
 * Переменные окружения функции:
 *   TG_BOT_TOKEN — токен от @BotFather
 *   TG_CHAT_ID   — куда слать заявки (свой id или id группы)
 *   ALLOW_ORIGIN — адрес сайта, например https://soloft.ru
 *
 * Токен живёт только в переменных окружения и в браузер не попадает.
 */

const escapeHtml = (v = '') =>
  String(v).slice(0, 500)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const reply = (statusCode, data, origin) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    // Сайт лежит на другом домене, поэтому браузеру нужно разрешение
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  },
  body: JSON.stringify(data),
});

module.exports.handler = async function (event) {
  const origin = process.env.ALLOW_ORIGIN || '*';

  // Браузер сначала спрашивает разрешение отдельным запросом
  if (event.httpMethod === 'OPTIONS') {
    return reply(204, {}, origin);
  }
  if (event.httpMethod !== 'POST') {
    return reply(405, { ok: false, error: 'Только POST' }, origin);
  }

  const token = process.env.TG_BOT_TOKEN;
  const chat = process.env.TG_CHAT_ID;
  if (!token || !chat) {
    console.error('Не заданы TG_BOT_TOKEN или TG_CHAT_ID');
    return reply(500, { ok: false, error: 'Приём заявок не настроен' }, origin);
  }

  let raw = event.body || '';
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }

  let data = {};
  try { data = JSON.parse(raw); } catch { data = {}; }

  const { name = '', phone = '', date = '', company = '' } = data;

  // Скрытое поле: люди его не видят, боты заполняют
  if (company) return reply(200, { ok: true }, origin);

  const digits = String(phone).replace(/\D/g, '');
  if (!String(name).trim() || digits.length < 11) {
    return reply(400, { ok: false, error: 'Проверьте имя и телефон' }, origin);
  }

  const moscow = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const text =
    '<b>Заявка с сайта SOLDOUT</b>\n\n' +
    `<b>Имя:</b> ${escapeHtml(name)}\n` +
    `<b>Телефон:</b> ${escapeHtml(phone)}\n` +
    (date ? `<b>Дата и формат:</b> ${escapeHtml(date)}\n` : '') +
    `\n<i>${moscow} МСК</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      console.error('Telegram ответил', res.status, await res.text());
      return reply(502, { ok: false, error: 'Не удалось отправить заявку' }, origin);
    }
    return reply(200, { ok: true }, origin);
  } catch (e) {
    console.error('Сбой при обращении к Telegram:', e);
    return reply(502, { ok: false, error: 'Не удалось отправить заявку' }, origin);
  }
};
