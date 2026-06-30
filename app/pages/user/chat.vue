<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

definePageMeta({ middleware: 'user-only' });

/* ================= 1. Route & Identification ================= */
const route = useRoute();
const router = useRouter();

const { apiUrl, uploadsChat, imagesAccount, imagesPharma, apiBase } = useApiBase();
const { user, syncFromServer } = useAuthUser();

/** ดึง ID เภสัชกรจาก URL (รองรับทั้ง id และ id_pharma)
 * เช่น localhost:3000/user/chat?id=2
 */
const activePatientId = ref(route.query.id || route.query.id_pharma || 1);

const myUserId = computed(() => Number(user.value?.id_account || user.value?.id || 0));

// ===== ระบบโทร / วิดีโอคอล (WebRTC ผ่าน PeerJS) =====
const {
    isCalling,
    isReceivingCall,
    isInCall,
    callType,
    callTimerText,
    isMicOn,
    isCamOn,
    peerInfo,
    localVideo,
    remoteVideo,
    makeCall: makeCallRTC,
    acceptCall,
    endCall,
    toggleMic,
    toggleCamera,
    startPolling: startCallPolling,
    stopPolling: stopCallPolling
} = useWebRTCCall({
    myRole: 'user',
    myId: myUserId,
    apiUrl,
    imagesAccount,
    imagesPharma,
    apiBase
});

// wrapper สำหรับ user "โทรหาเภสัชกร"
const makeCall = (type = 'voice') => {
    if (!activePatientId.value) return;
    return makeCallRTC(activePatientId.value, type);
};

const getAutoCallKey = (reqId) => `consult-auto-call-${reqId || '0'}`;

const maybeAutoStartCall = (data, reqId, forceType = '') => {
    if (!import.meta.client || !activePatientId.value) return;
    const method = String(forceType || data?.consult_method || 'chat');
    if (method !== 'video' && method !== 'voice') return;
    if (isConsultEnded.value || isInCall.value || isCalling.value) return;
    const rid = Number(reqId) || 0;
    const key = getAutoCallKey(rid);
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');
    setTimeout(() => {
        if (!isInCall.value && !isCalling.value && activePatientId.value) {
            makeCall(method);
        }
    }, 2200);
};

const callerDisplayName = computed(() => peerInfo.value.name || 'เภสัชกร');
const callerDisplayImage = computed(() => peerInfo.value.image || '');

/* ================= 2. State & Data ================= */
const newMessage = ref('');
const chatMessages = ref([]);
const chatScroll = ref(null);
const fileInput = ref(null);
let mainTimer = null;
let consultCountdownTimer = null;
let consultCountdownStarting = false;

// ===== ข้อมูลเภสัชกรที่กำลังคุยด้วย =====
const pharmaName = ref('');
const pharmaImage = ref('');

// ===== Mobile sidebar (hamburger drawer) =====
const isSidebarOpen = ref(false);
const openSidebar = () => { isSidebarOpen.value = true; };
const closeSidebar = () => { isSidebarOpen.value = false; };

const fetchPharmaInfo = async () => {
    if (!activePatientId.value) return;
    try {
        // lookup=pharma → ดึงชื่อจริงจาก pharmacist_account (ไม่ให้ auth role=user ทับ)
        const res = await $fetch(
            apiUrl(`get-patient-info.php?id=${activePatientId.value}&lookup=pharma`),
            { credentials: 'include' }
        );
        if (res?.status === 'success') {
            pharmaName.value = res.data.patient_name || 'เภสัชกร';
            if (res.data.image_url) {
                pharmaImage.value = apiUrl(res.data.image_url);
            } else {
                pharmaImage.value = '';
            }
        }
    } catch (e) {
        pharmaName.value = 'เภสัชกร';
    }
};

// ===== Parse marker ใบสั่งยา [PRESCRIPTION_PDF:<id>] =====
const PRESCRIPTION_MARKER = /\[PRESCRIPTION_PDF:(\d+)\]/;

const parsePrescriptionMessage = (text) => {
    if (!text) return { prescriptionId: 0, cleanText: '' };
    const m = String(text).match(PRESCRIPTION_MARKER);
    if (!m) return { prescriptionId: 0, cleanText: text };
    return {
        prescriptionId: Number(m[1]) || 0,
        cleanText: String(text).replace(PRESCRIPTION_MARKER, '').trim(),
    };
};

const openPrescriptionPdf = (prescriptionId) => {
    if (!prescriptionId || !import.meta.client) return;
    window.open(`/prescription-view?id=${prescriptionId}&print=0`, '_blank', 'noopener,noreferrer');
};

// ===== ระบบแก้ไขข้อความ =====
const editingMessageId = ref(null);
const editingText = ref('');
// แก้ไข/ลบข้อความได้เฉพาะภายใน 5 นาทีหลังส่ง
const EDIT_DELETE_WINDOW_MS = 5 * 60 * 1000;
const canModifyMessage = (msg) => {
    if (!msg?.created_at) return false;
    const t = new Date(msg.created_at).getTime();
    if (Number.isNaN(t)) return false;
    return (Date.now() - t) <= EDIT_DELETE_WINDOW_MS;
};
const startEditMessage = (msg) => {
    if (!canModifyMessage(msg)) {
        alert('ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถแก้ไขได้');
        return;
    }
    editingMessageId.value = msg.message_id;
    editingText.value = msg.message_text || '';
};
const cancelEditMessage = () => {
    editingMessageId.value = null;
    editingText.value = '';
};
const saveEditMessage = async () => {
    if (!editingMessageId.value) return;
    if (!editingText.value.trim()) {
        alert('ข้อความว่างเปล่า');
        return;
    }
    try {
        const body = new FormData();
        body.append('message_id', editingMessageId.value);
        body.append('message_text', editingText.value.trim());
        const res = await $fetch(apiUrl('chat-edit.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (res?.status === 'success') {
            cancelEditMessage();
            await fetchMessages();
        } else {
            alert(res?.message || 'แก้ไขไม่สำเร็จ');
        }
    } catch (err) {
        console.error('Edit error:', err);
        alert('แก้ไขข้อความไม่สำเร็จ');
    }
};

const CONSULT_DURATION_SECONDS = 15 * 60;
const TRACKING_DURATION_SECONDS = 3 * 24 * 60 * 60; // 3 วัน สำหรับโหมดติดตามอาการ
const WARNING_SECONDS = [180, 60];
const consultTimeLeftText = ref('--:--');
const warnedAt = ref(new Set());
const isConsultEnded = ref(false);
const isFollowupActive = ref(false);
// ✨ โหมดติดตามอาการ (3 วัน) เมื่อเภสัชหรือผู้ใช้กดเริ่มต่ออีกครั้ง
const isTrackingMode = ref(false);
const trackingStartedAt = ref(null); // last_followup_at
const trackingTimeLeftText = ref('');
// 🔚 สิ้นสุดการติดตามอาการ (ครบ 3 วัน) → เข้าไปดูแชทได้ แต่พิมพ์ตอบไม่ได้
const isTrackingEnded = ref(false);

// ===== นาฬิกาให้คำปรึกษา (15 นาที) แบบ "กลาง" จาก server =====
//   - เวลาก้อนเดียวกันทั้งฝั่งผู้ใช้และเภสัช → เห็นตรงกัน (เวลาตามคนที่เหลือน้อยกว่าเสมอ)
//   - เดินเฉพาะตอนมีคน "เปิดหน้าจอแชทอยู่" อย่างน้อย 1 ฝ่าย (heartbeat)
const serverRemaining = ref(0);
const lastSyncAt = ref(0);
const frozenSecondsLeft = ref(null);
const timerResyncing = ref(false);
const activeRequestId = ref(0);                         // id ของ consult_requests สำหรับโหลดแชท/archive
const timerRequestId = ref(0);                          // id รอบที่ใช้กับนาฬิกา 15 นาที (ไม่ผูก URL archive)
const activeServiceCode = ref('');                      // SRV-xxx ของรอบที่กำลังดู

/** consult_id ของรอบที่แสดงในแชท — ไม่รวม SRV อื่น */
const resolveViewConsultId = () => {
    const fromRoute = Number(route.query.consult_id) || 0;
    if (fromRoute > 0) return fromRoute;
    return Number(activeRequestId.value) || 0;
};

const resolveViewServiceCode = () => {
    const fromRoute = String(route.query.srv || '').trim();
    if (fromRoute) return fromRoute;
    return String(activeServiceCode.value || '').trim();
};

const buildChatGetUrl = () => {
    const params = new URLSearchParams({
        target_id: String(activePatientId.value || ''),
        t: String(Date.now())
    });
    const cid = resolveViewConsultId();
    const srv = resolveViewServiceCode();
    if (cid > 0 || srv) {
        params.set('include_archive', '1');
        if (cid > 0) params.set('consult_id', String(cid));
        if (srv) params.set('service_code', srv);
    }
    return apiUrl(`chat-get.php?${params.toString()}`);
};
let chatTimerHeartbeat = null;

const getTimerStorageKey = () => `consult-user-${activePatientId.value || 'default'}-deadline`;
const getConsultEndedKey = () => `consult-user-${activePatientId.value || 'default'}-ended`;
const getFollowupSeenKey = () => `consult-user-${activePatientId.value || 'default'}-followup-seen`;

const saveTimerCache = (overrideRemaining) => {
    if (!import.meta.client || !activePatientId.value) return;
    let remaining = overrideRemaining;
    if (remaining == null) {
        if (lastSyncAt.value) {
            const drift = Math.floor((Date.now() - lastSyncAt.value) / 1000);
            remaining = Math.max(0, serverRemaining.value - drift);
        } else {
            remaining = serverRemaining.value;
        }
    }
    try {
        sessionStorage.setItem(getTimerStorageKey(), JSON.stringify({
            remaining,
            syncedAt: Date.now(),
            requestId: timerRequestId.value,
        }));
    } catch { /* ignore */ }
};

const getInterpolatedSecondsLeft = () => {
    if (!lastSyncAt.value) return frozenSecondsLeft.value;
    const drift = Math.floor((Date.now() - lastSyncAt.value) / 1000);
    return Math.max(0, serverRemaining.value - drift);
};

const persistTimerBeforeLeave = () => {
    if (!import.meta.client || !activePatientId.value || !timerRequestId.value) return;
    if (isTrackingMode.value || isTrackingEnded.value || isConsultEnded.value) return;
    const sec = getInterpolatedSecondsLeft();
    if (sec == null || sec <= 0) return;
    saveTimerCache(sec);
};

const restoreTimerCache = () => {
    if (!import.meta.client || !activePatientId.value || !timerRequestId.value) return;
    try {
        const raw = sessionStorage.getItem(getTimerStorageKey());
        if (!raw) return;
        const cached = JSON.parse(raw);
        if (Number(cached?.requestId) !== Number(timerRequestId.value)) return;
        serverRemaining.value = Math.max(0, Number(cached.remaining) || 0);
        lastSyncAt.value = Date.now();
    } catch { /* ignore */ }
};

const freezeTimerOnTabHide = () => {
    if (isTrackingMode.value || isTrackingEnded.value || isConsultEnded.value) return;
    const sec = getInterpolatedSecondsLeft();
    if (sec == null) return;
    frozenSecondsLeft.value = sec;
    saveTimerCache(sec);
    lastSyncAt.value = 0;
};

const applyChatTimerSync = (serverSec, { reset = false } = {}) => {
    const sec = Math.max(0, Number(serverSec) || 0);
    if (reset) {
        serverRemaining.value = sec;
        lastSyncAt.value = Date.now();
        saveTimerCache();
        return;
    }
    if (!lastSyncAt.value) {
        let anchorSec = frozenSecondsLeft.value;
        if (anchorSec == null && timerRequestId.value) {
            try {
                const raw = sessionStorage.getItem(getTimerStorageKey());
                if (raw) {
                    const cached = JSON.parse(raw);
                    if (Number(cached?.requestId) === Number(timerRequestId.value)) {
                        anchorSec = Math.max(0, Number(cached.remaining) || 0);
                    }
                }
            } catch { /* ignore */ }
        }
        if (anchorSec != null && anchorSec > 0 && sec > anchorSec + 2) {
            serverRemaining.value = anchorSec;
        } else {
            serverRemaining.value = sec;
        }
        lastSyncAt.value = Date.now();
        saveTimerCache();
        return;
    }
    const drift = Math.floor((Date.now() - lastSyncAt.value) / 1000);
    const clientSec = Math.max(0, serverRemaining.value - drift);
    // กัน server ตอบค่าเก่า (เช่น 900) ขณะ client นับลงไปแล้ว → ไม่ให้เวลากระโดดกลับ 15:00
    if (sec <= clientSec + 2) {
        serverRemaining.value = sec;
        lastSyncAt.value = Date.now();
        saveTimerCache();
    }
};

const syncChatTimer = async ({ reset = false } = {}) => {
    if (!import.meta.client) return;
    if (!activePatientId.value) return;
    if (isTrackingMode.value) return;
    if (isConsultEnded.value && !reset) return;
    if (!reset && !timerRequestId.value) return;
    // ส่ง heartbeat เฉพาะตอน "เปิดหน้าจออยู่จริง" — ถ้าแท็บถูกซ่อน = ถือว่าไม่อยู่ เวลาหยุด
    if (!reset && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
        const body = new FormData();
        body.append('target_id', activePatientId.value);
        body.append('request_id', timerRequestId.value || 0);
        if (reset) body.append('reset', '1');
        const data = await $fetch(apiUrl('chat-timer.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (data?.status === 'success') {
            applyChatTimerSync(data.remaining_seconds, { reset });
            if (data.ended) handleConsultTimeout();
        }
    } catch (err) {
        console.error('chat timer sync error:', err);
    }
};

const pauseChatTimerForBackground = () => {
    freezeTimerOnTabHide();
    persistTimerBeforeLeave();
};

const resumeChatTimerFromBackground = () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (isTrackingMode.value || isTrackingEnded.value || isConsultEnded.value) return;
    if (timerResyncing.value) return;

    if (frozenSecondsLeft.value != null) {
        serverRemaining.value = frozenSecondsLeft.value;
        lastSyncAt.value = Date.now();
    } else if (timerRequestId.value) {
        restoreTimerCache();
    }

    timerResyncing.value = true;
    syncChatTimer().finally(() => {
        timerResyncing.value = false;
        if (lastSyncAt.value) frozenSecondsLeft.value = null;
        tickConsultCountdown();
    });
};

const onChatVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
        pauseChatTimerForBackground();
        return;
    }
    resumeChatTimerFromBackground();
};

