import type { H3Event } from 'h3';
import { readMultipartRequest } from './formData';
import { getAuthContext } from './sessionContext';

const RETENTION_DAYS = 365;

function hiddenFilterSql(viewerRole: 'user' | 'pharma'): string {
    const col = viewerRole === 'user' ? 'hidden_by_user' : 'hidden_by_pharma';
    return `AND NOT EXISTS (
        SELECT 1 FROM consult_archive_hidden h
        WHERE h.id_consult_request = chat_messages_archive.id_consult_request
          AND h.id_account = chat_messages_archive.id_account
          AND h.id_pharma = chat_messages_archive.id_pharma
          AND h.${col} = 1
    )`;
}

async function purgeExpiredArchives(sql: ReturnType<typeof useDb>) {
    await sql`
        UPDATE chat_messages_archive
        SET is_deleted = 1,
            deleted_at = NOW(),
            deleted_by_role = 'system'
        WHERE expires_at IS NOT NULL
          AND expires_at < NOW()
          AND COALESCE(is_deleted, 0) = 0
    `;
}

async function resolveServiceCode(
    sql: ReturnType<typeof useDb>,
    consultId: number,
): Promise<string> {
    if (consultId <= 0) return '';
    const rows = await sql`
        SELECT service_code FROM service_usage
        WHERE id_consult_request = ${consultId}
        LIMIT 1
    `;
    const code = String(rows[0]?.service_code || '').trim();
    if (code) return code;
    return `SRV-${String(consultId).padStart(3, '0')}`;
}

export async function archiveAndClearChatBetween(
    sql: ReturnType<typeof useDb>,
    idPharma: number,
    idAccount: number,
): Promise<{ consultId: number; serviceCode: string }> {
    if (idPharma <= 0 || idAccount <= 0) {
        return { consultId: 0, serviceCode: '' };
    }

    let consultId = 0;
    const accepted = await sql`
        SELECT id FROM consult_requests
        WHERE id_pharma = ${idPharma}
          AND id_account = ${idAccount}
          AND status = 'accepted'
        ORDER BY id DESC
        LIMIT 1
    `;
    if (accepted[0]) {
        consultId = Number(accepted[0].id);
    } else {
        const latest = await sql`
            SELECT id FROM consult_requests
            WHERE id_pharma = ${idPharma} AND id_account = ${idAccount}
            ORDER BY id DESC
            LIMIT 1
        `;
        consultId = Number(latest[0]?.id || 0);
    }

    const serviceCode = await resolveServiceCode(sql, consultId);

    const cnt = await sql`
        SELECT COUNT(*)::int AS n FROM chat_messages
        WHERE COALESCE(is_deleted, 0) = 0
          AND (
            (sender_id = ${idPharma} AND receiver_id = ${idAccount})
            OR (sender_id = ${idAccount} AND receiver_id = ${idPharma})
          )
    `;
    if (Number(cnt[0]?.n || 0) === 0) {
        return { consultId, serviceCode };
    }

    await sql`
        INSERT INTO chat_messages_archive (
            message_id, id_consult_request, id_account, id_pharma, service_code,
            sender_id, receiver_id, sender_role, message_text, file_path,
            created_at, edited_at, archived_at, expires_at
        )
        SELECT cm.id, ${consultId || null}, ${idAccount}, ${idPharma}, ${serviceCode || null},
               cm.sender_id, cm.receiver_id, cm.sender_role, cm.message_text, cm.file_path,
               cm.created_at, cm.edited_at, NOW(), NOW() + INTERVAL '365 days'
        FROM chat_messages cm
        WHERE COALESCE(cm.is_deleted, 0) = 0
          AND (
            (cm.sender_id = ${idPharma} AND cm.receiver_id = ${idAccount})
            OR (cm.sender_id = ${idAccount} AND cm.receiver_id = ${idPharma})
          )
    `;

    await sql`
        UPDATE chat_messages
        SET is_deleted = 1,
            deleted_at = NOW(),
            deleted_by_role = 'system'
        WHERE COALESCE(is_deleted, 0) = 0
          AND (
            (sender_id = ${idPharma} AND receiver_id = ${idAccount})
            OR (sender_id = ${idAccount} AND receiver_id = ${idPharma})
          )
    `;

    return { consultId, serviceCode };
}

