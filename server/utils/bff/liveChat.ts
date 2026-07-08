import type { H3Event } from 'h3';
import { randomBytes } from 'node:crypto';
import { getAuthContext } from './sessionContext';
import { readMultipartRequest } from './formData';

const TIMER_TOTAL = 15 * 60;
const PRESENCE_GAP_SEC = 15;
const EDIT_DELETE_WINDOW_MS = 5 * 60 * 1000;
const EDIT_DELETE_WINDOW_SEC = EDIT_DELETE_WINDOW_MS / 1000;

function resolveChatIdentity(event: H3Event, targetId: number) {
    const auth = getAuthContext(event);
    if (auth.id_pharma) {
        return {
            myId: auth.id_pharma,
            role: 'pharma' as const,
            idPharma: auth.id_pharma,
            idAccount: targetId,
        };
    }
    if (auth.id_account) {
        return {
            myId: auth.id_account,
            role: 'user' as const,
            idPharma: targetId,
            idAccount: auth.id_account,
        };
    }
    return null;
}

type ChatRow = Record<string, unknown>;

function toIsoTime(v: unknown): string {
    if (v == null || v === '') return '';
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim();
    // timestamp without time zone จาก Postgres → ถือเป็น UTC แล้วแปลงเป็น ISO
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        const ms = new Date(`${s.replace(' ', 'T')}Z`).getTime();
        return Number.isNaN(ms) ? s : new Date(ms).toISOString();
    }
    const ms = new Date(s).getTime();
    return Number.isNaN(ms) ? s : new Date(ms).toISOString();
}

function msgSortKey(m: ChatRow): number {
    const ms = new Date(toIsoTime(m.created_at)).getTime();
    return Number.isNaN(ms) ? 0 : ms;
}

function msgTieBreak(m: ChatRow): number {
    return Number(m.archive_id || m.message_id || m.id || 0);
}

function mapLiveRow(row: ChatRow) {
    const createdAt = toIsoTime(row.created_at);
    const canModify = row.can_modify === true
        || row.can_modify === 't'
        || row.can_modify === 1
        || row.can_modify === '1';
    return {
        ...row,
        message_id: Number(row.id || row.message_id || 0),
        created_at: createdAt,
        edited_at: row.edited_at ? toIsoTime(row.edited_at) : null,
        display_time: String(row.display_time || '').trim(),
        is_archived: 0,
        can_modify: canModify,
    };
}

function mapArchiveRow(row: ChatRow) {
    return {
        message_id: Number(row.message_id || row.archive_id || 0),
        archive_id: Number(row.archive_id || 0),
        sender_id: row.sender_id,
        receiver_id: row.receiver_id,
        sender_role: row.sender_role,
        message_text: row.message_text,
        file_path: row.file_path,
        created_at: toIsoTime(row.created_at),
        edited_at: row.edited_at ? toIsoTime(row.edited_at) : null,
        display_time: String(row.display_time || '').trim(),
        id_consult_request: row.id_consult_request,
        service_code: row.service_code,
        is_archived: 1,
        can_modify: false,
    };
}

function mergeMessages(live: ChatRow[], archive: ChatRow[]) {
    const byKey = new Map<string, ChatRow>();
    // ใส่ archive ก่อน แล้วให้ live ทับ (ข้อความสดแก้/ลบได้)
    for (const m of archive) {
        const key = `${toIsoTime(m.created_at)}|${m.sender_id || ''}|${m.message_text || ''}|${m.file_path || ''}`;
        byKey.set(key, m);
    }
    for (const m of live) {
        const key = `${toIsoTime(m.created_at)}|${m.sender_id || ''}|${m.message_text || ''}|${m.file_path || ''}`;
        byKey.set(key, m);
    }
    const merged = [...byKey.values()];
    merged.sort((a, b) => {
        const diff = msgSortKey(a) - msgSortKey(b);
        if (diff !== 0) return diff;
        return msgTieBreak(a) - msgTieBreak(b);
    });
    return merged;
}

