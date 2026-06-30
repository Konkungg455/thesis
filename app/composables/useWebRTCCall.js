/**
 * useWebRTCCall — composable สำหรับระบบโทร/วิดีโอคอลระหว่างผู้ใช้และเภสัชกร
 *
 * ใช้ PeerJS เป็น signaling + transport (WebRTC)
 * Backend (call-handler.php / call-check.php) ทำหน้าที่:
 *   - แจ้งสถานะการโทร (calling / accepted / ended)
 *   - แลก peer_id ของแต่ละฝั่ง
 *   - ส่งข้อมูลคู่สนทนา (ชื่อ + รูป)
 *
 * Peer ID convention: `telebot-<role>-<id>` (เช่น telebot-pharma-2, telebot-user-5)
 */

import { ref, computed, onBeforeUnmount, nextTick, watch, unref } from 'vue';

const PEER_PREFIX = 'telebot';

const buildPeerId = (role, id) => `${PEER_PREFIX}-${unref(role)}-${unref(id)}`;

/**
 * ICE servers — STUN สำหรับหา public IP + TURN สำหรับ relay เมื่ออยู่หลัง NAT/มือถือ
 * (ถ้าไม่มี TURN สายจะต่อไม่ติดเมื่อสองฝั่งอยู่คนละเครือข่าย/เน็ตมือถือ)
 *
 * ⚠️ TURN ด้านล่างเป็นเซิร์ฟเวอร์สาธารณะ (ฟรี) เหมาะกับทดสอบ/ใช้งานเบา
 *    โปรดักชันจริงควรตั้ง TURN ของตัวเอง (coturn) เพื่อความเสถียร
 */
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp',
            'turns:openrelay.metered.ca:443'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

const buildPeerOptions = () => ({
    debug: 1,
    config: {
        iceServers: ICE_SERVERS,
        iceCandidatePoolSize: 10
    }
});