async function autoArchivePending(
    sql: ReturnType<typeof useDb>,
    ownerSql: string,
    ownerParams: number[],
) {
    const pending = await sql.unsafe(
        `SELECT DISTINCT r.id_account, r.id_pharma
         FROM consult_requests r
         INNER JOIN chat_messages cm ON (
             (cm.sender_id = r.id_pharma AND cm.receiver_id = r.id_account)
             OR (cm.sender_id = r.id_account AND cm.receiver_id = r.id_pharma)
         )
         WHERE (r.status = 'completed' OR r.status = '')
           AND COALESCE(r.is_deleted, 0) = 0
           AND COALESCE(cm.is_deleted, 0) = 0
           AND (${ownerSql})`,
        ownerParams,
    );

    for (const row of pending) {
        await archiveAndClearChatBetween(
            sql,
            Number(row.id_pharma),
            Number(row.id_account),
        );
    }
}

async function fetchAccountName(sql: ReturnType<typeof useDb>, idAccount: number): Promise<string> {
    if (idAccount <= 0) return '';
    const rows = await sql`
        SELECT firstname, lastname, username_account
        FROM account WHERE id_account = ${idAccount} LIMIT 1
    `;
    const row = rows[0];
    if (!row) return '';
    const name = `${row.firstname || ''} ${row.lastname || ''}`.trim();
    return name || String(row.username_account || '').trim();
}

