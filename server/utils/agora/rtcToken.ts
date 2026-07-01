import agoraToken from 'agora-token';

const { RtcRole, RtcTokenBuilder } = agoraToken;

/** Agora RTC channel name จาก video_calls.id */
export function agoraChannelName(callId: number): string {
    return `telebot-call-${callId}`;
}

/** UID ไม่ชนกันระหว่าง user กับ pharma (เช่น id=1 ทั้งคู่) */
export function agoraUidForRole(role: 'user' | 'pharma', id: number): number {
    const n = Math.floor(Number(id) || 0);
    if (n <= 0) return 0;
    return role === 'pharma' ? n + 1_000_000 : n;
}

/** สร้าง RTC token — หมดอายุ 1 ชม. (เพียงพอต่อสาย) */
export function buildAgoraRtcToken(
    appId: string,
    appCertificate: string,
    channelName: string,
    uid: number,
    ttlSeconds = 3600,
): string {
    return RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        RtcRole.PUBLISHER,
        ttlSeconds,
        ttlSeconds,
    );
}
