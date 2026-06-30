import type { H3Event } from 'h3';
import { getAuthContext } from './sessionContext';
import { readRequestFields } from './formData';

let schemaReady = false;

function normalizeCallType(raw: unknown): 'voice' | 'video' {
    const t = String(raw || 'voice').trim().toLowerCase();
    return t === 'video' ? 'video' : 'voice';
}

async function ensureVideoCallsSchema(sql: ReturnType<typeof useDb>) {
    if (schemaReady) return;
    await sql`
        CREATE TABLE IF NOT EXISTS video_calls (
            id SERIAL PRIMARY KEY,
            caller_id INT NOT NULL,
            receiver_id INT NOT NULL,
            call_status VARCHAR(20) DEFAULT 'calling',
            call_type VARCHAR(10) DEFAULT 'voice',
            caller_role VARCHAR(20) DEFAULT 'user',
            receiver_role VARCHAR(20) DEFAULT 'user',
            caller_peer_id VARCHAR(120) DEFAULT '',
            receiver_peer_id VARCHAR(120) DEFAULT '',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;
    schemaReady = true;
}

function resolveMyIdentity(event: H3Event) {
    const auth = getAuthContext(event);
    if (auth.id_pharma) {
        return { myId: auth.id_pharma, myRole: 'pharma' as const };
    }
    if (auth.id_account) {
        return { myId: auth.id_account, myRole: 'user' as const };
    }
    return null;
}

async function fetchPeerProfile(
    sql: ReturnType<typeof useDb>,
    peerId: number,
    peerRole: string,
) {
    if (peerRole === 'pharma') {
        const rows = await sql`
            SELECT firstname_pharma, lastname_pharma, username_pharma, images_pharma
            FROM pharmacist_account
            WHERE id_pharma = ${peerId}
            LIMIT 1
        `;
        const row = rows[0];
        if (!row) {
            return { peer_name: 'เภสัชกร', peer_image: '' };
        }
        const fn = String(row.firstname_pharma || '').trim();
        const ln = String(row.lastname_pharma || '').trim();
        const full = `${fn} ${ln}`.trim();
        return {
            peer_name: full ? `ภก. ${full}` : String(row.username_pharma || 'เภสัชกร'),
            peer_image: String(row.images_pharma || ''),
        };
    }

    const rows = await sql`
        SELECT firstname, lastname, username_account, images_account
        FROM account
        WHERE id_account = ${peerId}
        LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
        return { peer_name: `ผู้ป่วย ${peerId}`, peer_image: '' };
    }
    const fn = String(row.firstname || '').trim();
    const ln = String(row.lastname || '').trim();
    const full = `${fn} ${ln}`.trim();
    return {
        peer_name: full || String(row.username_account || `ผู้ป่วย ${peerId}`),
        peer_image: String(row.images_account || ''),
    };
}

