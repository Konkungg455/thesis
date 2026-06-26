<?php
/**
 * แจ้งเตือนเภสัชกรเมื่อถูกเพิ่มเข้าร้าน (server-side)
 */
if (!function_exists('ensurePharmaStoreNoticeColumns')) {
    function ensurePharmaStoreNoticeColumns($connect): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        @mysqli_query($connect, 'ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS store_join_notice_at DATETIME NULL DEFAULT NULL');
        @mysqli_query($connect, 'ALTER TABLE pharmacist_account
            ADD COLUMN IF NOT EXISTS store_join_ack_at DATETIME NULL DEFAULT NULL');
        $done = true;
    }

    function setPharmaStoreJoinNotice($connect, int $idPharma): void
    {
        if ($idPharma <= 0) {
            return;
        }
        ensurePharmaStoreNoticeColumns($connect);
        mysqli_query($connect,
            "UPDATE pharmacist_account
             SET store_join_notice_at = NOW(), store_join_ack_at = NULL
             WHERE id_pharma = $idPharma");
    }

    function pharmaWelcomePending(array $row): bool
    {
        $notice = $row['store_join_notice_at'] ?? null;
        if ($notice === null || $notice === '') {
            return false;
        }
        $ack = $row['store_join_ack_at'] ?? null;
        if ($ack === null || $ack === '') {
            return true;
        }
        return strtotime((string) $ack) < strtotime((string) $notice);
    }
}
