/**
 * เติมรีวิว dummy 10 คน (บัญชี demo + รีวิวในตาราง reviews)
 * ใช้: npm run db:seed-reviews
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEMO_PASSWORD = 'not-for-login';
const DEMO_SALT = 'demo';

const REVIEWS = [
    { firstname: 'สมชาย', lastname: 'ใจดี', rating: 5, comment: 'เป็นแอพที่ดีนะ ใช้งานง่ายมาก' },
    { firstname: 'วิภา', lastname: 'รักสุขภาพ', rating: 5, comment: 'ปรึกษาเภสัชสะดวก ตอบเร็วดีค่ะ' },
    { firstname: 'อนุชา', lastname: 'มีสุข', rating: 5, comment: 'ชอบระบบแชท AI ช่วยสรุปอาการได้ดี' },
    { firstname: 'พิมพ์ใจ', lastname: 'สบายดี', rating: 4, comment: 'โทรหาเภสัชชัดเจน ได้คำแนะนำตรงจุด' },
    { firstname: 'กมล', lastname: 'แสงทอง', rating: 5, comment: 'นัดหมายรวดเร็ว ไม่ต้องรอคิวนาน' },
    { firstname: 'ธนกฤต', lastname: 'วงศ์ไทย', rating: 5, comment: 'UI สวย ใช้บนมือถือลื่นมากครับ' },
    { firstname: 'ศิริพร', lastname: 'ขำใจ', rating: 4, comment: 'บริการดี ราคาเข้าถึงได้' },
    { firstname: 'ประเสริฐ', lastname: 'สุขใจ', rating: 5, comment: 'ได้รับยาตรงอาการ อธิบายละเอียด' },
    { firstname: 'นลิน', lastname: 'พาใจ', rating: 5, comment: 'รีวิวจากใจเลย แนะนำให้คนในครอบครัวใช้' },
    { firstname: 'วีรภัทร', lastname: 'มั่นใจ', rating: 4, comment: 'ใช้แล้วสบายใจ มีเภสัชคอยติดตามอาการ' },
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

function loadEnv() {
    if (!existsSync(envPath)) return;
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (!m) continue;
        const key = m[1].trim();
        if (!process.env[key]) {
            process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('ต้องมี DATABASE_URL ใน .env');
    process.exit(1);
}

const sql = postgres(url, { ssl: 'require', prepare: false, connect_timeout: 20 });

try {
    const seeded = [];

    for (let i = 0; i < REVIEWS.length; i++) {
        const n = String(i + 1).padStart(2, '0');
        const email = `demo.review${n}@telebot-pharmacy.test`;
        const username = `demo_review_${n}`;
        const row = REVIEWS[i];

        let userId;
        const existing = await sql`
            SELECT id_account FROM account
            WHERE email_account = ${email}
            LIMIT 1
        `;

        if (existing[0]) {
            userId = Number(existing[0].id_account);
            await sql`
                UPDATE account SET
                    firstname = ${row.firstname},
                    lastname = ${row.lastname},
                    images_account = COALESCE(NULLIF(TRIM(images_account), ''), 'default.png'),
                    is_deleted = 0
                WHERE id_account = ${userId}
            `;
        } else {
            const inserted = await sql`
                INSERT INTO account (
                    username_account, email_account, password_account, salt_account,
                    firstname, lastname, images_account, gender, old, height, weight, phone_number
                ) VALUES (
                    ${username}, ${email}, ${DEMO_PASSWORD}, ${DEMO_SALT},
                    ${row.firstname}, ${row.lastname}, 'default.png',
                    'ไม่ระบุ', 0, 0, 0, ${`080100${n}`}
                )
                RETURNING id_account
            `;
            userId = Number(inserted[0].id_account);
        }

        const review = await sql`
            INSERT INTO reviews (user_id, rating, comment, created_at)
            VALUES (${userId}, ${row.rating}, ${row.comment}, NOW() - (${i} * INTERVAL '2 hours'))
            RETURNING id, rating, comment
        `;

        seeded.push({
            user_id: userId,
            email,
            name: `${row.firstname} ${row.lastname}`,
            review_id: review[0]?.id,
            rating: review[0]?.rating,
            comment: review[0]?.comment,
        });
    }

    const [{ n: visible }] = await sql`
        SELECT COUNT(*)::int AS n
        FROM reviews r
        INNER JOIN (
            SELECT user_id, MAX(id) AS latest_id
            FROM reviews
            GROUP BY user_id
        ) latest ON latest.user_id = r.user_id AND latest.latest_id = r.id
        JOIN account a ON r.user_id = a.id_account
        WHERE a.email_account LIKE 'demo.review%@telebot-pharmacy.test'
    `;

    console.log(JSON.stringify({
        status: 'success',
        message: `เติมรีวิว dummy ${seeded.length} คน (แสดงในหน้าแรกได้ ${visible} รายการ)`,
        seeded,
        demo_reviews_visible: visible,
    }, null, 2));
} catch (err) {
    console.error(JSON.stringify({ status: 'error', message: err.message }, null, 2));
    process.exit(1);
} finally {
    await sql.end({ timeout: 3 });
}
