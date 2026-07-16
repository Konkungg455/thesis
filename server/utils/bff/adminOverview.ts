import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';

const PRESENCE_ONLINE_SEC = 15;

type OverviewPeriod = 'day' | 'week' | 'month' | 'year';

function resolvePeriodBounds(period: string): { start: Date; end: Date; period: OverviewPeriod } {
    const p: OverviewPeriod = ['day', 'week', 'month', 'year'].includes(period)
        ? (period as OverviewPeriod)
        : 'week';

    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (p === 'week') {
        start.setDate(start.getDate() - 6);
    } else if (p === 'month') {
        start.setDate(start.getDate() - 29);
    } else if (p === 'year') {
        start.setFullYear(start.getFullYear(), start.getMonth() - 11, 1);
        start.setHours(0, 0, 0, 0);
    }

    return { start, end, period: p };
}

export async function handleGetAdminOverviewActivity(event: H3Event) {
    const auth = getAuthContext(event);
    if (!auth.isAdmin && !auth.id_account_admin) {
        return { status: 'error', message: 'ไม่มีสิทธิ์เข้าถึง' };
    }

    const q = getQuery(event);
    const { start, end, period } = resolvePeriodBounds(String(q.period || 'week'));

    const row = await dbQuery(async (sql) => {
        const rows = await sql`
            WITH bounds AS (
                SELECT ${start.toISOString()}::timestamptz AS start_at,
                       ${end.toISOString()}::timestamptz AS end_at
            ),
            active_users AS (
                SELECT DISTINCT id_account
                FROM (
                    SELECT su.id_account
                    FROM service_usage su, bounds b
                    WHERE su.id_account IS NOT NULL
                      AND su.service_date >= b.start_at
                      AND su.service_date <= b.end_at
                    UNION
                    SELECT cr.id_account
                    FROM consult_requests cr, bounds b
                    WHERE cr.id_account IS NOT NULL
                      AND COALESCE(cr.is_deleted, 0) = 0
                      AND cr.created_at >= b.start_at
                      AND cr.created_at <= b.end_at
                    UNION
                    SELECT ct.id_account
                    FROM consult_chat_timer ct, bounds b
                    WHERE ct.id_account IS NOT NULL
                      AND ct.user_last_seen IS NOT NULL
                      AND ct.user_last_seen >= b.start_at
                      AND ct.user_last_seen <= b.end_at
                    UNION
                    SELECT p.id_account
                    FROM prescriptions p, bounds b
                    WHERE p.id_account IS NOT NULL
                      AND p.created_at >= b.start_at
                      AND p.created_at <= b.end_at
                ) u
                WHERE id_account IS NOT NULL
            ),
            active_pharmas AS (
                SELECT DISTINCT id_pharma
                FROM (
                    SELECT su.id_pharma
                    FROM service_usage su, bounds b
                    WHERE su.id_pharma IS NOT NULL
                      AND su.service_date >= b.start_at
                      AND su.service_date <= b.end_at
                    UNION
                    SELECT cr.id_pharma
                    FROM consult_requests cr, bounds b
                    WHERE cr.id_pharma IS NOT NULL
                      AND COALESCE(cr.is_deleted, 0) = 0
                      AND cr.created_at >= b.start_at
                      AND cr.created_at <= b.end_at
                    UNION
                    SELECT ct.id_pharma
                    FROM consult_chat_timer ct, bounds b
                    WHERE ct.id_pharma IS NOT NULL
                      AND ct.pharma_last_seen IS NOT NULL
                      AND ct.pharma_last_seen >= b.start_at
                      AND ct.pharma_last_seen <= b.end_at
                    UNION
                    SELECT p.id_pharma
                    FROM prescriptions p, bounds b
                    WHERE p.id_pharma IS NOT NULL
                      AND p.created_at >= b.start_at
                      AND p.created_at <= b.end_at
                ) p
                WHERE id_pharma IS NOT NULL
            )
            SELECT
                (SELECT COUNT(*)::int FROM active_users) AS active_users,
                (SELECT COUNT(*)::int FROM active_pharmas) AS active_pharmas,
                (
                    SELECT COUNT(DISTINCT id_account)::int
                    FROM consult_chat_timer
                    WHERE id_account IS NOT NULL
                      AND user_last_seen > NOW() - (${PRESENCE_ONLINE_SEC} * INTERVAL '1 second')
                ) AS online_users_now,
                (
                    SELECT COUNT(DISTINCT id_pharma)::int
                    FROM consult_chat_timer
                    WHERE id_pharma IS NOT NULL
                      AND pharma_last_seen > NOW() - (${PRESENCE_ONLINE_SEC} * INTERVAL '1 second')
                ) AS online_pharmas_now
        `;
        return rows[0] as Record<string, unknown> | undefined;
    });

    if (!row) {
        return {
            status: 'error',
            message: 'ไม่สามารถโหลดสถิติออนไลน์ได้',
            data: {
                period,
                active_users: 0,
                active_pharmas: 0,
                online_users_now: 0,
                online_pharmas_now: 0,
            },
        };
    }

    return {
        status: 'success',
        data: {
            period,
            active_users: Number(row.active_users || 0),
            active_pharmas: Number(row.active_pharmas || 0),
            online_users_now: Number(row.online_users_now || 0),
            online_pharmas_now: Number(row.online_pharmas_now || 0),
        },
    };
}
