<?php
/**
 * Приём заявок с сайта и отправка на почту.
 * Работает на любом хостинге с PHP 7.4+ (Timeweb, Beget, REG.RU и др.).
 *
 * Почта выбрана вместо мессенджеров сознательно: 152-ФЗ требует хранить
 * персональные данные россиян в базах на территории РФ, а ящик на
 * yandex.ru данные из страны не выводит.
 *
 * Настройка: скопируйте config.sample.php в config.php и заполните.
 */

declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

function out(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    out(405, ['ok' => false, 'error' => 'Только POST']);
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    error_log('SOLDOUT: нет api/config.php');
    out(500, ['ok' => false, 'error' => 'Приём заявок не настроен']);
}
$cfg = require $configPath;

$to   = $cfg['mail_to']   ?? '';
$from = $cfg['mail_from'] ?? $to;
if ($to === '') {
    error_log('SOLDOUT: в config.php не задан mail_to');
    out(500, ['ok' => false, 'error' => 'Приём заявок не настроен']);
}

// ── разбор и проверка ────────────────────────────────────────────
$raw  = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) $data = $_POST;

$clean = static fn($v): string => trim(mb_substr((string)$v, 0, 500));

$name    = $clean($data['name']    ?? '');
$phone   = $clean($data['phone']   ?? '');
$date    = $clean($data['date']    ?? '');
$company = trim((string)($data['company'] ?? ''));

// Скрытое поле: люди его не видят, боты заполняют. Молча принимаем.
if ($company !== '') out(200, ['ok' => true]);

$digits = preg_replace('/\D/', '', $phone) ?? '';
if ($name === '' || mb_strlen($digits) < 11) {
    out(400, ['ok' => false, 'error' => 'Проверьте имя и телефон']);
}

// Не чаще одной заявки в 20 секунд с адреса
$ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$lock = sys_get_temp_dir() . '/soldout_' . md5($ip);
if (is_file($lock) && (time() - filemtime($lock)) < 20) {
    out(429, ['ok' => false, 'error' => 'Слишком часто, попробуйте через минуту']);
}
@touch($lock);

// ── письмо ───────────────────────────────────────────────────────
date_default_timezone_set('Europe/Moscow');
$esc = static fn($v) => htmlspecialchars($v, ENT_QUOTES, 'UTF-8');

$subject = 'Заявка с сайта: ' . $name;
$html = '<html><body style="font-family:Arial,sans-serif;font-size:15px;color:#12161a">'
      . '<h2 style="margin:0 0 16px">Заявка с сайта SOLDOUT</h2>'
      . '<table cellpadding="6" style="border-collapse:collapse">'
      . '<tr><td style="color:#666">Имя</td><td><b>' . $esc($name) . '</b></td></tr>'
      . '<tr><td style="color:#666">Телефон</td><td><b>' . $esc($phone) . '</b></td></tr>'
      . ($date !== '' ? '<tr><td style="color:#666">Дата и формат</td><td>' . $esc($date) . '</td></tr>' : '')
      . '<tr><td style="color:#666">Получено</td><td>' . date('d.m.Y H:i') . ' МСК</td></tr>'
      . '</table></body></html>';

/** Отправка через SMTP без сторонних библиотек. */
function smtpSend(array $c, string $to, string $from, string $subject, string $html): bool {
    $host = $c['smtp_host'] ?? '';
    $port = (int)($c['smtp_port'] ?? 465);
    $user = $c['smtp_user'] ?? '';
    $pass = $c['smtp_pass'] ?? '';
    if ($host === '' || $user === '' || $pass === '') return false;

    $target = ($port === 465 ? 'ssl://' : '') . $host . ':' . $port;
    $fp = @stream_socket_client($target, $errno, $errstr, 15);
    if (!$fp) { error_log("SOLDOUT SMTP: не подключиться — $errstr"); return false; }
    stream_set_timeout($fp, 15);

    $read = static function ($fp): string {
        $out = '';
        while ($line = fgets($fp, 515)) {
            $out .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $out;
    };
    $say = static function ($fp, string $cmd) use ($read): string {
        fwrite($fp, $cmd . "\r\n");
        return $read($fp);
    };

    $read($fp);
    $say($fp, 'EHLO soldout');
    if ($port === 587) { $say($fp, 'STARTTLS');
        stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        $say($fp, 'EHLO soldout'); }
    $say($fp, 'AUTH LOGIN');
    $say($fp, base64_encode($user));
    $auth = $say($fp, base64_encode($pass));
    if (strpos($auth, '235') !== 0) { error_log('SOLDOUT SMTP: отказ авторизации — ' . trim($auth)); fclose($fp); return false; }

    $say($fp, "MAIL FROM:<$from>");
    $say($fp, "RCPT TO:<$to>");
    $say($fp, 'DATA');

    $headers = "From: SOLDOUT <$from>\r\n"
             . "To: <$to>\r\n"
             . 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: text/html; charset=UTF-8\r\n"
             . "Content-Transfer-Encoding: base64\r\n\r\n";
    $res = $say($fp, $headers . chunk_split(base64_encode($html)) . "\r\n.");
    $say($fp, 'QUIT');
    fclose($fp);

    if (strpos($res, '250') !== 0) { error_log('SOLDOUT SMTP: письмо отклонено — ' . trim($res)); return false; }
    return true;
}

$sent = false;
if (empty($cfg['use_php_mail'])) {
    $sent = smtpSend($cfg, $to, $from, $subject, $html);
}
if (!$sent) {
    $headers = "From: SOLDOUT <$from>\r\n"
             . "Reply-To: $from\r\n"
             . "MIME-Version: 1.0\r\n"
             . "Content-Type: text/html; charset=UTF-8\r\n";
    $sent = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $html, $headers);
}

if (!$sent) {
    error_log('SOLDOUT: письмо не отправлено');
    out(502, ['ok' => false, 'error' => 'Не удалось отправить заявку']);
}

out(200, ['ok' => true]);
