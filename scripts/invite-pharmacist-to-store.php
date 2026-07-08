<?php
/**
 * invite-pharmacist-to-store.php
 * เจ้าของร้านเชิญเภสัชกรที่ยังไม่สังกัดร้าน → เพิ่มเข้าร้านทันที (ไม่ผ่าน pending)
 */
require_once __DIR__ . '/cors.php';
applyVueCors(true);
startVueSession();

$open_connect = 1;
require 'connect.php';
require_once __DIR__ . '/pharma-store-notice-helper.php';

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$id_pharma = (int) ($input['id_pharma'] ?? $_POST['id_pharma'] ?? 0);
$store_id  = (int) ($input['store_id']  ?? $_POST['store_id']  ?? $_SESSION['id_store_accounts'] ?? 0);

if ($id_pharma <= 0 || $store_id <= 0) {
    echo json_encode(['status' => 'error', 'message' => 'ข้อมูลไม่ครบ'], JSON_UNESCAPED_UNICODE);
    exit;
}

$sessionStore = (int) ($_SESSION['id_store_accounts'] ?? 0);
if ($sessionStore > 0 && $sessionStore !== $store_id) {
    echo json_encode(['status' => 'error', 'message' => 'ไม่มีสิทธิ์จัดการร้านนี้'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($sessionStore <= 0 && ($_SESSION['role_account'] ?? '') !== 'admin' && !isset($_SESSION['id_account_admin'])) {
    echo json_encode(['status' => 'error', 'message' => 'กรุณาเข้าสู่ระบบในฐานะเจ้าของร้าน'], JSON_UNESCAPED_UNICODE);
    exit;
}

$storeOk = mysqli_query($connect,
    "SELECT a.id_store_accounts
     FROM phamacy_store_accounts a
     WHERE a.id_store_accounts = $store_id
       AND a.status = 1
       AND (a.admin_status IS NULL OR a.admin_status = 'approved')
     LIMIT 1");
if (!$storeOk || mysqli_num_rows($storeOk) === 0) {
    echo json_encode(['status' => 'error', 'message' => 'ไม่พบร้านยาหรือร้านยังไม่ได้รับการอนุมัติ'], JSON_UNESCAPED_UNICODE);
    exit;
}

$pharmaRes = mysqli_query($connect,
    "SELECT id_pharma, status_verify, id_store, pending_store_id
     FROM pharmacist_account
     WHERE id_pharma = $id_pharma
     LIMIT 1");
$pharma = $pharmaRes ? mysqli_fetch_assoc($pharmaRes) : null;

if (!$pharma) {
    echo json_encode(['status' => 'error', 'message' => 'ไม่พบข้อมูลเภสัชกร'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ((int) ($pharma['status_verify'] ?? 0) !== 1) {
    echo json_encode(['status' => 'error', 'message' => 'เภสัชกรยังไม่ได้รับการอนุมัติจากแอดมิน'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!empty($pharma['id_store']) && (int) $pharma['id_store'] !== $store_id) {
    echo json_encode(['status' => 'error', 'message' => 'เภสัชกรสังกัดร้านอื่นอยู่แล้ว'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!empty($pharma['id_store']) && (int) $pharma['id_store'] === $store_id) {
    echo json_encode(['status' => 'success', 'message' => 'เภสัชกรอยู่ในร้านนี้แล้ว'], JSON_UNESCAPED_UNICODE);
    exit;
}

$storeName = '';
$nameRes = mysqli_query($connect,
    "SELECT store_name FROM phamacy_store_details WHERE id_store_accounts = $store_id LIMIT 1");
if ($nameRes && ($nr = mysqli_fetch_assoc($nameRes))) {
    $storeName = mysqli_real_escape_string($connect, $nr['store_name'] ?? '');
}

$ok = mysqli_query($connect,
    "UPDATE pharmacist_account
     SET id_store = $store_id,
         pending_store_id = NULL,
         store_name = " . ($storeName !== '' ? "'$storeName'" : 'NULL') . "
     WHERE id_pharma = $id_pharma");

if ($ok) {
    setPharmaStoreJoinNotice($connect, $id_pharma);
    echo json_encode([
        'status'  => 'success',
        'message' => 'เพิ่มเภสัชกรเข้าร้านเรียบร้อย ระบบจะแจ้งเตือนเภสัชกรให้ทราบ',
        'store_name' => $storeName,
    ], JSON_UNESCAPED_UNICODE);
} else {
    echo json_encode(['status' => 'error', 'message' => 'อัปเดตข้อมูลไม่สำเร็จ: ' . mysqli_error($connect)], JSON_UNESCAPED_UNICODE);
}

mysqli_close($connect);