/** PHP chat-get.php returns a plain JSON array */
export async function handleChatGet(event: H3Event) {
    const query = getQuery(event);
    const targetId = Number(query.target_id || 0);
    const identity = resolveChatIdentity(event, targetId);

    if (!identity || !targetId) {
        return [];
    }

    const consultId = Number(query.consult_id || 0);
    const serviceCode = String(query.service_code || query.srv || '').trim();
    const includeArchive = String(query.include_archive || '') === '1'
        && (consultId > 0 || serviceCode !== '');

    const rows = await dbQuery(async (sql) => {
        const liveRows = await sql`
            SELECT *, id AS message_id,
                   (EXTRACT(EPOCH FROM (NOW() - created_at)) <= ${EDIT_DELETE_WINDOW_SEC}) AS can_modify,
                   TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS display_time
            FROM chat_messages
            WHERE COALESCE(is_deleted, 0) = 0
              AND (
                (sender_id = ${identity.myId} AND receiver_id = ${targetId})
                OR (sender_id = ${targetId} AND receiver_id = ${identity.myId})
              )
            ORDER BY created_at ASC
        `;
        const live = liveRows.map(mapLiveRow);

        if (!includeArchive) return live;

        let archiveRows;
        if (serviceCode) {
            archiveRows = await sql`
                SELECT message_id, sender_id, receiver_id, sender_role,
                       message_text, file_path, created_at, edited_at,
                       id_consult_request, service_code, archive_id,
                       TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS display_time
                FROM chat_messages_archive
                WHERE service_code = ${serviceCode}
                  AND COALESCE(is_deleted, 0) = 0
                  AND (
                    (sender_id = ${identity.myId} AND receiver_id = ${targetId})
                    OR (sender_id = ${targetId} AND receiver_id = ${identity.myId})
                  )
                ORDER BY created_at ASC, archive_id ASC
            `;
        } else if (consultId > 0) {
            archiveRows = await sql`
                SELECT message_id, sender_id, receiver_id, sender_role,
                       message_text, file_path, created_at, edited_at,
                       id_consult_request, service_code, archive_id,
                       TO_CHAR(created_at AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS display_time
                FROM chat_messages_archive
                WHERE id_consult_request = ${consultId}
                  AND COALESCE(is_deleted, 0) = 0
                  AND (
                    (sender_id = ${identity.myId} AND receiver_id = ${targetId})
                    OR (sender_id = ${targetId} AND receiver_id = ${identity.myId})
                  )
                ORDER BY created_at ASC, archive_id ASC
            `;
        } else {
            archiveRows = [];
        }

        return mergeMessages(live, archiveRows.map(mapArchiveRow));
    });

    return rows || [];
}

export async function handleChatSend(event: H3Event) {
    const { fields, files } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const receiverId = Number(fields.receiver_id || 0);
    const messageText = String(fields.message_text || '').trim();

    let senderId = 0;
    let role = '';
    if (auth.id_pharma) {
        senderId = auth.id_pharma;
        role = 'pharma';
    } else if (auth.id_account) {
        senderId = auth.id_account;
        role = 'user';
    }

    if (!senderId || !receiverId) {
        return { status: 'error', message: 'Unauthorized' };
    }

    let filePath: string | null = null;
    const chatFile = files.chat_file;
    if (chatFile?.data?.length) {
        const ext = (chatFile.filename?.split('.').pop() || 'bin').toLowerCase();
        const filename = `chat_${randomBytes(8).toString('hex')}.${ext}`;
        try {
            await uploadMediaFile('uploads/chat', filename, chatFile.data, mimeFromExt(ext));
            filePath = filename;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[chat-send] upload failed:', msg);
            return { status: 'error', message: msg || 'อัปโหลดไฟล์ไม่สำเร็จ' };
        }
    }

    if (!messageText && !filePath) {
        return { status: 'error', message: 'empty message' };
    }

    // message_text เป็น NOT NULL — ส่งไฟล์อย่างเดียวใช้ '' แทน null
    const textToSave = messageText || '';

    const ok = await dbQuery(async (sql) => {
        await sql`
            INSERT INTO chat_messages (sender_id, receiver_id, sender_role, message_text, file_path)
            VALUES (${senderId}, ${receiverId}, ${role}, ${textToSave}, ${filePath})
        `;
        return true;
    });

    return ok
        ? { status: 'success' }
        : { status: 'error', message: 'บันทึกไม่สำเร็จ' };
}

