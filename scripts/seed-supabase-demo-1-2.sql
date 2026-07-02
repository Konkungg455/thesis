-- =============================================================================
-- Supabase SQL Editor — ข้อ 1 & 2 จากคอมเมนต์ PDF (รันซ้ำได้บางส่วน)
-- Production ใช้ DATABASE_URL → Supabase pooler (port 6543)
-- ถ้าเพื่อนใส่ข้อมูลแล้ว ข้ามได้ — ใช้ตรวจสอบหรือ environment ใหม่
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1b) แอดมิน **รออนุมัติ (pending)** เหลือ 5 คน — soft-delete ที่เกิน
--     (เก็บ demo.admin01–05 ก่อน แล้วตามด้วยคนที่สมัครเก่าสุด)
--     หรือรัน: npm run db:trim-pending-admins
-- -----------------------------------------------------------------------------
WITH pending_ranked AS (
  SELECT id_account_admin,
         ROW_NUMBER() OVER (
           ORDER BY
             CASE WHEN email_account IN (
               'demo.admin01@telebot-pharmacy.test',
               'demo.admin02@telebot-pharmacy.test',
               'demo.admin03@telebot-pharmacy.test',
               'demo.admin04@telebot-pharmacy.test',
               'demo.admin05@telebot-pharmacy.test'
             ) THEN 0 ELSE 1 END,
             created_at ASC NULLS LAST,
             id_account_admin ASC
         ) AS rn
  FROM account_admin
  WHERE admin_status = 'pending'
    AND (is_deleted IS NULL OR is_deleted = 0)
)
UPDATE account_admin a
SET is_deleted = 1
FROM pending_ranked r
WHERE a.id_account_admin = r.id_account_admin
  AND r.rn > 5;

SELECT id_account_admin, username_account, email_account, admin_status
FROM account_admin
WHERE admin_status = 'pending'
  AND (is_deleted IS NULL OR is_deleted = 0)
ORDER BY created_at;

-- -----------------------------------------------------------------------------
-- 1) แอดมิน demo เหลือ 5 คน (soft-delete แอดมิน @telebot-pharmacy.test ที่เกิน)
--    เก็บ super admin ไว้ — ปรับ email ใน IN (...) ให้ตรงกับ 5 คนที่ต้องการ
-- -----------------------------------------------------------------------------
UPDATE account_admin
SET is_deleted = 1
WHERE (is_deleted IS NULL OR is_deleted = 0)
  AND COALESCE(is_super_admin, 0) = 0
  AND email_account LIKE '%@telebot-pharmacy.test'
  AND email_account NOT IN (
    'demo.admin01@telebot-pharmacy.test',
    'demo.admin02@telebot-pharmacy.test',
    'demo.admin03@telebot-pharmacy.test',
    'demo.admin04@telebot-pharmacy.test',
    'demo.admin05@telebot-pharmacy.test'
  );

-- ตรวจจำนวนแอดมินที่ยังแสดงในระบบ
SELECT id_account_admin, username_account, email_account, is_super_admin, is_deleted
FROM account_admin
WHERE (is_deleted IS NULL OR is_deleted = 0)
ORDER BY id_account_admin;

-- -----------------------------------------------------------------------------
-- 2) ร้านยาสาขาพระราม 9 (กรุงเทพฯ) — อัปเดตร้านที่มีอยู่ หรือเพิ่มใหม่
--    ถ้าเพื่อนใส่แล้ว รันแค่ SELECT ด้านล่างเพื่อตรวจพิกัด
-- -----------------------------------------------------------------------------

-- อัปเดตรายละเอียด+พิกัด ถ้ามีร้านชื่อพระราม 9 อยู่แล้ว
UPDATE phamacy_store_details d
SET
  store_name = COALESCE(NULLIF(TRIM(d.store_name), ''), 'ร้านยาเทเลบอท สาขาพระราม 9'),
  house_no = '55/12',
  road = 'ถนนพระราม 9',
  sub_district = 'ห้วยขวาง',
  district = 'ห้วยขวาง',
  province = 'กรุงเทพมหานคร',
  zipcode = '10310',
  latitude = 13.7590,
  longitude = 100.5650,
  google_maps_url = 'https://maps.google.com/?q=13.7590,100.5650'
FROM phamacy_store_accounts a
WHERE d.id_store_accounts = a.id_store_accounts
  AND a.status = 1
  AND (a.admin_status IS NULL OR a.admin_status = 'approved')
  AND (
    d.store_name ILIKE '%พระราม%9%'
    OR d.road ILIKE '%พระราม%9%'
    OR a.personal_email = 'demo.owner.r9@telebot-pharmacy.test'
  );

-- ตรวจร้านยาในกรุงเทพที่มีพิกัด (ใช้หน้า "ร้านยาใกล้ฉัน")
SELECT
  a.id_store_accounts,
  d.store_name,
  d.road,
  d.sub_district,
  d.province,
  d.latitude,
  d.longitude
FROM phamacy_store_accounts a
JOIN phamacy_store_details d ON d.id_store_accounts = a.id_store_accounts
WHERE a.status = 1
  AND (a.admin_status IS NULL OR a.admin_status = 'approved')
  AND d.province ILIKE '%กรุงเทพ%'
ORDER BY a.id_store_accounts;
