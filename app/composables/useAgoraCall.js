/**
 * useAgoraCall — วิดีโอ/เสียงผ่าน Agora.io RTC
 * ใช้ call-handler / call-check เดิมสำหรับสัญญาณโทร (calling/accepted/ended)
 * Media วิ่งผ่าน Agora cloud (~10,000 นาทีฟรี/เดือน) — ไม่ต้องตั้ง TURN เอง
 */
import { ref, computed, onBeforeUnmount, nextTick, watch, unref } from 'vue';

const AGORA_PLACEHOLDER_PEER = 'agora';

/** Safari / iOS ต้องเล่นเสียงผ่าน HTMLMediaElement ถึงจะออกลำโพง */
const prefersElementPlayback = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox/i.test(ua)) return true;
    return false;
};

/** BFF ใช้ id จาก query (ไม่ใช่ cookie) — ต้องส่งเหมือน apiUrl() */
const buildBffAuthQuery = (myRole, myId) => {
    const q = {};
    let id = Number(unref(myId)) || 0;
    let role = String(unref(myRole) || '');

    if ((!id || !role) && import.meta.client) {
        try {
            const u = JSON.parse(localStorage.getItem('user_data') || '{}');
            if (Number(u.id_pharma) > 0) {
                id = Number(u.id_pharma);
                role = 'pharma';
            } else if (Number(u.id_account) > 0) {
                id = Number(u.id_account);
                role = 'user';
            } else if ((u.role || u.role_account) === 'pharmacist' && Number(u.id) > 0) {
                id = Number(u.id);
                role = 'pharma';
            } else if (Number(u.id) > 0) {
                id = Number(u.id);
                role = role || 'user';
            }
        } catch { /* ignore */ }
    }

    if (role === 'pharma' && id > 0) {
        q.id_pharma = id;
        q.role = 'pharmacist';
    } else if (id > 0) {
        q.id_account = id;
        q.role = 'user';
    }
    return q;
};

