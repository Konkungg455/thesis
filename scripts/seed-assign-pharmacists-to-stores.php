<?php
/**
 * seed-assign-pharmacists-to-stores.php
 * จัดสรรเภสัชกรที่ยังไม่มีร้านสังกัด → ร้านยาที่อนุมัติแล้วและมีพิกัดในกรุงเทพฯ
 * รันซ้ำได้ — อัปเดตเฉพาะคนที่ยังไม่มีร้าน / ร้านไม่ถูกต้อง / ไม่มีชื่อร้าน
 *
 * CLI: php seed-assign-pharmacists-to-stores.php
 * Web: http://localhost/4/seed-assign-pharmacists-to-stores.php
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

/** ร้านยาที่พร้อมรับเภสัช (approved + มีพิกัด) */
$storeRes = mysqli_query($connect,
    "SELECT a.id_store_accounts AS id, d.store_name, d.latitude, d.longitude
     FROM phamacy_store_accounts a
     INNER JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
     WHERE a.status = 1
       AND (a.admin_status IS NULL OR a.admin_status = 'approved')
       AND d.store_name IS NOT NULL AND TRIM(d.store_name) <> ''
       AND d.latitude IS NOT NULL AND d.longitude IS NOT NULL
       AND NOT (d.latitude = 0 AND d.longitude = 0)
     ORDER BY a.id_store_accounts ASC");

$stores = [];
while ($row = mysqli_fetch_assoc($storeRes)) {
    $stores[] = $row;
}

if (count($stores) === 0) {
    echo json_encode([
        'status' => 'error',
        'message' => 'ไม่พบร้านยาที่อนุมัติและมีพิกัด — รัน seed-store-coordinates.php ก่อน',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$validStoreIds = array_map(fn ($s) => (int) $s['id'], $stores);
$validSet = array_flip($validStoreIds);

$pharmaRes = mysqli_query($connect,
    "SELECT p.id_pharma, p.firstname_pharma, p.lastname_pharma,
            p.id_store, p.store_name,
            d.store_name AS detail_name
     FROM pharmacist_account p
     LEFT JOIN phamacy_store_details d ON d.id_store_accounts = p.id_store
     WHERE p.status_verify = 1
     ORDER BY p.id_pharma ASC");

$assigned = [];
$skipped = [];
$storeIdx = 0;
$storeCount = count($stores);

while ($row = mysqli_fetch_assoc($pharmaRes)) {
    $id = (int) $row['id_pharma'];
    $currentStore = $row['id_store'] !== null ? (int) $row['id_store'] : 0;
    $hasValidStore = $currentStore > 0
        && isset($validSet[$currentStore])
        && trim((string) ($row['detail_name'] ?? '')) !== '';

    if ($hasValidStore) {
        $skipped[] = [
            'id_pharma' => $id,
            'name' => trim($row['firstname_pharma'] . ' ' . $row['lastname_pharma']),
            'id_store' => $currentStore,
            'store_name' => $row['detail_name'],
        ];
        continue;
    }

    $target = $stores[$storeIdx % $storeCount];
    $storeIdx++;
    $storeId = (int) $target['id'];
    $storeName = trim((string) $target['store_name']);

    $stmt = mysqli_prepare($connect,
        'UPDATE pharmacist_account SET id_store = ?, store_name = ? WHERE id_pharma = ?');
    mysqli_stmt_bind_param($stmt, 'isi', $storeId, $storeName, $id);
    mysqli_stmt_execute($stmt);

    $assigned[] = [
        'id_pharma' => $id,
        'name' => trim($row['firstname_pharma'] . ' ' . $row['lastname_pharma']),
        'from_store' => $currentStore ?: null,
        'to_store' => $storeId,
        'store_name' => $storeName,
    ];
}

echo json_encode([
    'status' => 'success',
    'message' => 'จัดสรรร้านยาให้เภสัชกรเรียบร้อย',
    'stores_available' => count($stores),
    'assigned_count' => count($assigned),
    'skipped_count' => count($skipped),
    'assigned' => $assigned,
    'skipped_sample' => array_slice($skipped, 0, 5),
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
