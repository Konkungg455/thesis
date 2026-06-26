<?php
/**
 * ack-pharma-store-welcome.php — เภสัชกรกด "รับทราบ" แจ้งเตือนเข้าร้าน
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

$id = (int) $_SESSION['id_pharma'];
ensurePharmaStoreNoticeColumns($connect);
mysqli_query($connect, "UPDATE pharmacist_account SET store_join_ack_at = NOW() WHERE id_pharma = $id");

echo json_encode(['status' => 'success', 'message' => 'รับทราบแล้ว'], JSON_UNESCAPED_UNICODE);
mysqli_close($connect);
