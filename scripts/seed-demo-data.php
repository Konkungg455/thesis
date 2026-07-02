<?php
/**
 * seed-demo-data.php — เติมข้อมูลตัวอย่างสำหรับทดสอบระบบ Telebot Pharmacy
 *
 * ⚠️ Production (Vercel) ใช้ Supabase Postgres ผ่าน DATABASE_URL
 *    ข้อ 1 (แอดมิน) และ ข้อ 2 (ร้านยา พระราม 9) — ใส่ใน Supabase SQL Editor แล้ว
 *    → ดู scripts/seed-supabase-demo-1-2.sql (ไม่ต้องรัน PHP สองส่วนนี้ซ้ำ)
 *
 * รันผ่านเบราว์เซอร์: http://localhost/4/seed-demo-data.php
 * หรือ CLI: php seed-demo-data.php
 *
 * รหัสผ่านทุกบัญชี demo: Demo@1234
 */
header('Content-Type: application/json; charset=utf-8');

$isCli = (php_sapi_name() === 'cli');
if (!$isCli) {
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (!in_array($host, ['localhost', '127.0.0.1'], true) && strpos($host, '192.168.') !== 0) {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'อนุญาตรันได้เฉพาะ localhost/LAN เท่านั้น'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$open_connect = 1;
require __DIR__ . '/connect.php';
date_default_timezone_set('Asia/Bangkok');

const DEMO_PASSWORD = 'Demo@1234';

function demoCreds(): array
{
    $salt = bin2hex(random_bytes(16));
    return [
        'salt' => $salt,
        'hash' => password_hash(DEMO_PASSWORD . $salt, PASSWORD_ARGON2ID),
    ];
}

function demoCredsStore(): array
{
    $salt = bin2hex(random_bytes(16));
    return [
        'salt' => $salt,
        'hash' => password_hash(DEMO_PASSWORD . $salt, PASSWORD_ARGON2ID),
    ];
}

function workTime(array $days, string $start = '08:30', string $end = '17:30'): string
{
    return implode(', ', array_map(
        fn ($d) => "$d ($start-$end)",
        $days
    ));
}

function findByEmail(mysqli $db, string $table, string $col, string $email): ?array
{
    $stmt = mysqli_prepare($db, "SELECT * FROM `$table` WHERE `$col` = ? LIMIT 1");
    mysqli_stmt_bind_param($stmt, 's', $email);
    mysqli_stmt_execute($stmt);
    $row = mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
    return $row ?: null;
}

function upsertUser(mysqli $db, array $u): int
{
    $existing = findByEmail($db, 'account', 'email_account', $u['email']);
    if ($existing) {
        $id = (int) $existing['id_account'];
        $stmt = mysqli_prepare($db, 'UPDATE account SET username_account=?, firstname=?, lastname=?, gender=?, old=?, height=?, weight=?, phone_number=?, personal_disease=? WHERE id_account=?');
        mysqli_stmt_bind_param($stmt, 'ssssiiissi',
            $u['username'], $u['firstname'], $u['lastname'], $u['gender'],
            $u['age'], $u['height'], $u['weight'], $u['phone'], $u['disease'], $id
        );
        mysqli_stmt_execute($stmt);
        return $id;
    }

    $c = demoCreds();
    $stmt = mysqli_prepare($db, 'INSERT INTO account (username_account, email_account, password_account, salt_account, firstname, lastname, gender, old, height, weight, phone_number, personal_disease, images_account) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $img = 'default.png';
    mysqli_stmt_bind_param($stmt, 'sssssssiiisss',
        $u['username'], $u['email'], $c['hash'], $c['salt'],
        $u['firstname'], $u['lastname'], $u['gender'],
        $u['age'], $u['height'], $u['weight'], $u['phone'], $u['disease'], $img
    );
    mysqli_stmt_execute($stmt);
    return (int) mysqli_insert_id($db);
}

function upsertUserAddress(mysqli $db, int $userId, array $a): void
{
    $stmt = mysqli_prepare($db, 'INSERT INTO account_address (id_account, house_no, road, sub_district, district, province, zipcode)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE house_no=VALUES(house_no), road=VALUES(road), sub_district=VALUES(sub_district),
            district=VALUES(district), province=VALUES(province), zipcode=VALUES(zipcode), updated_at=NOW()');
    mysqli_stmt_bind_param($stmt, 'issssss',
        $userId, $a['house_no'], $a['road'], $a['sub_district'], $a['district'], $a['province'], $a['zipcode']
    );
    mysqli_stmt_execute($stmt);
}

function upsertStore(mysqli $db, array $s): int
{
    $existing = findByEmail($db, 'phamacy_store_accounts', 'personal_email', $s['email']);
    if ($existing) {
        $id = (int) $existing['id_store_accounts'];
        $stmt = mysqli_prepare($db, 'UPDATE phamacy_store_accounts SET username=?, firstname=?, lastname=?, personal_phone=?, status=1, admin_status=?, admin_reviewed_at=NOW() WHERE id_store_accounts=?');
        if (!$stmt) throw new RuntimeException('store update prepare: ' . mysqli_error($db));
        mysqli_stmt_bind_param($stmt, 'sssssi',
            $s['username'], $s['firstname'], $s['lastname'], $s['phone'], $s['admin_status'], $id
        );
        if (!mysqli_stmt_execute($stmt)) throw new RuntimeException('store update: ' . mysqli_stmt_error($stmt));
    } else {
        $c = demoCredsStore();
        $license = 'license_69c517754e074.png';
        $stmt = mysqli_prepare($db, 'INSERT INTO phamacy_store_accounts (username, password, salt_store, firstname, lastname, personal_phone, personal_email, license_file, status, admin_status, admin_reviewed_at) VALUES (?,?,?,?,?,?,?,?,1,?,NOW())');
        if (!$stmt) throw new RuntimeException('store insert prepare: ' . mysqli_error($db));
        mysqli_stmt_bind_param($stmt, 'sssssssss',
            $s['username'], $c['hash'], $c['salt'], $s['firstname'], $s['lastname'],
            $s['phone'], $s['email'], $license, $s['admin_status']
        );
        if (!mysqli_stmt_execute($stmt)) throw new RuntimeException('store insert: ' . mysqli_stmt_error($stmt));
        $id = (int) mysqli_insert_id($db);
    }

    $d = $s['details'];
    $chk = mysqli_prepare($db, 'SELECT id_store_details FROM phamacy_store_details WHERE id_store_accounts = ? LIMIT 1');
    mysqli_stmt_bind_param($chk, 'i', $id);
    mysqli_stmt_execute($chk);
    $has = mysqli_fetch_assoc(mysqli_stmt_get_result($chk));

    if ($has) {
        $stmt = mysqli_prepare($db, 'UPDATE phamacy_store_details SET store_name=?, house_no=?, road=?, sub_district=?, district=?, province=?, zipcode=?, store_phone=?, store_email=?, google_maps_url=?, latitude=?, longitude=? WHERE id_store_accounts=?');
        if (!$stmt) throw new RuntimeException('store det update prepare: ' . mysqli_error($db));
        mysqli_stmt_bind_param($stmt, 'ssssssssssddi',
            $d['store_name'], $d['house_no'], $d['road'], $d['sub_district'], $d['district'],
            $d['province'], $d['zipcode'], $d['store_phone'], $d['store_email'],
            $d['google_maps_url'], $d['latitude'], $d['longitude'], $id
        );
    } else {
        $stmt = mysqli_prepare($db, 'INSERT INTO phamacy_store_details (id_store_accounts, store_name, house_no, road, sub_district, district, province, zipcode, store_phone, store_email, google_maps_url, latitude, longitude) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        if (!$stmt) throw new RuntimeException('store det insert prepare: ' . mysqli_error($db));
        mysqli_stmt_bind_param($stmt, 'issssssssssdd',
            $id, $d['store_name'], $d['house_no'], $d['road'], $d['sub_district'], $d['district'],
            $d['province'], $d['zipcode'], $d['store_phone'], $d['store_email'],
            $d['google_maps_url'], $d['latitude'], $d['longitude']
        );
    }
    if (!mysqli_stmt_execute($stmt)) throw new RuntimeException('store det save: ' . mysqli_stmt_error($stmt));

    setStoreSchedule($db, $id, $s['schedule']);
    return $id;
}

function setStoreSchedule(mysqli $db, int $storeId, array $rows): void
{
    foreach ($rows as $row) {
        $day = $row['day'];
        $open = $row['open'];
        $close = $row['close'];
        $isOpen = (int) ($row['is_open'] ?? 1);
        $dayEsc = mysqli_real_escape_string($db, $day);
        $exists = mysqli_query($db, "SELECT id FROM store_schedule WHERE id_store = $storeId AND day_of_week = '$dayEsc' LIMIT 1");
        if ($exists && mysqli_num_rows($exists) > 0) {
            mysqli_query($db, "UPDATE store_schedule SET open_time='$open', close_time='$close', is_open=$isOpen WHERE id_store=$storeId AND day_of_week='$dayEsc'");
        } else {
            mysqli_query($db, "INSERT INTO store_schedule (id_store, day_of_week, open_time, close_time, is_open) VALUES ($storeId, '$dayEsc', '$open', '$close', $isOpen)");
        }
    }
}

function upsertPharmacist(mysqli $db, array $p, ?int $storeId): int
{
    $existing = findByEmail($db, 'pharmacist_account', 'email_pharma', $p['email']);
    $storeName = $p['store_name'] ?? null;
    $license = 'license_69ce44ed3b232.png';

    if ($existing) {
        $id = (int) $existing['id_pharma'];
        $stmt = mysqli_prepare($db, 'UPDATE pharmacist_account SET username_pharma=?, firstname_pharma=?, lastname_pharma=?, gender_pharma=?, age_pharma=?, phone_pharma=?, work_time=?, id_store=?, store_name=?, status_verify=1 WHERE id_pharma=?');
        mysqli_stmt_bind_param($stmt, 'ssssissisi',
            $p['username'], $p['firstname'], $p['lastname'], $p['gender'], $p['age'],
            $p['phone'], $p['work_time'], $storeId, $storeName, $id
        );
        mysqli_stmt_execute($stmt);
        return $id;
    }

    $c = demoCreds();
    $stmt = mysqli_prepare($db, 'INSERT INTO pharmacist_account (username_pharma, email_pharma, password_pharma, salt_pharma, firstname_pharma, lastname_pharma, gender_pharma, age_pharma, height_pharma, weight_pharma, phone_pharma, work_time, license_image, id_store, store_name, images_pharma, status_verify) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)');
    $h = 170;
    $w = 65;
    $img = 'default.png';
    mysqli_stmt_bind_param($stmt, 'sssssssiiisssiss',
        $p['username'], $p['email'], $c['hash'], $c['salt'],
        $p['firstname'], $p['lastname'], $p['gender'], $p['age'],
        $h, $w, $p['phone'], $p['work_time'], $license, $storeId, $storeName, $img
    );
    mysqli_stmt_execute($stmt);
    return (int) mysqli_insert_id($db);
}

function upsertAdmin(mysqli $db, array $a, bool $isSuper = false): int
{
    $existing = findByEmail($db, 'account_admin', 'email_account', $a['email']);
    $super = $isSuper ? 1 : 0;

    if ($existing) {
        $id = (int) $existing['id_account_admin'];
        $stmt = mysqli_prepare($db, 'UPDATE account_admin SET username_account=?, firstname=?, lastname=?, gender=?, old=?, phone_number=?, admin_status=?, is_super_admin=?, is_deleted=0, admin_reviewed_at=NOW() WHERE id_account_admin=?');
        mysqli_stmt_bind_param($stmt, 'ssssissii',
            $a['username'], $a['firstname'], $a['lastname'], $a['gender'],
            $a['age'], $a['phone'], $a['admin_status'], $super, $id
        );
        mysqli_stmt_execute($stmt);
        return $id;
    }

    $c = demoCreds();
    $img = 'default.png';
    $stmt = mysqli_prepare($db, 'INSERT INTO account_admin (username_account, email_account, password_account, salt_account, firstname, lastname, gender, old, phone_number, images_account, admin_status, is_super_admin, is_deleted, admin_reviewed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,NOW())');
    mysqli_stmt_bind_param($stmt, 'sssssssisssi',
        $a['username'], $a['email'], $c['hash'], $c['salt'],
        $a['firstname'], $a['lastname'], $a['gender'], $a['age'],
        $a['phone'], $img, $a['admin_status'], $super
    );
    mysqli_stmt_execute($stmt);
    return (int) mysqli_insert_id($db);
}

/** เหลือแอดมิน pending 5 คน — soft-delete ที่เกิน */
function trimPendingAdmins(mysqli $db, int $keep = 5): int
{
    $demoList = [
        'demo.admin01@telebot-pharmacy.test',
        'demo.admin02@telebot-pharmacy.test',
        'demo.admin03@telebot-pharmacy.test',
        'demo.admin04@telebot-pharmacy.test',
        'demo.admin05@telebot-pharmacy.test',
    ];
    $inDemo = "'" . implode("','", array_map(fn ($e) => mysqli_real_escape_string($db, $e), $demoList)) . "'";
    $sql = "UPDATE account_admin a
            INNER JOIN (
                SELECT id_account_admin,
                       ROW_NUMBER() OVER (
                           ORDER BY
                               CASE WHEN email_account IN ($inDemo) THEN 0 ELSE 1 END,
                               created_at ASC,
                               id_account_admin ASC
                       ) AS rn
                FROM account_admin
                WHERE admin_status = 'pending'
                  AND (is_deleted IS NULL OR is_deleted = 0)
            ) r ON r.id_account_admin = a.id_account_admin
            SET a.is_deleted = 1
            WHERE r.rn > $keep";
    mysqli_query($db, $sql);
    return mysqli_affected_rows($db);
}

/** เหลือแอดมิน demo 5 คน — soft-delete แอดมิน demo เกิน */
function trimDemoAdmins(mysqli $db, array $keepEmails): int
{
    if (!$keepEmails) return 0;
    $placeholders = implode(',', array_fill(0, count($keepEmails), '?'));
    $types = str_repeat('s', count($keepEmails));
    $sql = "UPDATE account_admin SET is_deleted = 1
            WHERE (is_deleted IS NULL OR is_deleted = 0)
              AND is_super_admin = 0
              AND email_account NOT IN ($placeholders)
              AND email_account LIKE '%@telebot-pharmacy.test'";
    $stmt = mysqli_prepare($db, $sql);
    mysqli_stmt_bind_param($stmt, $types, ...$keepEmails);
    mysqli_stmt_execute($stmt);
    return mysqli_affected_rows($db);
}

$weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
$allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

$defaultSchedule = [
    ['day' => 'Mon', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
    ['day' => 'Tue', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
    ['day' => 'Wed', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
    ['day' => 'Thu', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
    ['day' => 'Fri', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
    ['day' => 'Sat', 'open' => '09:00', 'close' => '18:00', 'is_open' => 1],
    ['day' => 'Sun', 'open' => '09:00', 'close' => '17:00', 'is_open' => 1],
];

$stores = [
    [
        'username' => 'demo_owner_bkk',
        'firstname' => 'สมชาย',
        'lastname' => 'ร้านดี',
        'phone' => '0812345001',
        'email' => 'demo.owner.bkk@telebot-pharmacy.test',
        'admin_status' => 'approved',
        'details' => [
            'store_name' => 'ร้านยาเทเลบอท สาขาลาดพร้าว',
            'house_no' => '128/4',
            'road' => 'ถนนลาดพร้าว ซอย 101',
            'sub_district' => 'ลาดพร้าว',
            'district' => 'ลาดพร้าว',
            'province' => 'กรุงเทพมหานคร',
            'zipcode' => '10230',
            'store_phone' => '021234567',
            'store_email' => 'ladprao@telebot-pharmacy.test',
            'google_maps_url' => 'https://maps.google.com/?q=13.8167,100.6050',
            'latitude' => 13.8167000,
            'longitude' => 100.6050000,
        ],
        'schedule' => $defaultSchedule,
    ],
    [
        'username' => 'demo_owner_cnx',
        'firstname' => 'วิชัย',
        'lastname' => 'บางนายา',
        'phone' => '0812345002',
        'email' => 'demo.owner.cnx@telebot-pharmacy.test',
        'admin_status' => 'approved',
        'details' => [
            'store_name' => 'ร้านยาเทเลบอท สาขาบางนา',
            'house_no' => '88',
            'road' => 'ถนนบางนา-ตราด กม.3',
            'sub_district' => 'บางนาเหนือ',
            'district' => 'บางนา',
            'province' => 'กรุงเทพมหานคร',
            'zipcode' => '10260',
            'store_phone' => '021345678',
            'store_email' => 'bangna@telebot-pharmacy.test',
            'google_maps_url' => 'https://maps.google.com/?q=13.6680,100.6300',
            'latitude' => 13.6680000,
            'longitude' => 100.6300000,
        ],
        'schedule' => [
            ['day' => 'Mon', 'open' => '08:30', 'close' => '19:30', 'is_open' => 1],
            ['day' => 'Tue', 'open' => '08:30', 'close' => '19:30', 'is_open' => 1],
            ['day' => 'Wed', 'open' => '08:30', 'close' => '19:30', 'is_open' => 1],
            ['day' => 'Thu', 'open' => '08:30', 'close' => '19:30', 'is_open' => 1],
            ['day' => 'Fri', 'open' => '08:30', 'close' => '19:30', 'is_open' => 1],
            ['day' => 'Sat', 'open' => '09:00', 'close' => '17:00', 'is_open' => 1],
            ['day' => 'Sun', 'open' => '00:00', 'close' => '00:00', 'is_open' => 0],
        ],
    ],
    [
        'username' => 'demo_owner_kkc',
        'firstname' => 'มานี',
        'lastname' => 'รัชดายา',
        'phone' => '0812345003',
        'email' => 'demo.owner.kkc@telebot-pharmacy.test',
        'admin_status' => 'approved',
        'details' => [
            'store_name' => 'ร้านยาเทเลบอท สาขารัชดาภิเษก',
            'house_no' => '210',
            'road' => 'ถนนรัชดาภิเษก',
            'sub_district' => 'ดินแดง',
            'district' => 'ดินแดง',
            'province' => 'กรุงเทพมหานคร',
            'zipcode' => '10400',
            'store_phone' => '022345678',
            'store_email' => 'ratchada@telebot-pharmacy.test',
            'google_maps_url' => 'https://maps.google.com/?q=13.7650,100.5690',
            'latitude' => 13.7650000,
            'longitude' => 100.5690000,
        ],
        'schedule' => [
            ['day' => 'Mon', 'open' => '07:30', 'close' => '21:00', 'is_open' => 1],
            ['day' => 'Tue', 'open' => '07:30', 'close' => '21:00', 'is_open' => 1],
            ['day' => 'Wed', 'open' => '07:30', 'close' => '21:00', 'is_open' => 1],
            ['day' => 'Thu', 'open' => '07:30', 'close' => '21:00', 'is_open' => 1],
            ['day' => 'Fri', 'open' => '07:30', 'close' => '21:00', 'is_open' => 1],
            ['day' => 'Sat', 'open' => '08:00', 'close' => '20:00', 'is_open' => 1],
            ['day' => 'Sun', 'open' => '08:00', 'close' => '18:00', 'is_open' => 1],
        ],
    ],
    [
        'username' => 'demo_owner_r9',
        'firstname' => 'สุภา',
        'lastname' => 'พระรามเก้า',
        'phone' => '0812345004',
        'email' => 'demo.owner.r9@telebot-pharmacy.test',
        'admin_status' => 'approved',
        'details' => [
            'store_name' => 'ร้านยาเทเลบอท สาขาพระราม 9',
            'house_no' => '55/12',
            'road' => 'ถนนพระราม 9',
            'sub_district' => 'ห้วยขวาง',
            'district' => 'ห้วยขวาง',
            'province' => 'กรุงเทพมหานคร',
            'zipcode' => '10310',
            'store_phone' => '022456789',
            'store_email' => 'rama9@telebot-pharmacy.test',
            'google_maps_url' => 'https://maps.google.com/?q=13.7590,100.5650',
            'latitude' => 13.7590000,
            'longitude' => 100.5650000,
        ],
        'schedule' => $defaultSchedule,
    ],
];

$users = [
    ['username' => 'demo_user01', 'email' => 'demo.user01@telebot-pharmacy.test', 'firstname' => 'สมหญิง', 'lastname' => 'รักสุข', 'gender' => 'หญิง', 'age' => 28, 'height' => 162, 'weight' => 55, 'phone' => '0891000001', 'disease' => 'ไม่มี', 'address' => ['house_no' => '99/1', 'road' => 'ซอยรามคำแหง 24', 'sub_district' => 'หัวหมาก', 'district' => 'บางกะปิ', 'province' => 'กรุงเทพมหานคร', 'zipcode' => '10240']],
    ['username' => 'demo_user02', 'email' => 'demo.user02@telebot-pharmacy.test', 'firstname' => 'วิชัย', 'lastname' => 'ใจดี', 'gender' => 'ชาย', 'age' => 35, 'height' => 175, 'weight' => 72, 'phone' => '0891000002', 'disease' => 'ความดันโลหิตสูง', 'address' => ['house_no' => '12', 'road' => 'ถนนสุขุมวิท', 'sub_district' => 'คลองตัน', 'district' => 'คลองเตย', 'province' => 'กรุงเทพมหานคร', 'zipcode' => '10110']],
    ['username' => 'demo_user03', 'email' => 'demo.user03@telebot-pharmacy.test', 'firstname' => 'มานี', 'lastname' => 'มีสุข', 'gender' => 'หญิง', 'age' => 42, 'height' => 158, 'weight' => 60, 'phone' => '0891000003', 'disease' => 'เบาหวาน', 'address' => ['house_no' => '45', 'road' => 'ถนนพระราม 9', 'sub_district' => 'ห้วยขวาง', 'district' => 'ห้วยขวาง', 'province' => 'กรุงเทพมหานคร', 'zipcode' => '10310']],
    ['username' => 'demo_user04', 'email' => 'demo.user04@telebot-pharmacy.test', 'firstname' => 'ประเสริฐ', 'lastname' => 'สุขใจ', 'gender' => 'ชาย', 'age' => 50, 'height' => 168, 'weight' => 68, 'phone' => '0891000004', 'disease' => 'ไม่มี', 'address' => ['house_no' => '78', 'road' => 'ถนนจรัญสนิทวงศ์', 'sub_district' => 'บางขุนศรี', 'district' => 'บางกอกน้อย', 'province' => 'กรุงเทพมหานคร', 'zipcode' => '10700']],
    ['username' => 'demo_user05', 'email' => 'demo.user05@telebot-pharmacy.test', 'firstname' => 'พิมพ์ใจ', 'lastname' => 'สุขภาพดี', 'gender' => 'หญิง', 'age' => 24, 'height' => 165, 'weight' => 52, 'phone' => '0891000005', 'disease' => 'ภูมิแพ้', 'address' => ['house_no' => '33/2', 'road' => 'ซอยลาดพร้าว 80', 'sub_district' => 'ลาดพร้าว', 'district' => 'ลาดพร้าว', 'province' => 'กรุงเทพมหานคร', 'zipcode' => '10230']],
];

mysqli_begin_transaction($connect);
$summary = ['password' => DEMO_PASSWORD, 'stores' => [], 'users' => [], 'pharmacists' => [], 'admins' => []];

try {
    $demoAdminEmails = [];
    $admins = [
        ['username' => 'demo_admin01', 'email' => 'demo.admin01@telebot-pharmacy.test', 'firstname' => 'อรุณ', 'lastname' => 'บริหารดี', 'gender' => 'ชาย', 'age' => 38, 'phone' => '0813000001', 'admin_status' => 'approved', 'super' => true],
        ['username' => 'demo_admin02', 'email' => 'demo.admin02@telebot-pharmacy.test', 'firstname' => 'พิมพ์ใจ', 'lastname' => 'ดูแลระบบ', 'gender' => 'หญิง', 'age' => 34, 'phone' => '0813000002', 'admin_status' => 'approved', 'super' => false],
        ['username' => 'demo_admin03', 'email' => 'demo.admin03@telebot-pharmacy.test', 'firstname' => 'วิชัย', 'lastname' => 'ตรวจสอบ', 'gender' => 'ชาย', 'age' => 41, 'phone' => '0813000003', 'admin_status' => 'approved', 'super' => false],
        ['username' => 'demo_admin04', 'email' => 'demo.admin04@telebot-pharmacy.test', 'firstname' => 'มานี', 'lastname' => 'อนุมัติ', 'gender' => 'หญิง', 'age' => 29, 'phone' => '0813000004', 'admin_status' => 'approved', 'super' => false],
        ['username' => 'demo_admin05', 'email' => 'demo.admin05@telebot-pharmacy.test', 'firstname' => 'ประเสริฐ', 'lastname' => 'สนับสนุน', 'gender' => 'ชาย', 'age' => 36, 'phone' => '0813000005', 'admin_status' => 'approved', 'super' => false],
    ];
    foreach ($admins as $a) {
        $isSuper = !empty($a['super']);
        unset($a['super']);
        $demoAdminEmails[] = $a['email'];
        $id = upsertAdmin($connect, $a, $isSuper);
        $summary['admins'][] = [
            'id' => $id,
            'username' => $a['username'],
            'email' => $a['email'],
            'name' => $a['firstname'] . ' ' . $a['lastname'],
            'is_super_admin' => $isSuper,
        ];
    }
    $trimmed = trimDemoAdmins($connect, $demoAdminEmails);
    $summary['admins_trimmed'] = $trimmed;
    $summary['pending_trimmed'] = trimPendingAdmins($connect, 5);

    $storeIds = [];
    foreach ($stores as $s) {
        $id = upsertStore($connect, $s);
        $storeIds[$s['username']] = $id;
        $summary['stores'][] = [
            'id' => $id,
            'username' => $s['username'],
            'store_name' => $s['details']['store_name'],
            'email' => $s['email'],
            'province' => $s['details']['province'],
            'login' => 'เจ้าของร้าน — อีเมล: ' . $s['email'],
        ];
    }

    foreach ($users as $u) {
        $addr = $u['address'];
        unset($u['address']);
        $id = upsertUser($connect, $u);
        upsertUserAddress($connect, $id, $addr);
        $summary['users'][] = [
            'id' => $id,
            'username' => $u['username'],
            'name' => $u['firstname'] . ' ' . $u['lastname'],
            'email' => $u['email'],
            'province' => $addr['province'],
        ];
    }

    $pharmacists = [
        ['username' => 'demo_pharma01', 'email' => 'demo.pharma01@telebot-pharmacy.test', 'firstname' => 'สมศักดิ์', 'lastname' => 'เภสัชดี', 'gender' => 'M', 'age' => 32, 'phone' => '0822000001', 'work_time' => workTime($weekdays, '08:30', '17:30'), 'store_key' => 'demo_owner_bkk'],
        ['username' => 'demo_pharma02', 'email' => 'demo.pharma02@telebot-pharmacy.test', 'firstname' => 'ปิยะดา', 'lastname' => 'ใจเย็น', 'gender' => 'F', 'age' => 29, 'phone' => '0822000002', 'work_time' => workTime($weekdays, '09:00', '18:00'), 'store_key' => 'demo_owner_bkk'],
        ['username' => 'demo_pharma03', 'email' => 'demo.pharma03@telebot-pharmacy.test', 'firstname' => 'อนุชา', 'lastname' => 'รักษาดี', 'gender' => 'M', 'age' => 38, 'phone' => '0822000003', 'work_time' => workTime(array_merge($weekdays, ['Saturday']), '08:00', '16:00'), 'store_key' => 'demo_owner_bkk'],
        ['username' => 'demo_pharma04', 'email' => 'demo.pharma04@telebot-pharmacy.test', 'firstname' => 'นภา', 'lastname' => 'สุขภาพดี', 'gender' => 'F', 'age' => 34, 'phone' => '0822000004', 'work_time' => workTime($weekdays, '08:30', '17:00'), 'store_key' => 'demo_owner_cnx'],
        ['username' => 'demo_pharma05', 'email' => 'demo.pharma05@telebot-pharmacy.test', 'firstname' => 'กิตติ', 'lastname' => 'ยาดี', 'gender' => 'M', 'age' => 41, 'phone' => '0822000005', 'work_time' => workTime($allDays, '10:00', '19:00'), 'store_key' => 'demo_owner_cnx'],
        ['username' => 'demo_pharma06', 'email' => 'demo.pharma06@telebot-pharmacy.test', 'firstname' => 'พิมพ์ใจ', 'lastname' => 'เภสัชกร', 'gender' => 'F', 'age' => 27, 'phone' => '0822000006', 'work_time' => workTime($weekdays, '08:00', '17:00'), 'store_key' => 'demo_owner_kkc'],
        ['username' => 'demo_pharma07', 'email' => 'demo.pharma07@telebot-pharmacy.test', 'firstname' => 'ชัยวัฒน์', 'lastname' => 'แพทย์ดี', 'gender' => 'M', 'age' => 45, 'phone' => '0822000007', 'work_time' => workTime(array_merge($weekdays, ['Saturday']), '07:30', '16:30'), 'store_key' => 'demo_owner_kkc'],
        ['username' => 'demo_pharma08', 'email' => 'demo.pharma08@telebot-pharmacy.test', 'firstname' => 'ศิริพร', 'lastname' => 'ว่องไว', 'gender' => 'F', 'age' => 31, 'phone' => '0822000008', 'work_time' => workTime($weekdays, '13:00', '22:00'), 'store_key' => 'demo_owner_r9'],
        ['username' => 'demo_pharma09', 'email' => 'demo.pharma09@telebot-pharmacy.test', 'firstname' => 'ธนากร', 'lastname' => 'ปรึกษาดี', 'gender' => 'M', 'age' => 36, 'phone' => '0822000009', 'work_time' => workTime($weekdays, '08:00', '16:00'), 'store_key' => 'demo_owner_r9'],
    ];

    foreach ($pharmacists as $p) {
        $storeKey = $p['store_key'];
        unset($p['store_key']);
        $storeId = $storeKey ? ($storeIds[$storeKey] ?? null) : null;
        $storeName = null;
        if ($storeId) {
            foreach ($stores as $s) {
                if (($storeIds[$s['username']] ?? null) === $storeId) {
                    $storeName = $s['details']['store_name'];
                    break;
                }
            }
        }
        $p['store_name'] = $storeName;
        $id = upsertPharmacist($connect, $p, $storeId);
        $summary['pharmacists'][] = [
            'id' => $id,
            'username' => $p['username'],
            'name' => 'ภก. ' . $p['firstname'] . ' ' . $p['lastname'],
            'email' => $p['email'],
            'store_name' => $storeName ?: '(ยังไม่สังกัดร้าน)',
            'work_time' => $p['work_time'],
        ];
    }

    mysqli_commit($connect);
    echo json_encode([
        'status' => 'success',
        'message' => 'เติมข้อมูลตัวอย่างสำเร็จ — รหัสผ่านทุกบัญชี: ' . DEMO_PASSWORD,
        'summary' => $summary,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (Throwable $e) {
    mysqli_rollback($connect);
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage(),
    ], JSON_UNESCAPED_UNICODE);
}

mysqli_close($connect);
