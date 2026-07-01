/**
 * useWebRTCCall — composable สำหรับระบบโทร/วิดีโอคอลระหว่างผู้ใช้และเภสัชกร
 *
 * ใช้ PeerJS เป็น signaling + transport (WebRTC)
 * Backend (call-handler.php / call-check.php) ทำหน้าที่:
 *   - แจ้งสถานะการโทร (calling / accepted / ended)
 *   - แลก peer_id ของแต่ละฝั่ง
 *   - ส่งข้อมูลคู่สนทนา (ชื่อ + รูป)
 *
 * Peer ID convention: `telebot-<role>-<id>-<session>` — session ไม่ซ้ำต่อแท็บ/เครื่อง
 * Backend เก็บ peer_id จริงผ่าน register_peer / accept (อย่า hardcode id ฝั่งตรงข้าม)
 */

import { ref, computed, onBeforeUnmount, nextTick, watch, unref } from 'vue';

const PEER_PREFIX = 'telebot';

const newPeerSessionToken = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * ICE servers — STUN สำหรับหา public IP + TURN สำหรับ relay เมื่ออยู่หลัง NAT/มือถือ
 * (ถ้าไม่มี TURN สายจะต่อไม่ติดเมื่อสองฝั่งอยู่คนละเครือข่าย/เน็ตมือถือ)
 *
 * ⚠️ TURN ด้านล่างเป็นเซิร์ฟเวอร์สาธารณะ (ฟรี) เหมาะกับทดสอบ/ใช้งานเบา
 *    โปรดักชันจริงควรตั้ง TURN ของตัวเอง (coturn) เพื่อความเสถียร
 */
const STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
];

/** TURN ฟรีสาธารณะ — มักใช้ไม่ได้จากมือถือไทย ใช้เมื่อไม่ได้ตั้ง Metered/.env */
const FALLBACK_TURN_SERVERS = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
        urls: [
            'turn:global.relay.metered.ca:80?transport=udp',
            'turn:global.relay.metered.ca:443?transport=tcp',
            'turns:global.relay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject',
    },
];

const needsTurnRelay = () => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return /ngrok|trycloudflare|vercel\.app/i.test(host)
        || (!/^localhost$|^127\.0\.0\.1$|^192\.168\./.test(host) && host.includes('.'));
};

