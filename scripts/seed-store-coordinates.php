<?php
/**
 * seed-store-coordinates.php — เติมพิกัดจำลองร้านยาในกรุงเทพฯ (รันซ้ำได้)
 * CLI: php seed-store-coordinates.php
 * Web: http://localhost/4/seed-store-coordinates.php
 */
header('Content-Type: application/json; charset=utf-8');

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (!in_array($host, ['localhost', '127.0.0.1'], true) && strpos($host, '192.168.') !== 0) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'localhost only'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$open_connect = 1;
require __DIR__ . '/connect.php';

/** พิกัดจำลองในกรุงเทพฯ — กระจายตามชื่อร้าน / id */
$bangkokCoords = [
    4  => ['lat' => 13.7998000, 'lng' => 100.5501000, 'label' => 'Chatuchak'],
    5  => ['lat' => 13.8051584, 'lng' => 100.7058944, 'label' => 'Khan Na Yao'],
    6  => ['lat' => 13.7223000, 'lng' => 100.5298000, 'label' => 'Sathorn'],
    18 => ['lat' => 13.8167000, 'lng' => 100.6050000, 'label' => 'Lat Phrao'],
    19 => ['lat' => 13.6680000, 'lng' => 100.6300000, 'label' => 'Bang Na'],
    20 => ['lat' => 13.7650000, 'lng' => 100.5690000, 'label' => 'Ratchada'],
];

/** จับคู่จากชื่อร้าน (สำหรับสาขาใหม่หลัง seed) */
$nameCoords = [
    'พระราม 9' => ['lat' => 13.7590000, 'lng' => 100.5650000, 'label' => 'Rama 9'],
    'พระราม9'  => ['lat' => 13.7590000, 'lng' => 100.5650000, 'label' => 'Rama 9'],
    'ลาดพร้าว' => ['lat' => 13.8167000, 'lng' => 100.6050000, 'label' => 'Lat Phrao'],
    'บางนา'    => ['lat' => 13.6680000, 'lng' => 100.6300000, 'label' => 'Bang Na'],
    'รัชดา'    => ['lat' => 13.7650000, 'lng' => 100.5690000, 'label' => 'Ratchada'],
];

$defaultBangkok = ['lat' => 13.7563000, 'lng' => 100.5018000]; // ใจกลางกรุงเทพฯ (พระนคร)

$res = mysqli_query($connect,
    "SELECT a.id_store_accounts AS id, d.store_name, d.latitude, d.longitude, d.province
     FROM phamacy_store_accounts a
     LEFT JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
     WHERE a.status = 1
       AND (a.admin_status IS NULL OR a.admin_status = 'approved')");

$updated = [];
while ($row = mysqli_fetch_assoc($res)) {
    $id = (int) $row['id'];
    $lat = $row['latitude'] !== null && $row['latitude'] !== '' ? (float) $row['latitude'] : null;
    $lng = $row['longitude'] !== null && $row['longitude'] !== '' ? (float) $row['longitude'] : null;
    $needsCoords = ($lat === null || $lng === null || ($lat === 0.0 && $lng === 0.0));

    if (!$needsCoords && isset($bangkokCoords[$id])) {
        continue; // มีพิกัดแล้ว
    }
    if (!$needsCoords && !isset($bangkokCoords[$id])) {
        continue;
    }

    $storeName = (string) ($row['store_name'] ?? '');
    $c = $bangkokCoords[$id] ?? null;
    if (!$c) {
        foreach ($nameCoords as $keyword => $coords) {
            if ($storeName !== '' && mb_strpos($storeName, $keyword) !== false) {
                $c = $coords;
                break;
            }
        }
    }
    $c = $c ?? $defaultBangkok;
    $newLat = $c['lat'];
    $newLng = $c['lng'];
    $maps = "https://maps.google.com/?q={$newLat},{$newLng}";

    $stmt = mysqli_prepare($connect,
        'UPDATE phamacy_store_details
         SET latitude = ?, longitude = ?,
             google_maps_url = COALESCE(NULLIF(google_maps_url, ""), ?),
             province = CASE WHEN province IS NULL OR province = "" OR province = "อ่างทอง" THEN "กรุงเทพมหานคร" ELSE province END
         WHERE id_store_accounts = ?');
    mysqli_stmt_bind_param($stmt, 'ddsi', $newLat, $newLng, $maps, $id);
    mysqli_stmt_execute($stmt);

    $updated[] = [
        'id' => $id,
        'store_name' => $row['store_name'],
        'latitude' => $newLat,
        'longitude' => $newLng,
        'area' => $c['label'] ?? 'Bangkok center',
    ];
}

echo json_encode([
    'status' => 'success',
    'message' => 'เติมพิกัดจำลองกรุงเทพฯ เรียบร้อย',
    'updated_count' => count($updated),
    'stores' => $updated,
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

mysqli_close($connect);
