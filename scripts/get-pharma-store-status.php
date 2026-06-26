<?php
/**
 * get-pharma-store-status.php — สถานะร้านที่เภสัชสังกัด + แจ้งเตือนเข้าร้าน
 * state: active | pending | unassigned
 */
require_once __DIR__ . '/cors.php';
applyVueCors(true);
startVueSession();

$open_connect = 1;
require 'connect.php';
require_once __DIR__ . '/pharma-store-notice-helper.php';

$role = $_SESSION['role'] ?? '';
if (!isset($_SESSION['id_pharma']) || !in_array($role, ['pharmacist', 'pharmacy'], true)) {
    echo json_encode(['status' => 'error', 'message' => 'ไม่ใช่บัญชีเภสัชกร'], JSON_UNESCAPED_UNICODE);
    exit;
}

ensurePharmaStoreNoticeColumns($connect);

$id = (int) $_SESSION['id_pharma'];
$res = mysqli_query($connect,
    "SELECT p.id_store, p.pending_store_id,
            p.store_join_notice_at, p.store_join_ack_at,
            d1.store_name AS current_store_name,
            d2.store_name AS pending_store_name
     FROM pharmacist_account p
     LEFT JOIN phamacy_store_details d1 ON d1.id_store_accounts = p.id_store
     LEFT JOIN phamacy_store_details d2 ON d2.id_store_accounts = p.pending_store_id
     WHERE p.id_pharma = $id
     LIMIT 1");

$row = $res ? mysqli_fetch_assoc($res) : null;
if (!$row) {
    echo json_encode(['status' => 'error', 'message' => 'ไม่พบข้อมูล'], JSON_UNESCAPED_UNICODE);
    exit;
}

$welcomePending = pharmaWelcomePending($row);
$pendingId = $row['pending_store_id'] !== null ? (int) $row['pending_store_id'] : 0;
$storeId   = $row['id_store'] !== null ? (int) $row['id_store'] : 0;

$base = ['welcome_pending' => $welcomePending];

if ($pendingId > 0) {
    $label = $row['pending_store_name'] ?: "ร้าน #$pendingId";
    echo json_encode(array_merge($base, [
        'status'     => 'success',
        'state'      => 'pending',
        'store_name' => $label,
        'message'    => "กำลังรอเจ้าของร้าน \"$label\" อนุมัติคำขอเข้าร้าน",
    ]), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($storeId > 0) {
    $label = $row['current_store_name'] ?: "ร้าน #$storeId";
    echo json_encode(array_merge($base, [
        'status'     => 'success',
        'state'      => 'active',
        'store_name' => $label,
        'store_id'   => $storeId,
        'message'    => "คุณกำลังทำงานที่ \"$label\"",
    ]), JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(array_merge($base, [
    'status'     => 'success',
    'state'      => 'unassigned',
    'store_name' => '',
    'message'    => 'คุณยังไม่ได้สังกัดร้านยา — รอเจ้าของร้ายเชิญเข้าร้าน',
]), JSON_UNESCAPED_UNICODE);

mysqli_close($connect);