export function useAgoraCall({ myRole, myId, apiUrl, imagesAccount, imagesPharma }) {
    const runtimeConfig = useRuntimeConfig();
    const appId = String(runtimeConfig.public.agoraAppId || '').trim();

    const isCalling = ref(false);
    const isReceivingCall = ref(false);
    const isInCall = ref(false);
    const callType = ref('voice');
    const callTimerText = ref('00:00');

    const isMicOn = ref(true);
    const isCamOn = ref(true);
    const isSpeakerOn = ref(true);

    const peerInfo = ref({ id: null, name: '', image: '', role: '' });

    const localVideo = ref(null);
    const remoteVideo = ref(null);
    const remoteVideoLive = ref(null);
    const remoteAudioSink = ref(null);

    const localStreamRef = ref(null);
    const remoteStreamRef = ref(null);
    const hasRemoteVideo = ref(false);
    const hasRemoteAudio = ref(false);
    const callConnectStatus = ref('idle');

    const showRemoteVideoBg = computed(() => hasRemoteVideo.value);

    const callConnectHint = computed(() => {
        if (hasRemoteVideo.value) return '';
        if (callConnectStatus.value === 'bad_token') {
            return 'Token Agora ไม่ถูกต้อง — คัดลอก Primary Certificate ล่าสุดจาก Console ใส่ NUXT_AGORA_APP_CERTIFICATE แล้ว restart';
        }
        if (callConnectStatus.value === 'auth') {
            return 'ยังไม่ได้ Login — รีเฟรชหน้าแล้วลองโทรใหม่';
        }
        if (callConnectStatus.value === 'forbidden') {
            return 'ไม่มีสิทธิ์เข้าช่องสนทนา — ลองวางสายแล้วโทรใหม่';
        }
        if (callConnectStatus.value === 'failed') {
            return 'เชื่อมต่อ Agora ไม่สำเร็จ — ตรวจสอบ App ID / Certificate ใน .env แล้ว restart npm run dev';
        }
        if (hasRemoteAudio.value && !hasRemoteVideo.value && isVideoCallUI()) {
            return 'ได้ยินเสียงแล้ว — กำลังโหลดภาพ... แตะหน้าจอถ้าไม่มีเสียง';
        }
        if (hasRemoteAudio.value) return '';
        if (callConnectStatus.value === 'connecting' || isInCall.value) {
            const appleHint = prefersElementPlayback() ? ' • แตะหน้าจอเพื่อเปิดเสียง' : ' • แตะปุ่มลำโพงถ้าไม่มีเสียง';
            return `กำลังเชื่อมต่อผ่าน Agora — กด Allow กล้อง+ไมค์${appleHint}`;
        }
        return '';
    });

    let AgoraRTC = null;
    let agoraClient = null;
    let localAudioTrack = null;
    let localVideoTrack = null;
    let localStream = null;
    let pollTimer = null;
    let callInterval = null;
    let acceptInProgress = false;
    let currentCallId = 0;
    let joinInProgress = false;
    let joinedChannel = '';
    let remoteAgoraAudioTrack = null;
    let remoteAgoraVideoTrack = null;
    let audioUnlockTimer = null;
    let remoteSyncTimer = null;
    let audioUnlockAttempts = 0;

    const normalizeCallType = (type) => String(type || 'voice').trim().toLowerCase();
    const isVideoCallUI = () => isInCall.value && normalizeCallType(callType.value) === 'video';

    const agoraUid = () => {
        const id = Number(unref(myId)) || 0;
        if (!id) return 0;
        return unref(myRole) === 'pharma' ? id + 1_000_000 : id;
    };

    const buildPeerImage = (image, role) => {
        if (!image) return '';
        if (role === 'pharma' && imagesPharma) return imagesPharma(image);
        if (imagesAccount) return imagesAccount(image);
        return image;
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
                p.catch(() => setTimeout(() => { el.play?.().catch(() => {}); }, 300));
            }
        } catch (e) { /* ignore */ }
    };

    const bindStreamToElement = (el, stream, { muted = false } = {}) => {
        if (!el || !stream) return;
        try {
            if (el.srcObject !== stream) el.srcObject = stream;
            el.onloadedmetadata = () => tryPlayElement(el, { muted });
            tryPlayElement(el, { muted });
        } catch (e) { /* ignore */ }
    };

    const clearRemoteStreamElements = () => {
        if (remoteVideo.value) {
            remoteVideo.value.srcObject = null;
            remoteVideo.value.classList.remove('has-stream');
        }
        if (remoteVideoLive.value) {
            remoteVideoLive.value.srcObject = null;
            remoteVideoLive.value.classList.remove('has-stream');
        }
        if (remoteAudioSink.value) remoteAudioSink.value.srcObject = null;
    };

    const resetRemoteStreams = () => {
        remoteStreamRef.value = null;
        hasRemoteVideo.value = false;
        hasRemoteAudio.value = false;
        clearRemoteStreamElements();
    };

    const resumeAgoraAudio = async () => {
        try {
            await loadAgoraSdk();
            if (typeof AgoraRTC?.resumeAudioContext === 'function') {
                await AgoraRTC.resumeAudioContext();
            }
        } catch (e) { /* ignore */ }
    };

    const unlockRemoteAudio = () => {
        const muted = !isSpeakerOn.value;
        const vol = isSpeakerOn.value ? 100 : 0;
        if (remoteAudioSink.value) {
            remoteAudioSink.value.muted = muted;
            remoteAudioSink.value.volume = isSpeakerOn.value ? 1 : 0;
            tryPlayElement(remoteAudioSink.value, { muted });
        }
        try {
            remoteAgoraAudioTrack?.setVolume?.(vol);
        } catch (e) { /* ignore */ }
    };

    const playRemoteAgoraVideo = async () => {
        if (!remoteAgoraVideoTrack) return;
        try {
            await nextTick();
            const el = remoteVideoLive.value || remoteVideo.value;
            if (!el) return;
            if (remoteAgoraVideoTrack.isPlaying) {
                el.classList.add('has-stream');
                hasRemoteVideo.value = true;
                return;
            }
            el.classList.add('has-stream');
            try {
                await remoteAgoraVideoTrack.play(el, { fit: 'cover' });
            } catch {
                await remoteAgoraVideoTrack.play(el);
            }
            hasRemoteVideo.value = true;
            callConnectStatus.value = 'ok';
        } catch (e) {
            console.warn('[Agora] video play:', e?.message || e);
        }
    };

    const playRemoteAgoraAudio = async (force = false) => {
        if (!remoteAgoraAudioTrack) return;
        try {
            await resumeAgoraAudio();
            await nextTick();
            const vol = isSpeakerOn.value ? 100 : 0;
            const apple = prefersElementPlayback();

            if (remoteAgoraAudioTrack.isPlaying && !force && !apple) {
                remoteAgoraAudioTrack.setVolume?.(vol);
                hasRemoteAudio.value = true;
                return;
            }

            if (force) {
                try { remoteAgoraAudioTrack.stop?.(); } catch (e) { /* ignore */ }
            }

            let played = false;
            const el = remoteAudioSink.value;
            if (el) {
                el.muted = !isSpeakerOn.value;
                el.volume = isSpeakerOn.value ? 1 : 0;
                el.setAttribute('playsinline', '');
                el.setAttribute('webkit-playsinline', '');
                try {
                    await remoteAgoraAudioTrack.play(el);
                    tryPlayElement(el, { muted: !isSpeakerOn.value });
                    played = true;
                } catch (e1) {
                    console.warn('[Agora] audio play (element):', e1?.message || e1);
                }
            }

            if (!played) {
                try {
                    await remoteAgoraAudioTrack.play();
                    played = true;
                } catch (e2) {
                    console.warn('[Agora] audio play (webaudio):', e2?.message || e2);
                }
            }

            remoteAgoraAudioTrack.setVolume?.(vol);
            if (played) {
                hasRemoteAudio.value = true;
                callConnectStatus.value = 'ok';
            }
        } catch (e) {
            console.warn('[Agora] audio play:', e?.message || e);
        }
    };

    const playAllRemoteAgora = async () => {
        await playRemoteAgoraVideo();
        await playRemoteAgoraAudio();
        unlockRemoteAudio();
    };

    const buildLocalPreviewStream = () => {
        if (!localVideoTrack?.getMediaStreamTrack) return null;
        return new MediaStream([localVideoTrack.getMediaStreamTrack()]);
    };

    const ensureLocalPreviewSilent = (el) => {
        if (!el) return;
        el.muted = true;
        el.volume = 0;
        el.setAttribute('muted', '');
    };

    const playLocalAgoraVideo = async () => {
        if (!localVideoTrack) return;
        await nextTick();
        if (localVideo.value) {
            ensureLocalPreviewSilent(localVideo.value);
            try { await localVideoTrack.play(localVideo.value); } catch (e) { /* ignore */ }
        }
    };

    const stopRemoteSyncLoop = () => {
        if (remoteSyncTimer) {
            clearInterval(remoteSyncTimer);
            remoteSyncTimer = null;
        }
    };

    const syncRemoteMedia = async () => {
        if (!agoraClient || !isInCall.value) return;
        await subscribeExistingRemoteUsers();
        for (const user of agoraClient.remoteUsers || []) {
            if (user.audioTrack) {
                remoteAgoraAudioTrack = user.audioTrack;
                hasRemoteAudio.value = true;
            }
            if (user.videoTrack) {
                remoteAgoraVideoTrack = user.videoTrack;
                hasRemoteVideo.value = true;
            }
        }
        await nextTick();
        await playLocalAgoraVideo();
        await playAllRemoteAgora();
    };

    const startRemoteSyncLoop = () => {
        stopRemoteSyncLoop();
        remoteSyncTimer = setInterval(() => {
            if (!isInCall.value) {
                stopRemoteSyncLoop();
                return;
            }
            syncRemoteMedia();
        }, 2000);
    };

    const stopAudioUnlockLoop = () => {
        if (audioUnlockTimer) {
            clearInterval(audioUnlockTimer);
            audioUnlockTimer = null;
        }
    };

    const startAudioUnlockLoop = () => {
        stopAudioUnlockLoop();
        audioUnlockAttempts = 0;
        audioUnlockTimer = setInterval(() => {
            if (!isInCall.value) {
                stopAudioUnlockLoop();
                return;
            }
            if (isSpeakerOn.value) {
                audioUnlockAttempts += 1;
                const force = prefersElementPlayback() && audioUnlockAttempts % 3 === 0;
                unlockRemoteAudio();
                playRemoteAgoraAudio(force);
                playRemoteAgoraVideo();
            }
        }, 2500);
    };

    const playRemote = () => {
        // อย่า bind srcObject ทับ Agora track — จะทำให้เสียง/ภาพฝั่งตรงข้ามหาย
        if (remoteAgoraAudioTrack || remoteAgoraVideoTrack) {
            playAllRemoteAgora();
            return;
        }
        const stream = remoteStreamRef.value;
        if (!stream) return;
        if (isVideoCallUI()) {
            bindStreamToElement(remoteVideoLive.value || remoteVideo.value, stream, { muted: true });
            const audioOnly = new MediaStream(stream.getAudioTracks());
            bindStreamToElement(remoteAudioSink.value, audioOnly, { muted: !isSpeakerOn.value });
        } else {
            bindStreamToElement(remoteVideo.value, stream, { muted: !isSpeakerOn.value });
            bindStreamToElement(remoteAudioSink.value, stream, { muted: !isSpeakerOn.value });
        }
        hasRemoteAudio.value = !!stream.getAudioTracks?.().length;
        hasRemoteVideo.value = !!stream.getVideoTracks?.().length;
    };

    watch([localVideo, localStreamRef], async ([el, stream]) => {
        if (!el) return;
        ensureLocalPreviewSilent(el);
        // preview เฉพาะวิดีโอ — ห้าม bind เสียงไมค์ตัวเองเข้า element
        if (localVideoTrack) {
            await playLocalAgoraVideo();
            return;
        }
        if (stream) {
            await nextTick();
            bindStreamToElement(el, stream, { muted: true });
        }
    });

    watch(
        [remoteVideo, remoteVideoLive, remoteAudioSink, localVideo, isInCall, callType],
        async () => {
            if (!isInCall.value) return;
            await nextTick();
            await playLocalAgoraVideo();
            await playAllRemoteAgora();
        },
        { flush: 'post' },
    );

    const subscribeExistingRemoteUsers = async () => {
        if (!agoraClient) return;
        const users = agoraClient.remoteUsers || [];
        for (const user of users) {
            if (user.hasAudio && !user.audioTrack) {
                try { await agoraClient.subscribe(user, 'audio'); } catch (e) { /* ignore */ }
            }
            if (user.hasVideo && !user.videoTrack) {
                try { await agoraClient.subscribe(user, 'video'); } catch (e) { /* ignore */ }
            }
            if (user.audioTrack) {
                remoteAgoraAudioTrack = user.audioTrack;
                hasRemoteAudio.value = true;
            }
            if (user.videoTrack) {
                remoteAgoraVideoTrack = user.videoTrack;
                hasRemoteVideo.value = true;
            }
        }
    };

    const ensureMediaForCall = async () => {
        const wantVideo = normalizeCallType(callType.value) === 'video';
        await loadAgoraSdk();

        if (!localAudioTrack) {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                ANS: true,
                AEC: true,
                AGC: true,
            });
            isMicOn.value = true;
        }

        if (wantVideo && !localVideoTrack) {
            try {
                localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                    encoderConfig: { width: 640, height: 480, frameRate: 15 },
                    facingMode: 'user',
                });
                isCamOn.value = true;
                localStream = buildLocalPreviewStream();
                localStreamRef.value = localStream;
            } catch (err) {
                console.warn('[Agora] camera failed on join:', err?.message);
                localVideoTrack = null;
                isCamOn.value = false;
            }
        }

        await nextTick();
        await playLocalAgoraVideo();
    };

    const publishLocalTracks = async () => {
        if (!agoraClient) return;
        const toPublish = [localAudioTrack, localVideoTrack].filter(Boolean);
        if (!toPublish.length) return;
        try {
            await agoraClient.publish(toPublish);
        } catch (e) {
            console.warn('[Agora] publish failed, retry:', e?.message || e);
            try { await agoraClient.unpublish(toPublish); } catch (err) { /* ignore */ }
            await agoraClient.publish(toPublish);
        }
    };

    const ensureLocalAudioPublished = async () => {
        if (!agoraClient || !localAudioTrack) return;
        try {
            localAudioTrack.setEnabled(isMicOn.value);
            const locals = agoraClient.localTracks || [];
            if (!locals.includes(localAudioTrack)) {
                await agoraClient.publish([localAudioTrack]);
                console.log('[Agora] re-published local audio');
            }
            if (localVideoTrack && !locals.includes(localVideoTrack)) {
                await agoraClient.publish([localVideoTrack]);
            }
        } catch (e) {
            console.warn('[Agora] ensureLocalAudioPublished:', e?.message || e);
        }
    };

    const loadAgoraSdk = async () => {
        if (AgoraRTC) return AgoraRTC;
        if (typeof window === 'undefined') return null;
        const mod = await import('agora-rtc-sdk-ng');
        AgoraRTC = mod.default || mod;
        AgoraRTC.setLogLevel(2);
        return AgoraRTC;
    };

    const initPeer = async () => {
        await loadAgoraSdk();
    };

    const buildLocalStreamFromTracks = () => buildLocalPreviewStream();

    const startMedia = async (withVideo = true) => {
        if (!navigator.mediaDevices?.getUserMedia) {
            alert('เบราว์เซอร์ไม่อนุญาตกล้อง/ไมค์บนหน้านี้ — เปิดผ่าน HTTPS');
            throw new Error('getUserMedia unavailable');
        }
        await loadAgoraSdk();
        await stopMedia();

        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
            ANS: true,
            AEC: true,
            AGC: true,
        });
        if (withVideo) {
            try {
                localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                    encoderConfig: { width: 640, height: 480, frameRate: 15 },
                    facingMode: 'user',
                });
            } catch (err) {
                console.warn('[Agora] camera failed, audio-only:', err?.message);
                localVideoTrack = null;
            }
        }

        localStream = buildLocalPreviewStream();
        localStreamRef.value = localStream;
        isCamOn.value = !!localVideoTrack;
        isMicOn.value = true;

        await playLocalAgoraVideo();
        return localStream;
    };

    const stopMedia = async () => {
        try { localVideoTrack?.stop?.(); } catch (e) { /* ignore */ }
        try { localVideoTrack?.close?.(); } catch (e) { /* ignore */ }
        try { localAudioTrack?.stop?.(); } catch (e) { /* ignore */ }
        try { localAudioTrack?.close?.(); } catch (e) { /* ignore */ }
        localVideoTrack = null;
        localAudioTrack = null;
        localStream = null;
        localStreamRef.value = null;
        resetRemoteStreams();
        if (localVideo.value) localVideo.value.srcObject = null;
    };

    const handleUserPublished = async (user, mediaType) => {
        if (!agoraClient) return;
        try {
            await agoraClient.subscribe(user, mediaType);
        } catch (e) {
            console.warn('[Agora] subscribe failed:', e?.message || e);
            return;
        }

        if (mediaType === 'video' && user.videoTrack) {
            remoteAgoraVideoTrack = user.videoTrack;
            hasRemoteVideo.value = true;
            await playRemoteAgoraVideo();
        }

        if (mediaType === 'audio' && user.audioTrack) {
            remoteAgoraAudioTrack = user.audioTrack;
            hasRemoteAudio.value = true;
            await resumeAgoraAudio();
            await playRemoteAgoraAudio(prefersElementPlayback());
        }

        callConnectStatus.value = 'ok';
        unlockRemoteAudio();
    };

    const handleUserUnpublished = (user, mediaType) => {
        if (mediaType === 'video') {
            hasRemoteVideo.value = false;
            remoteAgoraVideoTrack = null;
        }
        if (mediaType === 'audio') {
            hasRemoteAudio.value = false;
            remoteAgoraAudioTrack = null;
        }
    };

    const leaveAgoraChannel = async () => {
        joinedChannel = '';
        currentCallId = 0;
        joinInProgress = false;
        if (agoraClient) {
            try {
                if (localAudioTrack || localVideoTrack) {
                    const pubs = [localAudioTrack, localVideoTrack].filter(Boolean);
                    if (pubs.length) await agoraClient.unpublish(pubs);
                }
                await agoraClient.leave();
            } catch (e) { /* ignore */ }
            agoraClient.removeAllListeners?.();
            agoraClient = null;
        }
        resetRemoteStreams();
        remoteAgoraAudioTrack = null;
        remoteAgoraVideoTrack = null;
    };

    const joinAgoraChannel = async (callId) => {
        const cid = Number(callId) || 0;
        if (!cid || (!isInCall.value && !isCalling.value)) return;
        if (joinInProgress) return;

        const channelKey = `telebot-call-${cid}`;
        if (joinedChannel === channelKey && agoraClient) {
            await syncRemoteMedia();
            return;
        }

        joinInProgress = true;
        callConnectStatus.value = 'connecting';
        try {
            await loadAgoraSdk();
            await ensureMediaForCall();
            await nextTick();

            const credRes = await $fetch(apiUrl(`agora-token.php?call_id=${cid}`), {
                credentials: 'include',
            });
            if (credRes?.status === 'error') {
                throw new Error(credRes.message || 'ไม่สามารถขอ Agora token ได้');
            }
            const cred = credRes;

            if (agoraClient) await leaveAgoraChannel();

            agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
            agoraClient.on('user-published', handleUserPublished);
            agoraClient.on('user-unpublished', handleUserUnpublished);
            agoraClient.on('user-joined', () => { syncRemoteMedia(); });
            agoraClient.on('connection-state-change', (cur, prev) => {
                if (cur === 'DISCONNECTED' && prev === 'CONNECTED') {
                    callConnectStatus.value = 'failed';
                }
            });

            const uid = cred?.uid ?? agoraUid();
            await agoraClient.join(
                cred?.appId || appId,
                cred?.channel || channelKey,
                cred?.token || null,
                uid,
            );

            await publishLocalTracks();
            await ensureLocalAudioPublished();
            await subscribeExistingRemoteUsers();
            await resumeAgoraAudio();
            await syncRemoteMedia();

            currentCallId = cid;
            joinedChannel = cred?.channel || channelKey;
            callConnectStatus.value = 'ok';
            console.log('[Agora] joined', joinedChannel, 'uid', uid);
        } catch (err) {
            const code = err?.code || err?.data?.code || err?.cause?.code;
            const msg = err?.data?.message || err?.message || String(err);
            console.error('[Agora] join error:', code || msg, err);
            if (/กรุณา Login|login|unauthorized/i.test(msg)) {
                callConnectStatus.value = 'auth';
            } else if (/403|สิทธิ์|forbidden/i.test(msg)) {
                callConnectStatus.value = 'forbidden';
            } else if (/INVALID_TOKEN|invalid token|certificate/i.test(`${code} ${msg}`)) {
                callConnectStatus.value = 'bad_token';
            } else {
                callConnectStatus.value = 'failed';
            }
        } finally {
            joinInProgress = false;
        }
    };

    const tryJoinWhenAccepted = async (data) => {
        if (!data || data.call_status !== 'accepted') return;
        const cid = Number(data.id) || currentCallId;
        if (!cid) return;
        if (!isInCall.value && !isCalling.value) return;

        if (data.is_caller && isCalling.value) {
            isCalling.value = false;
            isInCall.value = true;
            startCallTimer();
            await nextTick();
            await nextTick();
        }

        if (isInCall.value || isCalling.value) {
            await joinAgoraChannel(cid);
        }
    };

    const apiCallStart = async (receiverId, type) => {
        const body = new FormData();
        body.append('receiver_id', receiverId);
        body.append('call_type', type);
        body.append('caller_peer_id', AGORA_PLACEHOLDER_PEER);
        return await $fetch(apiUrl('call-handler.php?action=start'), {
            method: 'POST',
            body,
            credentials: 'include',
        });
    };

    const apiCallAccept = async () => {
        const body = new FormData();
        body.append('receiver_peer_id', AGORA_PLACEHOLDER_PEER);
        return await $fetch(apiUrl('call-handler.php?action=accept'), {
            method: 'POST',
            body,
            credentials: 'include',
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

    const checkCallSystem = async () => {
        try {
            const data = await apiCallCheck();
            if (!data?.call_status || data.call_status === 'idle' || data.call_status === 'ended') {
                if (isCalling.value || isReceivingCall.value || isInCall.value) await stopCallUI();
                return;
            }

            if (data.id) currentCallId = Number(data.id);

            peerInfo.value = {
                id: data.peer_id,
                name: data.peer_name || '',
                image: buildPeerImage(data.peer_image, data.peer_role),
                role: data.peer_role || '',
            };
            callType.value = normalizeCallType(data.call_type);

            if (isInCall.value || acceptInProgress) {
                isReceivingCall.value = false;
            }

            if (data.call_status === 'calling' && !data.is_caller && !isReceivingCall.value && !isInCall.value && !acceptInProgress) {
                isReceivingCall.value = true;
            }

            if (data.call_status === 'accepted') {
                if (data.is_caller && isCalling.value) {
                    isCalling.value = false;
                    isInCall.value = true;
                    startCallTimer();
                    await nextTick();
                }
                if (isInCall.value || isCalling.value) {
                    await tryJoinWhenAccepted(data);
                }
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
            const active = isCalling.value || isReceivingCall.value || isInCall.value;
            pollTimer = setTimeout(tick, active ? 800 : intervalMs);
        };
        tick();
    };

    const stopPolling = () => {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = null;
    };

    const startCallTimer = () => {
        if (callInterval) clearInterval(callInterval);
        let sec = 0;
        callInterval = setInterval(() => {
            sec += 1;
            const m = String(Math.floor(sec / 60)).padStart(2, '0');
            const s = String(sec % 60).padStart(2, '0');
            callTimerText.value = `${m}:${s}`;
        }, 1000);
    };

    const makeCall = async (receiverId, type = 'voice') => {
        if (!receiverId) return;
        if (!appId) {
            alert('ยังไม่ได้ตั้ง NUXT_PUBLIC_AGORA_APP_ID ใน .env');
            return;
        }
        callType.value = normalizeCallType(type);
        try {
            await initPeer();
            await resumeAgoraAudio();
            // ระหว่างเรียกสายใช้แค่ไมค์ — เปิดกล้องตอน join จริง (UI พร้อมแล้ว)
            await startMedia(false);
            const res = await apiCallStart(receiverId, callType.value);
            if (res?.status !== 'success') {
                throw new Error(res?.message || 'ไม่สามารถเริ่มสายได้');
            }
            isCalling.value = true;
            unlockRemoteAudio();
            startAudioUnlockLoop();
        } catch (err) {
            console.error('[Call] makeCall error:', err);
            alert(err?.message || 'ไม่สามารถเริ่มสายได้ — กรุณาลองใหม่');
            await stopCallUI();
        }
    };

    const acceptCall = async () => {
        if (acceptInProgress || isInCall.value) return;
        acceptInProgress = true;
        try {
            await resumeAgoraAudio();
            isReceivingCall.value = false;
            isInCall.value = true;
            callConnectStatus.value = 'connecting';
            startCallTimer();
            await nextTick();

            try {
                const latest = await apiCallCheck();
                if (latest?.call_type) callType.value = normalizeCallType(latest.call_type);
                if (latest?.id) currentCallId = Number(latest.id);
            } catch (e) { /* ignore */ }

            const myIdReady = await waitForMyId();
            if (!myIdReady) throw new Error('ยังไม่ได้ Login — รีเฟรชหน้าแล้วลองรับสายใหม่');

            await initPeer();
            const wantVideo = normalizeCallType(callType.value) === 'video';
            await startMedia(wantVideo);

            const res = await apiCallAccept();
            if (res?.status !== 'success') {
                throw new Error(res?.message || 'รับสายไม่สำเร็จ');
            }

            const latest = await apiCallCheck();
            await tryJoinWhenAccepted(latest);
            await unlockCallAudio();
            startAudioUnlockLoop();
        } catch (err) {
            console.error('[Call] acceptCall error:', err);
            alert(err?.message || 'รับสายไม่สำเร็จ — ตรวจสอบสิทธิ์กล้อง/ไมค์');
            await stopCallUI();
        } finally {
            acceptInProgress = false;
            if (isInCall.value) isReceivingCall.value = false;
        }
    };

    const endCall = async () => {
        await apiCallEnd();
        await stopCallUI();
    };

    const stopCallUI = async () => {
        isCalling.value = false;
        isReceivingCall.value = false;
        isInCall.value = false;
        isMicOn.value = true;
        isCamOn.value = true;
        isSpeakerOn.value = true;
        callTimerText.value = '00:00';
        peerInfo.value = { id: null, name: '', image: '', role: '' };
        callConnectStatus.value = 'idle';
        stopAudioUnlockLoop();
        stopRemoteSyncLoop();
        if (callInterval) clearInterval(callInterval);
        callInterval = null;
        await leaveAgoraChannel();
        await stopMedia();
    };

    const toggleMic = () => {
        if (!localAudioTrack) return;
        const enabled = !isMicOn.value;
        localAudioTrack.setEnabled(enabled);
        isMicOn.value = enabled;
    };

    const toggleCamera = () => {
        if (!localVideoTrack) return;
        const enabled = !isCamOn.value;
        localVideoTrack.setEnabled(enabled);
        isCamOn.value = enabled;
    };

    const unlockCallAudio = async () => {
        isSpeakerOn.value = true;
        await resumeAgoraAudio();
        unlockRemoteAudio();
        await playRemoteAgoraAudio(true);
        await playRemoteAgoraVideo();
        await ensureLocalAudioPublished();
    };

    const toggleSpeaker = async () => {
        isSpeakerOn.value = !isSpeakerOn.value;
        await resumeAgoraAudio();
        unlockRemoteAudio();
        if (isSpeakerOn.value) await playRemoteAgoraAudio(true);
    };

    const retryRemoteVideo = async () => {
        await unlockCallAudio();
        if (!isInCall.value || !currentCallId) return;
        if (!hasRemoteVideo.value && isVideoCallUI()) {
            callConnectStatus.value = 'connecting';
            joinedChannel = '';
            await joinAgoraChannel(currentCallId);
        }
    };

    const destroy = async () => {
        stopPolling();
        await stopCallUI();
    };

    watch(isInCall, async (active) => {
        if (active) {
            isSpeakerOn.value = true;
            await resumeAgoraAudio();
            startAudioUnlockLoop();
            startRemoteSyncLoop();
        } else {
            stopAudioUnlockLoop();
            stopRemoteSyncLoop();
        }
    });

    onBeforeUnmount(() => { destroy(); });

    return {
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
        localVideo,
        remoteVideo,
        remoteVideoLive,
        remoteAudioSink,
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
        unlockCallAudio,
        destroy,
    };
}