export async function handleChatTimer(event: H3Event) {
    const query = getQuery(event);
    const fields = event.method?.toUpperCase() === 'POST'
        ? (await readMultipartRequest(event)).fields
        : {};
    const merged = { ...query, ...fields };

    const targetId = Number(merged.target_id || 0);
    const requestId = Number(merged.request_id || 0);
    const forceReset = String(merged.reset || '') === '1';
    const forceEnd = String(merged.end || '') === '1';

    const identity = resolveChatIdentity(event, targetId);
    if (!identity || identity.idAccount <= 0 || identity.idPharma <= 0) {
        return { status: 'error', message: identity ? 'missing target' : 'unauthorized' };
    }

    const result = await dbQuery(async (sql) => {
        const now = new Date();
        const rows = await sql`
            SELECT * FROM consult_chat_timer
            WHERE id_account = ${identity.idAccount} AND id_pharma = ${identity.idPharma}
            LIMIT 1
        `;

        if (!rows[0]) {
            await sql`
                INSERT INTO consult_chat_timer (
                    id_account, id_pharma, request_id, total_seconds, remaining_seconds,
                    status, user_last_seen, pharma_last_seen, last_tick_at
                ) VALUES (
                    ${identity.idAccount}, ${identity.idPharma}, ${requestId},
                    ${TIMER_TOTAL}, ${TIMER_TOTAL}, 'running',
                    ${identity.role === 'user' ? now : null},
                    ${identity.role === 'pharma' ? now : null},
                    ${now}
                )
            `;
            return {
                remaining: TIMER_TOTAL,
                total: TIMER_TOTAL,
                statusVal: 'running',
                peerPresent: false,
            };
        }

        const row = rows[0];
        let remaining = Number(row.remaining_seconds || 0);
        let total = Number(row.total_seconds || TIMER_TOTAL);
        let storedRequestId = Number(row.request_id || 0);
        let statusVal = String(row.status || 'running');

        const userSeenTs = row.user_last_seen ? new Date(String(row.user_last_seen)).getTime() : 0;
        const pharmaSeenTs = row.pharma_last_seen ? new Date(String(row.pharma_last_seen)).getTime() : 0;
        const lastTickTs = row.last_tick_at ? new Date(String(row.last_tick_at)).getTime() : now.getTime();
        const nowMs = now.getTime();

        const userPresentBefore = userSeenTs > 0 && (nowMs - userSeenTs) <= PRESENCE_GAP_SEC * 1000;
        const pharmaPresentBefore = pharmaSeenTs > 0 && (nowMs - pharmaSeenTs) <= PRESENCE_GAP_SEC * 1000;
        const anyonePresentBefore = userPresentBefore || pharmaPresentBefore;

        const shouldReset = forceReset
            || (requestId > 0 && storedRequestId > 0 && requestId !== storedRequestId);

        if (shouldReset) {
            remaining = total;
            statusVal = 'running';
            storedRequestId = requestId > 0 ? requestId : storedRequestId;
        } else if (forceEnd) {
            remaining = 0;
            statusVal = 'ended';
        } else if (statusVal !== 'ended') {
            const elapsed = Math.floor((nowMs - lastTickTs) / 1000);
            if (elapsed > 0 && anyonePresentBefore) {
                remaining = Math.max(0, remaining - elapsed);
            }
            if (remaining <= 0) {
                remaining = 0;
                statusVal = 'ended';
            }
        }

        // ถ้า client ส่ง request_id มาแต่แถวเดิมยังเป็น 0 → จดไว้ (ไม่ถือเป็นรอบใหม่)
        if (requestId > 0 && storedRequestId <= 0) {
            storedRequestId = requestId;
        }

        const userSeen = identity.role === 'user' ? now : row.user_last_seen;
        const pharmaSeen = identity.role === 'pharma' ? now : row.pharma_last_seen;
        const peerPresent = identity.role === 'user' ? pharmaPresentBefore : userPresentBefore;

        await sql`
            UPDATE consult_chat_timer
            SET remaining_seconds = ${remaining},
                status = ${statusVal},
                request_id = ${storedRequestId},
                user_last_seen = ${userSeen},
                pharma_last_seen = ${pharmaSeen},
                last_tick_at = ${now}
            WHERE id_account = ${identity.idAccount} AND id_pharma = ${identity.idPharma}
        `;

        return { remaining, total, statusVal, peerPresent };
    });

    if (!result) {
        return { status: 'error', message: 'timer unavailable' };
    }

    return {
        status: 'success',
        remaining_seconds: result.remaining,
        total_seconds: result.total,
        running: result.statusVal === 'running' && result.remaining > 0,
        ended: result.statusVal === 'ended' || result.remaining <= 0,
        viewer_present: true,
        peer_present: result.peerPresent,
        role: identity.role,
    };
}