async function fetchPharmaName(sql: ReturnType<typeof useDb>, idPharma: number): Promise<string> {
    if (idPharma <= 0) return '';
    const rows = await sql`
        SELECT firstname_pharma, lastname_pharma, username_pharma
        FROM pharmacist_account
        WHERE id_pharma = ${idPharma}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) return '';
    const first = String(row.firstname_pharma || '').trim();
    const last = String(row.lastname_pharma || '').trim();
    let name = `${first} ${last}`.trim();
    if (!name) name = String(row.username_pharma || '').trim();
    if (!name) return '';
    return name.startsWith('ภก.') ? name : `ภก. ${name}`;
}

async function fetchSymptomForConsult(
    sql: ReturnType<typeof useDb>,
    consultId: number,
    idAccount: number,
): Promise<string> {
    if (consultId <= 0 || idAccount <= 0) return '';
    const req = await sql`
        SELECT bot_session_id FROM consult_requests WHERE id = ${consultId} LIMIT 1
    `;
    const sess = String(req[0]?.bot_session_id || '').trim();
    if (!sess) return '';
    const hist = await sql`
        SELECT symptom_name FROM chat_history
        WHERE id_account = ${idAccount}
          AND session_id = ${sess}
          AND COALESCE(is_deleted, 0) = 0
          AND symptom_name IS NOT NULL
          AND symptom_name <> ''
        ORDER BY created_at ASC, id ASC
        LIMIT 1
    `;
    return String(hist[0]?.symptom_name || '').trim();
}

export async function handleListConsultArchives(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const uId = auth.id_account || 0;
    const pId = auth.id_pharma || 0;

    if (uId <= 0 && pId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ', data: [] };
    }

    const patientFilter = Number(query.patient_id || 0);
    const pharmaFilter = Number(query.pharma_id || 0);
    const cacheKey = `archives:${pId || 0}:${uId || 0}:${patientFilter}:${pharmaFilter}`;
    const cached = getBffCache(cacheKey);
    if (cached) return cached;

    const result = await dbQuery(async (sql) => {
        const runMaint = shouldRunArchiveMaintenance();
        if (runMaint) {
            await purgeExpiredArchives(sql);
        }

        let ownerSql: string;
        let ownerParams: number[];
        let viewerRole: 'user' | 'pharma';

        if (pId > 0) {
            viewerRole = 'pharma';
            ownerSql = 'id_pharma = $1';
            ownerParams = [pId];
            if (patientFilter > 0) {
                ownerSql += ' AND id_account = $2';
                ownerParams.push(patientFilter);
            }
            if (runMaint) {
                await autoArchivePending(
                    sql,
                    'r.id_pharma = $1' + (patientFilter > 0 ? ' AND r.id_account = $2' : ''),
                    ownerParams,
                );
            }
        } else {
            viewerRole = 'user';
            ownerSql = 'id_account = $1';
            ownerParams = [uId];
            if (pharmaFilter > 0) {
                ownerSql += ' AND id_pharma = $2';
                ownerParams.push(pharmaFilter);
            }
            if (runMaint) {
                await autoArchivePending(
                    sql,
                    'r.id_account = $1' + (pharmaFilter > 0 ? ' AND r.id_pharma = $2' : ''),
                    ownerParams,
                );
            }
        }

        const hiddenFilter = hiddenFilterSql(viewerRole);
        const rows = await sql.unsafe(
            `SELECT id_consult_request,
                    service_code,
                    id_account,
                    id_pharma,
                    MIN(archived_at) AS archived_at,
                    MIN(expires_at)  AS expires_at,
                    MAX(created_at)  AS last_message_at,
                    COUNT(*)::int    AS message_count
             FROM chat_messages_archive
             WHERE ${ownerSql}
               AND COALESCE(is_deleted, 0) = 0
               AND (expires_at IS NULL OR expires_at > NOW())
               ${hiddenFilter}
             GROUP BY id_consult_request, service_code, id_account, id_pharma
             ORDER BY archived_at DESC, id_consult_request DESC`,
            ownerParams,
        );

        const list = [];
        const accountIds = [...new Set(rows.map((r) => Number(r.id_account || 0)).filter((id) => id > 0))];
        const pharmaIds = [...new Set(rows.map((r) => Number(r.id_pharma || 0)).filter((id) => id > 0))];

        const accountNameMap = new Map<number, string>();
        const pharmaNameMap = new Map<number, string>();

        if (accountIds.length > 0) {
            const accRows = await sql`
                SELECT id_account, firstname, lastname, username_account
                FROM account
                WHERE id_account IN ${sql(accountIds)}
            `;
            for (const row of accRows) {
                const id = Number(row.id_account);
                const name = `${row.firstname || ''} ${row.lastname || ''}`.trim()
                    || String(row.username_account || '').trim();
                accountNameMap.set(id, name || `ผู้ป่วย #${id}`);
            }
        }

        if (pharmaIds.length > 0) {
            const phRows = await sql`
                SELECT id_pharma, firstname_pharma, lastname_pharma, username_pharma
                FROM pharmacist_account
                WHERE id_pharma IN ${sql(pharmaIds)}
            `;
            for (const row of phRows) {
                const id = Number(row.id_pharma);
                const first = String(row.firstname_pharma || '').trim();
                const last = String(row.lastname_pharma || '').trim();
                let name = `${first} ${last}`.trim();
                if (!name) name = String(row.username_pharma || '').trim();
                if (!name) name = `เภสัชกร #${id}`;
                else if (!name.startsWith('ภก.')) name = `ภก. ${name}`;
                pharmaNameMap.set(id, name);
            }
        }

        for (const row of rows) {
            const consultId = Number(row.id_consult_request || 0);
            const idAccount = Number(row.id_account || 0);
            const idPharma = Number(row.id_pharma || 0);
            let serviceCode = String(row.service_code || '');
            if (!serviceCode && consultId > 0) {
                serviceCode = `SRV-${String(consultId).padStart(3, '0')}`;
            }

            let daysLeft: number | null = null;
            if (row.expires_at) {
                const diff = new Date(String(row.expires_at)).getTime() - Date.now();
                daysLeft = Math.max(0, Math.ceil(diff / 86400000));
            }

            let otherId: number;
            let otherName: string;
            let otherRole: string;
            if (viewerRole === 'user') {
                otherId = idPharma;
                otherName = pharmaNameMap.get(idPharma) || `เภสัชกร #${idPharma}`;
                otherRole = 'pharma';
            } else {
                otherId = idAccount;
                otherName = accountNameMap.get(idAccount) || `ผู้ป่วย #${idAccount}`;
                otherRole = 'user';
            }

            list.push({
                consult_id: consultId,
                service_code: serviceCode,
                id_account: idAccount,
                id_pharma: idPharma,
                other_id: otherId,
                other_name: otherName,
                other_role: otherRole,
                archived_at: row.archived_at,
                expires_at: row.expires_at,
                last_message_at: row.last_message_at,
                message_count: Number(row.message_count || 0),
                days_left: daysLeft,
                symptom_name: '',
            });
        }

        return { list, viewerRole };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้', data: [] };
    }

    const payload = {
        status: 'success',
        data: result.list,
        retention_days: RETENTION_DAYS,
        viewer_role: result.viewerRole,
    };
    setBffCache(cacheKey, payload, 30_000);
    return payload;
}

