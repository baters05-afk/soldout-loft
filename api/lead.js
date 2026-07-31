/**
 * Приём заявок с сайта и отправка их в Telegram.
 *
 * Функция выполняется на сервере Vercel, поэтому токен бота не попадает
 * в браузер. Значения берутся из переменных окружения проекта:
 *
 *   TG_BOT_TOKEN — токен от @BotFather
 *   TG_CHAT_ID   — куда слать: ваш id или id группы
 *
 * Задаются в Vercel: Settings → Environment Variables. В репозиторий
 * их класть не нужно и не следует.
 */

const escapeHtml = (v = '') =>
  String(v).slice(0, 500)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Только POST' });
  }

  const token = process.env.TG_BOT_TOKEN;
  const chat  = process.env.TG_CHAT_ID;
  if (!token || !chat) {
    console.error('Не заданы TG_BOT_TOKEN или TG_CHAT_ID');
    return res.status(500).json({ ok: false, error: 'Приём заявок не настроен' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { name = '', phone = '', date = '', company = '' } = body || {};

  // Скрытое поле: люди его не видят и не заполняют, боты — заполняют.
  if (company) return res.status(200).json({ ok: true });

  const digits = String(phone).replace(/\D/g, '');
  if (!String(name).trim() || digits.length < 11) {
    return res.status(400).json({ ok: false, error: 'Проверьте имя и телефон' });
  }

  const text =
    '<b>Заявка с сайта SOLDOUT</b>\n\n' +
    `<b>Имя:</b> ${escapeHtml(name)}\n` +
    `<b>Телефон:</b> ${escapeHtml(phone)}\n` +
    (date ? `<b>Дата и формат:</b> ${escapeHtml(date)}\n` : '') +
    `\n<i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</i>`;

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chat,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    if (!tg.ok) {
      const detail = await tg.text();
      console.error('Telegram ответил ошибкой:', tg.status, detail);
      return res.status(502).json({ ok: false, error: 'Не удалось отправить заявку' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Сбой при обращении к Telegram:', e);
    return res.status(502).json({ ok: false, error: 'Не удалось отправить заявку' });
  }
}
