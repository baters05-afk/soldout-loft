/**
 * Приём заявок с сайта и отправка на почту.
 * Среда: Yandex Cloud Functions, Node.js 18+.
 *
 * Точка входа в настройках функции:  index.handler
 *
 * Почта выбрана вместо мессенджеров сознательно: 152-ФЗ требует хранить
 * персональные данные россиян в базах на территории РФ, а ящик на
 * yandex.ru данные из страны не выводит.
 *
 * Переменные окружения функции:
 *   MAIL_TO      — куда приходят заявки, например soldout-loft@yandex.ru
 *   SMTP_USER    — ящик для отправки (обычно тот же)
 *   SMTP_PASS    — пароль приложения: id.yandex.ru → Безопасность →
 *                  Пароли приложений → Почта. Обычный пароль не подойдёт.
 *   SMTP_HOST    — smtp.yandex.ru
 *   SMTP_PORT    — 465
 *   ALLOW_ORIGIN — адрес сайта, например https://soloft.ru
 */

const tls = require('tls');

const esc = (v = '') =>
  String(v).slice(0, 500)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const reply = (statusCode, data, origin) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  },
  body: JSON.stringify(data),
});

/** Отправка письма по SMTP поверх TLS. Без сторонних библиотек. */
function sendMail({ host, port, user, pass, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: Number(port), servername: host }, () => {});
    socket.setEncoding('utf8');
    socket.setTimeout(20000, () => { socket.destroy(); reject(new Error('SMTP: таймаут')); });

    const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
    const steps = [
      { expect: '220', send: 'EHLO soldout' },
      { expect: '250', send: 'AUTH LOGIN' },
      { expect: '334', send: b64(user) },
      { expect: '334', send: b64(pass) },
      { expect: '235', send: `MAIL FROM:<${user}>` },
      { expect: '250', send: `RCPT TO:<${to}>` },
      { expect: '250', send: 'DATA' },
      { expect: '354', send:
          `From: SOLDOUT <${user}>\r\n` +
          `To: <${to}>\r\n` +
          `Subject: =?UTF-8?B?${b64(subject)}?=\r\n` +
          'MIME-Version: 1.0\r\n' +
          'Content-Type: text/html; charset=UTF-8\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n') +
          '\r\n.' },
      { expect: '250', send: 'QUIT' },
    ];

    let i = 0, buf = '';
    socket.on('data', (chunk) => {
      buf += chunk;
      // ответ SMTP закончен, когда в последней строке после кода стоит пробел
      if (!/^\d{3} [^\n]*\n$/m.test(buf.split('\n').slice(-2).join('\n') + '\n')) {
        if (!/\r\n$/.test(buf)) return;
      }
      const code = buf.trim().split('\n').pop().slice(0, 3);
      const step = steps[i];
      if (!step) return;
      if (code !== step.expect) {
        socket.destroy();
        return reject(new Error(`SMTP: ожидался ${step.expect}, пришёл ${code} — ${buf.trim()}`));
      }
      buf = '';
      socket.write(step.send + '\r\n');
      i++;
      if (i >= steps.length) { socket.end(); resolve(true); }
    });

    socket.on('error', reject);
    socket.on('close', () => { if (i >= steps.length) resolve(true); });
  });
}

module.exports.handler = async function (event) {
  const origin = process.env.ALLOW_ORIGIN || '*';

  if (event.httpMethod === 'OPTIONS') return reply(204, {}, origin);
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Только POST' }, origin);

  const to   = process.env.MAIL_TO;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.yandex.ru';
  const port = process.env.SMTP_PORT || 465;

  if (!to || !user || !pass) {
    console.error('Не заданы MAIL_TO, SMTP_USER или SMTP_PASS');
    return reply(500, { ok: false, error: 'Приём заявок не настроен' }, origin);
  }

  let raw = event.body || '';
  if (event.isBase64Encoded) raw = Buffer.from(raw, 'base64').toString('utf8');

  let data = {};
  try { data = JSON.parse(raw); } catch { data = {}; }
  const { name = '', phone = '', date = '', company = '' } = data;

  // Скрытое поле: люди его не видят, боты заполняют
  if (company) return reply(200, { ok: true }, origin);

  if (!String(name).trim() || String(phone).replace(/\D/g, '').length < 11) {
    return reply(400, { ok: false, error: 'Проверьте имя и телефон' }, origin);
  }

  const moscow = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const html =
    '<html><body style="font-family:Arial,sans-serif;font-size:15px;color:#12161a">' +
    '<h2 style="margin:0 0 16px">Заявка с сайта SOLDOUT</h2>' +
    '<table cellpadding="6" style="border-collapse:collapse">' +
    `<tr><td style="color:#666">Имя</td><td><b>${esc(name)}</b></td></tr>` +
    `<tr><td style="color:#666">Телефон</td><td><b>${esc(phone)}</b></td></tr>` +
    (date ? `<tr><td style="color:#666">Дата и формат</td><td>${esc(date)}</td></tr>` : '') +
    `<tr><td style="color:#666">Получено</td><td>${moscow} МСК</td></tr>` +
    '</table></body></html>';

  try {
    await sendMail({ host, port, user, pass, to, subject: `Заявка с сайта: ${name}`, html });
    return reply(200, { ok: true }, origin);
  } catch (e) {
    console.error('Письмо не отправлено:', e.message);
    return reply(502, { ok: false, error: 'Не удалось отправить заявку' }, origin);
  }
};
