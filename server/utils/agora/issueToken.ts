import type { H3Event } from 'h3';
import { getAuthContext } from '../bff/sessionContext';
import {
    agoraChannelName,
    agoraUidForRole,
    buildAgoraRtcToken,
} from './rtcToken';

/** ออก Agora RTC token — ใช้ร่วมกับ /api/agora/token และ BFF agora-token.php */
export async function issueAgoraRtcToken(event: H3Event) {
    const query = getQuery(event);
    const callId = Number(query.call_id || 0);
    if (callId <= 0) {
        return { status: 'error', message: 'call_id required' };
    }

    const config = useRuntimeConfig();
    const appId = String(config.public.agoraAppId || '').trim();
    const appCertificate = String(config.agoraAppCertificate || '').trim();
    if (!appId) {
        return { status: 'error', message: 'NUXT_PUBLIC_AGORA_APP_ID not set' };
    }

    const auth = getAuthContext(event);
    const myId = auth.id_pharma || auth.id_account;
    const myRole = auth.id_pharma ? ('pharma' as const) : ('user' as const);
    if (!myId) {
        return { status: 'error', message: 'กรุณา Login ก่อน' };
    }

    const allowed = await dbQuery(async (sql) => {
        const rows = await sql`
            SELECT id, caller_id, receiver_id, caller_role, receiver_role, call_status
            FROM video_calls
            WHERE id = ${callId}
            LIMIT 1
        `;
        const call = rows[0];
        if (!call) return false;
        const status = String(call.call_status || '');
        if (!['calling', 'accepted'].includes(status)) return false;
        const callerMatch = Number(call.caller_id) === myId && String(call.caller_role) === myRole;
        const receiverMatch = Number(call.receiver_id) === myId && String(call.receiver_role) === myRole;
        return callerMatch || receiverMatch;
    });

    if (!allowed) {
        return { status: 'error', message: 'ไม่มีสิทธิ์เข้าช่องสนทนานี้' };
    }

    const channel = agoraChannelName(callId);
    const uid = agoraUidForRole(myRole, myId);
    const token = appCertificate
        ? buildAgoraRtcToken(appId, appCertificate, channel, uid)
        : null;

    return { status: 'success', appId, channel, token, uid };
}
