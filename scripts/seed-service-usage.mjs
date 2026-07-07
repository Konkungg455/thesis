/**
 * ซิงก์ service_usage จาก consult_requests จริง + สร้าง mock 20 รายการใน Supabase
 * ใช้: npm run db:seed-service-usage
 *      npm run db:seed-service-usage -- --mock-only=20
 *      npm run db:seed-service-usage -- --backfill-only
 */
import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MOCK = 20;

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

function parseArgs() {
    const out = { mockCount: DEFAULT_MOCK, backfillOnly: false, mockOnly: false };
    for (const arg of process.argv.slice(2)) {
        if (arg === '--backfill-only') out.backfillOnly = true;
        const mockMatch = arg.match(/^--mock(?:-only)?=(\d+)$/);
        if (mockMatch) {
            out.mockCount = Math.max(1, Number(mockMatch[1]) || DEFAULT_MOCK);
            if (arg.startsWith('--mock-only')) out.mockOnly = true;
        }
    }
    return out;
}

function mapServiceStatus(status) {
    switch (String(status || '').trim()) {
        case 'waiting': return 'pending';
        case 'accepted': return 'in_progress';
        case 'completed': return 'completed';
        case 'cancelled':
        case 'rejected': return 'cancelled';
        default: return 'pending';
    }
}

function mapServiceFormat(method) {
    const m = String(method || '').toLowerCase();
    return (m === 'in_store' || m === 'store') ? 'in_store' : 'online';
}

function buildServiceCode(consultId, existingCode = '') {
    const preset = String(existingCode || '').trim();
    if (preset) return preset.slice(0, 32);
    return `SRV-${String(consultId).padStart(3, '0')}`.slice(0, 32);
}

async function syncServiceUsageForConsult(sql, consultId) {
    if (consultId <= 0) return 'skip';

    const rows = await sql`
        SELECT cr.id, cr.id_account, cr.id_pharma, cr.status, cr.privilege,
               cr.consult_method, cr.booking_type, cr.delivery_prepaid, cr.created_at,
               TRIM(CONCAT(COALESCE(a.firstname, ''), ' ', COALESCE(a.lastname, ''))) AS account_full_name,
               COALESCE(NULLIF(TRIM(a.username_account), ''), '') AS account_username,
               TRIM(CONCAT(COALESCE(p.firstname_pharma, ''), ' ', COALESCE(p.lastname_pharma, ''))) AS pharma_full_name,
               COALESCE(NULLIF(TRIM(p.username_pharma), ''), '') AS pharma_username
        FROM consult_requests cr
        LEFT JOIN account a ON a.id_account = cr.id_account
        LEFT JOIN pharmacist_account p ON p.id_pharma = cr.id_pharma
        WHERE cr.id = ${consultId}
          AND COALESCE(cr.is_deleted, 0) = 0
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return 'skip';

    const serviceStatus = mapServiceStatus(row.status);
    const userName = String(row.account_full_name || '').trim()
        || String(row.account_username || '').trim()
        || `ผู้ใช้ #${Number(row.id_account || 0)}`;
    const pharmaName = String(row.pharma_full_name || '').trim()
        || String(row.pharma_username || '').trim()
        || `เภสัช #${Number(row.id_pharma || 0)}`;
    const serviceType = row.privilege === 'gold_card' ? 'gold_card' : 'normal';
    const serviceFormat = mapServiceFormat(row.consult_method);
    const rawStatus = String(row.status || '');

    const existing = await sql`
        SELECT id_service_usage, service_code FROM service_usage
        WHERE id_consult_request = ${consultId} LIMIT 1
    `;
    const serviceCode = buildServiceCode(consultId, existing[0]?.service_code);

    if (existing[0]) {
        await sql`
            UPDATE service_usage SET
                id_account = ${row.id_account},
                id_pharma = ${row.id_pharma},
                user_name = ${userName},
                pharmacist_name = ${pharmaName},
                service_type = ${serviceType},
                service_format = ${serviceFormat},
                service_status = ${serviceStatus},
                consult_method = ${row.consult_method},
                booking_type = ${row.booking_type},
                delivery_prepaid = ${Number(row.delivery_prepaid) || 0},
                raw_status = ${rawStatus},
                service_date = COALESCE(service_date, ${row.created_at}),
                completed_at = CASE
                    WHEN ${serviceStatus} = 'completed' THEN COALESCE(completed_at, NOW())
                    ELSE NULL
                END,
                updated_at = NOW()
            WHERE id_consult_request = ${consultId}
        `;
        return 'updated';
    }

    const completedAt = serviceStatus === 'completed' ? row.created_at : null;
    await sql`
        INSERT INTO service_usage (
            service_code, id_consult_request, id_account, id_pharma,
            user_name, pharmacist_name, service_type, service_format,
            service_status, consult_method, booking_type, delivery_prepaid,
            raw_status, note, service_date, completed_at, created_at, updated_at
        ) VALUES (
            ${serviceCode}, ${consultId}, ${row.id_account}, ${row.id_pharma},
            ${userName}, ${pharmaName}, ${serviceType}, ${serviceFormat},
            ${serviceStatus}, ${row.consult_method}, ${row.booking_type},
            ${Number(row.delivery_prepaid) || 0}, ${rawStatus}, NULL,
            ${row.created_at}, ${completedAt}, ${row.created_at}, NOW()
        )
    `;
    return 'inserted';
}

