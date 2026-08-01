<?php
/**
 * Приём заявок с сайта и отправка в Telegram.
 * Работает на любом обычном хостинге с PHP 7.4+ (Timeweb, Beget, REG.RU и др.).
 *
 * Настройка: скопируйте config.sample.php в config.php и впишите туда
 * токен бота и chat_id. Файл config.php на сервере лежит рядом,
 * в репозиторий он не попадает — токен не должен оказаться в открытом коде.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['ok' => false, 'error' => 'Только POST'], JSON_UNESCAPED_UNICODE);
    exit;
}

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    error_log('SOLDOUT: нет api/config.php');
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Приём заявок не настроен'], JSON_UNESCAPED_UNICODE);
    exit;
}
$cfg = require $configPath;
$token = $cfg['bot_token'] ?? '';
$chat  = $cfg['chat_id']   ?? '';

if ($token === '' || $chat === '') {
    error_log('SOLDOUT: в config.php пустые bot_token или chat_id');
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Приём заявок не настроен'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw  = file_get_contents('php://input') ?: '';
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$clean = static function ($v): string {
    return htmlspecialchars(mb_substr(trim((string)$v), 0, 500), ENT_QUOTES, 'UTF-8');
};

$name    = $clean($data['name']    ?? '');
$phone   = $clean($data['phone']   ?? '');
$date    = $clean($data['date']    ?? '');
$company = trim((string)($data['company'] ?? ''));

// Скрытое поле: люди его не видят, боты заполняют. Молча принимаем и не шлём.
if ($company !== '') {
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

$digits = preg_replace('/\D/', '', $phone) ?? '';
if ($name === '' || mb_strlen($digits) < 11) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Проверьте имя и телефон'], JSON_UNESCAPED_UNICODE);
    exit;
}

// Простая защита от потока заявок с одного адреса: не чаще раза в 20 секунд.
$ip   = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
$lock = sys_get_temp_dir() . '/soldout_' . md5($ip);
if (is_file($lock) && (time() - filemtime($lock)) < 20) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Слишком часто, попробуйте через минуту'], JSON_UNESCAPED_UNICODE);
    exit;
}
@touch($lock);

date_default_timezone_set('Europe/Moscow');
$text = "<b>Заявка с сайта SOLDOUT</b>\n\n"
      . "<b>Имя:</b> {$name}\n"
      . "<b>Телефон:</b> {$phone}\n"
      . ($date !== '' ? "<b>Дата и формат:</b> {$date}\n" : '')
      . "\n<i>" . date('d.m.Y H:i') . " МСК</i>";

$payload = http_build_query([
    'chat_id'                  => $chat,
    'text'                     => $text,
    'parse_mode'               => 'HTML',
    'disable_web_page_preview' => 'true',
]);

$ch = curl_init("https://api.telegram.org/bot{$token}/sendMessage");
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 15,
]);
$response = curl_exec($ch);
$status   = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($status !== 200) {
    error_log('SOLDOUT: Telegram ответил ' . $status . ' ' . $curlErr . ' ' . (string)$response);
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Не удалось отправить заявку'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