export async function handleChatDelete(event: H3Event) {
    const { fields } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const messageId = Number(fields.message_id || 0);

    let myId = 0;
    let myRole = '';
    if (auth.id_pharma) {
        myId = auth.id_pharma;
        myRole = 'pharma';
    } else if (auth.id_account) {
        myId = auth.id_account;
        myRole = 'user';
    }

    if (!myId || messageId <= 0) {
        return { status: 'error', message: 'กรุณาเข้าสู่ระบบ' };
    }

    const result = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT sender_id, sender_role,
                   (EXTRACT(EPOCH FROM (NOW() - created_at)) <= ${EDIT_DELETE_WINDOW_SEC}) AS can_modify
            FROM chat_messages
            WHERE id = ${messageId} AND COALESCE(is_deleted, 0) = 0
            LIMIT 1
        `;
        const msg = rows[0];
        if (!msg) return { ok: false, reason: 'not_found' as const };
        if (Number(msg.sender_id) !== myId || String(msg.sender_role) !== myRole) {
            return { ok: false, reason: 'forbidden' as const };
        }
        if (!msg.can_modify) return { ok: false, reason: 'expired' as const };
        await sql`
            UPDATE chat_messages
            SET is_deleted = 1, deleted_at = NOW(), deleted_by = ${myId}, deleted_by_role = ${myRole}
            WHERE id = ${messageId}
        `;
        return { ok: true, reason: 'success' as const };
    });

    if (!result?.ok) {
        if (result?.reason === 'expired') {
            return { status: 'error', message: 'ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถลบได้' };
        }
        return { status: 'error', message: 'ไม่พบข้อความหรือไม่มีสิทธิ์ลบ' };
    }

    return { status: 'success', message: 'ลบข้อความเรียบร้อยแล้ว' };
}

export async function handleChatEdit(event: H3Event) {
    const { fields } = await readMultipartRequest(event);
    const auth = getAuthContext(event, fields);
    const messageId = Number(fields.message_id || 0);
    const newText = String(fields.message_text || '').trim();

    let myId = 0;
    let myRole = '';
    if (auth.id_pharma) {
        myId = auth.id_pharma;
        myRole = 'pharma';
    } else if (auth.id_account) {
        myId = auth.id_account;
        myRole = 'user';
    }

    if (!myId || messageId <= 0 || !newText) {
        return { status: 'error', message: 'ข้อมูลไม่ครบ' };
    }

    const result = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT sender_id, sender_role,
                   (EXTRACT(EPOCH FROM (NOW() - created_at)) <= ${EDIT_DELETE_WINDOW_SEC}) AS can_modify
            FROM chat_messages
            WHERE id = ${messageId} AND COALESCE(is_deleted, 0) = 0
            LIMIT 1
        `;
        const msg = rows[0];
        if (!msg) return { ok: false, reason: 'not_found' as const };
        if (Number(msg.sender_id) !== myId || String(msg.sender_role) !== myRole) {
            return { ok: false, reason: 'forbidden' as const };
        }
        if (!msg.can_modify) return { ok: false, reason: 'expired' as const };
        const updated = await sql`
            UPDATE chat_messages
            SET message_text = ${newText}, edited_at = NOW()
            WHERE id = ${messageId} AND COALESCE(is_deleted, 0) = 0
        `;
        return updated.count > 0
            ? { ok: true, reason: 'success' as const }
            : { ok: false, reason: 'not_found' as const };
    });

    if (!result?.ok) {
        if (result?.reason === 'expired') {
            return { status: 'error', message: 'ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถแก้ไขได้' };
        }
        return { status: 'error', message: 'ไม่พบข้อความหรือไม่มีสิทธิ์แก้ไข' };
    }

    return { status: 'success', message: 'แก้ไขข้อความเรียบร้อยแล้ว' };
}
