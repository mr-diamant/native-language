<?php
// OpenAI API proxy for Native Language
// This file is never exposed to the browser; keep it outside web root if possible.
// On shared hosting, place it alongside the app and deny direct listing via .htaccess.

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

function validateToken() {
    if (!defined('JWT_SECRET')) return false;
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
$word = trim($input['word'] ?? '');
$count = min(max(intval($input['count'] ?? 3), 1), 5);

if ($word === '' || strlen($word) > 100) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid word']);
    exit;
}

if (!defined('OPENAI_API_KEY') || OPENAI_API_KEY === '') {
    http_response_code(503);
    echo json_encode(['error' => 'OpenAI key not configured']);
    exit;
}

$prompt = "Generate {$count} simple, natural English sentences using the word \"{$word}\". Each sentence should be beginner-friendly (CEFR A1-A2), useful for daily conversation, and include the exact word. Return ONLY a JSON array of strings, no markdown, no explanation.";

$payload = json_encode([
    'model' => 'gpt-4o-mini',
    'messages' => [
        ['role' => 'system', 'content' => 'You are a helpful English tutor. Return valid JSON arrays only.'],
        ['role' => 'user', 'content' => $prompt]
    ],
    'temperature' => 0.7,
    'max_tokens' => 250
]);

$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . OPENAI_API_KEY
    ],
    CURLOPT_TIMEOUT => 15,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_SSL_VERIFYPEER => true,
]);

$response = curl_exec($ch);
$err = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($err || $httpCode >= 400) {
    http_response_code(502);
    echo json_encode(['error' => 'OpenAI request failed', 'details' => $err ?: $response]);
    exit;
}

$data = json_decode($response, true);
$content = $data['choices'][0]['message']['content'] ?? '';

// Extract JSON array from possible markdown fences
if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $content, $matches)) {
    $content = $matches[1];
}

$sentences = json_decode($content, true);
if (!is_array($sentences) || count($sentences) === 0) {
    // Fallback: split by newline and clean
    $sentences = array_values(array_filter(array_map(function($line) {
        $line = trim(preg_replace('/^[-•\d\.\)]*\s*/', '', $line));
        return $line;
    }, explode("\n", $content)), function($line) {
        return strlen($line) > 10;
    }));
}

if (count($sentences) === 0) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not parse sentences']);
    exit;
}

echo json_encode(['sentences' => array_values(array_slice($sentences, 0, $count))]);