export function useWebRTCCall({ myRole, myId, apiUrl, imagesAccount, imagesPharma, apiBase }) {
    // ===== Reactive state =====
    const isCalling       = ref(false);
    const isReceivingCall = ref(false);
    const isInCall        = ref(false);
    const callType        = ref('voice');
    const callTimerText   = ref('00:00');

    const isMicOn = ref(true);
    const isCamOn = ref(true);

    // ข้อมูลคู่สนทนา (อีกฝ่าย)
    const peerInfo = ref({ id: null, name: '', image: '', role: '' });

    // template refs สำหรับ <video>
    const localVideo       = ref(null);
    const remoteVideo      = ref(null);   // voice overlay (1px) หรือ fullscreen .remote-video-bg
    const remoteAudioSink  = ref(null);   // element ซ่อนสำหรับเสียงฝั่งตรงข้าม (วิดีโอคอลบนมือถือ)

    // เก็บ stream ไว้เอง — เพื่อให้ assign กลับเข้า element ได้แม้ component re-mount
    const localStreamRef  = ref(null);
    const remoteStreamRef = ref(null);
    const hasRemoteVideo  = ref(false);

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
            const el = remoteVideo.value;
            const stream = remoteStreamRef.value;
            const hasVideoTrack = !!stream?.getVideoTracks?.().length;
            hasRemoteVideo.value = hasVideoTrack && !!el && el.videoWidth > 0;
            if (hasRemoteVideo.value || attempts >= 24) stopRemotePlayLoop();
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
        if (remoteAudioSink.value) remoteAudioSink.value.srcObject = null;
    };

    const resetRemoteStreams = () => {
        remoteStreamRef.value = null;
        hasRemoteVideo.value = false;
        remoteDisplayStream = null;
        remoteAudioStream = null;
        clearRemoteStreamElements();
    };

    // Watch — เมื่อ element หรือ stream เปลี่ยน → assign srcObject อัตโนมัติ
    watch([localVideo, localStreamRef], async ([el, stream]) => {
        await nextTick();
        bindStreamToElement(el, stream, { muted: true });
    });

    /**
     * ฝั่งตรงข้าม:
     * - โทรเสียง: ใช้ remoteVideo (1px, unmuted) เล่นทั้งเสียง+วิดีโอ
     * - วิดีโอคอล: remoteVideo (fullscreen, muted) แสดงภาพ + remoteAudioSink (1px, unmuted) เล่นเสียง
     *   มือถือ Safari/Chrome บล็อก autoplay ถ้า video ไม่ mute — จึงแยก element
     */
    const playRemote = () => {
        const stream = remoteStreamRef.value;
        if (!stream) return;

        if (isVideoCallUI()) {
            // ใช้ stream เดิมทั้งก้อน — อย่าแยก track (มือถือบางรุ่นแยกแล้วภาพไม่ขึ้น)
            bindStreamToElement(remoteVideo.value, stream, { muted: true });
            bindStreamToElement(remoteAudioSink.value, stream, { muted: false });
            hasRemoteVideo.value = !!stream.getVideoTracks?.().length
                && (remoteVideo.value?.videoWidth > 0 || stream.getVideoTracks()[0]?.readyState === 'live');
        } else {
            bindStreamToElement(remoteVideo.value, stream, { muted: false });
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
        [remoteVideo, remoteAudioSink, remoteStreamRef, localVideo, localStreamRef],
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
    let activeCall      = null;          // PeerJS call ที่กำลัง active
    let pendingIncoming = null;          // incoming PeerJS call ที่รอ answer
    let pollTimer       = null;
    let callInterval    = null;
    let peerReadyPromise = null;

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
     * Init PeerJS เมื่อจำเป็น — ใช้ peer id ที่ unique ตาม role+id
     */
    const initPeer = async () => {
        if (peer && !peer.destroyed) return peer;
        if (peerReadyPromise) return peerReadyPromise;

        const currentMyId = unref(myId);
        if (!currentMyId) {
            // ยังไม่รู้ id ของตัวเอง — ไม่ init peer
            return null;
        }

        peerReadyPromise = new Promise(async (resolve, reject) => {
            try {
                const Peer = await loadPeer();
                if (!Peer) return reject(new Error('PeerJS not available'));

                const myPeerId = buildPeerId(myRole, currentMyId);

                // ใช้ PeerJS public cloud (ฟรี + พร้อมใช้ทันที) เป็น signaling
                peer = new Peer(myPeerId, buildPeerOptions());

                peer.on('open', (id) => {
                    console.log('[PeerJS] connected as', id);
                    resolve(peer);
                });

                // signaling หลุด — พยายามต่อใหม่อัตโนมัติ (ไม่งั้นสายถัดไปจะโทรไม่ติด)
                peer.on('disconnected', () => {
                    console.warn('[PeerJS] disconnected — reconnecting');
                    try { peer.reconnect(); } catch (e) {}
                });

                peer.on('error', (err) => {
                    console.error('[PeerJS] error:', err?.type, err?.message);
                    if (err?.type === 'unavailable-id') {
                        // มี session ของเราเปิดอยู่ที่แท็บอื่น — ลองใช้ id ใหม่ที่ random
                        try { peer.destroy(); } catch (e) {}
                        const fallback = `${myPeerId}-${Math.floor(Math.random() * 10000)}`;
                        peer = new Peer(fallback, buildPeerOptions());
                        peer.on('open', () => resolve(peer));
                        peer.on('call', handleIncomingPeerCall);
                    }
                });

                peer.on('call', handleIncomingPeerCall);
            } catch (err) {
                reject(err);
            }
        });

        return peerReadyPromise;
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
            localStream = await navigator.mediaDevices.getUserMedia({
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
            });
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

        if (isInCall.value && localStream) {
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
    const MAX_DIAL_ATTEMPTS = 6;

    const resolveRemotePeerId = (data) => {
        if (!data) return null;
        if (data.is_caller) {
            return data.receiver_peer_id || buildPeerId(data.peer_role, data.peer_id);
        }
        return data.caller_peer_id || buildPeerId(data.peer_role, data.peer_id);
    };

    const needsRemoteMedia = () => {
        if (!isInCall.value) return false;
        const stream = remoteStreamRef.value;
        if (!stream) return true;
        if (isVideoCallUI() && !stream.getVideoTracks?.().length) return true;
        return false;
    };

    const dialPeer = (remotePeerId, { force = false } = {}) => {
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

            if (dialRetryTimer) clearTimeout(dialRetryTimer);
            dialRetryTimer = setTimeout(() => {
                if (needsRemoteMedia() && lastRemotePeerId && peer && !peer.destroyed && localStream) {
                    console.warn('[PeerJS] still no remote media — retry dial');
                    dialPeer(lastRemotePeerId, { force: true });
                }
            }, 4000);
        } catch (err) {
            console.error('[PeerJS] dialPeer error:', err);
        }
    };

    const attachRemoteStream = (call) => {
        if (!call) return;

        const handleRemoteStream = (remoteStream) => {
            if (!remoteStream) return;
            remoteStream.getTracks().forEach((t) => { t.enabled = true; });
            remoteStreamRef.value = remoteStream;
            dialAttempts = 0;
            if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
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
                    dialPeer(lastRemotePeerId, { force: true });
                }
            };
            pc.oniceconnectionstatechange = () => {
                const ice = pc.iceConnectionState;
                console.log('[WebRTC] iceConnectionState:', ice);
                if ((ice === 'failed' || ice === 'disconnected') && lastRemotePeerId && needsRemoteMedia()) {
                    setTimeout(() => dialPeer(lastRemotePeerId, { force: true }), 800);
                }
            };
        }

        call.on('close', () => stopCallUI());
        call.on('error', (err) => console.warn('[PeerJS] call error:', err));
    };

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

            // เรา = ผู้รับ + ยังไม่ได้รับสาย
            if (data.call_status === 'calling' && !data.is_caller && !isReceivingCall.value && !isInCall.value) {
                isReceivingCall.value = true;
                await initPeer();   // เตรียม peer ไว้รอ peer.on('call')
            }

            // เรา = ผู้โทร + ฝั่งรับกดรับแล้ว
            if (data.call_status === 'accepted' && data.is_caller && (isCalling.value || isInCall.value)) {
                if (isCalling.value) {
                    isCalling.value = false;
                    isInCall.value = true;
                    startCallTimer();
                }
                if (needsRemoteMedia()) {
                    const remotePeerId = resolveRemotePeerId(data);
                    if (remotePeerId) dialPeer(remotePeerId);
                    startRemotePlayLoop();
                }
            }

            // เรา = ผู้รับ + อยู่ในสายแล้ว — รับสายหรือโทรกลับ caller ถ้ายังไม่ได้ stream
            if (data.call_status === 'accepted' && !data.is_caller && isInCall.value && localStream) {
                if (pendingIncoming) {
                    answerPendingIncoming();
                } else if (needsRemoteMedia()) {
                    const remotePeerId = resolveRemotePeerId(data);
                    if (remotePeerId) dialPeer(remotePeerId);
                    startRemotePlayLoop();
                }
            }
        } catch (err) {
            console.warn('[Call] check error:', err);
        }
    };

    const startPolling = (intervalMs = 2000) => {
        if (pollTimer) return;
        const tick = async () => {
            if (!unref(myId)) return;
            await checkCallSystem();
            // เตรียม Peer ไว้ก่อน — ลดโอกาสพลาดสาย
            if (!peer || peer.destroyed) {
                try { await initPeer(); } catch (e) { /* ignore */ }
            }
        };
        tick();
        pollTimer = setInterval(tick, intervalMs);
    };

    const stopPolling = () => {
        if (pollTimer) clearInterval(pollTimer);
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
            isCalling.value = true;
        } catch (err) {
            console.error('[Call] makeCall error:', err);
            alert(err?.message || 'ไม่สามารถเริ่มสายได้ — กรุณาลองใหม่');
            stopCallUI();
        }
    };

    const acceptCall = async () => {
        try {
            await initPeer();
            isReceivingCall.value = false;
            // ดึง call_type ล่าสุดจาก backend ก่อนเปิดกล้อง (กันฝั่งรับเปิดแค่ไมค์ตอนสายวิดีโอ)
            try {
                const latest = await apiCallCheck();
                if (latest?.call_type) callType.value = normalizeCallType(latest.call_type);
            } catch (e) {}
            await startMedia(normalizeCallType(callType.value) === 'video');
            await apiCallAccept(peer.id);
            isInCall.value = true;
            startCallTimer();
            if (pendingIncoming) answerPendingIncoming();
            // ฝั่งรับ: ถ้า caller ยังไม่โทรมา ให้โทรหา caller เอง (สำคัญบนมือถือ/ngrok)
            setTimeout(async () => {
                if (!isInCall.value || remoteStreamRef.value) return;
                if (pendingIncoming) {
                    answerPendingIncoming();
                    return;
                }
                try {
                    const latest = await apiCallCheck();
                    const callerPeerId = resolveRemotePeerId(latest);
                    if (callerPeerId) dialPeer(callerPeerId, { force: true });
                } catch (e) { /* ignore */ }
            }, 1200);
            await nextTick();
            playRemote();
            startRemotePlayLoop();
        } catch (err) {
            console.error('[Call] acceptCall error:', err);
            stopCallUI();
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
        callTimerText.value = '00:00';
        peerInfo.value = { id: null, name: '', image: '', role: '' };

        stopRemotePlayLoop();
        if (callInterval) clearInterval(callInterval);
        callInterval = null;
        if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
        lastRemotePeerId = null;
        lastDialAt = 0;
        dialAttempts = 0;

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
    };

    const retryRemoteVideo = async () => {
        playRemote();
        if (!needsRemoteMedia()) return;
        try {
            const data = await apiCallCheck();
            const remotePeerId = resolveRemotePeerId(data);
            if (remotePeerId) dialPeer(remotePeerId, { force: true });
        } catch (e) {
            if (lastRemotePeerId) dialPeer(lastRemotePeerId, { force: true });
        }
    };

    onBeforeUnmount(destroy);

    return {
        // states
        isCalling,
        isReceivingCall,
        isInCall,
        callType,
        callTimerText,
        isMicOn,
        isCamOn,
        peerInfo,
        hasRemoteVideo,
        // refs
        localVideo,
        remoteVideo,
        remoteAudioSink,
        // actions
        makeCall,
        acceptCall,
        endCall,
        toggleMic,
        toggleCamera,
        startPolling,
        stopPolling,
        initPeer,
        retryRemoteVideo,
        destroy
    };
}