async function seedMockRows(sql, count) {
    const pairs = await sql`
        SELECT cr.id AS consult_id, cr.id_account, cr.id_pharma, cr.status, cr.privilege,
               cr.consult_method, cr.booking_type, cr.delivery_prepaid, cr.created_at,
               TRIM(CONCAT(COALESCE(a.firstname, ''), ' ', COALESCE(a.lastname, ''))) AS user_name,
               TRIM(CONCAT(COALESCE(p.firstname_pharma, ''), ' ', COALESCE(p.lastname_pharma, ''))) AS pharma_name
        FROM consult_requests cr
        JOIN account a ON a.id_account = cr.id_account
        JOIN pharmacist_account p ON p.id_pharma = cr.id_pharma
        WHERE COALESCE(cr.is_deleted, 0) = 0
        ORDER BY cr.id DESC
        LIMIT ${count}
    `;

    if (!pairs.length) {
        throw new Error('ไม่พบ consult_requests สำหรับสร้าง mock');
    }

    const statuses = ['completed', 'completed', 'in_progress', 'pending', 'cancelled'];
    const methods = ['chat', 'video', 'voice'];
    let created = 0;

    for (let i = 0; i < count; i++) {
        const src = pairs[i % pairs.length];
        const seq = String(i + 1).padStart(3, '0');
        const serviceCode = `MCK-SRV-${seq}`;
        const exists = await sql`
            SELECT id_service_usage FROM service_usage WHERE service_code = ${serviceCode} LIMIT 1
        `;
        if (exists[0]) continue;

        const serviceStatus = statuses[i % statuses.length];
        const method = methods[i % methods.length];
        const serviceDate = new Date();
        serviceDate.setHours(serviceDate.getHours() - i * 3);
        const completedAt = serviceStatus === 'completed'
            ? new Date(serviceDate.getTime() + 45 * 60 * 1000)
            : null;

        await sql`
            INSERT INTO service_usage (
                service_code, id_consult_request, id_account, id_pharma,
                user_name, pharmacist_name, service_type, service_format,
                service_status, consult_method, booking_type, delivery_prepaid,
                raw_status, note, service_date, completed_at, created_at, updated_at
            ) VALUES (
                ${serviceCode},
                ${src.consult_id},
                ${src.id_account},
                ${src.id_pharma},
                ${String(src.user_name || '').trim() || `ผู้ใช้ #${src.id_account}`},
                ${String(src.pharma_name || '').trim() || `เภสัช #${src.id_pharma}`},
                ${src.privilege === 'gold_card' ? 'gold_card' : 'normal'},
                ${mapServiceFormat(method)},
                ${serviceStatus},
                ${method},
                ${src.booking_type || 'now'},
                ${Number(src.delivery_prepaid) || 0},
                ${serviceStatus},
                NULL,
                ${serviceDate},
                ${completedAt},
                ${serviceDate},
                NOW()
            )
        `;
        created += 1;
    }
    return created;
}

async function main() {
    loadEnv();
    const args = parseArgs();
    const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });

    let backfillInserted = 0;
    let backfillUpdated = 0;

    if (!args.mockOnly) {
        const missing = await sql`
            SELECT id FROM consult_requests cr
            WHERE COALESCE(cr.is_deleted, 0) = 0
              AND NOT EXISTS (
                SELECT 1 FROM service_usage su WHERE su.id_consult_request = cr.id
              )
            ORDER BY id ASC
        `;
        for (const row of missing) {
            const result = await syncServiceUsageForConsult(sql, Number(row.id));
            if (result === 'inserted') backfillInserted += 1;
            if (result === 'updated') backfillUpdated += 1;
        }

        const latest = await sql`
            SELECT id FROM consult_requests
            WHERE COALESCE(is_deleted, 0) = 0
            ORDER BY id DESC LIMIT 20
        `;
        for (const row of latest) {
            const result = await syncServiceUsageForConsult(sql, Number(row.id));
            if (result === 'inserted') backfillInserted += 1;
            if (result === 'updated') backfillUpdated += 1;
        }
    }

    let mockCreated = 0;
    if (!args.backfillOnly) {
        mockCreated = await seedMockRows(sql, args.mockCount);
    }

    const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM service_usage`;
    const [{ linked }] = await sql`
        SELECT COUNT(*)::int AS linked FROM service_usage WHERE id_consult_request IS NOT NULL
    `;

    await sql.end();

    console.log(JSON.stringify({
        status: 'success',
        backfillInserted,
        backfillUpdated,
        mockCreated,
        totalServiceUsage: total,
        linkedToConsult: linked,
    }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