const bindChatTimerPageLifecycle = () => {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', onChatVisibilityChange);
    window.addEventListener('pagehide', pauseChatTimerForBackground);
    window.addEventListener('pageshow', resumeChatTimerFromBackground);
};

const unbindChatTimerPageLifecycle = () => {
    if (typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', onChatVisibilityChange);
    window.removeEventListener('pagehide', pauseChatTimerForBackground);
    window.removeEventListener('pageshow', resumeChatTimerFromBackground);
};

// คำนวณรายการข้อความ + เส้นแบ่ง "ปรึกษา ↔ ติดตามอาการ" (ภายในรอบ SRV เดียว)
const chatMessagesWithDivider = computed(() => {
    const msgs = chatMessages.value || [];
    if (!isTrackingMode.value || !trackingStartedAt.value || msgs.length === 0) {
        return msgs.map(m => ({ ...m, __divider: false }));
    }
    const boundaryMs = new Date(trackingStartedAt.value).getTime();
    const out = [];
    let inserted = false;
    for (let i = 0; i < msgs.length; i++) {
        const m = msgs[i];
        const mMs = m.created_at ? new Date(m.created_at).getTime() : 0;
        if (!inserted && mMs >= boundaryMs) {
            out.push({ __divider: true, __key: `div-${i}` });
            inserted = true;
        }
        out.push({ ...m, __divider: false });
    }
    if (!inserted && msgs.length > 0) {
        out.push({ __divider: true, __key: 'div-end' });
    }
    return out;
});
let lastSeenFollowupId = 0;
let lastSeenAcceptedId = 0;     // request_id ของ accepted ล่าสุดที่เห็น
let lastKnownConsultStatus = ''; // จับการเปลี่ยน accepted → completed
let followupPollTimer = null;

const markConsultCompleted = async () => {
    try {
        const data = await $fetch(apiUrl('consult-handler.php?action=check_user_status'), {
            credentials: 'include'
        });
        if (data?.id && data.status === 'accepted') {
            const body = new FormData();
            body.append('request_id', data.id);
            body.append('status', 'completed');
            await $fetch(apiUrl('consult-handler.php?action=update_status'), {
                method: 'POST',
                body,
                credentials: 'include'
            });
        }
    } catch (err) {
        console.error('Complete consult error:', err);
    }
};

// ===== ปุ่ม "ออกแชท" =====
const showExitChatConfirm = ref(false);
const isExitingChat = ref(false);

const openExitChatConfirm = () => {
    if (isExitingChat.value) return;
    showExitChatConfirm.value = true;
};
const closeExitChatConfirm = () => {
    if (isExitingChat.value) return;
    showExitChatConfirm.value = false;
};

const confirmExitChat = () => {
    isExitingChat.value = true;
    showExitChatConfirm.value = false;
    // ออกจากห้องแชทโดยไม่จบ consult — กลับหน้าแรก
    router.push('/');
};

// 🔁 ปลดล็อกการพิมพ์ใหม่เมื่อเภสัชกรกดเปิดแชท follow-up
//    หรือเริ่มต้นคำขอใหม่ → reset timer เป็น 15:00 เหมือนเดิม
//    (consult_requests จะมี status='accepted')
const reopenConsultForFollowup = (opts = { showBanner: true, requestId: 0 }) => {
    if (import.meta.client) {
        sessionStorage.removeItem(getConsultEndedKey());
        sessionStorage.removeItem(getTimerStorageKey());
    }
    cancelAutoRedirect(); // กัน auto-redirect ไป review ระหว่างกำลังจะคุยต่อ
    isConsultEnded.value = false;
    isFollowupActive.value = !!opts.showBanner;
    warnedAt.value = new Set();
    if (opts.requestId > 0) {
        timerRequestId.value = opts.requestId;
    }
    serverRemaining.value = CONSULT_DURATION_SECONDS;
    lastSyncAt.value = 0;
    consultTimeLeftText.value = '15:00';
    syncChatTimer({ reset: true }); // รีเซ็ต timer กลางที่ server เป็น 15 นาทีใหม่
    startConsultCountdown({ force: true }); // เริ่มนาฬิกาใหม่ 15 นาทีอีกครั้ง
};

// ===== Polling: ตรวจสถานะ consult ฝั่งเภสัชกรแบบ live =====
//   - เภสัชกรกด "จบบทสนทนา" (accepted → completed) → เด้งไป /review_write
//   - เภสัชกรเปิด follow-up หรือรับคำขอใหม่ → ปลดล็อก + รีเซ็ตเวลา 15:00
const handleConsultEndedByPharma = async () => {
    if (isConsultEnded.value) return;
    clearConsultCountdown();
    await checkForFollowup();
    if (isTrackingMode.value) {
        if (import.meta.client) {
            sessionStorage.removeItem(getConsultEndedKey());
            sessionStorage.removeItem(getTimerStorageKey());
        }
        isConsultEnded.value = false;
        cancelAutoRedirect();
        startConsultCountdown({ force: true });
        return;
    }
    if (import.meta.client) {
        sessionStorage.removeItem(getTimerStorageKey()); // ล้าง deadline → ครั้งหน้าเริ่มใหม่ 15:00
        sessionStorage.setItem(getConsultEndedKey(), '1');
    }
    isConsultEnded.value = true;
    consultTimeLeftText.value = '00:00';
    // เภสัชกรปิดเอง → ไม่ต้องเรียก markConsultCompleted ซ้ำ (backend ทำให้แล้ว)
    if (!isFollowupActive.value) {
        startAutoRedirectToReview();
    }
};

const checkForFollowup = async () => {
    if (!myUserId.value) return;
    try {
        const routeCidForStatus = Number(route.query.consult_id) || 0;
        const data = await $fetch(
            apiUrl(`consult-handler.php?action=check_user_status&u_id=${myUserId.value}&consult_id=${routeCidForStatus}&t=${Date.now()}`),
            { credentials: 'include' }
        );
        if (!data || !data.id || data.status === 'none') {
            lastKnownConsultStatus = '';
            isTrackingMode.value = false;
            trackingStartedAt.value = null;
            return;
        }

        const reqId = Number(data.id) || 0;
        const newStatus = String(data.status || '');
        const matchesCurrentPharma = Number(data.id_pharma) === Number(activePatientId.value);
        if (!matchesCurrentPharma) {
            lastKnownConsultStatus = newStatus;
            return;
        }

        // จดรอบ SRV → โหลดแชทเฉพาะรอบนี้ (ไม่ปน SRV อื่น)
        const pinnedCid = Number(route.query.consult_id) || 0;
        const pinnedSrv = String(route.query.srv || '').trim();
        const viewCid = pinnedCid > 0 ? pinnedCid : reqId;
        if (viewCid > 0) {
            const prevCid = activeRequestId.value;
            activeRequestId.value = viewCid;
            if (pinnedSrv) {
                activeServiceCode.value = pinnedSrv;
            } else if (viewCid === reqId) {
                const sc = String(data.service_code || '').trim();
                if (sc) activeServiceCode.value = sc;
            }
            if (prevCid !== viewCid || pinnedSrv) {
                fetchMessages();
            }
        }

        // อัปเดต flag โหมดติดตามอาการ (3 วัน) จาก backend
        //  - โหมด follow-up เดิม: consult ยัง accepted + is_followup=1
        //  - 🆕 โหมดติดตามจากใบสั่งยา: consult รอบนี้ completed แล้ว แต่ยังมีใบสั่งยา
        //        ที่กำลังติดตามอยู่ในกรอบ 3 วัน → ห้องยังใช้งานได้ ไม่บังคับไปรีวิว
        const followupAccepted = newStatus === 'accepted' && Number(data.is_followup) === 1;
        const rxTrackingActive = Number(data.tracking_active) === 1 && newStatus !== 'accepted';
        const trackingPeriodEnded = Number(data.tracking_ended) === 1
            || (newStatus === 'completed'
                && Number(data.tracking_active) !== 1
                && String(data.tracking_status || '') === 'completed');
        const wasTracking = isTrackingMode.value;
        isTrackingMode.value = followupAccepted || rxTrackingActive;
        trackingStartedAt.value = followupAccepted
            ? (data.last_followup_at || null)
            : (rxTrackingActive ? (data.tracking_base || null) : null);
        // ถ้าเพิ่งเข้าโหมดติดตาม → tick ทันที (แสดงผลใหม่)
        if (isTrackingMode.value && !wasTracking) {
            tickConsultCountdown();
        }

        // 🆕 อยู่ในกรอบติดตาม 3 วันจากใบสั่งยา → ปลดล็อกห้อง ไม่ล็อก/ไม่เด้งไปรีวิว
        //     (แม้ consult รอบนี้จะ completed และยังไม่ได้เขียนรีวิวก็ตาม)
        if (rxTrackingActive) {
            cancelAutoRedirect();
            isTrackingEnded.value = false;
            if (isConsultEnded.value) {
                isConsultEnded.value = false;
                if (import.meta.client) sessionStorage.removeItem(getConsultEndedKey());
            }
            if (!consultCountdownTimer && !consultCountdownStarting) startConsultCountdown();
            lastKnownConsultStatus = newStatus;
            return;
        }

        // === เคส A: เภสัชกรกด "จบบทสนทนา" ขณะที่ผู้ใช้ยังอยู่หน้าแชท ===
        //  - trigger เฉพาะตอนเห็น transition: accepted → completed
        //  - กันเด้งซ้ำตอนเปิดแชทใหม่แล้วเจอ completed ค้างอยู่ตั้งแต่แรก
        if (newStatus === 'completed' && !isConsultEnded.value) {
            if (trackingPeriodEnded) {
                // ครบ 3 วันหรือเภสัชปิดติดตามแล้ว → สิ้นสุดการติดตาม (ไม่เด้งรีวิวทันที)
                clearConsultCountdown();
                if (import.meta.client) {
                    sessionStorage.setItem(getConsultEndedKey(), '1');
                    sessionStorage.removeItem(getTimerStorageKey());
                }
                isConsultEnded.value = true;
                isTrackingEnded.value = true;
                isTrackingMode.value = false;
                consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
            } else if (lastKnownConsultStatus === 'accepted') {
                await handleConsultEndedByPharma();
            } else if (Number(data.tracking_active) === 1) {
                // เพิ่งจบ consult → เข้าโหมดติดตาม 3 วัน
                cancelAutoRedirect();
                isConsultEnded.value = false;
                isTrackingEnded.value = false;
                isTrackingMode.value = true;
                trackingStartedAt.value = data.tracking_base || data.last_followup_at || null;
                if (import.meta.client) sessionStorage.removeItem(getConsultEndedKey());
                startConsultCountdown({ force: true });
            } else {
                // เพิ่งเข้ามาเจอ completed → ปิดห้องไว้เฉย ๆ (ไม่ redirect)
                clearConsultCountdown();
                if (import.meta.client) {
                    sessionStorage.setItem(getConsultEndedKey(), '1');
                    sessionStorage.removeItem(getTimerStorageKey());
                }
                isConsultEnded.value = true;
                consultTimeLeftText.value = '00:00';
            }
            lastKnownConsultStatus = newStatus;
            return;
        }

        // === เคส B: เภสัชกรเปิดแชทใหม่ / เริ่ม follow-up / รับคำขอใหม่ ===
        if (newStatus === 'accepted') {
            const isFollowup    = Number(data.is_followup) === 1;
            const isFreshAccept = reqId > Math.max(lastSeenAcceptedId, lastSeenFollowupId);
            const shouldRevive  = isConsultEnded.value;

            if (reqId > 0) {
                timerRequestId.value = reqId;
            }

            if (isFollowup && (reqId > lastSeenFollowupId || shouldRevive)) {
                lastSeenFollowupId  = Math.max(lastSeenFollowupId, reqId);
                lastSeenAcceptedId  = Math.max(lastSeenAcceptedId, reqId);
                if (import.meta.client) {
                    try { sessionStorage.setItem(getFollowupSeenKey(), String(reqId)); } catch {}
                }
                reopenConsultForFollowup({ showBanner: true, requestId: reqId });
            } else if (isFreshAccept && shouldRevive) {
                lastSeenAcceptedId = Math.max(lastSeenAcceptedId, reqId);
                reopenConsultForFollowup({ showBanner: false, requestId: reqId });
            } else if (isFreshAccept) {
                lastSeenAcceptedId = Math.max(lastSeenAcceptedId, reqId);
                maybeAutoStartCall(data, reqId);
            } else if (reqId > 0 && !consultCountdownTimer && !consultCountdownStarting && !isConsultEnded.value) {
                startConsultCountdown();
            }
        }

        lastKnownConsultStatus = newStatus;
    } catch (err) {
        console.error('checkForFollowup error:', err);
    }
};

const formatTimer = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const m = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
    const s = String(safeSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
};

// ===== Auto-redirect ไปหน้าประเมินเภสัช เมื่อครบเวลา 15 นาที =====
const REDIRECT_COUNTDOWN_SECONDS = 8;
const isRedirectingToReview = ref(false);
const redirectCountdown = ref(REDIRECT_COUNTDOWN_SECONDS);
let redirectIntervalId = null;

const cancelAutoRedirect = () => {
    if (redirectIntervalId) {
        clearInterval(redirectIntervalId);
        redirectIntervalId = null;
    }
    isRedirectingToReview.value = false;
    redirectCountdown.value = REDIRECT_COUNTDOWN_SECONDS;
};

const startAutoRedirectToReview = () => {
    if (!import.meta.client) return;
    if (isRedirectingToReview.value) return;
    isRedirectingToReview.value = true;
    redirectCountdown.value = REDIRECT_COUNTDOWN_SECONDS;

    redirectIntervalId = setInterval(() => {
        redirectCountdown.value -= 1;
        if (redirectCountdown.value <= 0) {
            cancelAutoRedirect();
            router.push('/review_write');
        }
    }, 1000);
};

const handleConsultTimeout = async () => {
    if (isConsultEnded.value) return;
    clearConsultCountdown();
    await markConsultCompleted();
    await checkForFollowup();
    if (isTrackingMode.value) {
        if (import.meta.client) {
            sessionStorage.removeItem(getConsultEndedKey());
            sessionStorage.removeItem(getTimerStorageKey());
        }
        isConsultEnded.value = false;
        cancelAutoRedirect();
        startConsultCountdown({ force: true });
        return;
    }
    if (import.meta.client) {
        sessionStorage.removeItem(getTimerStorageKey());
        sessionStorage.setItem(getConsultEndedKey(), '1');
    }
    isConsultEnded.value = true;
    consultTimeLeftText.value = '00:00';

    // หลังบันทึก consult เป็น completed → ดีเลย์สั้น ๆ ให้ผู้ใช้เห็นข้อความก่อน แล้ว auto-redirect ไป review_write
    if (!isFollowupActive.value) {
        startAutoRedirectToReview();
    }
};

// ===== ฟอร์แมตเวลา 3 วัน → "X วัน Y ชั่วโมง Z นาที" =====
const formatTrackingTime = (secondsLeft) => {
    if (secondsLeft <= 0) return 'ติดตามเสร็จสิ้น';
    const days = Math.floor(secondsLeft / 86400);
    const hours = Math.floor((secondsLeft % 86400) / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    return `${days}\u00A0วัน ${hours}\u00A0ชั่วโมง ${mins}\u00A0นาที`;
};

const tickConsultCountdown = () => {
    // โหมดติดตามอาการ (3 วัน) — ใช้ last_followup_at + 3 days เป็น deadline
    if (isTrackingMode.value && trackingStartedAt.value) {
        const baseMs    = new Date(trackingStartedAt.value).getTime();
        const deadlineMs = baseMs + TRACKING_DURATION_SECONDS * 1000;
        const secondsLeft = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
        // โหมดติดตามไม่ใช้ alert เตือนเป็นวินาที — ปล่อยให้คนไข้พิมพ์ได้สบาย ๆ
        if (secondsLeft <= 0) {
            // ครบ 3 วัน → สิ้นสุดการติดตามอาการ: เข้าไปดูแชทได้ แต่พิมพ์ตอบไม่ได้
            // (ไม่เด้งไปหน้ารีวิว — แค่ล็อกช่องพิมพ์)
            isTrackingEnded.value = true;
            isConsultEnded.value  = true;
            trackingTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
            consultTimeLeftText.value  = 'สิ้นสุดการติดตามอาการแล้ว';
        } else {
            isTrackingEnded.value = false;
            trackingTimeLeftText.value = formatTrackingTime(secondsLeft);
            consultTimeLeftText.value  = trackingTimeLeftText.value;
        }
        return;
    }

    // โหมดให้คำปรึกษาปกติ (15 นาที) — ใช้เวลาจาก server timer กลาง
    if (!import.meta.client) return;
    if (isConsultEnded.value) return;

    if (timerResyncing.value || document.visibilityState !== 'visible') {
        if (frozenSecondsLeft.value != null) {
            consultTimeLeftText.value = formatTimer(frozenSecondsLeft.value);
        }
        return;
    }

    if (!lastSyncAt.value) {
        consultTimeLeftText.value = '--:--';
        return;
    }

    let secondsLeft = serverRemaining.value;
    const drift = Math.floor((Date.now() - lastSyncAt.value) / 1000);
    secondsLeft = Math.max(0, serverRemaining.value - drift);
    consultTimeLeftText.value = formatTimer(secondsLeft);

    WARNING_SECONDS.forEach((warnSec) => {
        if (secondsLeft === warnSec && !warnedAt.value.has(warnSec)) {
            warnedAt.value.add(warnSec);
            alert(`แจ้งเตือน: เหลือเวลาให้คำปรึกษาอีก ${warnSec / 60} นาที`);
        }
    });

    if (secondsLeft <= 0) {
        handleConsultTimeout();
    }
};

const startConsultCountdown = async ({ force = false } = {}) => {
    if (!import.meta.client) return;
    if (consultCountdownStarting) return;
    if (!force && consultCountdownTimer) return;

    clearConsultCountdown();
    warnedAt.value = new Set();

    if (isTrackingEnded.value) {
        consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
        return;
    }

    if (isTrackingMode.value) {
        if (import.meta.client) {
            sessionStorage.removeItem(getConsultEndedKey());
        }
        isConsultEnded.value = false;
        tickConsultCountdown();
        consultCountdownTimer = setInterval(tickConsultCountdown, 1000);
        return;
    }

    if (sessionStorage.getItem(getConsultEndedKey()) === '1') {
        isConsultEnded.value = true;
        consultTimeLeftText.value = '00:00';
        return;
    }

    if (!timerRequestId.value) {
        consultTimeLeftText.value = '--:--';
        return;
    }

    consultCountdownStarting = true;
    try {
        if (!lastSyncAt.value) {
            restoreTimerCache();
        }
        await syncChatTimer();
        tickConsultCountdown();
        consultCountdownTimer = setInterval(tickConsultCountdown, 1000);
    } finally {
        consultCountdownStarting = false;
    }
};

const goToPharmaReview = () => {
    cancelAutoRedirect();
    router.push('/review_write');
};

const clearConsultCountdown = () => {
    if (consultCountdownTimer) {
        clearInterval(consultCountdownTimer);
        consultCountdownTimer = null;
    }
};

/* ================= 3. Call System (handled by useWebRTCCall composable) ================= */
// เมื่อมีสายเรียกเข้า ระบุชื่อ caller (เภสัชกร) แล้ว
// ใช้ peerInfo.id สำหรับเชื่อม route id_pharma ถ้าจำเป็น
watch(peerInfo, (info) => {
    if (!info?.id) return;
    if (!isReceivingCall.value && !isInCall.value && !isCalling.value) return;
    // อัปเดต activePatientId เป็น peer id (เภสัช) เพื่อ chat ได้ทันที
    if (Number(activePatientId.value) !== Number(info.id)) {
        activePatientId.value = info.id;
    }
}, { deep: true });

/* ================= 6. Chat Logic (Fetch, Send, Delete) ================= */

// ลายเซ็นของชุดข้อความล่าสุด — ใช้เทียบว่ามีการเปลี่ยนแปลงจริงไหม
// กัน poll ทุก 3 วิ reassign chatMessages → re-render ทั้งลิสต์ → สกอร์ลสะดุด
let lastMsgSignature = '';
const buildMsgSignature = (list) => {
    if (!Array.isArray(list)) return '';
    return list
        .map(m => `${m.message_id}:${m.edited_at || ''}:${m.is_archived || 0}:${(m.message_text || '').length}:${m.file_path || ''}`)
        .join('|');
};

const fetchMessages = async () => {
    if (!activePatientId.value) return;
    try {
        const data = await $fetch(buildChatGetUrl(), {
            credentials: 'include'
        });
        if (data) {
            const list = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
            const sig = buildMsgSignature(list);
            // ข้อความไม่เปลี่ยน → ไม่ต้อง re-render (ปล่อยให้ผู้ใช้เลื่อนลื่น ๆ)
            if (sig === lastMsgSignature && initialScrollDone.value) {
                return;
            }
            lastMsgSignature = sig;
            chatMessages.value = list;
            // เลื่อนลงล่างเมื่อเปิดครั้งแรก หรือมีข้อความใหม่ขณะอยู่ใกล้ล่าง
            if (!initialScrollDone.value) {
                initialScrollDone.value = true;
                await scrollToBottom(true);
            } else if (isNearBottomChat()) {
                await scrollToBottom(true);
            } else {
                updateJumpVisibility();
            }
        }
    } catch (err) { console.error("Fetch Error:", err); }
};

const sendMessage = async () => {
    if (!newMessage.value.trim()) return;
    const body = new FormData();
    body.append('receiver_id', activePatientId.value);
    body.append('message_text', newMessage.value);
    try {
        await $fetch(apiUrl('chat-send.php'), { method: 'POST', body, credentials: 'include' });
        newMessage.value = '';
        await fetchMessages();
        await scrollToBottom(true);
    } catch (err) { console.error("Send Error:", err); }
};

// ========= ปุ่ม "รับยา" — ส่งคำขอรับยาให้เภสัชกร =========
const MEDICINE_REQUEST_TEXT = 'ระบบ : ผู้ป่วยต้องการรับยา กรุณาออกใบปรึกษาให้ด้วย';
const isSendingMedRequest = ref(false);
const medRequestConfirmOpen = ref(false);
const medRequestSentToast = ref(false);

const openMedRequestConfirm = () => {
    if (isConsultEnded.value || isSendingMedRequest.value) return;
    medRequestConfirmOpen.value = true;
};

const closeMedRequestConfirm = () => {
    if (isSendingMedRequest.value) return;
    medRequestConfirmOpen.value = false;
};

const sendMedicineRequest = async () => {
    if (!activePatientId.value || isSendingMedRequest.value) return;
    isSendingMedRequest.value = true;
    try {
        const body = new FormData();
        body.append('receiver_id', activePatientId.value);
        body.append('message_text', MEDICINE_REQUEST_TEXT);
        await $fetch(apiUrl('chat-send.php'), { method: 'POST', body, credentials: 'include' });
        await fetchMessages();
        medRequestConfirmOpen.value = false;

        medRequestSentToast.value = true;
        setTimeout(() => { medRequestSentToast.value = false; }, 2600);
    } catch (err) {
        console.error('Send medicine request error:', err);
        alert('ส่งคำขอรับยาไม่สำเร็จ กรุณาลองใหม่');
    } finally {
        isSendingMedRequest.value = false;
    }
};

const deleteMessage = async (msg) => {
    const messageId = typeof msg === 'object' && msg !== null ? msg.message_id : msg;
    if (typeof msg === 'object' && msg !== null && !canModifyMessage(msg)) {
        alert('ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถลบได้');
        return;
    }
    if (!confirm('ลบข้อความนี้ออกจากหน้าจอหรือไม่?\nข้อมูลจริงจะถูก freeze เก็บไว้ในฐานข้อมูล')) return;
    try {
        const body = new FormData();
        body.append('message_id', messageId);
        await $fetch(apiUrl('chat-delete.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
        await fetchMessages();
    } catch (err) { console.error("Delete Error:", err); }
};

const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file || !activePatientId.value) return;
    const body = new FormData();
    body.append('receiver_id', activePatientId.value);
    body.append('chat_file', file);
    try {
        const res = await $fetch(apiUrl('chat-send.php'), { method: 'POST', body, credentials: 'include' });
        if (res?.status === 'error') {
            alert(res.message || 'ส่งไฟล์ไม่สำเร็จ');
            return;
        }
        event.target.value = '';
        await fetchMessages();
        await scrollToBottom(true);
    } catch (err) {
        console.error('Upload Error', err);
        alert(err?.data?.message || err?.message || 'ส่งไฟล์ไม่สำเร็จ');
    }
};

/* 🪶 smart scroll — เลื่อนลงล่าง "เฉพาะ" ตอนเปิดแชทครั้งแรก + ตอนเราส่งเอง
 *   ไม่เลื่อนเองตอน poll ข้อความใหม่ (กันแชทเด้งลงล่างเอง) */
const NEAR_BOTTOM_THRESHOLD_PX = 120;
const showJumpToBottom = ref(false);
const initialScrollDone = ref(false);

const isNearBottomChat = () => {
    if (!chatScroll.value) return true;
    const el = chatScroll.value;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= NEAR_BOTTOM_THRESHOLD_PX;
};
const updateJumpVisibility = () => { showJumpToBottom.value = !isNearBottomChat(); };

const scrollToBottom = async (force = false) => {
    await nextTick();
    await new Promise((r) => requestAnimationFrame(r));
    if (!chatScroll.value) return;
    if (force || isNearBottomChat()) {
        const el = chatScroll.value;
        el.scrollTop = el.scrollHeight;
        showJumpToBottom.value = false;
    } else {
        showJumpToBottom.value = true;
    }
};
const jumpToBottom = () => scrollToBottom(true);
const onChatScroll = () => updateJumpVisibility();

/* ================= 7. Lifecycle & Watcher ================= */

let initRouteGen = 0;

const initChatFromRoute = async (newId) => {
    if (!import.meta.client || !newId) return;
    if (activePatientId.value && String(activePatientId.value) !== String(newId)) {
        persistTimerBeforeLeave();
    }
    const myGen = ++initRouteGen;

    activePatientId.value = newId;
    initialScrollDone.value = false;
    const routeCid = Number(route.query.consult_id) || 0;
    const routeSrv = String(route.query.srv || '').trim();
    activeRequestId.value = routeCid;
    timerRequestId.value = 0;
    activeServiceCode.value = routeSrv;
    lastSyncAt.value = 0;
    serverRemaining.value = 0;
    isConsultEnded.value = sessionStorage.getItem(getConsultEndedKey()) === '1';
    isFollowupActive.value = false;
    try {
        const seen = sessionStorage.getItem(getFollowupSeenKey());
        lastSeenFollowupId = seen ? (Number(seen) || 0) : 0;
    } catch { lastSeenFollowupId = 0; }
    chatMessages.value = [];
    lastMsgSignature = '';
    pharmaName.value = '';
    pharmaImage.value = '';

    await checkForFollowup();
    if (myGen !== initRouteGen) return;
    if (isTrackingMode.value) {
        isConsultEnded.value = false;
        if (import.meta.client) sessionStorage.removeItem(getConsultEndedKey());
    }

    const autoCall = String(route.query.auto_call || '').trim();
    if (autoCall === 'video' || autoCall === 'voice') {
        maybeAutoStartCall({ consult_method: autoCall }, activeRequestId.value || timerRequestId.value, autoCall);
    }

    await fetchMessages();
    if (myGen !== initRouteGen) return;

    fetchPharmaInfo();
    await startConsultCountdown();
};

watch(() => route.query.id || route.query.id_pharma, (newId) => {
    initChatFromRoute(newId);
}, { immediate: true });

watch(() => [route.query.consult_id, route.query.srv], () => {
    if (!import.meta.client) return;
    const routeCid = Number(route.query.consult_id) || 0;
    const routeSrv = String(route.query.srv || '').trim();
    if (routeCid > 0) activeRequestId.value = routeCid;
    if (routeSrv) activeServiceCode.value = routeSrv;
    fetchMessages();
});

onMounted(async () => {
    // sync user session ก่อน เพื่อให้ peer id (telebot-user-<id>) ใช้งานได้ทันที
    try { await syncFromServer(); } catch (e) { /* ignore */ }

    mainTimer = setInterval(() => {
        fetchMessages();
    }, 3000);

    // ตรวจสอบการ "เปิดแชทอีกครั้ง" จากเภสัชกรทุก 4 วินาที (เร็วกว่ารอ Header polling)
    checkForFollowup();
    followupPollTimer = setInterval(checkForFollowup, 4000);

    // 💓 heartbeat นาฬิกากลางทุก 5 วิ (ส่งเฉพาะตอนเปิดหน้าจออยู่) + เช็คทันทีเมื่อกลับมาที่แท็บ
    chatTimerHeartbeat = setInterval(() => syncChatTimer(), 5000);
    bindChatTimerPageLifecycle();

    // เริ่ม polling การโทร — composable ใช้ความถี่ของตัวเอง (2.5s)
    startCallPolling(2500);
});

onBeforeUnmount(() => {
    persistTimerBeforeLeave();
    if (mainTimer) clearInterval(mainTimer);
    if (followupPollTimer) clearInterval(followupPollTimer);
    if (redirectIntervalId) clearInterval(redirectIntervalId);
    if (chatTimerHeartbeat) clearInterval(chatTimerHeartbeat);
    unbindChatTimerPageLifecycle();
    clearConsultCountdown();
    stopCallPolling();
});
/* ================= 8. Image Preview (Lightbox) ================= */
const isShowPreview = ref(false);
const previewUrl = ref('');

const openPreview = (url) => {
    previewUrl.value = url;
    isShowPreview.value = true;
};

const closePreview = () => {
    isShowPreview.value = false;
    previewUrl.value = '';
};
</script>

<template>
    <div class="user-layout">
        <Header />

        <transition name="fade">
            <div v-if="isShowPreview" class="image-preview-overlay" @click.self="closePreview">
                <div class="preview-container">
                    <button class="close-preview-btn-top" @click="closePreview">×</button>
                    <img :src="previewUrl" class="full-preview-image" />
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div v-if="isReceivingCall" class="call-overlay">
                <div class="call-card incoming">
                    <div class="caller-tag">
                        <i :class="callType === 'video' ? 'fa-solid fa-video' : 'fa-solid fa-phone'"></i>
                        {{ callType === 'video' ? 'สายวิดีโอเข้า' : 'สายเรียกเข้า' }}
                    </div>
                    <div class="avatar-animation">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00a86b&color=fff&size=160'"
                             class="profile-img" alt="caller" />
                        <div class="pulse-ring"></div>
                    </div>
                    <h2 class="caller-name">{{ callerDisplayName }}</h2>
                    <p class="caller-sub">กำลังโทรหาคุณ...</p>
                    <div class="call-actions">
                        <button class="btn-hangup" @click="endCall">
                            <i class="fa-solid fa-phone-slash"></i> ปฏิเสธ
                        </button>
                        <button class="btn-accept" @click="acceptCall">
                            <i class="fa-solid fa-phone"></i> รับสาย
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div v-if="isCalling" class="call-overlay">
                <div class="call-card outgoing">
                    <div class="caller-tag">
                        <i :class="callType === 'video' ? 'fa-solid fa-video' : 'fa-solid fa-phone'"></i>
                        {{ callType === 'video' ? 'กำลังเรียกสายวิดีโอ' : 'กำลังเรียกสาย' }}
                    </div>
                    <div class="avatar-animation">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00a86b&color=fff&size=160'"
                             class="profile-img" alt="caller" />
                        <div class="pulse-ring"></div>
                    </div>
                    <h2 class="caller-name">{{ callerDisplayName }}</h2>
                    <p class="caller-sub">กำลังเรียก{{ callType === 'video' ? 'สายวิดีโอ' : 'สาย' }}เภสัชกร...</p>
                    <div class="call-actions">
                        <button class="btn-hangup btn-hangup-full" @click="endCall">
                            <i class="fa-solid fa-phone-slash"></i> วางสาย
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div v-if="isInCall && callType === 'voice'" class="voice-call-overlay">
                <div class="voice-call-card">
                    <div class="avatar-animation big">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00a86b&color=fff&size=200'"
                             class="profile-img" alt="caller" />
                        <div class="pulse-soft"></div>
                    </div>
                    <h2 class="caller-name">{{ callerDisplayName }}</h2>
                    <p class="caller-timer">🎙 {{ callTimerText }}</p>
                    <div class="video-call-controls">
                        <button @click="toggleMic" :class="{ 'btn-device-off': !isMicOn }" class="video-control-btn" title="ปิด/เปิดไมค์">
                            <i :class="isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                        </button>
                        <button @click="endCall" class="btn-hangup-main">
                            <i class="fa-solid fa-phone-slash"></i>
                        </button>
                        <button class="video-control-btn" disabled style="opacity:0.5;cursor:default" title="เสียงเปิด">
                            <i class="fa-solid fa-volume-high"></i>
                        </button>
                    </div>
                    <!-- ซ่อนแบบยัง render อยู่ (ไม่ใช้ display:none) เพื่อให้เสียงฝั่งตรงข้ามเล่นได้ทุกเบราว์เซอร์ -->
                    <video ref="remoteVideo" autoplay playsinline style="position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;"></video>
                    <video ref="localVideo" autoplay playsinline muted style="display:none"></video>
                </div>
            </div>
        </transition>

        <!-- Mobile topbar — hamburger + ชื่อเภสัช -->
        <div class="mobile-topbar">
            <button class="hamburger" @click="openSidebar" aria-label="เปิดเมนู">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">
                <i class="fa-solid fa-comment-medical"></i>
                <span>{{ pharmaName || 'ปรึกษาเภสัชกร' }}</span>
            </div>
        </div>

        <div class="main-content">
            <!-- Backdrop เมื่อ sidebar เปิดบนมือถือ -->
            <div v-if="isSidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>

            <aside class="sidebar" :class="{ 'is-open': isSidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-comments"></i>
                    <span>เมนูแชท</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="menu-item active" @click="closeSidebar">
                    <i class="fa-solid fa-comment-medical"></i> แชทกับเภสัชกร
                </div>
                <NuxtLink to="/user/consult-history" class="menu-item" @click="closeSidebar">
                    <i class="fa-solid fa-clock-rotate-left"></i> ประวัติการปรึกษากับเภสัชกร
                </NuxtLink>
            </aside>

            <section class="chat-section">
                <transition name="fade">
                    <div v-if="isFollowupActive && !isConsultEnded" class="followup-banner">
                        <div class="followup-banner-icon">
                            <i class="fa-solid fa-comment-medical"></i>
                        </div>
                        <div class="followup-banner-text">
                            <strong>เภสัชกรเปิดห้องแชทอีกครั้งให้คุณ</strong>
                            <p>สามารถพิมพ์ตอบกลับเพื่อสอบถามอาการหรือพูดคุยต่อได้เลย ⏱ ระบบรีเซ็ตเวลาให้ใหม่ 15 นาที</p>
                        </div>
                        <button type="button" class="followup-banner-close" @click="isFollowupActive = false" aria-label="ปิด">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </transition>

                <div v-if="isTrackingEnded" class="consult-ended-bar tracking-ended-bar">
                    <div class="consult-ended-icon">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <div class="consult-ended-text">
                        <strong>สิ้นสุดการติดตามอาการแล้ว</strong>
                        <p>คุณยังเข้ามาดูประวัติการสนทนาได้ แต่ไม่สามารถพิมพ์ตอบได้แล้ว</p>
                    </div>
                </div>

                <div v-if="isTrackingMode && !isTrackingEnded && !isFollowupActive" class="tracking-mode-bar">
                    <div class="consult-ended-icon">
                        <i class="fa-solid fa-stethoscope"></i>
                    </div>
                    <div class="consult-ended-text">
                        <strong>อยู่ในกรอบติดตามอาการ 3 วัน</strong>
                        <p>สามารถแชทถามอาการเภสัชกรได้จนกว่าจะครบกำหนด — ไม่จำกัด 15 นาที</p>
                    </div>
                </div>

                <div v-if="isConsultEnded && !isTrackingEnded && !isTrackingMode" class="consult-ended-bar">
                    <div class="consult-ended-icon">
                        <i class="fa-solid fa-user-doctor"></i>
                    </div>
                    <div class="consult-ended-text">
                        <strong>ครบเวลาให้คำปรึกษา 15 นาทีแล้ว</strong>
                        <p v-if="isRedirectingToReview">
                            กำลังพาคุณไปหน้าประเมินเภสัชกรในอีก
                            <strong class="redirect-num">{{ redirectCountdown }}</strong> วินาที...
                        </p>
                        <p v-else>กรุณาไปหน้าประเมินผลการปรึกษากับเภสัชกร</p>
                    </div>
                    <div class="ended-bar-actions">
                        <button v-if="isRedirectingToReview" type="button" class="btn-cancel-redirect" @click="cancelAutoRedirect">
                            ยกเลิก
                        </button>
                        <button type="button" class="btn-go-pharma-review" @click="goToPharmaReview">
                            <i class="fa-solid fa-arrow-right"></i> ไปประเมินเภสัชเลย
                        </button>
                    </div>
                </div>

                <!-- Overlay เต็มจอ: countdown ก่อน auto-redirect (LINE-style) -->
                <transition name="fade">
                    <div v-if="isRedirectingToReview" class="redirect-overlay">
                        <div class="redirect-card">
                            <div class="redirect-icon-ring">
                                <svg class="redirect-svg" viewBox="0 0 100 100">
                                    <circle class="redirect-track" cx="50" cy="50" r="44" />
                                    <circle
                                        class="redirect-progress"
                                        cx="50"
                                        cy="50"
                                        r="44"
                                        :style="{
                                            strokeDashoffset:
                                                276 - (276 * (REDIRECT_COUNTDOWN_SECONDS - redirectCountdown)) / REDIRECT_COUNTDOWN_SECONDS
                                        }"
                                    />
                                </svg>
                                <div class="redirect-count">{{ redirectCountdown }}</div>
                            </div>
                            <h3 class="redirect-title">ครบเวลาให้คำปรึกษาแล้ว</h3>
                            <p class="redirect-desc">
                                ระบบจะพาคุณไปหน้าประเมินเภสัชกรอัตโนมัติ
                                ในอีก <strong>{{ redirectCountdown }}</strong> วินาที
                            </p>
                            <div class="redirect-actions">
                                <button type="button" class="redirect-btn cancel" @click="cancelAutoRedirect">
                                    ยังไม่ประเมินตอนนี้
                                </button>
                                <button type="button" class="redirect-btn confirm" @click="goToPharmaReview">
                                    <i class="fa-solid fa-arrow-right"></i> ไปประเมินเลย
                                </button>
                            </div>
                        </div>
                    </div>
                </transition>

                <div v-if="isInCall" class="active-call-bar in-call">
                    <div class="call-info">
                        <span class="blink-dot in-call-active"></span>
                        <span class="call-info-text">
                            <strong class="call-state-label">กำลังคุยสายกับเภสัช</strong>
                            <span class="timer-pill">⏱ {{ callTimerText }}</span>
                        </span>
                    </div>
                    <button class="btn-hangup-bar" @click="endCall">
                        <i class="fa-solid fa-phone-slash"></i> วางสาย
                    </button>
                </div>

                <div class="chat-container chat-container--patient">
                    <div class="role-banner role-banner--patient">
                        <i class="fa-solid fa-user"></i>
                        <span>หน้าผู้ป่วย · กำลังปรึกษาเภสัชกร</span>
                    </div>
                    <div class="chat-header">
                        <div class="pharma-profile">
                            <div class="pharma-avatar" :class="{ 'has-img': pharmaImage }">
                                <img v-if="pharmaImage" :src="pharmaImage" :alt="pharmaName"
                                     @error="$event.target.style.display='none'" />
                                <i v-else class="fa-solid fa-user-doctor"></i>
                            </div>
                            <div class="pharma-info">
                                <h3>{{ pharmaName || 'เภสัชกร' }}</h3>
                                <div class="pharma-status">
                                    <span class="status-dot online"></span>
                                    <span v-if="activeServiceCode" class="srv-badge">ออนไลน์</span>
                                    <span v-else>ออนไลน์ พร้อมให้คำปรึกษา</span>
                                </div>
                            </div>
                        </div>
                            <div class="header-actions">
                                <div
                                    class="consult-timer"
                                    :class="{ 'tracking-mode': isTrackingMode, 'tracking-ended': isTrackingEnded }"
                                    :title="isTrackingEnded ? 'สิ้นสุดการติดตามอาการแล้ว' : (isTrackingMode ? 'เหลือเวลาในการติดตามอาการ' : 'เวลาคงเหลือในการให้คำปรึกษา')"
                                >
                                    <i :class="isTrackingEnded ? 'fa-solid fa-circle-check' : (isTrackingMode ? 'fa-solid fa-notes-medical' : 'fa-regular fa-clock')"></i>
                                    <span class="timer-label-mini">
                                        {{ isTrackingEnded ? '' : (isTrackingMode ? 'เหลือเวลาในการติดตามอาการ:' : '') }}
                                    </span>
                                    {{ consultTimeLeftText }}
                                </div>
                            <button v-if="!isInCall" class="line-call-btn" @click="makeCall" title="โทรเสียง">
                                <i class="fa-solid fa-phone"></i>
                                <span class="btn-label">โทร</span>
                            </button>
                            <button class="video-call-btn" @click="makeCall('video')" title="วิดีโอคอล">
                                <i class="fa-solid fa-video"></i>
                                <span class="btn-label">วิดีโอ</span>
                            </button>
                            <button
                                class="btn-exit-chat-header"
                                @click="openExitChatConfirm"
                                title="ออกจากห้องแชท (สนทนายังไม่จบ)"
                            >
                                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                                <span class="btn-label">ออกแชท</span>
                            </button>
                        </div>
                    </div>

                    <transition name="video-pop">
                        <div v-if="isInCall && callType === 'video'" class="video-call-full-overlay">
                            <video ref="remoteVideo" autoplay playsinline class="remote-video-bg"></video>
                            <div class="video-caller-banner">
                                <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00a86b&color=fff&size=80'"
                                     class="banner-avatar" alt="caller" />
                                <div>
                                    <div class="banner-name">{{ callerDisplayName }}</div>
                                    <div class="banner-timer">🎥 {{ callTimerText }}</div>
                                </div>
                            </div>
                            <div class="local-video-pip">
                                <video ref="localVideo" autoplay playsinline muted class="local-video-stream"></video>
                            </div>
                            <div class="video-call-controls">
                                <button @click="toggleCamera" :class="{ 'btn-device-off': !isCamOn }" class="video-control-btn">
                                    <i :class="isCamOn ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'"></i>
                                </button>
                                <button @click="endCall" class="btn-hangup-main">
                                    <i class="fa-solid fa-phone-slash"></i>
                                </button>
                                <button @click="toggleMic" :class="{ 'btn-device-off': !isMicOn }" class="video-control-btn">
                                    <i :class="isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                                </button>
                            </div>
                        </div>
                    </transition>

                    <div class="chat-messages" ref="chatScroll" @scroll.passive="onChatScroll">
                        <div v-if="!chatMessages.length" class="chat-welcome">
                            <div class="welcome-icon">💊</div>
                            <h4>สวัสดีค่ะ พร้อมให้คำปรึกษา</h4>
                            <p>พิมพ์อาการหรือคำถามของคุณเพื่อเริ่มสนทนากับเภสัชกร</p>
                        </div>

                        <template v-for="msg in chatMessagesWithDivider" :key="msg.__divider ? msg.__key : `${Number(msg.is_archived) ? 'a' : 'l'}-${msg.message_id}`">
                            <!-- ✂️ เส้นแบ่ง: ปรึกษา → ติดตามอาการ -->
                            <div v-if="msg.__divider" class="chat-section-divider">
                                <span class="divider-line"></span>
                                <span class="divider-label">
                                    <i class="fa-solid fa-notes-medical"></i>
                                    เริ่มติดตามอาการ
                                </span>
                                <span class="divider-line"></span>
                            </div>
                            <div v-else
                                :class="['message-bubble', msg.sender_role === 'user' ? 'me' : 'pharma']">

                            <!-- ปุ่มแก้ไข/ลบ — แสดงเฉพาะข้อความสดของตัวเอง (ประวัติเก่าแก้/ลบไม่ได้) -->
                            <!-- ⚠️ is_archived มาจาก backend เป็น string "0"/"1" → ต้องแปลงเป็นเลขก่อน (กัน !"0" === false) -->
                            <div v-if="msg.sender_role === 'user' && !Number(msg.is_archived) && editingMessageId !== msg.message_id && canModifyMessage(msg)"
                                 class="msg-actions">
                                <button v-if="msg.message_text" type="button" class="msg-act-btn"
                                        @click="startEditMessage(msg)" title="แก้ไข">
                                    <i class="fa-solid fa-pen"></i>
                                </button>
                                <button type="button" class="msg-act-btn delete"
                                        @click="deleteMessage(msg)" title="ลบ">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </div>

                            <div v-if="msg.file_path && msg.file_path.match(/\.(jpg|jpeg|png|gif|webp)$/i)" class="msg-image-wrap">
                                <img :src="uploadsChat(msg.file_path)" class="msg-image"
                                     @click="openPreview(uploadsChat(msg.file_path))" />
                            </div>

                            <div v-if="msg.file_path && msg.file_path.toLowerCase().endsWith('.pdf')" class="pdf-box">
                                <div class="pdf-icon">📄</div>
                                <div class="pdf-meta">
                                    <span class="pdf-title">เอกสาร PDF</span>
                                    <a :href="uploadsChat(msg.file_path)" target="_blank" download class="pdf-link">
                                        คลิกเพื่อดาวน์โหลด 📥
                                    </a>
                                </div>
                            </div>

                            <!-- โหมดแก้ไข -->
                            <div v-if="editingMessageId === msg.message_id" class="msg-edit-box">
                                <textarea v-model="editingText" rows="2" class="edit-input" @keyup.esc="cancelEditMessage"></textarea>
                                <div class="edit-actions">
                                    <button type="button" class="edit-btn cancel" @click="cancelEditMessage">ยกเลิก</button>
                                    <button type="button" class="edit-btn save" @click="saveEditMessage">บันทึก</button>
                                </div>
                            </div>
                            <template v-else>
                                <div v-if="parsePrescriptionMessage(msg.message_text).cleanText" class="text">
                                    {{ parsePrescriptionMessage(msg.message_text).cleanText }}
                                    <span v-if="msg.edited_at" class="edited-mark">(แก้ไขแล้ว)</span>
                                </div>
                                <!-- 📋 การ์ดใบสั่งยา (ถ้าข้อความมี marker [PRESCRIPTION_PDF:<id>]) -->
                                <div
                                    v-if="parsePrescriptionMessage(msg.message_text).prescriptionId > 0"
                                    class="prescription-card"
                                    @click="openPrescriptionPdf(parsePrescriptionMessage(msg.message_text).prescriptionId)"
                                >
                                    <div class="rx-icon"><i class="fa-solid fa-file-prescription"></i></div>
                                    <div class="rx-body">
                                        <div class="rx-title">ใบสั่งยา (PDF)</div>
                                        <div class="rx-sub">คลิกเพื่อเปิด/บันทึก</div>
                                    </div>
                                    <div class="rx-action">
                                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                    </div>
                                </div>
                            </template>

                            <div class="time">{{ new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</div>
                            </div>
                        </template>
                    </div>

                    <div class="chat-input-area" :class="{ 'input-disabled': isConsultEnded }">
                        <button type="button" @click="$refs.fileInput.click()" class="icon-btn-attach"
                                :disabled="isConsultEnded" title="แนบไฟล์ / รูป">
                            <i class="fa-solid fa-paperclip"></i>
                        </button>
                        <input type="file" ref="fileInput" style="display: none" accept="image/*, .pdf" @change="handleFileUpload">
                        <div class="input-wrap">
                            <input
                                type="text"
                                v-model="newMessage"
                                placeholder="พิมพ์ข้อความ..."
                                :disabled="isConsultEnded"
                                @keyup.enter="sendMessage"
                            >
                        </div>
                        <button class="btn-send" :disabled="isConsultEnded || !newMessage.trim()" @click="sendMessage" title="ส่ง">
                            <i class="fa-solid fa-paper-plane"></i>
                            <span class="btn-label">ส่ง</span>
                        </button>
                        <button
                            type="button"
                            class="btn-receive-med"
                            :disabled="isConsultEnded || isSendingMedRequest"
                            @click="openMedRequestConfirm"
                            title="แจ้งเภสัชกรว่าต้องการรับยา"
                        >
                            <i class="fa-solid fa-pills"></i>
                            <span class="btn-label">รับยา</span>
                        </button>
                    </div>
                </div>
            </section>
        </div>

        <!-- ===== Modal: ยืนยันคำขอรับยา ===== -->
        <transition name="fade">
            <div v-if="medRequestConfirmOpen" class="med-req-overlay" @click.self="closeMedRequestConfirm">
                <div class="med-req-card">
                    <button class="med-req-close" @click="closeMedRequestConfirm" :disabled="isSendingMedRequest" aria-label="ปิด">×</button>
                    <div class="med-req-icon">
                        <i class="fa-solid fa-pills"></i>
                    </div>
                    <h3 class="med-req-title">ยืนยันคำขอรับยา</h3>
                    <p class="med-req-desc">
                        ระบบจะส่งข้อความแจ้งเภสัชกรว่าคุณ
                        <strong>ต้องการรับยา</strong>
                        เภสัชกรจะดำเนินการออกใบปรึกษาและใบสั่งยาให้คุณ
                    </p>
                    <div class="med-req-preview">
                        <i class="fa-solid fa-quote-left"></i>
                        {{ MEDICINE_REQUEST_TEXT }}
                    </div>
                    <div class="med-req-actions">
                        <button class="med-req-btn cancel" :disabled="isSendingMedRequest" @click="closeMedRequestConfirm">
                            ยกเลิก
                        </button>
                        <button class="med-req-btn confirm" :disabled="isSendingMedRequest" @click="sendMedicineRequest">
                            <i v-if="isSendingMedRequest" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-solid fa-paper-plane"></i>
                            {{ isSendingMedRequest ? 'กำลังส่ง...' : 'ส่งคำขอรับยา' }}
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- ===== Toast: ส่งคำขอรับยาสำเร็จ ===== -->
        <transition name="med-toast">
            <div v-if="medRequestSentToast" class="med-req-toast">
                <i class="fa-solid fa-circle-check"></i>
                <span>ส่งคำขอรับยาให้เภสัชกรแล้ว — รอเภสัชกรออกใบปรึกษา</span>
            </div>
        </transition>

        <!-- ===== Modal: ยืนยันก่อนออกจากแชท (ไม่จบ consult) ===== -->
        <transition name="fade">
            <div v-if="showExitChatConfirm" class="ec-overlay" @click.self="closeExitChatConfirm">
                <div class="ec-card">
                    <button class="ec-x" @click="closeExitChatConfirm" aria-label="ปิด">×</button>
                    <div class="ec-icon-exit">
                        <i class="fa-solid fa-arrow-right-from-bracket"></i>
                    </div>
                    <h3 class="ec-title">ออกจากห้องแชท?</h3>
                    <p class="ec-desc">
                        บทสนทนายังคงเปิดอยู่ คุณสามารถกลับมาคุยต่อได้ภายในเวลาที่กำหนด
                    </p>
                    <div class="ec-info-line">
                        <i class="fa-solid fa-circle-info"></i>
                        <span>หากต้องการจบการให้บริการ กรุณากด <b>"จบแชท"</b> แทน</span>
                    </div>
                    <div class="ec-buttons">
                        <button class="ec-btn-cancel" @click="closeExitChatConfirm">
                            อยู่ในแชทต่อ
                        </button>
                        <button class="ec-btn-exit" @click="confirmExitChat">
                            <i class="fa-solid fa-arrow-right-from-bracket"></i>
                            ออกจากห้องแชท
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/chat.css";

.chat-wrapper { position: relative; }

/* chat-container ต้อง relative เพื่อวางปุ่ม "ไปข้อความล่าสุด" */
.chat-container { position: relative; }

/* ===== ปุ่ม "ไปข้อความล่าสุด" (โผล่เมื่อผู้ใช้เลื่อนอ่านอยู่ด้านบน) ===== */
.chat-jump-btn {
  position: absolute;
  right: 22px;
  bottom: 90px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: #fff;
  font-size: 1.05rem;
  cursor: pointer;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.15s ease;
}
.chat-jump-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 9px 22px rgba(37, 99, 235, 0.55);
  filter: brightness(1.05);
}
@media (max-width: 640px) {
  .chat-jump-btn { right: 14px; bottom: 84px; width: 40px; height: 40px; }
}

/* 🚩 3. CSS สำหรับ Image Preview - เพิ่มเข้าไปเพื่อให้แสดงผลสมบูรณ์ */
/* 🚩 ปุ่มปิดแบบชิดขวาบนหน้าจอ (สไตล์ Instagram Desktop) */
.close-preview-btn-top {
  position: absolute;
  top: 20px;    /* ห่างจากขอบบนหน้าจอ */
  right: 20px;  /* ห่างจากขอบขวาหน้าจอ */
  
  background: none;
  border: none;
  color: white;
  font-size: 45px; /* ขนาดใหญ่เห็นชัดแบบในรูป */
  font-weight: 200; /* เส้นบางๆ ดูแพง */
  cursor: pointer;
  line-height: 1;
  z-index: 10002;
  transition: transform 0.2s, color 0.2s;
  padding: 10px;
}

.close-preview-btn-top:hover {
  color: #ccc;
  transform: scale(1.1);
}

/* 🚩 ตัว Overlay ต้องมั่นใจว่าเต็มหน้าจอ */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
}

/* 🚩 คอนเทนเนอร์รูปภาพ (ไม่ต้องใส่ relative แล้วก็ได้ถ้าปุ่มอยู่ข้างนอก) */
.preview-container {
  max-width: 80%;
  max-height: 80%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.full-preview-image {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
  box-shadow: 0 0 20px rgba(0,0,0,0.3);
}

.consult-timer {
  background: #fff3cd;
  color: #7a5a00;
  border: 1px solid #ffe08a;
  border-radius: 20px;
  padding: 6px 12px;
  font-size: 0.85rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.consult-timer.tracking-mode {
  background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
  color: #047857;
  border-color: #6ee7b7;
}
.consult-timer.tracking-ended {
  background: #f1f5f9;
  color: #64748b;
  border-color: #cbd5e1;
}
/* ===== เส้นแบ่ง: ปรึกษา → ติดตามอาการ ===== */
.chat-section-divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 18px 4px 12px;
  padding: 0 4px;
}
.chat-section-divider .divider-line {
  flex: 1;
  height: 0;
  border-top: 2px dashed #10b981;
  opacity: 0.55;
}
.chat-section-divider .divider-label {
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.78rem;
  font-weight: 800;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.15);
}
.srv-badge {
  font-size: 0.78rem;
  font-weight: 700;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 2px 8px;
  margin-right: 4px;
}
.consult-timer .timer-label-mini {
  font-size: 0.78rem;
  font-weight: 700;
}
@media (max-width: 720px) {
  .consult-timer .timer-label-mini { display: none; }
}

.consult-ended-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  background: linear-gradient(90deg, #e8f4fd 0%, #f0f9ff 100%);
  border-bottom: 2px solid #00469c;
  flex-wrap: wrap;
}
.consult-ended-bar.tracking-ended-bar {
  background: linear-gradient(90deg, #f1f5f9 0%, #f8fafc 100%);
  border-bottom-color: #94a3b8;
}
.consult-ended-bar.tracking-ended-bar .consult-ended-icon {
  background: #64748b;
}
.tracking-mode-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 20px;
  background: linear-gradient(90deg, #ecfdf5 0%, #f0fdf4 100%);
  border-bottom: 2px solid #16a34a;
  flex-wrap: wrap;
}
.tracking-mode-bar .consult-ended-icon {
  background: #16a34a;
}

.consult-ended-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #00469c;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.consult-ended-text {
  flex: 1;
  min-width: 180px;
}

.consult-ended-text strong {
  display: block;
  color: #00469c;
  font-size: 1rem;
  margin-bottom: 4px;
}

.consult-ended-text p {
  margin: 0;
  color: #475569;
  font-size: 0.875rem;
}

.btn-go-pharma-review {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #00469c;
  color: white;
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s, transform 0.2s;
}

.btn-go-pharma-review:hover {
  background: #00357a;
  transform: scale(1.02);
}

.consult-ended-fab {
  position: fixed;
  right: 28px;
  bottom: 100px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: #00469c;
  color: white;
  border: none;
  box-shadow: 0 6px 20px rgba(0, 70, 156, 0.45);
  font-size: 26px;
  cursor: pointer;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fab-pulse 2s infinite;
}

.consult-ended-fab:hover {
  background: #00357a;
  transform: scale(1.08);
}

/* ===== ปุ่มยกเลิก auto-redirect ใน ended-bar ===== */
.ended-bar-actions {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.btn-cancel-redirect {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 9px 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-cancel-redirect:hover { background: #e2e8f0; }
.redirect-num {
  display: inline-block;
  background: #fef3c7;
  color: #b45309;
  padding: 0 8px;
  border-radius: 6px;
  font-weight: 800;
}

/* ===== Overlay: Auto-redirect ไปหน้าประเมินเภสัช ===== */
.redirect-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(5px);
  z-index: 10003;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.redirect-card {
  width: 100%;
  max-width: 460px;
  background: #fff;
  border-radius: 22px;
  padding: 28px 26px 24px;
  text-align: center;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
  animation: redirectPop 0.3s ease-out;
}
@keyframes redirectPop {
  0% { transform: translateY(20px) scale(0.93); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}

.redirect-icon-ring {
  position: relative;
  width: 110px;
  height: 110px;
  margin: 4px auto 16px;
}
.redirect-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.redirect-track {
  fill: none;
  stroke: #e2e8f0;
  stroke-width: 8;
}
.redirect-progress {
  fill: none;
  stroke: #00469c;
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 276;
  transition: stroke-dashoffset 1s linear;
}
.redirect-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  font-weight: 800;
  color: #00469c;
  font-family: 'Sarabun', sans-serif;
}

.redirect-title {
  color: #0f172a;
  font-size: 1.3rem;
  font-weight: 800;
  margin: 4px 0 6px;
}
.redirect-desc {
  color: #475569;
  font-size: 0.95rem;
  margin: 0 0 22px;
  line-height: 1.55;
}
.redirect-desc strong { color: #b45309; }

.redirect-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.redirect-btn {
  flex: 1;
  min-height: 46px;
  min-width: 140px;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s, box-shadow 0.2s, filter 0.15s;
}
.redirect-btn.cancel {
  background: #f1f5f9;
  color: #475569;
}
.redirect-btn.cancel:hover { background: #e2e8f0; }
.redirect-btn.confirm {
  background: linear-gradient(135deg, #00469c 0%, #0066cc 100%);
  color: #fff;
  box-shadow: 0 6px 16px rgba(0, 70, 156, 0.3);
}
.redirect-btn.confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 70, 156, 0.42);
}

/* ===== Follow-up banner (เภสัชกรเปิดแชทใหม่) ===== */
.followup-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  background: linear-gradient(135deg, #ecfeff 0%, #f0f9ff 100%);
  border-left: 5px solid #0ea5e9;
  border-radius: 14px;
  margin: 14px 18px 0;
  box-shadow: 0 6px 16px rgba(14, 165, 233, 0.12);
  position: relative;
  animation: followupSlideIn 0.4s ease-out;
}
@keyframes followupSlideIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.followup-banner-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0ea5e9, #0369a1);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  box-shadow: 0 4px 10px rgba(14, 165, 233, 0.35);
  flex-shrink: 0;
}
.followup-banner-text { flex: 1; min-width: 0; }
.followup-banner-text strong {
  display: block;
  color: #0c4a6e;
  font-size: 0.98rem;
  margin-bottom: 3px;
}
.followup-banner-text p {
  margin: 0;
  color: #334155;
  font-size: 0.85rem;
  line-height: 1.45;
}
.followup-banner-close {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 1rem;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  transition: background 0.15s, color 0.15s;
}
.followup-banner-close:hover { background: #e0f2fe; color: #0c4a6e; }
@media (max-width: 640px) {
  .followup-banner { margin: 10px 10px 0; padding: 12px 14px; gap: 10px; }
  .followup-banner-icon { width: 38px; height: 38px; font-size: 1.05rem; }
  .followup-banner-text strong { font-size: 0.92rem; }
  .followup-banner-text p { font-size: 0.78rem; }
}

/* ===== ปุ่ม "รับยา" ใน chat input area ===== */
.btn-receive-med {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #10b981 0%, #047857 100%);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.32);
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.15s ease;
  white-space: nowrap;
  margin-left: 4px;
}
.btn-receive-med i { font-size: 1rem; }
.btn-receive-med:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(16, 185, 129, 0.45);
  filter: brightness(1.05);
}
.btn-receive-med:active:not(:disabled) { transform: translateY(0); }
.btn-receive-med:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}
@media (max-width: 640px) {
  .btn-receive-med { padding: 9px 12px; }
  .btn-receive-med .btn-label { display: none; }
}

/* ===== Modal: ยืนยันคำขอรับยา ===== */
.med-req-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(4px);
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.med-req-card {
  background: #fff;
  width: 100%;
  max-width: 480px;
  border-radius: 20px;
  padding: 32px 26px 22px;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
  position: relative;
  text-align: center;
  animation: medReqPop 0.25s ease-out;
}
@keyframes medReqPop {
  0% { transform: translateY(20px) scale(0.95); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.med-req-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: transparent;
  border: none;
  font-size: 1.8rem;
  color: #94a3b8;
  cursor: pointer;
  line-height: 1;
}
.med-req-close:hover:not(:disabled) { color: #334155; }
.med-req-close:disabled { opacity: 0.4; cursor: not-allowed; }

.med-req-icon {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  margin: 0 auto 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.9rem;
  background: linear-gradient(135deg, #10b981, #047857);
  color: #fff;
  box-shadow: 0 0 0 8px rgba(16, 185, 129, 0.12);
}
.med-req-title {
  color: #064e3b;
  font-size: 1.3rem;
  font-weight: 800;
  margin: 4px 0 8px;
}
.med-req-desc {
  color: #475569;
  font-size: 0.95rem;
  margin: 0 0 18px;
  line-height: 1.55;
}
.med-req-preview {
  background: #f0fdf4;
  border: 1.5px dashed #34d399;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 20px;
  color: #065f46;
  font-size: 0.9rem;
  text-align: left;
  position: relative;
}
.med-req-preview i {
  color: #34d399;
  margin-right: 6px;
}
.med-req-actions {
  display: flex;
  gap: 12px;
}
.med-req-btn {
  flex: 1;
  min-height: 46px;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  font-weight: 700;
  font-size: 0.95rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: transform 0.15s, box-shadow 0.2s, filter 0.15s;
}
.med-req-btn:disabled { opacity: 0.65; cursor: not-allowed; }
.med-req-btn.cancel {
  background: #f1f5f9;
  color: #475569;
}
.med-req-btn.cancel:hover:not(:disabled) { background: #e2e8f0; }
.med-req-btn.confirm {
  background: linear-gradient(135deg, #10b981, #047857);
  color: #fff;
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.35);
}
.med-req-btn.confirm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(16, 185, 129, 0.45);
}

/* ===== Toast: รับยาสำเร็จ ===== */
.med-req-toast {
  position: fixed;
  top: 90px;
  right: 22px;
  z-index: 10002;
  background: linear-gradient(135deg, #10b981, #047857);
  color: #fff;
  padding: 12px 18px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 0.92rem;
  box-shadow: 0 12px 30px rgba(16, 185, 129, 0.35);
  max-width: calc(100vw - 24px);
}
.med-req-toast i { font-size: 1.1rem; }

.med-toast-enter-active,
.med-toast-leave-active { transition: all 0.3s ease; }
.med-toast-enter-from { opacity: 0; transform: translateY(-10px) scale(0.95); }
.med-toast-leave-to   { opacity: 0; transform: translateY(-10px) scale(0.95); }

@media (max-width: 640px) {
  .med-req-toast { top: 70px; right: 10px; left: 10px; }
}

@keyframes fab-pulse {
  0%, 100% { box-shadow: 0 6px 20px rgba(0, 70, 156, 0.45); }
  50% { box-shadow: 0 6px 28px rgba(0, 70, 156, 0.7); }
}

.input-disabled {
  opacity: 0.65;
  pointer-events: none;
}

/* ===================== Call Overlay (Incoming / Outgoing / Voice In-Call) ===================== */
.call-card.incoming,
.call-card.outgoing {
  background: linear-gradient(160deg, #ffffff 0%, #ecfdf5 100%);
  padding: 32px 28px;
  border-radius: 24px;
  min-width: 340px;
  max-width: 95vw;
  box-shadow: 0 30px 80px rgba(0, 168, 107, 0.25);
  animation: callPopIn 0.3s ease-out;
}
@keyframes callPopIn {
  0% { transform: translateY(20px) scale(0.92); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
}
.caller-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  background: #00a86b;
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  border-radius: 20px;
  margin-bottom: 14px;
  letter-spacing: 0.3px;
}
.avatar-animation img.profile-img {
  object-fit: cover;
  aspect-ratio: 1 / 1;
}
.caller-name {
  color: #00a86b;
  font-size: 1.45rem;
  font-weight: 800;
  margin: 10px 0 4px;
  word-break: break-word;
}
.caller-sub {
  color: #475569;
  font-size: 0.95rem;
  margin: 0 0 18px;
}
.call-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
  margin-top: 8px;
}
.call-actions button {
  border: none;
  padding: 12px 22px;
  border-radius: 30px;
  font-weight: 700;
  cursor: pointer;
  font-size: 0.95rem;
  color: #fff;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform 0.15s;
}
.call-actions .btn-accept  { background: #10b981; }
.call-actions .btn-hangup  { background: #ef4444; }
.call-actions button:hover { transform: translateY(-2px); }
.btn-hangup-full {
  width: 100%;
  justify-content: center;
}

/* ----- Voice In-Call (เต็มจอ) ----- */
.voice-call-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, #0d3a23 0%, #052015 100%);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.voice-call-card {
  text-align: center;
  color: #fff;
  padding: 32px;
  max-width: 480px;
}
.avatar-animation.big {
  width: 180px;
  height: 180px;
  margin: 0 auto 18px;
  position: relative;
}
.avatar-animation.big img.profile-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 40px rgba(0, 168, 107, 0.5);
}
.pulse-soft {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  animation: pulse-soft 2.4s ease-out infinite;
}
@keyframes pulse-soft {
  0% { transform: scale(0.9); opacity: 0.9; }
  100% { transform: scale(1.25); opacity: 0; }
}
.voice-call-card .caller-name { color: #fff; font-size: 1.7rem; }
.caller-timer {
  color: #a7f3d0;
  font-size: 1rem;
  margin: 4px 0 24px;
  letter-spacing: 1px;
}
.video-call-controls {
  display: flex;
  gap: 18px;
  justify-content: center;
  margin-top: 16px;
}
.video-control-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  border: none;
  font-size: 22px;
  cursor: pointer;
  transition: background 0.2s;
}
.video-control-btn:hover { background: rgba(255, 255, 255, 0.28); }
.video-control-btn.btn-device-off { background: #ef4444; }
.btn-hangup-main {
  width: 75px;
  height: 75px;
  border-radius: 50%;
  background: #ef4444;
  color: #fff;
  border: none;
  font-size: 28px;
  cursor: pointer;
  transition: transform 0.15s, background 0.2s;
}
.btn-hangup-main:hover { transform: scale(1.08); background: #d63027; }

/* ----- Caller banner ใน Video Call ----- */
.video-caller-banner {
  position: absolute;
  top: 18px;
  left: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  padding: 8px 16px 8px 8px;
  border-radius: 50px;
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  z-index: 5;
}
.banner-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.4);
}
.banner-name {
  font-weight: 700;
  font-size: 0.95rem;
  line-height: 1.1;
}
.banner-timer {
  font-size: 0.78rem;
  color: #cbd5e1;
  margin-top: 2px;
}

/* ============================================ */
/*  ปุ่ม ออกแชท ที่หัว Chat Header              */
/* ============================================ */
.btn-exit-chat-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 22px;
  border: none;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-family: inherit;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.18);
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #fff;
}
.btn-exit-chat-header:hover {
  transform: translateY(-1px);
  box-shadow: 0 5px 14px rgba(239, 68, 68, 0.45);
  filter: brightness(1.07);
}
.btn-exit-chat-header i {
  font-size: 0.95rem;
}
.btn-exit-chat-header .btn-label {
  font-size: 0.85rem;
}

@media (max-width: 720px) {
  .btn-exit-chat-header .btn-label {
    display: none;
  }
}

/* ============================================ */
/*  Modal: ยืนยันจบแชท / ออกแชท                 */
/* ============================================ */
.ec-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ec-card {
  position: relative;
  background: #fff;
  border-radius: 22px;
  padding: 32px 28px 26px;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
  text-align: center;
  animation: ec-pop 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes ec-pop {
  from { opacity: 0; transform: translateY(20px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.ec-x {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  font-size: 1.3rem;
  font-weight: 700;
  cursor: pointer;
  line-height: 1;
  transition: all 0.2s ease;
}
.ec-x:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1e293b;
  transform: rotate(90deg);
}
.ec-x:disabled { opacity: 0.5; cursor: not-allowed; }
.ec-icon-exit {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  font-size: 2rem;
  color: #fff;
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  box-shadow: 0 8px 22px rgba(239, 68, 68, 0.4);
}
.ec-title {
  font-size: 1.3rem;
  font-weight: 800;
  color: #1e293b;
  margin: 0 0 10px;
}
.ec-desc {
  font-size: 0.95rem;
  color: #475569;
  margin: 0 0 16px;
  line-height: 1.5;
}
.ec-desc strong {
  color: #0f766e;
}
.ec-info-line {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 14px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  margin-bottom: 20px;
  font-size: 0.86rem;
  color: #92400e;
  text-align: left;
  line-height: 1.5;
}
.ec-info-line i {
  color: #d97706;
  margin-top: 2px;
}
.ec-info-line b { color: #78350f; }
.ec-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ec-btn-cancel,
.ec-btn-exit {
  padding: 12px 14px;
  border-radius: 12px;
  border: none;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
}
.ec-btn-cancel {
  background: #f1f5f9;
  color: #475569;
}
.ec-btn-cancel:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1e293b;
}
.ec-btn-exit {
  background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
  color: #fff;
}
.ec-btn-exit:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.45);
  filter: brightness(1.06);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .ec-card { padding: 26px 18px 20px; border-radius: 18px; }
  .ec-title { font-size: 1.15rem; }
  .ec-icon-exit { width: 60px; height: 60px; font-size: 1.6rem; }
  .ec-buttons { grid-template-columns: 1fr; }
  .ec-btn-cancel { order: 2; }
  .ec-btn-exit { order: 1; }
}

/* ===== 📋 การ์ดใบสั่งยา (แสดงเมื่อข้อความมี marker [PRESCRIPTION_PDF:<id>]) ===== */
.prescription-card {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 10px;
    padding: 12px 14px;
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    border: 1.5px solid #10b981;
    border-radius: 14px;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.2s ease;
    color: #065f46;
}
.prescription-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(16, 185, 129, 0.25);
}
.prescription-card .rx-icon {
    width: 42px; height: 42px;
    border-radius: 10px;
    background: linear-gradient(135deg, #10b981, #047857);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.2rem;
    flex-shrink: 0;
    box-shadow: 0 4px 10px rgba(16, 185, 129, 0.35);
}
.prescription-card .rx-body { flex: 1; min-width: 0; }
.prescription-card .rx-title {
    font-weight: 800;
    font-size: 0.98rem;
    color: #064e3b;
}
.prescription-card .rx-sub {
    font-size: 0.78rem;
    color: #047857;
    margin-top: 2px;
}
.prescription-card .rx-action {
    color: #10b981;
    font-size: 0.95rem;
    padding: 6px 8px;
}

@media (max-width: 480px) {
    .prescription-card { padding: 10px 12px; gap: 10px; }
    .prescription-card .rx-icon { width: 36px; height: 36px; font-size: 1.05rem; }
    .prescription-card .rx-title { font-size: 0.9rem; }
    .prescription-card .rx-sub { font-size: 0.72rem; }
}
</style>