const isMobileClient = () => {
    if (typeof navigator === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
};

/** มือถือ/แท็บเล็ต + ngrok ต้องใช้ TURN เกือบเสมอ (URL เดียวกัน ≠ วิดีโอวิ่งผ่าน ngrok) */
const relayEscalationMs = () => {
    if (!needsTurnRelay()) return 0;
    if (isMobileClient()) return 2500;
    return 4000;
};

const buildPeerOptions = (iceServers, { forceRelay = false, hasTurn = false } = {}) => ({
    debug: 2,
    config: {
        iceServers,
        iceCandidatePoolSize: 10,
        /** ngrok / คนละเครือข่าย — บังคับ relay ผ่าน TURN เมื่อมี credentials จริง */
        iceTransportPolicy: forceRelay || (needsTurnRelay() && hasTurn) ? 'relay' : 'all',
    },
});

export function useWebRTCCall({ myRole, myId, apiUrl, imagesAccount, imagesPharma, apiBase }) {
    const runtimeConfig = useRuntimeConfig();
    let iceServersCache = null;
    const hasCustomTurn = ref(false);

    const loadIceServers = async ({ bustCache = false } = {}) => {
        if (iceServersCache && !bustCache) return iceServersCache;

        const mergeStun = (servers) => {
            const list = Array.isArray(servers) ? [...servers] : [];
            const hasStun = list.some((s) => String(s?.urls || '').includes('stun:'));
            return hasStun ? list : [...STUN_SERVERS, ...list];
        };

        try {
            const res = await $fetch('/api/webrtc/turn');
            if (Array.isArray(res?.iceServers) && res.iceServers.length) {
                iceServersCache = mergeStun(res.iceServers);
                hasCustomTurn.value = Boolean(res.hasTurn ?? res.iceServers.some((s) => String(s?.urls || '').includes('turn')));
                console.log('[WebRTC] ICE servers:', res.source, hasCustomTurn.value ? '(TURN ok)' : '(STUN only)');
                return iceServersCache;
            }
        } catch (e) {
            console.warn('[WebRTC] /api/webrtc/turn:', e?.message || e);
        }

        const pub = runtimeConfig.public;
        const urls = String(pub.turnUrls || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (urls.length && pub.turnUsername && pub.turnCredential) {
            iceServersCache = [
                ...STUN_SERVERS,
                {
                    urls: urls.length === 1 ? urls[0] : urls,
                    username: pub.turnUsername,
                    credential: pub.turnCredential,
                },
            ];
            hasCustomTurn.value = true;
            console.log('[WebRTC] ICE from NUXT_PUBLIC_TURN_*');
            return iceServersCache;
        }

        iceServersCache = [...STUN_SERVERS, ...FALLBACK_TURN_SERVERS];
        hasCustomTurn.value = false;
        console.warn('[WebRTC] using fallback public TURN — มือถือ↔iPad คนละเน็ตมักไม่ติด');
        return iceServersCache;
    };

    const getPeerOptions = async ({ forceRelay = false } = {}) =>
        buildPeerOptions(await loadIceServers(), { forceRelay, hasTurn: hasCustomTurn.value });
    // ===== Reactive state =====
    const isCalling       = ref(false);
    const isReceivingCall = ref(false);
    const isInCall        = ref(false);
    const callType        = ref('voice');
    const callTimerText   = ref('00:00');

    const isMicOn = ref(true);
    const isCamOn = ref(true);
    const isSpeakerOn = ref(true);

    // ข้อมูลคู่สนทนา (อีกฝ่าย)
    const peerInfo = ref({ id: null, name: '', image: '', role: '' });

    // template refs สำหรับ <video>
    const localVideo       = ref(null);
    const remoteVideo      = ref(null);   // โทรเสียง (element 1px)
    const remoteVideoLive  = ref(null);   // วิดีโอคอล fullscreen
    const remoteAudioSink  = ref(null);   // เสียงฝั่งตรงข้าม (unmuted)

    // เก็บ stream ไว้เอง — เพื่อให้ assign กลับเข้า element ได้แม้ component re-mount
    const localStreamRef  = ref(null);
    const remoteStreamRef = ref(null);
    const hasRemoteVideo  = ref(false);
    const hasRemoteAudio  = ref(false);
    const callConnectStatus = ref('idle'); // idle | connecting | relay | failed | ok
    const iceConnectionState = ref('');

    const hasRemoteVideoTrack = computed(() => {
        const stream = remoteStreamRef.value;
        return !!stream?.getVideoTracks?.().some((t) => t.readyState === 'live' || t.readyState === 'new');
    });

    const showRemoteVideoBg = computed(() => hasRemoteVideo.value || hasRemoteVideoTrack.value);

    const callConnectHint = computed(() => {
        if (hasRemoteVideo.value) return '';
        if (callConnectStatus.value === 'relay') {
            return 'กำลังเชื่อมภาพ/เสียงอีกครั้ง — แตะปุ่มลำโพงหรือแตะจอกลาง';
        }
        if (callConnectStatus.value === 'failed' || iceConnectionState.value === 'failed') {
            return 'เครือข่ายเชื่อม media ไม่ได้ (ICE failed) — มือถือ↔iPad คนละเน็ตต้องมี TURN server ที่ใช้งานได้จริง';
        }
        if (iceConnectionState.value === 'disconnected') {
            return 'การเชื่อม media หลุดชั่วคราว — แตะจอกลางหรือกดลำโพงเพื่อลองใหม่';
        }
        if (hasRemoteAudio.value) {
            return 'ได้ยินเสียงแล้ว — กำลังโหลดภาพ...';
        }
        if (needsTurnRelay() && !hasCustomTurn.value) {
            return 'ยังไม่ได้ตั้ง TURN — ใส่ NUXT_METERED_API_KEY ใน .env หรือทดสอบทั้งสองเครื่อง Wi‑Fi เดียวกัน';
        }
        if (needsTurnRelay()) {
            if (isMobileClient()) {
                return 'วิดีโอไม่ผ่าน ngrok — ระบบกำลังเชื่อมตรงมือถือ↔แท็บเล็ตผ่าน TURN (~3 วิ) • ทั้งสองฝ่ายกด Allow กล้อง+ไมค์';
            }
            return 'วิดีโอเชื่อมตรงระหว่างเครื่อง (ไม่ผ่าน ngrok) — รอ TURN relay • กด Allow กล้อง+ไมค์ทั้งสองฝ่าย';
        }
        return 'กำลังเชื่อมต่อภาพและเสียงจากอีกฝ่าย...';
    });

    let remoteDisplayStream = null;
    let remoteAudioStream   = null;
    let remotePlayLoopTimer = null;

    const normalizeCallType = (type) => String(type || 'voice').trim().toLowerCase();

    const isVideoCallUI = () => isInCall.value && normalizeCallType(callType.value) === 'video';

    const stopRemotePlayLoop = () => {
        if (remotePlayLoopTimer) {
            clearInterval(remotePlayLoopTimer);
            remotePlayLoopTimer = null;
        }
    };

    const startRemotePlayLoop = () => {
        stopRemotePlayLoop();
        let attempts = 0;
        remotePlayLoopTimer = setInterval(() => {
            if (!isInCall.value) {
                stopRemotePlayLoop();
                return;
            }
            playRemote();
            attempts += 1;
            const el = remoteVideoLive.value || remoteVideo.value;
            const stream = remoteStreamRef.value;
            const videoTrack = stream?.getVideoTracks?.()[0];
            const audioTrack = stream?.getAudioTracks?.()[0];
            hasRemoteVideo.value = !!videoTrack
                && (videoTrack.readyState === 'live' || videoTrack.readyState === 'new' || (!!el && el.videoWidth > 0));
            hasRemoteAudio.value = !!audioTrack && audioTrack.readyState === 'live';
            if ((hasRemoteVideo.value || hasRemoteAudio.value) || attempts >= 30) stopRemotePlayLoop();
        }, 500);
    };

    const rebuildRemoteStreams = (sourceStream) => {
        if (!sourceStream) return { display: null, audio: null };

        if (!remoteDisplayStream) remoteDisplayStream = new MediaStream();
        if (!remoteAudioStream) remoteAudioStream = new MediaStream();

        remoteDisplayStream.getTracks().forEach((t) => remoteDisplayStream.removeTrack(t));
        remoteAudioStream.getTracks().forEach((t) => remoteAudioStream.removeTrack(t));

        sourceStream.getVideoTracks().forEach((t) => {
            t.enabled = true;
            remoteDisplayStream.addTrack(t);
        });
        sourceStream.getAudioTracks().forEach((t) => {
            t.enabled = true;
            remoteAudioStream.addTrack(t);
        });

        return { display: remoteDisplayStream, audio: remoteAudioStream };
    };

    const tryPlayElement = (el, { muted = false } = {}) => {
        if (!el) return;
        try {
            el.muted = muted;
            el.volume = 1;
            el.playsInline = true;
            el.setAttribute('playsinline', '');
            el.setAttribute('webkit-playsinline', '');
            const p = el.play?.();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    setTimeout(() => { el.play?.().catch(() => {}); }, 300);
                });
            }
        } catch (e) {}
    };

    const bindStreamToElement = (el, stream, { muted = false } = {}) => {
        if (!el || !stream) return;
        try {
            if (el.srcObject !== stream) el.srcObject = stream;
            el.onloadedmetadata = () => tryPlayElement(el, { muted });
            tryPlayElement(el, { muted });
        } catch (e) {}
    };

    const clearRemoteStreamElements = () => {
        if (remoteVideo.value) remoteVideo.value.srcObject = null;
        if (remoteVideoLive.value) remoteVideoLive.value.srcObject = null;
        if (remoteAudioSink.value) remoteAudioSink.value.srcObject = null;
    };

    const resetRemoteStreams = () => {
        remoteStreamRef.value = null;
        hasRemoteVideo.value = false;
        hasRemoteAudio.value = false;
        remoteDisplayStream = null;
        remoteAudioStream = null;
        clearRemoteStreamElements();
    };

    const mergeIntoRemoteStream = (incoming) => {
        if (!incoming) return null;
        let merged = remoteStreamRef.value;
        if (!merged) merged = new MediaStream();
        incoming.getTracks().forEach((track) => {
            track.enabled = true;
            merged.getTracks()
                .filter((t) => t.kind === track.kind && t.id !== track.id)
                .forEach((t) => {
                    try { merged.removeTrack(t); } catch (e) { /* ignore */ }
                });
            if (!merged.getTracks().some((t) => t.id === track.id)) {
                merged.addTrack(track);
            }
        });
        return merged;
    };

    const updateRemoteMediaFlags = (stream) => {
        if (!stream) return;
        const vt = stream.getVideoTracks?.()[0];
        const at = stream.getAudioTracks?.()[0];
        const el = remoteVideoLive.value || remoteVideo.value;
        if (vt && vt.readyState !== 'ended') hasRemoteVideo.value = true;
        else if (el && el.videoWidth > 0) hasRemoteVideo.value = true;
        if (at?.readyState === 'live') hasRemoteAudio.value = true;
    };

    // Watch — เมื่อ element หรือ stream เปลี่ยน → assign srcObject อัตโนมัติ
    watch([localVideo, localStreamRef], async ([el, stream]) => {
        await nextTick();
        bindStreamToElement(el, stream, { muted: true });
    });

    /** มือถือ Safari บล็อก autoplay — ต้อง unlock หลัง user กดปุ่ม/แตะจอ */
    const unlockRemoteAudio = () => {
        const vol = isSpeakerOn.value ? 1 : 0;
        const muted = !isSpeakerOn.value;
        [remoteAudioSink.value, remoteVideo.value].forEach((el) => {
            if (!el) return;
            el.muted = muted;
            el.volume = vol;
            tryPlayElement(el, { muted });
        });
    };

    const toggleSpeaker = () => {
        isSpeakerOn.value = !isSpeakerOn.value;
        unlockRemoteAudio();
        playRemote();
    };

    let audioUnlockTimer = null;
    const stopAudioUnlockLoop = () => {
        if (audioUnlockTimer) {
            clearInterval(audioUnlockTimer);
            audioUnlockTimer = null;
        }
    };
    const startAudioUnlockLoop = () => {
        stopAudioUnlockLoop();
        audioUnlockTimer = setInterval(() => {
            if (!isInCall.value) {
                stopAudioUnlockLoop();
                return;
            }
            if (!hasRemoteAudio.value || isSpeakerOn.value) unlockRemoteAudio();
        }, 2500);
    };

    /**
     * - โทรเสียง: ใช้ remoteVideo (1px, unmuted) เล่นทั้งเสียง+วิดีโอ
     * - วิดีโอคอล: remoteVideo (fullscreen, muted) แสดงภาพ + remoteAudioSink (1px, unmuted) เล่นเสียง
     *   มือถือ Safari/Chrome บล็อก autoplay ถ้า video ไม่ mute — จึงแยก element
     */
    const playRemote = () => {
        const stream = remoteStreamRef.value;
        if (!stream) return;

        if (isVideoCallUI()) {
            const { display, audio } = rebuildRemoteStreams(stream);
            const videoEl = remoteVideoLive.value || remoteVideo.value;
            bindStreamToElement(videoEl, display || stream, { muted: true });
            const audioStream = audio || stream;
            bindStreamToElement(remoteAudioSink.value, audioStream, { muted: !isSpeakerOn.value });
            bindStreamToElement(remoteVideo.value, audioStream, { muted: !isSpeakerOn.value });
            updateRemoteMediaFlags(stream);
        } else {
            bindStreamToElement(remoteVideo.value, stream, { muted: !isSpeakerOn.value });
            bindStreamToElement(remoteAudioSink.value, stream, { muted: !isSpeakerOn.value });
            hasRemoteAudio.value = !!stream.getAudioTracks?.().length;
        }
    };

    watch([isInCall, callType], async () => {
        if (isInCall.value && normalizeCallType(callType.value) === 'video') {
            await nextTick();
            if (localStreamRef.value) bindStreamToElement(localVideo.value, localStreamRef.value, { muted: true });
            playRemote();
        }
    });

    watch(
        [remoteVideo, remoteVideoLive, remoteAudioSink, remoteStreamRef, localVideo, localStreamRef],
        async () => {
            await nextTick();
            if (localStreamRef.value && localVideo.value) {
                bindStreamToElement(localVideo.value, localStreamRef.value, { muted: true });
            }
            playRemote();
        },
        { flush: 'post' }
    );

    // ===== Internal =====
    let peer            = null;
    let localStream     = null;
    let activeCall      = null;
    let pendingIncoming = null;
    let pollTimer       = null;
    let callInterval    = null;
    let peerReadyPromise = null;
    let inCallConnectTimer = null;
    let relayEscalated = false;
    let forceRelayIce = false;
    let relayAutoTimer = null;
    let relayStuckTimer = null;
    let acceptInProgress = false;
    let peerSessionToken = newPeerSessionToken();
    let unavailableIdRetries = 0;

    const buildMyPeerId = () => {
        const currentMyId = unref(myId);
        if (!currentMyId) return null;
        return `${PEER_PREFIX}-${unref(myRole)}-${currentMyId}-${peerSessionToken}`;
    };

    const regeneratePeerSession = () => {
        peerSessionToken = newPeerSessionToken();
    };

    const waitForMyId = async (timeoutMs = 8000) => {
        if (unref(myId)) return unref(myId);
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            await new Promise((r) => setTimeout(r, 250));
            if (unref(myId)) return unref(myId);
        }
        return null;
    };

    const stopRelayAutoEscalation = () => {
        if (relayAutoTimer) {
            clearTimeout(relayAutoTimer);
            relayAutoTimer = null;
        }
        if (relayStuckTimer) {
            clearTimeout(relayStuckTimer);
            relayStuckTimer = null;
        }
    };

    /** ลองเชื่อม media ใหม่โดยไม่ทำลาย Peer (กัน stuck ที่ TURN relay) */
    const forceMediaReconnect = async () => {
        if (!isInCall.value || !localStream) return;
        if (peer?.id) {
            try { await syncPeerIdToBackend(peer.id); } catch (e) { /* ignore */ }
        }
        if (pendingIncoming && localStream) {
            answerPendingIncoming();
            return;
        }
        try {
            const data = await apiCallCheck();
            if (data?.call_status === 'accepted') {
                await tryConnectRemote(data, { force: true });
            }
        } catch (e) { /* ignore */ }
    };

    /** สร้าง Peer ใหม่ด้วย iceTransportPolicy=relay (แก้จอดำเมื่อ NAT/ngrok) */
    const recreatePeerWithRelay = async () => {
        if (!needsTurnRelay() || !hasCustomTurn.value) return false;
        forceRelayIce = true;
        iceServersCache = null;
        const savedRemote = lastRemotePeerId;
        try { activeCall?.close?.(); } catch (e) { /* ignore */ }
        try { pendingIncoming?.close?.(); } catch (e) { /* ignore */ }
        activeCall = null;
        pendingIncoming = null;
        try { peer?.destroy?.(); } catch (e) { /* ignore */ }
        peer = null;
        peerReadyPromise = null;
        regeneratePeerSession();
        await loadIceServers({ bustCache: true });
        await initPeer();
        if (savedRemote && localStream) {
            lastRemotePeerId = savedRemote;
            await dialPeer(savedRemote, { force: true });
        }
        return true;
    };

    const escalateToRelayIce = async () => {
        if (!isInCall.value || !needsRemoteMedia()) return;
        callConnectStatus.value = 'relay';
        console.warn('[WebRTC] retry media connection (TURN relay)');
        if (!relayEscalated && hasCustomTurn.value) {
            relayEscalated = true;
            const recreated = await recreatePeerWithRelay();
            if (recreated) return;
        }
        await forceMediaReconnect();
        if (relayEscalated) return;
        relayEscalated = true;
        relayStuckTimer = setTimeout(async () => {
            if (!isInCall.value || !needsRemoteMedia()) return;
            callConnectStatus.value = 'connecting';
            relayEscalated = false;
            await forceMediaReconnect();
        }, 8000);
    };

    /** บน ngrok/มือถือ — ลองเชื่อม media ใหม่หลัง 2.5–4 วิ */
    const startRelayAutoEscalation = () => {
        stopRelayAutoEscalation();
        const delayMs = relayEscalationMs();
        if (!delayMs) return;
        relayAutoTimer = setTimeout(async () => {
            if (!isInCall.value || !needsRemoteMedia()) return;
            await escalateToRelayIce();
        }, delayMs);
    };

    const buildPeerImage = (image, role) => {
        if (!image) return '';
        if (role === 'pharma' && imagesPharma) return imagesPharma(image);
        if (imagesAccount) return imagesAccount(image);
        return image;
    };

    /**
     * โหลด PeerJS แบบ dynamic (client only)
     */
    const loadPeer = async () => {
        if (typeof window === 'undefined') return null;
        const mod = await import('peerjs');
        return mod.default || mod.Peer || mod;
    };

    /**
     * Init PeerJS — แต่ละแท็บ/เครื่องได้ peer id ไม่ซ้ำ (กัน unavailable-id บน iPad/มือถือ)
     */
    const initPeer = async () => {
        if (peer && !peer.destroyed) return peer;
        if (peerReadyPromise) return peerReadyPromise;

        const currentMyId = unref(myId);
        if (!currentMyId) return null;

        peerReadyPromise = new Promise(async (resolve, reject) => {
            let settled = false;
            const safeResolve = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            const safeReject = (err) => {
                if (settled) return;
                settled = true;
                peerReadyPromise = null;
                reject(err);
            };

            const openPeer = async () => {
                const Peer = await loadPeer();
                if (!Peer) throw new Error('PeerJS not available');

                const myPeerId = buildMyPeerId();
                if (!myPeerId) throw new Error('Peer id not ready');

                console.log('[PeerJS] connecting as', myPeerId);
                const peerOpts = await getPeerOptions({ forceRelay: forceRelayIce });
                const instance = new Peer(myPeerId, peerOpts);
                peer = instance;

                instance.on('open', async (id) => {
                    console.log('[PeerJS] connected as', id);
                    unavailableIdRetries = 0;
                    try {
                        const data = await apiCallCheck();
                        const active = data?.call_status
                            && data.call_status !== 'idle'
                            && data.call_status !== 'ended';
                        if (active) await apiCallRegisterPeer(id);
                        else await syncPeerIdToBackend(id);
                    } catch (e) {
                        await syncPeerIdToBackend(id);
                    }
                    safeResolve(peer);
                });

                instance.on('disconnected', () => {
                    console.warn('[PeerJS] disconnected — reconnecting');
                    try { instance.reconnect(); } catch (e) {}
                });

                instance.on('call', handleIncomingPeerCall);

                instance.on('error', async (err) => {
                    console.error('[PeerJS] error:', err?.type, err?.message);
                    if (err?.type !== 'unavailable-id') return;

                    unavailableIdRetries += 1;
                    if (unavailableIdRetries > 4) {
                        safeReject(new Error('ไม่สามารถเชื่อมวิดีโอคอลได้ — รีเฟรชหน้าแล้วลองใหม่'));
                        return;
                    }

                    console.warn('[PeerJS] id busy — new session token, retry', unavailableIdRetries);
                    try { instance.destroy(); } catch (e) {}
                    if (peer === instance) peer = null;
                    regeneratePeerSession();
                    await new Promise((r) => setTimeout(r, 350));
                    try {
                        await openPeer();
                    } catch (e2) {
                        safeReject(e2);
                    }
                });
            };

            try {
                await openPeer();
            } catch (err) {
                safeReject(err);
            }
        });

        try {
            return await peerReadyPromise;
        } catch (err) {
            peerReadyPromise = null;
            throw err;
        }
    };

    /**
     * ดึง media stream (กล้อง + ไมโครโฟน)
     */
    const startMedia = async (withVideo = true) => {
        try {
            // กล้อง/ไมโครโฟนต้องอยู่ใน secure context (HTTPS หรือ localhost) เท่านั้น
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('เบราว์เซอร์ไม่อนุญาตให้ใช้กล้อง/ไมโครโฟนบนหน้านี้\nกรุณาเปิดผ่าน HTTPS (เช่นลิงก์ ngrok https://...) ไม่ใช่ http://<IP> โดยตรง');
                throw new Error('getUserMedia unavailable (insecure context)');
            }
            if (localStream) stopMedia();
            const richConstraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: withVideo
                    ? {
                        facingMode: 'user',
                        width: { ideal: 640, max: 1280 },
                        height: { ideal: 480, max: 720 }
                    }
                    : false
            };
            const simpleConstraints = {
                audio: true,
                video: withVideo ? { facingMode: 'user' } : false
            };
            try {
                localStream = await navigator.mediaDevices.getUserMedia(richConstraints);
            } catch (err) {
                if (withVideo && (err?.name === 'OverconstrainedError' || err?.name === 'NotReadableError')) {
                    console.warn('[Media] retry with simpler constraints:', err?.name);
                    localStream = await navigator.mediaDevices.getUserMedia(simpleConstraints);
                } else {
                    throw err;
                }
            }
            localStreamRef.value = localStream;
            await nextTick();
            if (localVideo.value) localVideo.value.srcObject = localStream;
            isCamOn.value = withVideo;
            isMicOn.value = true;
            return localStream;
        } catch (err) {
            console.error('[Media] getUserMedia failed:', err);
            alert('ไม่สามารถเข้าถึงกล้อง/ไมโครโฟน — กรุณาตรวจสอบสิทธิ์การใช้งานในเบราว์เซอร์');
            throw err;
        }
    };

    const stopMedia = () => {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        localStreamRef.value = null;
        resetRemoteStreams();
        if (localVideo.value) localVideo.value.srcObject = null;
    };

    /**
     * PeerJS — ฝั่งรับ incoming call จาก peer
     * เก็บไว้รอ answer ตอนผู้ใช้กดรับ
     */
    const handleIncomingPeerCall = (call) => {
        console.log('[PeerJS] incoming call from', call.peer);
        // สาย outbound ค้างแต่ไม่ได้ media → ปิดแล้วรับสายเข้าแทน
        if (activeCall && !remoteStreamRef.value) {
            try { activeCall.close(); } catch (e) {}
            activeCall = null;
        }
        pendingIncoming = call;

        // รับทันทีถ้าอยู่ในสาย/กำลังโทรและมี media แล้ว (caller ยัง isCalling ได้)
        if ((isInCall.value || isCalling.value) && localStream) {
            answerPendingIncoming();
        }
    };

    /**
     * ฝั่งรับ — answer การโทรของ caller ด้วย localStream
     */
    const answerPendingIncoming = () => {
        if (!pendingIncoming || !localStream) return;
        activeCall = pendingIncoming;
        pendingIncoming = null;

        activeCall.answer(localStream);
        attachRemoteStream(activeCall);
    };

    /**
     * ฝั่งโทร — เรียกไปหา peer พร้อมส่ง stream (+ retry ถ้าไม่ได้ภาพ/เสียงใน 5 วิ)
     */
    let lastRemotePeerId = null;
    let dialRetryTimer = null;
    let lastDialAt = 0;
    let dialAttempts = 0;
    const MAX_DIAL_ATTEMPTS = 12;

    const resolveRemotePeerId = (data) => {
        if (!data) return null;
        if (data.is_caller) {
            return String(data.receiver_peer_id || '').trim() || null;
        }
        return String(data.caller_peer_id || '').trim() || null;
    };

    /** ฝั่งโทร — รอ receiver_peer_id ลง DB หลังกดรับ (สำคัญมือถือ↔iPad) */
    const resolveRemotePeerIdWithWait = async (data, maxWaitMs = 10000) => {
        if (!data) return null;
        if (!data.is_caller) return resolveRemotePeerId(data);

        const started = Date.now();
        while (Date.now() - started < maxWaitMs) {
            if (!isInCall.value) return null;
            const remoteId = data.receiver_peer_id || resolveRemotePeerId(data);
            if (data.receiver_peer_id) return data.receiver_peer_id;
            try {
                const latest = await apiCallCheck();
                if (latest?.call_status !== 'accepted') return null;
                if (latest.receiver_peer_id) return latest.receiver_peer_id;
                data = latest;
            } catch (e) { /* ignore */ }
            await new Promise((r) => setTimeout(r, 400));
        }
        return resolveRemotePeerId(data);
    };

    let connectRetryTimers = [];
    const clearConnectRetryTimers = () => {
        connectRetryTimers.forEach((t) => clearTimeout(t));
        connectRetryTimers = [];
    };

    const scheduleConnectRetries = (data) => {
        clearConnectRetryTimers();
        [400, 1200, 2500, 4500, 7000].forEach((delay) => {
            connectRetryTimers.push(setTimeout(async () => {
                if (!isInCall.value || !needsRemoteMedia()) return;
                try {
                    const latest = await apiCallCheck();
                    if (latest?.call_status === 'accepted') await tryConnectRemote(latest, { force: true });
                } catch (e) {
                    await tryConnectRemote(data, { force: true });
                }
            }, delay));
        });
    };

    const needsRemoteMedia = () => {
        if (!isInCall.value) return false;
        const stream = remoteStreamRef.value;
        if (!stream) return true;
        if (!stream.getAudioTracks?.().length) return true;
        if (isVideoCallUI() && !stream.getVideoTracks?.().length) return true;
        return false;
    };

    const dialPeer = (remotePeerId, { force = false } = {}) => {
        // มีสายเข้ารออยู่แล้ว — อย่าโทรซ้ำ (กัน glare สองฝ่ายโทรพร้อมกัน)
        if (pendingIncoming && localStream) {
            answerPendingIncoming();
            return;
        }
        if (!remotePeerId || !peer || peer.destroyed || !localStream) return;
        const now = Date.now();
        if (!force && remotePeerId === lastRemotePeerId && now - lastDialAt < 2800) return;
        if (dialAttempts >= MAX_DIAL_ATTEMPTS && !force) return;

        lastRemotePeerId = remotePeerId;
        lastDialAt = now;
        dialAttempts += 1;

        try {
            try { activeCall?.close?.(); } catch (e) {}
            console.log('[PeerJS] dialing', remotePeerId, 'attempt', dialAttempts);
            activeCall = peer.call(remotePeerId, localStream, { metadata: { type: callType.value } });
            attachRemoteStream(activeCall);
            activeCall.on('error', (err) => {
                console.warn('[PeerJS] outbound call error:', err?.type || err?.message || err);
                if (!isInCall.value || !needsRemoteMedia()) return;
                setTimeout(() => dialPeer(remotePeerId, { force: true }), 1200);
            });

            if (dialRetryTimer) clearTimeout(dialRetryTimer);
            dialRetryTimer = setTimeout(() => {
                if (needsRemoteMedia() && lastRemotePeerId && peer && !peer.destroyed && localStream) {
                    console.warn('[PeerJS] still no remote media — retry dial');
                    if (pendingIncoming && localStream) {
                        answerPendingIncoming();
                    } else {
                        dialPeer(lastRemotePeerId, { force: true });
                    }
                }
            }, 3500);
        } catch (err) {
            console.error('[PeerJS] dialPeer error:', err);
        }
    };

    const attachRemoteStream = (call) => {
        if (!call) return;

        const handleRemoteStream = (incoming) => {
            if (!incoming) return;
            const remoteStream = mergeIntoRemoteStream(incoming);
            remoteStreamRef.value = remoteStream;
            dialAttempts = 0;
            if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
            clearConnectRetryTimers();
            updateRemoteMediaFlags(remoteStream);
            if (hasRemoteVideo.value || hasRemoteAudio.value) {
                callConnectStatus.value = 'ok';
                stopRelayAutoEscalation();
            }
            nextTick().then(() => {
                playRemote();
                startRemotePlayLoop();
            });
            setTimeout(playRemote, 150);
            setTimeout(playRemote, 600);
            setTimeout(playRemote, 1500);
        };

        call.on('stream', handleRemoteStream);

        const pc = call.peerConnection;
        if (pc) {
            pc.ontrack = (event) => {
                const stream = event.streams?.[0] || new MediaStream([event.track]);
                handleRemoteStream(stream);
            };
            pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                console.log('[WebRTC] connectionState:', state);
                if (state === 'failed' && lastRemotePeerId) {
                    callConnectStatus.value = 'failed';
                    escalateToRelayIce().then(() => {
                        if (pendingIncoming && localStream) answerPendingIncoming();
                        else dialPeer(lastRemotePeerId, { force: true });
                    });
                }
            };
            pc.oniceconnectionstatechange = () => {
                const ice = pc.iceConnectionState;
                iceConnectionState.value = ice;
                console.log('[WebRTC] iceConnectionState:', ice);
                if ((ice === 'failed' || ice === 'disconnected') && lastRemotePeerId && needsRemoteMedia()) {
                    if (ice === 'failed') callConnectStatus.value = 'failed';
                    setTimeout(async () => {
                        if (!needsRemoteMedia()) return;
                        if (!relayEscalated) await escalateToRelayIce();
                        if (pendingIncoming && localStream) answerPendingIncoming();
                        else dialPeer(lastRemotePeerId, { force: true });
                    }, 800);
                }
            };
        }

        call.on('close', () => {
            activeCall = null;
            if (!isInCall.value) return;
            setTimeout(async () => {
                if (!isInCall.value || remoteStreamRef.value) return;
                try {
                    const data = await apiCallCheck();
                    if (data?.call_status === 'accepted') tryConnectRemote(data);
                } catch (e) { /* ignore */ }
            }, 600);
        });
        call.on('error', (err) => console.warn('[PeerJS] call error:', err));
    };

    const tryConnectRemote = async (data, { force = false } = {}) => {
        if (pendingIncoming && localStream) {
            answerPendingIncoming();
            startRemotePlayLoop();
            return;
        }
        if (!needsRemoteMedia() && !force) return;
        if (!localStream) return;

        const remotePeerId = data?.is_caller
            ? await resolveRemotePeerIdWithWait(data)
            : resolveRemotePeerId(data);

        if (!remotePeerId) {
            console.warn('[WebRTC] remote peer id not ready');
            return;
        }

        if (data?.is_caller) {
            dialPeer(remotePeerId, { force: force || true });
        } else if (pendingIncoming) {
            answerPendingIncoming();
        } else {
            dialPeer(remotePeerId, { force: true });
        }
        startRemotePlayLoop();
        scheduleConnectRetries(data);
    };

    const startInCallConnectLoop = () => {
        if (inCallConnectTimer) clearInterval(inCallConnectTimer);
        inCallConnectTimer = setInterval(async () => {
            if (!isInCall.value) {
                clearInterval(inCallConnectTimer);
                inCallConnectTimer = null;
                return;
            }
            if (!needsRemoteMedia()) return;
            try {
                const data = await apiCallCheck();
                if (data?.call_status === 'accepted') tryConnectRemote(data);
            } catch (e) { /* ignore */ }
        }, 2000);
    };

    const stopInCallConnectLoop = () => {
        if (inCallConnectTimer) {
            clearInterval(inCallConnectTimer);
            inCallConnectTimer = null;
        }
    };

    watch(isInCall, async (active) => {
        if (active) {
            callConnectStatus.value = 'connecting';
            isSpeakerOn.value = true;
            await initPeer();
            startInCallConnectLoop();
            startRelayAutoEscalation();
            startAudioUnlockLoop();
            try {
                const data = await apiCallCheck();
                if (data?.call_status === 'accepted') tryConnectRemote(data);
            } catch (e) { /* ignore */ }
        } else {
            stopInCallConnectLoop();
            stopRelayAutoEscalation();
            callConnectStatus.value = 'idle';
        }
    });

    /**
     * ===== Backend signaling =====
     */
    const apiCallStart = async (receiverId, type, callerPeerId) => {
        const body = new FormData();
        body.append('receiver_id', receiverId);
        body.append('call_type', type);
        body.append('caller_peer_id', callerPeerId);
        return await $fetch(apiUrl('call-handler.php?action=start'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
    };

    const apiCallAccept = async (receiverPeerId) => {
        const body = new FormData();
        body.append('receiver_peer_id', receiverPeerId);
        return await $fetch(apiUrl('call-handler.php?action=accept'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
    };

    const apiCallRegisterPeer = async (peerId) => {
        const body = new FormData();
        body.append('peer_id', peerId);
        return await $fetch(apiUrl('call-handler.php?action=register_peer'), {
            method: 'POST',
            body,
            credentials: 'include',
        });
    };

    const syncPeerIdToBackend = async (peerId) => {
        if (!peerId || (!isCalling.value && !isReceivingCall.value && !isInCall.value)) return;
        try {
            await apiCallRegisterPeer(peerId);
        } catch (e) {
            console.warn('[Call] register_peer:', e);
        }
    };

    const apiCallEnd = async () => {
        try {
            await $fetch(apiUrl('call-handler.php?action=end'), { credentials: 'include' });
        } catch (e) {
            console.warn('[Call] end api error:', e);
        }
    };

    const apiCallCheck = async () => {
        return await $fetch(apiUrl('call-check.php'), { credentials: 'include' });
    };

    /**
     * Polling — ตรวจสถานะการโทรอัตโนมัติ
     */
    const checkCallSystem = async () => {
        try {
            const data = await apiCallCheck();
            if (!data?.call_status || data.call_status === 'idle' || data.call_status === 'ended') {
                if (isCalling.value || isReceivingCall.value || isInCall.value) stopCallUI();
                return;
            }

            // อัปเดตข้อมูลคู่สนทนา
            peerInfo.value = {
                id: data.peer_id,
                name: data.peer_name || '',
                image: buildPeerImage(data.peer_image, data.peer_role),
                role: data.peer_role || ''
            };
            callType.value = normalizeCallType(data.call_type);

            // อยู่ในสายแล้ว — ห้ามเปิด overlay สายเข้าซ้ำ (กัน polling ทับตอนกดรับสาย)
            if (isInCall.value || acceptInProgress) {
                isReceivingCall.value = false;
            }

            // เรา = ผู้รับ + ยังไม่ได้รับสาย
            if (data.call_status === 'calling' && !data.is_caller && !isReceivingCall.value && !isInCall.value && !acceptInProgress) {
                isReceivingCall.value = true;
                await initPeer();
            }

            // เรา = ผู้โทร + ฝั่งรับกดรับแล้ว
            if (data.call_status === 'accepted' && data.is_caller && (isCalling.value || isInCall.value)) {
                if (isCalling.value) {
                    isCalling.value = false;
                    isInCall.value = true;
                    startCallTimer();
                }
                tryConnectRemote(data);
            }

            // เรา = ผู้รับ + อยู่ในสายแล้ว
            if (data.call_status === 'accepted' && !data.is_caller && isInCall.value && localStream) {
                tryConnectRemote(data);
            }
        } catch (err) {
            console.warn('[Call] check error:', err);
        }
    };

    const startPolling = (intervalMs = 2000) => {
        stopPolling();
        const tick = async () => {
            if (!unref(myId)) return;
            await checkCallSystem();
            if (!peer || peer.destroyed) {
                try { await initPeer(); } catch (e) { /* ignore */ }
            }
            // ระหว่างโทร poll ถี่ขึ้น — ลดเวลารอเชื่อม WebRTC
            const active = isCalling.value || isReceivingCall.value || isInCall.value;
            const delay = active ? 800 : intervalMs;
            pollTimer = setTimeout(tick, delay);
        };
        tick();
    };

    const stopPolling = () => {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
    };

    /**
     * Timer แสดงเวลาในสาย
     */
    const startCallTimer = () => {
        if (callInterval) clearInterval(callInterval);
        let sec = 0;
        callInterval = setInterval(() => {
            sec++;
            const m = String(Math.floor(sec / 60)).padStart(2, '0');
            const s = String(sec % 60).padStart(2, '0');
            callTimerText.value = `${m}:${s}`;
        }, 1000);
    };

    /**
     * ===== Public actions =====
     */
    const makeCall = async (receiverId, type = 'voice') => {
        if (!receiverId) return;
        callType.value = normalizeCallType(typeof type === 'string' ? type : 'voice');
        try {
            await initPeer();
            await startMedia(callType.value === 'video');
            const res = await apiCallStart(receiverId, callType.value, peer.id);
            if (res?.status !== 'success') {
                throw new Error(res?.message || 'ไม่สามารถเริ่มสายได้');
            }
            await syncPeerIdToBackend(peer.id);
            isCalling.value = true;
            unlockRemoteAudio();
            startAudioUnlockLoop();
        } catch (err) {
            console.error('[Call] makeCall error:', err);
            alert(err?.message || 'ไม่สามารถเริ่มสายได้ — กรุณาลองใหม่');
            stopCallUI();
        }
    };

    const acceptCall = async () => {
        if (acceptInProgress || isInCall.value) return;
        acceptInProgress = true;
        try {
            // เปิดหน้าจอสนทนาทันที — อย่ารอ getUserMedia/Peer (มือถืออาจช้า 3–5 วิ)
            isReceivingCall.value = false;
            isInCall.value = true;
            callConnectStatus.value = 'connecting';
            startCallTimer();

            try {
                const latest = await apiCallCheck();
                if (latest?.call_type) callType.value = normalizeCallType(latest.call_type);
            } catch (e) { /* ignore */ }

            const myIdReady = await waitForMyId();
            if (!myIdReady) {
                throw new Error('ยังไม่ได้ Login — รีเฟรชหน้าแล้วลองรับสายใหม่');
            }

            await initPeer();
            if (!peer?.id) {
                throw new Error('ระบบวิดีโอคอลยังไม่พร้อม — รอ 2 วิแล้วกดรับสายอีกครั้ง');
            }
            await syncPeerIdToBackend(peer.id);

            const wantVideo = normalizeCallType(callType.value) === 'video';
            let mediaOk = false;
            for (let attempt = 0; attempt < 2 && !mediaOk; attempt += 1) {
                try {
                    await startMedia(wantVideo);
                    mediaOk = true;
                } catch (mediaErr) {
                    if (!wantVideo || attempt >= 1) throw mediaErr;
                    console.warn('[Call] video retry attempt', attempt + 1, mediaErr?.name);
                    await new Promise((r) => setTimeout(r, 400));
                }
            }

            const res = await apiCallAccept(peer.id);
            if (res?.status !== 'success') {
                throw new Error(res?.message || 'รับสายไม่สำเร็จ');
            }
            await syncPeerIdToBackend(peer.id);

            if (pendingIncoming) {
                answerPendingIncoming();
            } else {
                try {
                    const latest = await apiCallCheck();
                    tryConnectRemote(latest);
                } catch (e) { /* ignore */ }
            }
            setTimeout(async () => {
                if (!isInCall.value || remoteStreamRef.value) return;
                if (pendingIncoming) {
                    answerPendingIncoming();
                    return;
                }
                try {
                    const latest = await apiCallCheck();
                    tryConnectRemote(latest);
                } catch (e) { /* ignore */ }
            }, 800);
            await nextTick();
            playRemote();
            unlockRemoteAudio();
            startRemotePlayLoop();
            startAudioUnlockLoop();
        } catch (err) {
            console.error('[Call] acceptCall error:', err);
            alert(err?.message || 'รับสายไม่สำเร็จ — ตรวจสอบสิทธิ์กล้อง/ไมค์ในเบราว์เซอร์');
            stopCallUI();
        } finally {
            acceptInProgress = false;
            if (isInCall.value) isReceivingCall.value = false;
        }
    };

    const endCall = async () => {
        await apiCallEnd();
        stopCallUI();
    };

    const stopCallUI = () => {
        isCalling.value = false;
        isReceivingCall.value = false;
        isInCall.value = false;
        isMicOn.value = true;
        isCamOn.value = true;
        isSpeakerOn.value = true;
        callTimerText.value = '00:00';
        peerInfo.value = { id: null, name: '', image: '', role: '' };

        stopRemotePlayLoop();
        stopInCallConnectLoop();
        stopRelayAutoEscalation();
        clearConnectRetryTimers();
        stopAudioUnlockLoop();
        callConnectStatus.value = 'idle';
        iceConnectionState.value = '';
        if (callInterval) clearInterval(callInterval);
        callInterval = null;
        if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
        lastRemotePeerId = null;
        lastDialAt = 0;
        dialAttempts = 0;
        relayEscalated = false;
        forceRelayIce = false;
        iceServersCache = null;

        try { activeCall?.close?.(); } catch (e) {}
        try { pendingIncoming?.close?.(); } catch (e) {}
        activeCall = null;
        pendingIncoming = null;

        stopMedia();
    };

    /**
     * Mic / Cam controls
     */
    const toggleMic = () => {
        if (!localStream) return;
        const enabled = !isMicOn.value;
        localStream.getAudioTracks().forEach(t => (t.enabled = enabled));
        isMicOn.value = enabled;
    };

    const toggleCamera = () => {
        if (!localStream) return;
        const enabled = !isCamOn.value;
        localStream.getVideoTracks().forEach(t => (t.enabled = enabled));
        isCamOn.value = enabled;
    };

    /**
     * Cleanup เมื่อ unmount
     */
    const destroy = () => {
        stopPolling();
        stopCallUI();
        try { peer?.destroy(); } catch (e) {}
        peer = null;
        peerReadyPromise = null;
        regeneratePeerSession();
    };

    const retryRemoteVideo = async () => {
        isSpeakerOn.value = true;
        unlockRemoteAudio();
        playRemote();
        if (!needsRemoteMedia()) return;
        callConnectStatus.value = 'connecting';
        await forceMediaReconnect();
        startRelayAutoEscalation();
    };

    onBeforeUnmount(destroy);

    if (import.meta.client) {
        loadIceServers().catch(() => {});
    }

    return {
        // states
        isCalling,
        isReceivingCall,
        isInCall,
        callType,
        callTimerText,
        isMicOn,
        isCamOn,
        isSpeakerOn,
        peerInfo,
        hasRemoteVideo,
        hasRemoteAudio,
        showRemoteVideoBg,
        callConnectHint,
        // refs
        localVideo,
        remoteVideo,
        remoteVideoLive,
        remoteAudioSink,
        // actions
        makeCall,
        acceptCall,
        endCall,
        toggleMic,
        toggleCamera,
        toggleSpeaker,
        startPolling,
        stopPolling,
        initPeer,
        retryRemoteVideo,
        destroy
    };
}
