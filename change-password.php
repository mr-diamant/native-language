<?php
// Change password endpoint for Native Language
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

if (file_exists(__DIR__ . '/config.local.php')) {
    require __DIR__ . '/config.local.php';
} else {
    require __DIR__ . '/config.php';
}

if (!defined('APP_USER_EMAIL') || !defined('APP_USER_PASSWORD') || !defined('JWT_SECRET')) {
    http_response_code(500);
    echo json_encode(['error' => 'Auth not configured']);
    exit;
}

function validateToken() {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth || !preg_match('/Bearer\s+(\S+)/', $auth, $m)) return false;
    $parts = explode('.', $m[1]);
    if (count($parts) !== 3) return false;
    $signature = hash_hmac('sha256', $parts[0] . '.' . $parts[1], JWT_SECRET, true);
    if (!hash_equals(base64_decode(strtr($parts[2], '-_', '+/') . str_repeat('=', (4 - strlen($parts[2]) % 4) % 4)), $signature)) return false;
    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/') . str_repeat('=', (4 - strlen($parts[1]) % 4) % 4)), true);
    if (empty($payload['exp']) || $payload['exp'] < time()) return false;
    return true;
}

if (!validateToken()) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$current = $input['currentPassword'] ?? '';
$new = $input['newPassword'] ?? '';

if ($current !== APP_USER_PASSWORD) {
    http_response_code(401);
    echo json_encode(['error' => 'Current password is incorrect']);
    exit;
}

if (strlen($new) < 6) {
    http_response_code(400);
    echo json_encode(['error' => 'New password must be at least 6 characters']);
    exit;
}

$path = __DIR__ . '/config.local.php';
$content = file_get_contents($path);
$escapedCurrent = var_export(APP_USER_PASSWORD, true);
$escapedNew = var_export($new, true);
$content = preg_replace(
    "/define\('APP_USER_PASSWORD',\s*" . preg_quote($escapedCurrent, '/') . "\s*\);/",
    "define('APP_USER_PASSWORD', {$escapedNew});",
    $content
);

if (file_put_contents($path, $content) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not update password']);
    exit;
}

if (function_exists('opcache_invalidate')) {
    opcache_invalidate($path, true);
}

echo json_encode(['success' => true]);
