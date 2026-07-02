import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m && !process.env[m[1].trim()]) {
            process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
        }
    }
}

const pharmaId = Number(process.argv[2] || 1);
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false });
const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
const now = Date.now();

try {
    const rows = await sql`
        SELECT id, patient_name, tracking_status, auto_created,
               med_details, created_at, last_followup_at
        FROM prescriptions
        WHERE id_pharma = ${pharmaId}
        ORDER BY created_at DESC
    `;

    const trackingPage = rows.filter((r) => {
        const status = String(r.tracking_status || 'active');
        const hasMeds = String(r.med_details || '').trim() !== '';
        const autoCreated = Number(r.auto_created || 0) === 1;
        return status === 'active' && (hasMeds || autoCreated);
    });

    const dashboard = rows.filter((r) => {
        const hasMeds = String(r.med_details || '').trim() !== '';
        const status = String(r.tracking_status || 'active');
        const start = new Date(r.created_at).getTime();
        const inWindow = !Number.isNaN(start) && now < start + threeDaysMs;
        return hasMeds && status === 'active' && inWindow;
    });

    console.log(JSON.stringify({
        id_pharma: pharmaId,
        total_rx: rows.length,
        tracking_page_count: trackingPage.length,
        dashboard_follow_up_count: dashboard.length,
        active_trackable: trackingPage.map((r) => ({
            id: r.id,
            patient: r.patient_name,
            auto_created: r.auto_created,
        })),
    }, null, 2));
} finally {
    await sql.end({ timeout: 3 });
}