export async function handleGetChatArchive(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const uId = auth.id_account || 0;
    const pId = auth.id_pharma || 0;
    const consultId = Number(query.consult_id || 0);
    const peerId = Number(query.peer_id || 0);
    const archivedAtRaw = String(query.archived_at || '').trim();
    const serviceCodeRaw = String(query.service_code || '').trim();

    if (uId <= 0 && pId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ' };
    }

    const result = await dbQuery(async (sql) => {
        const runMaint = shouldRunArchiveMaintenance();
        if (runMaint) {
            await purgeExpiredArchives(sql);
        }

        const viewerRole: 'user' | 'pharma' = pId > 0 ? 'pharma' : 'user';
        const hiddenFilter = hiddenFilterSql(viewerRole);
        const ownerId = pId > 0 ? pId : uId;
        const ownerCol = pId > 0 ? 'id_pharma' : 'id_account';

        let targetSql: string;
        const params: unknown[] = [ownerId];

        if (consultId > 0) {
            targetSql = 'id_consult_request = $2';
            params.push(consultId);
            if (serviceCodeRaw) {
                targetSql += ' AND service_code = $3';
                params.push(serviceCodeRaw);
            }
        } else if (peerId > 0) {
            const peerCol = pId > 0 ? 'id_account' : 'id_pharma';
            targetSql = `${peerCol} = $2`;
            params.push(peerId);
            if (archivedAtRaw) {
                targetSql += ' AND archived_at = $3';
                params.push(archivedAtRaw);
            } else if (serviceCodeRaw) {
                targetSql += ' AND service_code = $3';
                params.push(serviceCodeRaw);
            }
        } else {
            return { error: 'Missing consult_id หรือ peer_id' };
        }

        const rows = await sql.unsafe(
            `SELECT *
             FROM chat_messages_archive
             WHERE ${ownerCol} = $1
               AND ${targetSql}
               AND COALESCE(is_deleted, 0) = 0
               AND (expires_at IS NULL OR expires_at > NOW())
               ${hiddenFilter}
             ORDER BY created_at ASC, archive_id ASC`,
            params,
        );

        let firstArchived: string | null = null;
        let firstExpires: string | null = null;
        const messages = rows.map((row) => {
            if (firstArchived === null) firstArchived = row.archived_at ? String(row.archived_at) : null;
            if (firstExpires === null) firstExpires = row.expires_at ? String(row.expires_at) : null;
            return {
                id: Number(row.archive_id || row.message_id || 0),
                message_id: Number(row.message_id || 0),
                sender_id: Number(row.sender_id || 0),
                receiver_id: Number(row.receiver_id || 0),
                sender_role: row.sender_role,
                message_text: row.message_text,
                file_path: row.file_path,
                created_at: row.created_at,
                edited_at: row.edited_at,
            };
        });

        return { messages, firstArchived, firstExpires };
    });

    if (!result) {
        return { status: 'error', message: 'ไม่สามารถเชื่อมต่อฐานข้อมูลได้' };
    }
    if ('error' in result && result.error) {
        return { status: 'error', message: result.error };
    }

    return {
        status: 'success',
        data: result.messages,
        archived_at: result.firstArchived,
        expires_at: result.firstExpires,
        retention_days: RETENTION_DAYS,
    };
}

