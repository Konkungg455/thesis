/**
 * useCall — เลือก media layer อัตโนมัติ
 * - Agora.io (แนะนำ): NUXT_PUBLIC_USE_AGORA_RTC=true + NUXT_PUBLIC_AGORA_APP_ID
 * - WebRTC/PeerJS (เดิม): ถ้าไม่เปิด Agora
 */
export function useCall(options) {
    const config = useRuntimeConfig();
    const useAgora = config.public.useAgoraRtc === true
        && String(config.public.agoraAppId || '').trim().length > 0;

    if (useAgora) {
        if (import.meta.client) console.log('[Call] media: Agora RTC');
        return useAgoraCall(options);
    }
    if (import.meta.client) console.log('[Call] media: WebRTC/PeerJS');
    return useWebRTCCall(options);
}
