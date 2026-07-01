import { issueAgoraRtcToken } from '../../utils/agora/issueToken';

/** ออก Agora RTC token — ต้องเป็นผู้เข้าร่วมสายใน video_calls */
export default defineEventHandler(async (event) => {
    const result = await issueAgoraRtcToken(event);
    if (result.status === 'error') {
        const code = result.message?.includes('Login') ? 401
            : result.message?.includes('สิทธิ์') ? 403
                : result.message?.includes('call_id') ? 400
                    : result.message?.includes('APP_ID') ? 503
                        : 400;
        throw createError({ statusCode: code, message: result.message || 'error' });
    }
    return {
        appId: result.appId,
        channel: result.channel,
        token: result.token,
        uid: result.uid,
    };
});