export async function handleDeleteConsultArchive(event: H3Event) {
    const query = getQuery(event);
    const auth = getAuthContext(event);
    const uId = auth.id_account || 0;
    const pId = auth.id_pharma || 0;

    if (uId <= 0 && pId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ' };
    }

    let consultId = Number(query.consult_id || 0);
    let peerId = Number(query.peer_id || 0);

    if (event.method?.toUpperCase() === 'POST') {
        const { fields } = await readMultipartRequest(event);
        if (!consultId) consultId = Number(fields.consult_id || 0);
        if (!peerId) peerId = Number(fields.peer_id || 0);
        Object.assign(auth, getAuthContext(event, fields));
    }

    if (consultId <= 0 && peerId <= 0) {
        return { status: 'error', message: 'ขาดพารามิเตอร์ consult_id หรือ peer_id' };
    }

    const isPharma = pId > 0;
    const hidden = await dbQuery(async (sql) => {
        type PairRow = { id_account: number; id_pharma: number; id_consult_request: number };
        const pairs: PairRow[] = [];

        if (consultId > 0) {
            const ownerCol = isPharma ? 'id_pharma' : 'id_account';
            const ownerId = isPharma ? pId : uId;
            const rows = await sql.unsafe(
                `SELECT DISTINCT id_account, id_pharma, id_consult_request
                 FROM chat_messages_archive
                 WHERE id_consult_request = $1 AND ${ownerCol} = $2
                   AND COALESCE(is_deleted, 0) = 0`,
                [consultId, ownerId],
            );
            pairs.push(...rows.map((r) => ({
                id_account: Number(r.id_account),
                id_pharma: Number(r.id_pharma),
                id_consult_request: Number(r.id_consult_request),
            })));
        }

        if (pairs.length === 0 && peerId > 0) {
            const ownerCol = isPharma ? 'id_pharma' : 'id_account';
            const peerCol = isPharma ? 'id_account' : 'id_pharma';
            const ownerId = isPharma ? pId : uId;
            const rows = await sql.unsafe(
                `SELECT DISTINCT id_account, id_pharma, id_consult_request
                 FROM chat_messages_archive
                 WHERE ${ownerCol} = $1 AND ${peerCol} = $2
                   AND COALESCE(is_deleted, 0) = 0`,
                [ownerId, peerId],
            );
            pairs.push(...rows.map((r) => ({
                id_account: Number(r.id_account),
                id_pharma: Number(r.id_pharma),
                id_consult_request: Number(r.id_consult_request),
            })));
        }

        let count = 0;
        for (const p of pairs) {
            if (p.id_consult_request <= 0 || p.id_account <= 0 || p.id_pharma <= 0) continue;
            try {
                if (isPharma) {
                    await sql`
                        INSERT INTO consult_archive_hidden
                            (id_consult_request, id_account, id_pharma, hidden_by_pharma, pharma_hidden_at)
                        VALUES (${p.id_consult_request}, ${p.id_account}, ${p.id_pharma}, 1, NOW())
                        ON CONFLICT (id_consult_request, id_account, id_pharma)
                        DO UPDATE SET hidden_by_pharma = 1, pharma_hidden_at = NOW()
                    `;
                } else {
                    await sql`
                        INSERT INTO consult_archive_hidden
                            (id_consult_request, id_account, id_pharma, hidden_by_user, user_hidden_at)
                        VALUES (${p.id_consult_request}, ${p.id_account}, ${p.id_pharma}, 1, NOW())
                        ON CONFLICT (id_consult_request, id_account, id_pharma)
                        DO UPDATE SET hidden_by_user = 1, user_hidden_at = NOW()
                    `;
                }
                count++;
            } catch {
                // table may be missing on older schemas
            }
        }
        return count;
    });

    if (hidden != null && hidden > 0) {
        return { status: 'success', hidden, message: 'ลบออกจากรายการของคุณแล้ว' };
    }
    return { status: 'error', message: 'ไม่พบประวัติที่จะลบ' };
}