/** call-handler.php?action=start|accept|end */
export async function handleCallHandler(event: H3Event, action: string) {
    const identity = resolveMyIdentity(event);
    if (!identity) {
        return { status: 'error', message: 'กรุณา Login ก่อน' };
    }

    const { myId, myRole } = identity;

    const result = await dbQuery(async (sql) => {
        await ensureVideoCallsSchema(sql);

        if (action === 'start') {
            const fields = await readRequestFields(event);
            const receiverId = Number(fields.receiver_id || 0);
            const callType = normalizeCallType(String(fields.call_type || 'voice'));
            const callerPeerId = String(fields.caller_peer_id || '').trim();

            if (receiverId <= 0) {
                return { status: 'error', message: 'ไม่พบผู้รับสาย' };
            }

            const actualReceiverRole = myRole === 'pharma' ? 'user' : 'pharma';

            await sql`
                DELETE FROM video_calls
                WHERE (caller_id = ${myId} AND caller_role = ${myRole})
                   OR (receiver_id = ${myId} AND receiver_role = ${myRole})
                   OR (caller_id = ${receiverId} AND caller_role = ${actualReceiverRole})
                   OR (receiver_id = ${receiverId} AND receiver_role = ${actualReceiverRole})
            `;

            await sql`
                INSERT INTO video_calls (
                    caller_id, receiver_id, call_status, call_type,
                    caller_role, receiver_role, caller_peer_id, receiver_peer_id
                ) VALUES (
                    ${myId}, ${receiverId}, 'calling', ${callType},
                    ${myRole}, ${actualReceiverRole}, ${callerPeerId}, ''
                )
            `;

            return { status: 'success' };
        }

        if (action === 'accept') {
            const fields = await readRequestFields(event);
            const receiverPeerId = String(fields.receiver_peer_id || '').trim();

            await sql`
                UPDATE video_calls
                SET call_status = 'accepted', receiver_peer_id = ${receiverPeerId}
                WHERE receiver_id = ${myId}
                  AND receiver_role = ${myRole}
                  AND call_status = 'calling'
            `;

            return { status: 'success' };
        }

        if (action === 'register_peer') {
            const fields = await readRequestFields(event);
            const peerId = String(fields.peer_id || '').trim();
            if (!peerId) {
                return { status: 'error', message: 'missing peer_id' };
            }

            await sql`
                UPDATE video_calls
                SET caller_peer_id = CASE
                        WHEN caller_id = ${myId} AND caller_role = ${myRole} THEN ${peerId}
                        ELSE caller_peer_id END,
                    receiver_peer_id = CASE
                        WHEN receiver_id = ${myId} AND receiver_role = ${myRole} THEN ${peerId}
                        ELSE receiver_peer_id END
                WHERE call_status IN ('calling', 'accepted')
                  AND (
                    (caller_id = ${myId} AND caller_role = ${myRole})
                    OR (receiver_id = ${myId} AND receiver_role = ${myRole})
                  )
            `;

            return { status: 'success' };
        }

        if (action === 'end') {
            await sql`
                DELETE FROM video_calls
                WHERE (caller_id = ${myId} AND caller_role = ${myRole})
                   OR (receiver_id = ${myId} AND receiver_role = ${myRole})
            `;
            return { status: 'success' };
        }

        return { status: 'error', message: 'unknown action' };
    });

    if (result == null) {
        return {
            status: 'error',
            message: 'DATABASE_URL is not configured',
        };
    }

    return result;
}

/** call-check.php — polling สถานะสาย */
export async function handleCallCheck(event: H3Event) {
    const identity = resolveMyIdentity(event);
    if (!identity) {
        return { call_status: 'idle' };
    }

    const { myId, myRole } = identity;

    const result = await dbQuery(async (sql) => {
        await ensureVideoCallsSchema(sql);

        const rows = await sql`
            SELECT *
            FROM video_calls
            WHERE (
                (caller_id = ${myId} AND caller_role = ${myRole})
                OR (receiver_id = ${myId} AND receiver_role = ${myRole})
            )
              AND call_status NOT IN ('ended', 'idle')
            ORDER BY id DESC
            LIMIT 1
        `;

        const call = rows[0];
        if (!call) {
            return { call_status: 'idle' };
        }

        const callerRole = String(call.caller_role || 'user');
        const receiverRole = String(call.receiver_role || (callerRole === 'pharma' ? 'user' : 'pharma'));
        const isCaller = Number(call.caller_id) === myId && callerRole === myRole;
        const peerId = isCaller ? Number(call.receiver_id) : Number(call.caller_id);
        const peerRole = isCaller ? receiverRole : callerRole;
        const { peer_name, peer_image } = await fetchPeerProfile(sql, peerId, peerRole);

        return {
            id: Number(call.id || 0),
            caller_id: Number(call.caller_id),
            receiver_id: Number(call.receiver_id),
            call_status: String(call.call_status),
            call_type: String(call.call_type || 'voice'),
            caller_role: callerRole,
            caller_peer_id: String(call.caller_peer_id || ''),
            receiver_peer_id: String(call.receiver_peer_id || ''),
            my_role: myRole,
            is_caller: isCaller,
            peer_id: peerId,
            peer_role: peerRole,
            peer_name,
            peer_image,
        };
    });

    return result ?? { call_status: 'idle' };
}
