<?php
// Authentication endpoint for Native Language
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
$input = json_decode(file_get_contents('php://input'), true);
$email = strtolower(trim($input['email'] ?? ''));
$password = $input['password'] ?? '';
if ($email !== APP_USER_EMAIL || $password !== APP_USER_PASSWORD) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid credentials']);
    exit;
}
$header = json_encode(['alg' => 'HS256', 'typ' => 'JWT']);
$now = time();
$payload = json_encode([
    'iss' => 'native-language',
    'sub' => $email,
    'iat' => $now,
    'exp' => $now + 15 * 24 * 60 * 60
]);
function base64UrlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
$signature = hash_hmac('sha256', base64UrlEncode($header) . '.' . base64UrlEncode($payload), JWT_SECRET, true);
$token = base64UrlEncode($header) . '.' . base64UrlEncode($payload) . '.' . base64UrlEncode($signature);
echo json_encode(['token' => $token, 'expiresInDays' => 15]);
