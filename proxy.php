<?php
// Simple HLS/M3U8 CORS proxy for the HTML player.
// Put this file in the same folder as the HTML file.

$url = $_GET['url'] ?? '';
if (!$url || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit('Invalid URL');
}

$parts = parse_url($url);
if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http','https'], true)) {
    http_response_code(400);
    exit('Invalid scheme');
}

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_USERAGENT => 'Mozilla/5.0 HLS Proxy',
    CURLOPT_HTTPHEADER => ['Accept: */*'],
]);
$data = curl_exec($ch);
$type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($data === false || $status >= 400) {
    http_response_code(502);
    exit('Stream unavailable');
}

$isM3u8 = stripos($type, 'mpegurl') !== false || preg_match('/\.m3u8(?:\?|$)/i', $url);
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: *');
header('Cache-Control: no-store');

if ($isM3u8) {
    header('Content-Type: application/vnd.apple.mpegurl');
    $base = $url;
    $base = preg_replace('~/[^/]*$~', '/', $base);

    $lines = preg_split("/\r\n|\r|\n/", $data);
    foreach ($lines as &$line) {
        $trim = trim($line);
        if ($trim === '' || str_starts_with($trim, '#')) continue;
        if (preg_match('~^https?://~i', $trim)) {
            $line = 'proxy.php?url=' . rawurlencode($trim);
        } else {
            $absolute = $base . ltrim($trim, '/');
            $line = 'proxy.php?url=' . rawurlencode($absolute);
        }
    }
    echo implode("\n", $lines);
} else {
    header('Content-Type: ' . ($type ?: 'application/octet-stream'));
    echo $data;
}
