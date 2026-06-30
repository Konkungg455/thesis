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
    {
        urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
    }
];

const buildPeerOptions = () => ({
    debug: 1,
    config: { iceServers: ICE_SERVERS }
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
    const localVideo  = ref(null);
    const remoteVideo = ref(null);

    // เก็บ stream ไว้เอง — เพื่อให้ assign กลับเข้า element ได้แม้ component re-mount
    const localStreamRef  = ref(null);
    const remoteStreamRef = ref(null);

    // Watch — เมื่อ element หรือ stream เปลี่ยน → assign srcObject อัตโนมัติ
    watch([localVideo, localStreamRef], async ([el, stream]) => {
        await nextTick();
        if (el && stream) {
            try { el.srcObject = stream; el.play?.().catch(() => {}); } catch (e) {}
        }
    });
    watch([remoteVideo, remoteStreamRef], async ([el, stream]) => {
        await nextTick();
        if (el && stream) {
            try {
                el.srcObject = stream;
                el.muted = false;   // เสียงฝั่งตรงข้ามต้องดังเสมอ
                el.volume = 1;
                el.play?.().catch(() => { setTimeout(() => el.play?.().catch(() => {}), 300); });
            } catch (e) {}
        }
    });

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
                video: withVideo,
                audio: true
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
        remoteStreamRef.value = null;
        if (localVideo.value) localVideo.value.srcObject = null;
        if (remoteVideo.value) remoteVideo.value.srcObject = null;
    };

    /**
     * PeerJS — ฝั่งรับ incoming call จาก peer
     * เก็บไว้รอ answer ตอนผู้ใช้กดรับ
     */
    const handleIncomingPeerCall = (call) => {
        console.log('[PeerJS] incoming call from', call.peer);
        pendingIncoming = call;

        // ถ้า isInCall แล้ว → answer เลย (เกิดจาก caller ส่งใหม่)
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
     * บังคับให้ <video>/<audio> ฝั่งตรงข้ามเล่น (เสียง+ภาพ) — เรียกซ้ำได้
     * กันปัญหา autoplay ถูกบล็อก และ element เพิ่ง mount หลัง stream มาถึง
     */
    const playRemote = () => {
        const el = remoteVideo.value;
        const stream = remoteStreamRef.value;
        if (!el || !stream) return;
        try {
            if (el.srcObject !== stream) el.srcObject = stream;
            el.muted = false;          // ฝั่งตรงข้ามต้องได้ยินเสียง (ไม่ mute)
            el.volume = 1;
            const p = el.play?.();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    // บาง browser บล็อก autoplay — ลองอีกครั้งสั้น ๆ
                    setTimeout(() => { el.play?.().catch(() => {}); }, 300);
                });
            }
        } catch (e) {}
    };

    /**
     * ฝั่งโทร — เรียกไปหา peer พร้อมส่ง stream (+ retry ถ้าไม่ได้ภาพ/เสียงใน 5 วิ)
     */
    let lastRemotePeerId = null;
    let dialRetryTimer = null;
    const dialPeer = (remotePeerId) => {
        if (!peer || peer.destroyed || !localStream) return;
        lastRemotePeerId = remotePeerId;
        try {
            activeCall = peer.call(remotePeerId, localStream);
            attachRemoteStream(activeCall);

            // กันสายแรกหลุด/ฝั่งรับยังไม่พร้อม — ถ้ายังไม่ได้ remote stream ใน 5 วิ ลองโทรใหม่
            if (dialRetryTimer) clearTimeout(dialRetryTimer);
            dialRetryTimer = setTimeout(() => {
                if (isInCall.value && !remoteStreamRef.value && lastRemotePeerId && peer && !peer.destroyed && localStream) {
                    console.warn('[PeerJS] no remote stream yet — re-dialing', lastRemotePeerId);
                    try { activeCall?.close?.(); } catch (e) {}
                    activeCall = peer.call(lastRemotePeerId, localStream);
                    attachRemoteStream(activeCall);
                }
            }, 5000);
        } catch (err) {
            console.error('[PeerJS] dialPeer error:', err);
        }
    };

    const attachRemoteStream = (call) => {
        if (!call) return;
        call.on('stream', async (remoteStream) => {
            remoteStreamRef.value = remoteStream;
            if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
            await nextTick();
            playRemote();
        });
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
            callType.value = data.call_type || 'voice';

            // เรา = ผู้รับ + ยังไม่ได้รับสาย
            if (data.call_status === 'calling' && !data.is_caller && !isReceivingCall.value && !isInCall.value) {
                isReceivingCall.value = true;
                await initPeer();   // เตรียม peer ไว้รอ peer.on('call')
            }

            // เรา = ผู้โทร + ฝั่งรับเพิ่งกดรับ → dial peer
            if (data.call_status === 'accepted' && data.is_caller && isCalling.value) {
                isCalling.value = false;
                isInCall.value = true;
                startCallTimer();
                // ดึง peer ปลายทาง + เรียก
                const remotePeerId = data.receiver_peer_id || buildPeerId(data.peer_role, data.peer_id);
                if (remotePeerId) dialPeer(remotePeerId);
            }
        } catch (err) {
            console.warn('[Call] check error:', err);
        }
    };

    const startPolling = (intervalMs = 2500) => {
        if (pollTimer) return;
        const tick = () => {
            // skip ถ้ายังไม่รู้ id (รอ user load เสร็จ)
            if (!unref(myId)) return;
            checkCallSystem();
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
        callType.value = type;
        try {
            await initPeer();
            await startMedia(type === 'video');
            const res = await apiCallStart(receiverId, type, peer.id);
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
            await startMedia(callType.value === 'video');
            await apiCallAccept(peer.id);
            isInCall.value = true;
            startCallTimer();
            // ถ้า caller ส่ง peer.call() มาก่อนหน้านี้ (เร็วมาก) → answer ทันที
            if (pendingIncoming) answerPendingIncoming();
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

        if (callInterval) clearInterval(callInterval);
        callInterval = null;
        if (dialRetryTimer) { clearTimeout(dialRetryTimer); dialRetryTimer = null; }
        lastRemotePeerId = null;

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
        // refs
        localVideo,
        remoteVideo,
        // actions
        makeCall,
        acceptCall,
        endCall,
        toggleMic,
        toggleCamera,
        startPolling,
        stopPolling,
        initPeer,
        destroy
    };
}
