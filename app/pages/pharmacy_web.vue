<script setup>
import { formatChatMessageTime } from '@/utils/datetime';

definePageMeta({ middleware: 'pharmacist-only' });

const { apiUrl, uploadsChat, imagesAccount, imagesPharma, apiBase } = useApiBase();
const { user } = useAuthUser();

const myPharmaId = computed(() => Number(user.value?.id_pharma || user.value?.id || 0));

// ===== ระบบโทร / วิดีโอคอล (Agora.io หรือ WebRTC) =====
const {
    isCalling,
    isReceivingCall,
    isInCall,
    callType,
    callTimerText,
    isMicOn,
    isCamOn,
    isSpeakerOn,
    peerInfo,
    localVideo,
    remoteVideo,
    remoteVideoLive,
    remoteAudioSink,
    showRemoteVideoBg,
    callConnectHint,
    retryRemoteVideo,
    unlockCallAudio,
    makeCall: makeCallRTC,
    acceptCall,
    endCall,
    toggleMic,
    toggleCamera,
    toggleSpeaker,
    startPolling: startCallPolling,
    stopPolling: stopCallPolling
} = useCall({
    myRole: 'pharma',
    myId: myPharmaId,
    apiUrl,
    imagesAccount,
    imagesPharma,
    apiBase
});

// wrapper ให้เภสัช "โทรหาคนไข้"
const makeCall = (type = 'voice') => {
    if (!activePatientId.value) return;
    return makeCallRTC(activePatientId.value, type);
};

const callerDisplayName = computed(() => peerInfo.value.name || (activePatientId.value ? `ผู้ป่วยคนที่ ${activePatientId.value}` : 'คนไข้'));
const callerDisplayImage = computed(() => peerInfo.value.image || '');

// ===== Sidebar mobile drawer =====
const sidebarOpen = ref(false);
const toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value; };
const closeSidebar = () => { sidebarOpen.value = false; };

/* ================= 1. Route & Identification ================= */
const route = useRoute();
const router = useRouter();

const activePatientId = ref(route.query.id || null);
const sidebarPatientIds = ref([]);
const patientSearchQuery = ref('');
const MEDICINE_REQUEST_TEXT = 'ระบบ : ผู้ป่วยต้องการรับยา กรุณาออกใบปรึกษาให้ด้วย';

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

// กรองรายการคนไข้ตามคำค้น (ใช้กับ slider list ใน sidebar)
const filteredSidebarPatients = computed(() => {
    const q = patientSearchQuery.value.trim().toLowerCase();
    if (!q) return sidebarPatientIds.value;
    return sidebarPatientIds.value.filter((id) => {
        const name = (patientDetailsMap.value[id] || '').toLowerCase();
        return name.includes(q) || String(id).includes(q);
    });
});

const getSidebarStorageKey = () => {
    const pharmaId = user.value?.id_pharma || user.value?.id || 'guest';
    return `pharma-sidebar-patients-${pharmaId}`;
};

// กล่องเก็บข้อมูลรายละเอียดคนไข้ (ดึงชื่อจริงจากฐานข้อมูล)
const patientDetailsMap = ref({});
const patientImagesMap = ref({});
const patientSymptomsMap = ref({}); // 🩺 อาการป่วยของแต่ละคนไข้ (ตามรอบ consult ที่เลือก)
const patientSymptomLoaded = ref({}); // โหลดอาการเสร็จแล้วหรือยัง (กันขึ้น "ยังไม่มีข้อมูลอาการ" ก่อนคลิก/ก่อนโหลด)

const normalizePatientId = (id) => {
    const n = Number(id);
    return Number.isFinite(n) && n > 0 ? n : null;
};

const setPatientDisplayName = (id, name) => {
    const cleanId = normalizePatientId(id);
    if (!cleanId || !name) return;
    patientDetailsMap.value = { ...patientDetailsMap.value, [cleanId]: name };
};

const setPatientImage = (id, imageUrl) => {
    const cleanId = normalizePatientId(id);
    if (!cleanId || !imageUrl) return;
    patientImagesMap.value = { ...patientImagesMap.value, [cleanId]: imageUrl };
};

const setPatientSymptom = (id, symptom) => {
    const cleanId = normalizePatientId(id);
    if (!cleanId) return;
    patientSymptomsMap.value = { ...patientSymptomsMap.value, [cleanId]: (symptom || '').trim() };
};

// helper: รูปโปรไฟล์เต็ม URL (รองรับ ngrok/proxy)
const patientAvatar = (id) => {
    const img = patientImagesMap.value[id];
    if (img) return apiUrl(img);
    return '';
};

// ฟังก์ชันดึงชื่อ + รูป + อาการคนไข้จาก backend
//   - ถ้าระบุ consultId → ดึงอาการของ "รอบนั้น" (ไม่ใช่อาการล่าสุดรวม)
//   - markLoaded=false → ยังไม่แสดงข้อความ "ยังไม่มีข้อมูลอาการ" (ใช้ตอน preload sidebar)
const fetchPatientInfo = async (id, { consultId = 0, markLoaded = true } = {}) => {
    const cleanId = normalizePatientId(id);
    if (!cleanId) return;
    const cid = Number(consultId) || Number(activeRequestId.value) || Number(route.query.consult_id) || 0;
    const isActive = Number(activePatientId.value) === cleanId;
    let url = `get-patient-info.php?id=${cleanId}&role=user`;
    // ส่ง consult_id เฉพาะคนไข้ที่กำลังเปิดแชทอยู่ → ได้อาการของรอบรับเคสนั้น
    if (isActive && cid > 0) url += `&consult_id=${cid}`;
    try {
        const res = await $fetch(apiUrl(url), { credentials: 'include' });
        if (res && res.status === 'success') {
            setPatientDisplayName(cleanId, res.data.patient_name);
            if (res.data.image_url) setPatientImage(cleanId, res.data.image_url);
            if (isActive || markLoaded) {
                setPatientSymptom(cleanId, res.data.symptom_name || '');
            }
        } else if (!patientDetailsMap.value[cleanId]) {
            setPatientDisplayName(cleanId, `ผู้ป่วยคนที่ ${cleanId}`);
        }
    } catch {
        if (!patientDetailsMap.value[cleanId]) {
            setPatientDisplayName(cleanId, `ผู้ป่วยคนที่ ${cleanId}`);
        }
    } finally {
        if (markLoaded) {
            patientSymptomLoaded.value = { ...patientSymptomLoaded.value, [cleanId]: true };
        }
    }
};

// ดันคิวเข้าเมนูข้างบาร์แบบกระจายค่า (ช่วยกระตุ้นหน้าจอเรนเดอร์รายชื่อทันที)
const ensurePatientInSidebar = (id) => {
    const normalized = normalizePatientId(id);
    if (!normalized) return;
    
    if (!sidebarPatientIds.value.includes(normalized)) {
        // เปลี่ยนมาสร้างก้อน Array สดใหม่ทับลงไป เพื่อส่งสัญญาณ Reactivity ลั่นแจ้งเตือนสเตตทันที
        sidebarPatientIds.value = [...sidebarPatientIds.value, normalized].sort((a, b) => a - b);
        saveSidebarPatients(); // เขียนเก็บลงกล่องถาวร
    }
    fetchPatientInfo(normalized, { markLoaded: true }); // โหลดชื่อ + อาการ (แสดงในรายการแม้ยังไม่คลิก)
};

// ระบบ Auto-Focus ดึงแชทและชื่อคนไข้จริงขึ้นบาร์ทันทีหลังคลิกกระดิ่งรับเคส
const checkExternalBellTrigger = async () => {
    if (!import.meta.client) return;
    
    const bellTriggerId = localStorage.getItem('bell-incoming-patient-id');
    if (bellTriggerId) {
        const id = normalizePatientId(bellTriggerId);
        if (id) {
            const bellName = localStorage.getItem('bell-incoming-patient-name');
            localStorage.removeItem('bell-incoming-patient-id');
            localStorage.removeItem('bell-incoming-patient-name');

            if (bellName) {
                setPatientDisplayName(id, bellName);
            }

            ensurePatientInSidebar(id);
            await nextTick();

            activePatientId.value = id;
            // คง consult_id / srv ของ "รอบที่กำลังเปิด" ไว้ ไม่งั้นเวลาติดตามจะเด้งไปใช้ใบล่าสุด
            const keepCid = Number(route.query.consult_id) || 0;
            const keepSrv = String(route.query.srv || '').trim();
            const nextQuery = { id };
            if (keepCid > 0) nextQuery.consult_id = keepCid;
            if (keepSrv) nextQuery.srv = keepSrv;
            await router.push({ query: nextQuery });

            await fetchPatientInfo(id);
            fetchMessages();
        }
    }
};

const loadSidebarPatients = async () => {
    if (!import.meta.client) return;
    try {
        const res = await $fetch(apiUrl('consult-handler.php?action=list_my_patients'), {
            credentials: 'include'
        });
        if (res?.status === 'success' && Array.isArray(res.data)) {
            sidebarPatientIds.value = res.data
                .map((p) => normalizePatientId(p.id_account))
                .filter((v) => v !== null);
            res.data.forEach((p) => {
                if (p.patient_name) {
                    setPatientDisplayName(p.id_account, p.patient_name);
                }
                // โหลดอาการของแต่ละคนมาแสดงในรายการเลย (ไม่ต้องรอคลิก)
                fetchPatientInfo(p.id_account, { markLoaded: true });
            });
            saveSidebarPatients();
            return;
        }
    } catch (e) {
        console.warn('loadSidebarPatients API', e);
    }

    try {
        const raw = localStorage.getItem(getSidebarStorageKey());
        if (!raw) return;
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return;
        sidebarPatientIds.value = list
            .map((v) => normalizePatientId(v))
            .filter((v) => v !== null);
        sidebarPatientIds.value.forEach((id) => fetchPatientInfo(id, { markLoaded: true }));
    } catch {
        // ignore
    }
};

const saveSidebarPatients = () => {
    if (!import.meta.client) return;
    localStorage.setItem(getSidebarStorageKey(), JSON.stringify(sidebarPatientIds.value));
};

const removePatientFromSidebar = (id) => {
    const normalized = normalizePatientId(id);
    if (!normalized) return;
    sidebarPatientIds.value = sidebarPatientIds.value.filter((p) => p !== normalized);
    saveSidebarPatients();
    if (import.meta.client) {
        const key = `consult-pharma-${normalized}-deadline`;
        localStorage.removeItem(key);
    }
    if (Number(activePatientId.value) === normalized) {
        activePatientId.value = null;
        router.push({ path: '/pharmacy_web' });
    }
};

/* ================= 2. State & Data ================= */
const newMessage = ref('');
const chatMessages = ref([]);
const chatScroll = ref(null);
const fileInput = ref(null);
let mainTimer = null;
let consultCountdownTimer = null;
let consultCountdownStarting = false;

const CONSULT_DURATION_SECONDS = 15 * 60;
const TRACKING_DURATION_SECONDS = 3 * 24 * 60 * 60; // 3 วัน สำหรับโหมดติดตามอาการ
const WARNING_SECONDS = [180, 60];
const consultTimeLeftText = ref('--:--');
const warnedAt = ref(new Set());
const showEndConsultFab = ref(false);
const END_CONSULT_SHOW_SECONDS = 180;

// ✨ โหมดติดตามอาการ (เภสัช/ผู้ใช้ กดปรึกษาอีกครั้ง) — ซ่อนปุ่มจบบทสนทนา + เปลี่ยน timer
const isTrackingMode = ref(false);
const trackingStartedAt = ref(null);   // last_followup_at
// 🔚 สิ้นสุดการติดตามอาการ (ครบ 3 วัน) → เข้าไปดูแชทได้ แต่พิมพ์ตอบไม่ได้
const isTrackingEnded = ref(false);
let consultInfoPollTimer = null;

// ===== นาฬิกาให้คำปรึกษา (15 นาที) แบบ "กลาง" จาก server =====
//   - เวลาก้อนเดียวกับฝั่งผู้ใช้ → เห็นตรงกัน (เวลาตามคนที่เหลือน้อยกว่าเสมอ)
//   - เดินเฉพาะตอนมีคน "เปิดหน้าจอแชทอยู่" อย่างน้อย 1 ฝ่าย (heartbeat)
const serverRemaining = ref(0);
const lastSyncAt = ref(0);
const frozenSecondsLeft = ref(null);
const timerResyncing = ref(false);
const activeRequestId = ref(0);
const timerRequestId = ref(0);
const activeServiceCode = ref(''); // SRV-xxx ของรอบที่กำลังดู (จาก /tracking หรือ URL)

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

const formatTimer = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    const m = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
    const s = String(safeSeconds % 60).padStart(2, '0');
    return `${m}:${s}`;
};

const getTimerStorageKey = () => `consult-pharma-${activePatientId.value || 'default'}-deadline`;

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

const restoreTimerCache = () => {
    if (!import.meta.client || !activePatientId.value || !timerRequestId.value) return;
    try {
        const raw = sessionStorage.getItem(getTimerStorageKey());
        if (!raw) return;
        const cached = JSON.parse(raw);
        if (Number(cached?.requestId) !== Number(timerRequestId.value)) return;
        serverRemaining.value = Math.max(0, Number(cached.remaining) || 0);
        lastSyncAt.value = Date.now();
        consultTimeLeftText.value = formatTimer(serverRemaining.value);
    } catch { /* ignore */ }
};

const getInterpolatedSecondsLeft = () => {
    if (!lastSyncAt.value) return frozenSecondsLeft.value;
    const drift = Math.floor((Date.now() - lastSyncAt.value) / 1000);
    return Math.max(0, serverRemaining.value - drift);
};

const persistTimerBeforeLeave = () => {
    if (!import.meta.client || !activePatientId.value || !timerRequestId.value) return;
    if (isTrackingMode.value || isTrackingEnded.value) return;
    const sec = getInterpolatedSecondsLeft();
    if (sec == null || sec <= 0) return;
    saveTimerCache(sec);
};

const freezeTimerOnTabHide = () => {
    if (isTrackingMode.value || isTrackingEnded.value) return;
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
    if (isTrackingMode.value || isTrackingEnded.value) return;
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

// ===== chatMessagesWithDivider =====
//   - ใส่ไอเทมพิเศษ {__divider:true} ก่อนข้อความแรกที่อยู่ในโหมดติดตาม
//   - เกณฑ์: created_at >= trackingStartedAt → ถือเป็น "ติดตามอาการ"
//   - ถ้าไม่ได้อยู่ใน follow-up → แสดงข้อความปกติ ไม่มีเส้นแบ่ง
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
    // ถ้าไม่มีข้อความ "ติดตาม" ใด ๆ → ใส่เส้นแบ่งไว้ท้ายสุด (เพื่อสื่อว่ารอข้อความใหม่)
    if (!inserted && msgs.length > 0) {
        out.push({ __divider: true, __key: 'div-end' });
    }
    return out;
});

const handleConsultTimeout = () => {
    showEndConsultFab.value = true;
    consultTimeLeftText.value = '00:00';
};

// ฟอร์แมตเวลา 3 วัน → "X วัน Y ชั่วโมง Z นาที"
const formatTrackingTime = (secondsLeft) => {
    if (secondsLeft <= 0) return 'ติดตามเสร็จสิ้น';
    const days = Math.floor(secondsLeft / 86400);
    const hours = Math.floor((secondsLeft % 86400) / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    return `${days}\u00A0วัน ${hours}\u00A0ชั่วโมง ${mins}\u00A0นาที`;
};

const tickConsultCountdown = () => {
    if (!activePatientId.value) return;

    // สิ้นสุดการติดตามอาการแล้ว → ล็อกช่องพิมพ์ ดูแชทได้อย่างเดียว
    if (isTrackingEnded.value) {
        consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
        showEndConsultFab.value = false;
        return;
    }

    // โหมดติดตามอาการ (3 วัน) — ใช้ last_followup_at + 3 days
    if (isTrackingMode.value && trackingStartedAt.value) {
        const baseMs = new Date(trackingStartedAt.value).getTime();
        const deadlineMs = baseMs + TRACKING_DURATION_SECONDS * 1000;
        const secondsLeft = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
        // โหมดติดตามไม่ต้องโชว์ปุ่มจบบทสนทนาด่วน
        showEndConsultFab.value = false;
        if (secondsLeft <= 0) {
            // ครบ 3 วัน → สิ้นสุดการติดตาม: ดูแชทได้ แต่พิมพ์ตอบไม่ได้
            isTrackingEnded.value = true;
            isTrackingMode.value = false;
            consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
        } else {
            consultTimeLeftText.value = formatTrackingTime(secondsLeft);
        }
        return;
    }

    // โหมดให้คำปรึกษาปกติ 15 นาที — ใช้เวลาจาก server timer กลาง
    if (!import.meta.client) return;

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

    if (secondsLeft <= END_CONSULT_SHOW_SECONDS) {
        showEndConsultFab.value = true;
    }

    WARNING_SECONDS.forEach((warnSec) => {
        if (secondsLeft === warnSec && !warnedAt.value.has(warnSec)) {
            warnedAt.value.add(warnSec);
        }
    });

    if (secondsLeft <= 0) {
        handleConsultTimeout();
    }
};

// ===== Polling get_active_consult — รู้ว่าเภสัชกำลังอยู่ในโหมดติดตามอาการหรือไม่ =====
const fetchActiveConsultInfo = async () => {
    if (!activePatientId.value) {
        isTrackingMode.value = false;
        trackingStartedAt.value = null;
        return;
    }
    try {
        const routeCidForStatus = Number(route.query.consult_id) || 0;
        const data = await $fetch(
            apiUrl(`consult-handler.php?action=get_active_consult&patient_id=${activePatientId.value}&consult_id=${routeCidForStatus}&t=${Date.now()}`),
            { credentials: 'include' }
        );
        if (!data || data.status === 'none') {
            isTrackingMode.value = false;
            isTrackingEnded.value = false;
            trackingStartedAt.value = null;
            return;
        }
        // โหมดติดตาม 3 วัน (consult จบแล้ว แต่ยังติดตามอยู่)
        if (String(data.status) === 'tracking' || (Number(data.tracking_active) === 1 && String(data.status) !== 'accepted')) {
            const trackId = Number(data.id) || Number(route.query.consult_id) || 0;
            if (trackId > 0 && !(Number(route.query.consult_id) > 0)) {
                activeRequestId.value = trackId;
            }
            isTrackingMode.value = true;
            isTrackingEnded.value = false;
            trackingStartedAt.value = data.tracking_base || data.last_followup_at || null;
            showEndConsultFab.value = false;
            tickConsultCountdown();
            return;
        }
        if (!data.id) {
            isTrackingMode.value = false;
            isTrackingEnded.value = false;
            trackingStartedAt.value = null;
            return;
        }
        // สิ้นสุดการติดตามอาการแล้ว → เข้าไปดูแชทได้ แต่พิมพ์ตอบไม่ได้
        if (String(data.status) === 'tracking_ended') {
            isTrackingMode.value = false;
            isTrackingEnded.value = true;
            trackingStartedAt.value = data.tracking_base || null;
            consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
            showEndConsultFab.value = false;
            return;
        }
        // จด request_id รอบปัจจุบัน (ไม่ทับเมื่อ URL ล็อกรอบ SRV จาก /tracking)
        const pinnedCid = Number(route.query.consult_id) || 0;
        const pinnedSrv = String(route.query.srv || '').trim();
        if (!(pinnedCid > 0 || pinnedSrv)) {
            activeRequestId.value = Number(data.id) || 0;
        }
        if (String(data.status) === 'accepted') {
            const liveId = Number(data.id) || 0;
            if (liveId > 0) {
                timerRequestId.value = liveId;
            }
        }
        // โหมดติดตามอาการ:
        //  - follow-up เดิม: consult ยัง accepted + is_followup=1
        //  - 🆕 จากใบสั่งยา: consult รอบนี้ปรึกษาจบแล้ว แต่ยังอยู่ในกรอบติดตาม 3 วัน
        //  ⛔ ถ้าเป็นการ "รับเคสใหม่" (status='accepted') ต้องเป็นโหมดปรึกษา 15 นาทีเสมอ
        //     ห้ามให้ใบสั่งยาเก่าของคนเดิมมา override เป็นโหมดติดตาม (ตรงกับ logic ฝั่งผู้ใช้)
        const followup = Number(data.is_followup) === 1;
        const rxTrackingActive = Number(data.tracking_active) === 1 && String(data.status) !== 'accepted';
        const wasTracking = isTrackingMode.value;
        isTrackingEnded.value = false;
        isTrackingMode.value = followup || rxTrackingActive;
        trackingStartedAt.value = followup
            ? (data.last_followup_at || data.tracking_base || null)
            : (data.tracking_base || null);
        if (isTrackingMode.value && !wasTracking) {
            tickConsultCountdown(); // refresh ทันที
        }
        // รีเฟรชอาการของคนไข้ที่เปิดอยู่ตาม consult รอบนี้ (หลังรู้ consult_id แล้ว)
        if (activePatientId.value) {
            await fetchPatientInfo(activePatientId.value, {
                consultId: Number(data.id) || 0,
                markLoaded: true,
            });
        }
    } catch (e) {
        console.error('get_active_consult error', e);
    }
};

// ===== Modal: ยืนยันก่อนจบการสนทนา / โชว์รหัสบริการให้ส่งต่อแอดมิน =====
const showEndConfirmModal = ref(false);
const showEndResultModal = ref(false);
const isEndingConsult = ref(false);
const completedServiceCode = ref('');
const completedConsultId = ref(0);
const completedPatientName = ref('');
const completedPatientId = ref(0);
const copyFeedback = ref('');

const openEndConfirm = () => {
    if (!activePatientId.value) {
        alert('กรุณาเลือกคนไข้ก่อนจบบทสนทนา');
        return;
    }
    showEndConfirmModal.value = true;
};

const closeEndConfirm = () => {
    if (isEndingConsult.value) return;
    showEndConfirmModal.value = false;
};

const endConsultation = async () => {
    const patientId = normalizePatientId(activePatientId.value);
    if (!patientId) return;
    if (isEndingConsult.value) return;

    isEndingConsult.value = true;
    let serviceCode = '';
    let consultId = 0;

    try {
        const body = new FormData();
        body.append('patient_id', String(patientId));
        const res = await $fetch(apiUrl('consult-handler.php?action=complete_consult'), {
            method: 'POST',
            body,
            credentials: 'include'
        });
        if (res?.status === 'success') {
            serviceCode = res.service_code || '';
            consultId = Number(res.consult_id || 0);
        } else {
            alert(res?.message || 'จบการสนทนาไม่สำเร็จ กรุณาลองใหม่');
            isEndingConsult.value = false;
            return;
        }
    } catch (e) {
        console.error('complete_consult', e);
        alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
        isEndingConsult.value = false;
        return;
    }

    clearConsultCountdown();
    if (import.meta.client) {
        localStorage.removeItem(getTimerStorageKey());
    }
    showEndConsultFab.value = false;
    showEndConfirmModal.value = false;

    completedServiceCode.value = serviceCode;
    completedConsultId.value = consultId;
    completedPatientId.value = patientId;
    completedPatientName.value = patientDetailsMap.value[patientId] || `ผู้ป่วยคนที่ ${patientId}`;
    showEndResultModal.value = true;
    isEndingConsult.value = false;

    removePatientFromSidebar(patientId);
};

const copyServiceCode = async () => {
    if (!completedServiceCode.value) return;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(completedServiceCode.value);
        } else {
            const ta = document.createElement('textarea');
            ta.value = completedServiceCode.value;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        copyFeedback.value = 'คัดลอกแล้ว ✓';
    } catch (e) {
        copyFeedback.value = 'คัดลอกไม่สำเร็จ';
    }
    setTimeout(() => { copyFeedback.value = ''; }, 1800);
};

const finishToSummary = async () => {
    const pid = completedPatientId.value;
    showEndResultModal.value = false;
    if (pid) {
        await router.push({ path: '/Summary', query: { id: pid } });
    }
};

const closeEndResult = () => {
    showEndResultModal.value = false;
};

const startConsultCountdown = async ({ force = false } = {}) => {
    if (!import.meta.client) return;
    if (consultCountdownStarting) return;
    if (!force && consultCountdownTimer) return;

    if (!activePatientId.value) {
        consultTimeLeftText.value = '--:--';
        clearConsultCountdown();
        return;
    }

    if (isTrackingEnded.value) {
        consultTimeLeftText.value = 'สิ้นสุดการติดตามอาการแล้ว';
        clearConsultCountdown();
        return;
    }

    if (isTrackingMode.value) {
        clearConsultCountdown();
        tickConsultCountdown();
        consultCountdownTimer = setInterval(tickConsultCountdown, 1000);
        return;
    }

    if (!timerRequestId.value) {
        consultTimeLeftText.value = '--:--';
        clearConsultCountdown();
        return;
    }

    consultCountdownStarting = true;
    try {
        clearConsultCountdown();
        warnedAt.value = new Set();

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

const clearConsultCountdown = () => {
    if (consultCountdownTimer) {
        clearInterval(consultCountdownTimer);
        consultCountdownTimer = null;
    }
};

/* ================= 3. Call System (handled by useWebRTCCall composable) ================= */
// เมื่อมีสายเรียกเข้า — เปิดห้องสนทนาของลูกค้าให้อัตโนมัติ
watch(peerInfo, (info) => {
    if (!info?.id) return;
    if (!isReceivingCall.value && !isInCall.value && !isCalling.value) return;

    const pid = normalizePatientId(info.id);
    if (!pid) return;
    if (Number(activePatientId.value) !== pid) {
        activePatientId.value = pid;
        ensurePatientInSidebar(pid);
        router.push({ query: { id: pid } });
    }
}, { deep: true });

const goToSummary = () => {
    if (activePatientId.value) {
        router.push({
            path: '/Summary',
            query: {
                id: activePatientId.value,
                source: 'consult_form',
            }
        });
    } else {
        alert("กรุณาเลือกคนไข้ก่อนพิมพ์ใบปรึกษา");
    }
};

/* ================= 6. Chat Logic ================= */
// กัน response เก่าทับใหม่เมื่อสลับคนไข้เร็ว ๆ
let messageFetchGen = 0;

const fetchMessages = async () => {
    const pid = normalizePatientId(activePatientId.value);
    if (!pid) return;
    const myGen = ++messageFetchGen;

    try {
        const data = await $fetch(buildChatGetUrl(), { credentials: 'include' });
        if (myGen !== messageFetchGen) return;
        if (normalizePatientId(activePatientId.value) !== pid) return;

        if (data) {
            const list = Array.isArray(data) ? data.map(normalizeChatMessage) : [];
            chatMessages.value = list;
            const latestMedicineRequest = [...list]
                .reverse()
                .find((msg) => msg.sender_role === 'user' && msg.message_text === MEDICINE_REQUEST_TEXT);

            if (import.meta.client && latestMedicineRequest?.message_id) {
                const notifyKey = `pharma-med-request-notified-${activePatientId.value}`;
                const lastNotifiedId = Number(localStorage.getItem(notifyKey) || 0);
                if (Number(latestMedicineRequest.message_id) > lastNotifiedId) {
                    const currentPatientName = patientDetailsMap.value[activePatientId.value] || `ผู้ป่วยคนที่ ${activePatientId.value}`;
                    alert(`คุณ ${currentPatientName} กดปุ่มรับยา กรุณาออกใบปรึกษาให้ลูกค้า`);
                    localStorage.setItem(notifyKey, String(latestMedicineRequest.message_id));
                }
            }
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
    } catch (err) { console.error(err); }
};

const sendMessage = async () => {
    if (isTrackingEnded.value) return; // สิ้นสุดการติดตามอาการแล้ว → พิมพ์ตอบไม่ได้
    if (!newMessage.value.trim() || !activePatientId.value) return;
    const body = new FormData();
    body.append('receiver_id', activePatientId.value);
    body.append('message_text', newMessage.value);
    // 🚩 ซ่อมเครื่องหมายคำพูดครอบท้าย apiUrl
    await $fetch(apiUrl('chat-send.php'), { method: 'POST', body, credentials: 'include' });
    newMessage.value = '';
    await fetchMessages();
    await scrollToBottom(true);
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

// แก้ไข/ลบข้อความได้เฉพาะภายใน 5 นาทีหลังส่ง
const modifyTick = ref(0);
let modifyTickTimer = null;
const EDIT_DELETE_WINDOW_MS = 5 * 60 * 1000;
const DELETE_CONFIRM_TEXT = 'ลบข้อความนี้ออกจากหน้าจอหรือไม่?\nข้อมูลจริงจะถูก freeze เก็บไว้ในฐานข้อมูล';

const parseChatTimestamp = (v) => {
    if (v == null || v === '') return NaN;
    const s = String(v).trim();
    const candidates = [new Date(s).getTime()];
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
        candidates.push(new Date(`${s.replace(' ', 'T')}Z`).getTime());
        candidates.push(new Date(`${s.replace(' ', 'T')}+07:00`).getTime());
    }
    const valid = candidates.filter((t) => !Number.isNaN(t));
    return valid.length ? Math.max(...valid) : NaN;
};

const getMessageId = (msg) => Number(msg?.message_id || msg?.id || 0);

const normalizeChatMessage = (msg) => ({
    ...msg,
    message_id: getMessageId(msg),
    created_at: msg?.created_at ? String(msg.created_at) : '',
    display_time: msg?.display_time ? String(msg.display_time).trim() : '',
    can_modify: msg?.can_modify === true || msg?.can_modify === 1 || msg?.can_modify === '1',
    is_archived: Number(msg?.is_archived || 0),
});

const editingMessageId = ref(null);
const editingText = ref('');

const canModifyMessage = (msg) => {
    void modifyTick.value;
    if (!msg || Number(msg.is_archived)) return false;
    if (getMessageId(msg) <= 0) return false;
    return msg.can_modify === true;
};

const showMsgActions = (msg) =>
    !!msg
    && !msg.__divider
    && msg.sender_role === 'pharma'
    && Number(msg.is_archived) === 0
    && getMessageId(msg) > 0
    && getMessageId(msg) !== editingMessageId.value
    && canModifyMessage(msg);

const openMsgActionsId = ref(0);
const hoveredMsgId = ref(0);
const isMsgActionsVisible = (msg) => {
    const id = getMessageId(msg);
    return id > 0 && (hoveredMsgId.value === id || openMsgActionsId.value === id);
};
const onMsgPointerEnter = (msg) => {
    if (!canModifyMessage(msg)) return;
    hoveredMsgId.value = getMessageId(msg);
};
const onMsgPointerLeave = (msg) => {
    if (hoveredMsgId.value === getMessageId(msg)) hoveredMsgId.value = 0;
};
const onMsgBubbleTap = (msg, ev) => {
    if (!canModifyMessage(msg)) return;
    if (ev.target.closest('.msg-act-btn, .msg-edit-box, .msg-image, .pdf-container, a')) return;
    const id = getMessageId(msg);
    openMsgActionsId.value = openMsgActionsId.value === id ? 0 : id;
};

// ===== ลบข้อความ/รูป/ไฟล์ =====
const deleteMessage = async (msg) => {
    const messageId = typeof msg === 'object' && msg !== null ? getMessageId(msg) : Number(msg || 0);
    if (typeof msg === 'object' && msg !== null && !canModifyMessage(msg)) {
        alert('ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถลบได้');
        return;
    }
    if (!confirm(DELETE_CONFIRM_TEXT)) return;
    try {
        const body = new FormData();
        body.append('message_id', messageId);
        const res = await $fetch(apiUrl('chat-delete.php'), {
            method: 'POST', body, credentials: 'include'
        });
        if (res?.status === 'success') {
            await fetchMessages();
        } else {
            alert(res?.message || 'ลบไม่สำเร็จ');
        }
    } catch (err) {
        console.error('Delete error:', err);
        alert('เกิดข้อผิดพลาดในการลบ');
    }
};

const startEditMessage = (msg) => {
    if (!canModifyMessage(msg)) {
        alert('ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถแก้ไขได้');
        return;
    }
    editingMessageId.value = getMessageId(msg);
    editingText.value = msg.message_text || '';
};
const cancelEditMessage = () => {
    editingMessageId.value = null;
    editingText.value = '';
};
const saveEditMessage = async () => {
    if (!editingMessageId.value) return;
    const editingMsg = chatMessages.value.find((m) => getMessageId(m) === editingMessageId.value);
    if (editingMsg && !canModifyMessage(editingMsg)) {
        alert('ข้อความนี้ส่งเกิน 5 นาทีแล้ว ไม่สามารถแก้ไขได้');
        cancelEditMessage();
        return;
    }
    if (!editingText.value.trim()) {
        alert('ข้อความว่างเปล่า');
        return;
    }
    try {
        const body = new FormData();
        body.append('message_id', editingMessageId.value);
        body.append('message_text', editingText.value.trim());
        const res = await $fetch(apiUrl('chat-edit.php'), {
            method: 'POST', body, credentials: 'include'
        });
        if (res?.status === 'success') {
            cancelEditMessage();
            await fetchMessages();
        } else {
            alert(res?.message || 'แก้ไขไม่สำเร็จ');
        }
    } catch (err) {
        console.error('Edit error:', err);
        alert('แก้ไขไม่สำเร็จ');
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

/* ================= 7. Interaction & Lifecycle ================= */
let initRouteGen = 0;

const selectPatient = (id) => {
    const normalized = normalizePatientId(id);
    if (!normalized) return;
    if (String(normalized) !== String(activePatientId.value)) {
        persistTimerBeforeLeave();
    }

    messageFetchGen += 1;
    chatMessages.value = [];
    initialScrollDone.value = false;
    ensurePatientInSidebar(normalized);
    activePatientId.value = normalized;
    router.push({ query: { id: normalized } });
    fetchPatientInfo(normalized, { markLoaded: true });
    fetchActiveConsultInfo();
};

// ดักฟัง URL สลับคิว
watch(() => route.query.consult_done, (done) => {
    if (done === '1' || done === 'true') {
        const pid = normalizePatientId(route.query.patient_id);
        if (pid) {
            removePatientFromSidebar(pid);
        }
        router.replace({ path: '/pharmacy_web' });
    }
});

const initPharmacyFromRoute = async (newId) => {
    if (!import.meta.client) return;
    const normalized = normalizePatientId(newId);
    if (activePatientId.value && normalized && String(activePatientId.value) !== String(normalized)) {
        persistTimerBeforeLeave();
    }
    const routeCid = Number(route.query.consult_id) || 0;
    const routeSrv = String(route.query.srv || '').trim();
    const myGen = ++initRouteGen;

    activePatientId.value = normalized;
    showEndConsultFab.value = false;
    activeRequestId.value = routeCid;
    timerRequestId.value = 0;
    activeServiceCode.value = routeSrv;
    lastSyncAt.value = 0;
    serverRemaining.value = 0;

    if (normalized) {
        messageFetchGen += 1;
        chatMessages.value = [];
        initialScrollDone.value = false;

        const pendingName = localStorage.getItem('bell-incoming-patient-name');
        if (pendingName) {
            setPatientDisplayName(normalized, pendingName);
        }
        ensurePatientInSidebar(normalized);
        fetchPatientInfo(normalized, { consultId: routeCid, markLoaded: true });

        // โหลด consult + timerRequestId ก่อน sync นาฬิกา — กันรีเฟรชแล้วเวลากลับ 15:00
        await fetchActiveConsultInfo();
        if (myGen !== initRouteGen) return;

        await fetchMessages();
        if (myGen !== initRouteGen) return;
    } else {
        chatMessages.value = [];
        clearConsultCountdown();
        consultTimeLeftText.value = '--:--';
        return;
    }

    await startConsultCountdown();
};

watch(
    () => route.query.id,
    (newId) => {
        initPharmacyFromRoute(newId);
    },
    { immediate: true }
);

watch(
    () => [route.query.consult_id, route.query.srv],
    () => {
        if (!import.meta.client) return;
        const routeCid = Number(route.query.consult_id) || 0;
        const routeSrv = String(route.query.srv || '').trim();
        if (routeCid > 0) activeRequestId.value = routeCid;
        if (routeSrv) activeServiceCode.value = routeSrv;
        fetchMessages();
    }
);

watch(sidebarPatientIds, () => {
    saveSidebarPatients();
}, { deep: true });

onMounted(async () => {
    if (route.query.consult_done === '1' || route.query.consult_done === 'true') {
        const pid = normalizePatientId(route.query.patient_id);
        if (pid) removePatientFromSidebar(pid);
        router.replace({ path: '/pharmacy_web' });
    }

    await loadSidebarPatients();
    if (activePatientId.value) {
        ensurePatientInSidebar(activePatientId.value);
    }

    await checkExternalBellTrigger();

    mainTimer = setInterval(() => { 
        fetchMessages(); 
        checkExternalBellTrigger();
    }, 3000);

    // เริ่ม polling การโทร (ใน composable) — ใช้ความถี่ของตัวเอง
    startCallPolling(2500);

    // ตรวจสอบโหมดติดตามอาการทุก 4 วินาที (จับเหตุการณ์ user หรือ pharma กดปรึกษาอีกครั้ง)
    fetchActiveConsultInfo();
    consultInfoPollTimer = setInterval(fetchActiveConsultInfo, 4000);

    // 💓 heartbeat นาฬิกากลางทุก 5 วิ (ส่งเฉพาะตอนเปิดหน้าจออยู่) + เช็คทันทีเมื่อกลับมาที่แท็บ
    chatTimerHeartbeat = setInterval(() => syncChatTimer(), 5000);
    bindChatTimerPageLifecycle();

    modifyTickTimer = setInterval(() => {
        modifyTick.value += 1;
    }, 1000);
});

onBeforeUnmount(() => {
    persistTimerBeforeLeave();
    if (mainTimer) clearInterval(mainTimer);
    if (modifyTickTimer) clearInterval(modifyTickTimer);
    if (consultInfoPollTimer) clearInterval(consultInfoPollTimer);
    if (chatTimerHeartbeat) clearInterval(chatTimerHeartbeat);
    unbindChatTimerPageLifecycle();
    clearConsultCountdown();
    stopCallPolling();
});

/* ================= 8. Image Preview ================= */
const isShowPreview = ref(false);
const previewUrl = ref('');
const openPreview = (url) => { previewUrl.value = url; isShowPreview.value = true; };
const closePreview = () => { isShowPreview.value = false; };
</script>
<template>
    <div class="admin-layout pharmacy-web-page">
        <Pharmacy_header />
        <audio ref="remoteAudioSink" autoplay playsinline webkit-playsinline style="position:fixed;width:0;height:0;opacity:0;pointer-events:none;z-index:-1"></audio>

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
                    <div class="avatar-ring">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00469c&color=fff&size=160'"
                             class="caller-img" alt="caller" />
                        <div class="pulse"></div>
                    </div>
                    <h3 class="caller-name">{{ callerDisplayName }}</h3>
                    <p class="caller-sub">กำลังโทรหาคุณ...</p>
                    <div class="call-btns">
                        <button class="btn-decline" @click="endCall">
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
                        {{ callType === 'video' ? 'กำลังเรียกสายวิดีโอ' : 'กำลังโทรออก' }}
                    </div>
                    <div class="avatar-ring">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00469c&color=fff&size=160'"
                             class="caller-img" alt="caller" />
                        <div class="pulse"></div>
                    </div>
                    <h3 class="caller-name">{{ callerDisplayName }}</h3>
                    <p class="caller-sub">กำลังเรียกสาย...</p>
                    <button class="btn-decline btn-decline-full" @click="endCall">
                        <i class="fa-solid fa-phone-slash"></i> วางสาย
                    </button>
                </div>
            </div>
        </transition>

        <transition name="fade">
            <div v-if="isInCall && callType === 'voice'" class="voice-call-overlay" @click="unlockCallAudio">
                <div class="voice-call-card">
                    <div class="avatar-ring big">
                        <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00469c&color=fff&size=200'"
                             class="caller-img" alt="caller" />
                        <div class="pulse-soft"></div>
                    </div>
                    <h3 class="caller-name">{{ callerDisplayName }}</h3>
                    <p class="caller-timer">🎙 {{ callTimerText }}</p>
                    <div class="video-call-controls">
                        <button @click="toggleMic" :class="{ 'btn-device-off': !isMicOn }" class="video-control-btn" title="ปิด/เปิดไมค์">
                            <i :class="isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                        </button>
                        <button @click="endCall" class="btn-hangup-main">
                            <i class="fa-solid fa-phone-slash"></i>
                        </button>
                        <button @click.stop="toggleSpeaker" :class="{ 'btn-device-off': !isSpeakerOn }" class="video-control-btn" :title="isSpeakerOn ? 'ปิดลำโพง' : 'เปิดลำโพง'">
                            <i :class="isSpeakerOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark'"></i>
                        </button>
                    </div>
                    <!-- ซ่อนแบบยัง render อยู่ (ไม่ใช้ display:none) -->
                    <video ref="remoteVideo" autoplay playsinline style="position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;"></video>
                    <video ref="localVideo" autoplay playsinline muted style="display:none"></video>
                </div>
            </div>
        </transition>

        <!-- Mobile topbar: ปุ่ม hamburger -->
        <div class="mobile-topbar">
            <button class="hamburger" @click="toggleSidebar" aria-label="menu">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">
                <i class="fa-solid fa-comments"></i>
                {{ activePatientId ? (patientDetailsMap[activePatientId] || `ผู้ป่วย ${activePatientId}`) : 'ห้องสนทนา' }}
            </div>
            <span v-if="sidebarPatientIds.length" class="patient-count-badge">{{ sidebarPatientIds.length }}</span>
        </div>

        <transition name="fade-bd">
            <div v-if="sidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
        </transition>

        <div class="main-content">
            <aside class="sidebar" :class="{ open: sidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-users"></i>
                    <span>คนไข้ ({{ sidebarPatientIds.length }})</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <!-- ช่องค้นหาในรายการคนไข้ -->
                <div class="sidebar-search">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input
                        type="text"
                        v-model="patientSearchQuery"
                        placeholder="ค้นหาชื่อคนไข้..."
                    />
                    <button
                        v-if="patientSearchQuery"
                        type="button"
                        class="sidebar-search-clear"
                        @click="patientSearchQuery = ''"
                        aria-label="ล้างคำค้นหา"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="sidebar-section">
                    <div v-if="!sidebarPatientIds.length" class="sidebar-empty">
                        <i class="fa-regular fa-folder-open"></i>
                        <span>ยังไม่มีคนไข้</span>
                    </div>
                    <div v-else-if="!filteredSidebarPatients.length" class="sidebar-empty">
                        <i class="fa-regular fa-circle-question"></i>
                        <span>ไม่พบ "{{ patientSearchQuery }}"</span>
                    </div>
                    <div
                        v-for="patientId in filteredSidebarPatients"
                        :key="patientId"
                        class="menu-item patient-item"
                        :class="{ active: Number(activePatientId) === patientId }"
                        @click="selectPatient(patientId); closeSidebar()"
                    >
                        <div class="status-dot" :class="Number(activePatientId) === patientId ? 'online' : 'offline'"></div>
                        <div class="patient-item-info">
                            <span class="patient-name-text">{{ patientDetailsMap[patientId] || `กำลังโหลด (${patientId})...` }}</span>
                            <span
                                v-if="patientSymptomsMap[patientId]"
                                class="patient-symptom-text"
                                :title="patientSymptomsMap[patientId]"
                            >
                                <svg class="symptom-ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M4 3v6a5 5 0 0 0 10 0V3"></path>
                                    <path d="M4 3H2m2 0h2M14 3h-2m2 0h2"></path>
                                    <path d="M9 14v2a5 5 0 0 0 10 0v-1"></path>
                                    <circle cx="19" cy="11" r="2"></circle>
                                </svg>
                                {{ patientSymptomsMap[patientId] }}
                            </span>
                            <span v-else-if="patientSymptomLoaded[patientId]" class="patient-symptom-empty">ยังไม่มีข้อมูลอาการ</span>
                        </div>
                    </div>
                </div>
            </aside>

            <section class="chat-section">
                <div v-if="!activePatientId" class="empty-state-container">
                    <div class="empty-state-content">
                        <div class="empty-state-icon">
                            <span role="img" aria-label="chat">💬</span>
                        </div>
                        <br>
                        <h3 class="empty-state-title">เริ่มต้นการสนทนา</h3>
                        <p class="empty-state-description">
                            กรุณาเลือกรายชื่อคนไข้จากแถบเมนูด้านข้าง<br>เพื่อเริ่มการสนทนา
                        </p>
                        <div class="empty-state-note">
                            <p>หากไม่พบรายชื่อ: อาจเป็นเพราะคุณยังไม่มี<br>การรับเคสคนไข้ในระบบ</p>
                        </div>
                    </div>
                </div>

                <div v-else class="chat-wrapper">

                    <div v-if="isInCall" class="active-call-bar in-call">
                        <div class="call-info">
                            <span class="blink-dot in-call-active"></span>
                            <span class="call-info-text">
                                <strong class="call-state-label">กำลังอยู่ในสาย</strong>
                                กับ
                                <strong class="patient-name-inline">{{ patientDetailsMap[activePatientId] || `ผู้ป่วยคนที่ ${activePatientId}` }}</strong>
                                <span class="timer-pill">⏱ {{ callTimerText }}</span>
                            </span>
                        </div>
                        <button @click="endCall" class="btn-hangup-bar">
                            <i class="fa-solid fa-phone-slash"></i> วางสาย
                        </button>
                    </div>

                    <div class="chat-container chat-container--pharma">
                        <div class="role-banner role-banner--pharma">
                            <i class="fa-solid fa-user-doctor"></i>
                            <span>หน้าเภสัชกร · กำลังให้คำปรึกษาผู้ป่วย</span>
                        </div>
                        <div class="chat-header">
                            <div class="chat-header-left">
                                <div class="chat-avatar" :class="{ 'has-img': patientAvatar(activePatientId) }">
                                    <img v-if="patientAvatar(activePatientId)"
                                         :src="patientAvatar(activePatientId)"
                                         :alt="patientDetailsMap[activePatientId] || 'patient'"
                                         @error="$event.target.style.display='none'" />
                                    <span v-else>{{ (patientDetailsMap[activePatientId] || 'P').charAt(0).toUpperCase() }}</span>
                                </div>
                                <div class="chat-header-info">
                                    <h3 class="chat-title">{{ patientDetailsMap[activePatientId] || `ผู้ป่วยคนที่ ${activePatientId}` }}</h3>
                                    <div class="chat-subtitle">
                                        <span class="online-dot"></span>
                                        ออนไลน์
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
                                <button v-if="!isInCall" @click="makeCall('voice')" class="btn-call-header" title="โทรเสียง">
                                    <i class="fa-solid fa-phone"></i>
                                    <span class="btn-label">โทร</span>
                                </button>
                                <button class="video-call-btn" @click="makeCall('video')" title="วิดีโอคอล">
                                    <i class="fa-solid fa-video"></i>
                                    <span class="btn-label">วิดีโอ</span>
                                </button>
                                <!-- ปุ่ม "จบบทสนทนา" — ซ่อนเมื่ออยู่ในโหมดติดตามอาการ / สิ้นสุดการติดตาม -->
                                <button
                                    v-if="!isTrackingMode && !isTrackingEnded"
                                    class="btn-end-consult-header"
                                    @click="openEndConfirm"
                                    title="จบบทสนทนา และออกรหัสให้บริการสำหรับลิงก์กับฝั่งแอดมิน"
                                >
                                    <i class="fa-solid fa-circle-check"></i>
                                    <span class="btn-label">จบบทสนทนา</span>
                                </button>
                            </div>
                        </div>

                        <transition name="video-pop">
                            <div v-if="isInCall && callType === 'video'" class="video-call-full-overlay" @click="retryRemoteVideo">
                                <video
                                    ref="remoteVideoLive"
                                    autoplay
                                    playsinline
                                    muted
                                    :class="['remote-video-bg', { 'has-stream': showRemoteVideoBg }]"
                                ></video>
                                <div v-if="callConnectHint && !showRemoteVideoBg" class="video-connect-hint">
                                    <i class="fa-solid fa-circle-notch fa-spin"></i>
                                    {{ callConnectHint }}
                                </div>
                                <div class="video-caller-banner">
                                    <img :src="callerDisplayImage || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(callerDisplayName) + '&background=00469c&color=fff&size=80'"
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
                                    <button @click.stop="toggleCamera" :class="{ 'btn-device-off': !isCamOn }" class="video-control-btn">
                                        <i :class="isCamOn ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'"></i>
                                    </button>
                                    <button @click.stop="endCall" class="btn-hangup-main">
                                        <i class="fa-solid fa-phone-slash"></i>
                                    </button>
                                    <button @click.stop="toggleMic" :class="{ 'btn-device-off': !isMicOn }" class="video-control-btn">
                                        <i :class="isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                                    </button>
                                    <button @click.stop="toggleSpeaker" :class="{ 'btn-device-off': !isSpeakerOn }" class="video-control-btn" :title="isSpeakerOn ? 'ปิดลำโพง' : 'เปิดลำโพง'">
                                        <i :class="isSpeakerOn ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark'"></i>
                                    </button>
                                </div>
                            </div>
                        </transition>

                        <div class="chat-messages" ref="chatScroll" @scroll.passive="onChatScroll">
                            <div v-if="!chatMessages.length" class="chat-welcome">
                                <div class="welcome-icon">💬</div>
                                <h4>เริ่มต้นการสนทนา</h4>
                                <p>พิมพ์ข้อความเพื่อเริ่มให้คำปรึกษากับคนไข้ได้เลย</p>
                            </div>

                            <template v-for="msg in chatMessagesWithDivider" :key="msg.__divider ? msg.__key : msg.message_id">
                                <!-- ✂️ เส้นแบ่ง: ปรึกษา → ติดตามอาการ -->
                                <div v-if="msg.__divider" class="chat-section-divider">
                                    <span class="divider-line"></span>
                                    <span class="divider-label">
                                        <i class="fa-solid fa-notes-medical"></i>
                                        เริ่มติดตามอาการคนไข้
                                    </span>
                                    <span class="divider-line"></span>
                                </div>
                                <div v-else
                                    :class="['message-bubble', msg.sender_role === 'pharma' ? 'doctor' : 'patient', {
                                        'can-modify': showMsgActions(msg),
                                        'msg-actions-open': isMsgActionsVisible(msg),
                                    }]"
                                    @mouseenter="onMsgPointerEnter(msg)"
                                    @mouseleave="onMsgPointerLeave(msg)"
                                    @click="onMsgBubbleTap(msg, $event)">

                                <!-- ปุ่มแก้ไข/ลบ — แสดงเมื่อชี้/แตะข้อความของตัวเอง (ภายใน 5 นาที) -->
                                <div v-if="showMsgActions(msg)" class="msg-actions-bar">
                                    <button v-if="String(msg.message_text || '').trim()" type="button"
                                            class="msg-act-btn edit"
                                            @click.stop="startEditMessage(msg)" title="แก้ไขข้อความ">
                                        <span class="msg-act-label">แก้ไข</span>
                                    </button>
                                    <button type="button" class="msg-act-btn delete"
                                            @click.stop="deleteMessage(msg)" title="ลบข้อความ">
                                        <span class="msg-act-label">ลบ</span>
                                    </button>
                                </div>

                                <div v-if="msg.file_path && (msg.file_path.match(/\.(jpg|jpeg|png|gif|webp)$/i))" class="msg-image-wrap">
                                    <img :src="uploadsChat(msg.file_path)" class="msg-image"
                                         @click="openPreview(uploadsChat(msg.file_path))" />
                                </div>

                                <div v-if="msg.file_path && msg.file_path.toLowerCase().endsWith('.pdf')" class="pdf-container">
                                    <div class="pdf-icon">📄</div>
                                    <div class="pdf-meta">
                                        <span class="pdf-title">เอกสาร PDF</span>
                                        <a :href="uploadsChat(msg.file_path)" target="_blank" download class="pdf-link">
                                            คลิกเพื่อดาวน์โหลด 📥
                                        </a>
                                    </div>
                                </div>

                                <!-- โหมดแก้ไข -->
                                <div v-if="getMessageId(msg) === editingMessageId" class="msg-edit-box">
                                    <textarea v-model="editingText" rows="2" class="edit-input"
                                              @keyup.esc="cancelEditMessage"></textarea>
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
                                    <!-- 📋 การ์ดใบสั่งยา -->
                                    <div
                                        v-if="parsePrescriptionMessage(msg.message_text).prescriptionId > 0"
                                        class="prescription-card"
                                        @click="openPrescriptionPdf(parsePrescriptionMessage(msg.message_text).prescriptionId)"
                                    >
                                        <div class="rx-icon"><i class="fa-solid fa-file-prescription"></i></div>
                                        <div class="rx-body">
                                            <div class="rx-title">ใบสั่งยา (PDF)</div>
                                            <div class="rx-sub">คลิกเพื่อเปิด/พิมพ์</div>
                                        </div>
                                        <div class="rx-action">
                                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                        </div>
                                    </div>
                                </template>

                                <div class="time">{{ formatChatMessageTime(msg) }}</div>
                                </div>
                            </template>
                        </div>

                        <transition name="fade">
                            <div v-if="showEndConsultFab && !isTrackingMode" class="end-consult-fab-wrap">
                                <button type="button" class="btn-end-consult" @click="endConsultation">
                                    <i class="fa-solid fa-circle-check"></i> จบการสนทนา — ไปบันทึกใบสั่งยา (Summary)
                                </button>
                            </div>
                        </transition>

                        <div v-if="isTrackingEnded" class="tracking-ended-notice">
                            <i class="fa-solid fa-circle-check"></i>
                            <span>สิ้นสุดการติดตามอาการแล้ว — เข้าดูประวัติการสนทนาได้ แต่ไม่สามารถพิมพ์ตอบได้</span>
                        </div>

                        <div class="chat-input-area" :class="{ 'input-disabled': isTrackingEnded }">
                            <button type="button" @click="$refs.fileInput.click()" class="icon-btn-attach"
                                    :disabled="isTrackingEnded" title="แนบไฟล์ / รูปภาพ">
                                <i class="fa-solid fa-paperclip"></i>
                            </button>
                            <input type="file" ref="fileInput" style="display: none" accept="image/*, .pdf" @change="handleFileUpload">
                            <div class="input-wrap">
                                <input type="text" v-model="newMessage" placeholder="พิมพ์ข้อความ..."
                                       :disabled="isTrackingEnded" @keyup.enter="sendMessage">
                            </div>
                            <button class="btn-send" @click="sendMessage" :disabled="isTrackingEnded || !newMessage.trim()" title="ส่งข้อความ">
                                <i class="fa-solid fa-paper-plane"></i>
                                <span class="btn-label">ส่ง</span>
                            </button>
                            <button @click="goToSummary" class="btn-send1" title="พิมพ์ใบสั่งยา / ใบปรึกษา">
                                <i class="fa-solid fa-file-invoice"></i>
                                <span class="btn-label">ใบปรึกษา</span>
                            </button>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <!-- ===== Modal: ยืนยันก่อนจบการสนทนา ===== -->
        <transition name="fade">
            <div v-if="showEndConfirmModal" class="end-consult-modal-overlay" @click.self="closeEndConfirm">
                <div class="end-consult-modal confirm">
                    <button class="ec-close" @click="closeEndConfirm" :disabled="isEndingConsult" aria-label="ปิด">×</button>
                    <div class="ec-icon-wrap warn">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <h3 class="ec-title">ยืนยันการจบบทสนทนา</h3>
                    <p class="ec-desc">
                        คุณกำลังจะจบบทสนทนากับ
                        <strong>{{ patientDetailsMap[activePatientId] || `ผู้ป่วยคนที่ ${activePatientId}` }}</strong>
                    </p>
                    <ul class="ec-list">
                        <li><i class="fa-solid fa-check"></i> ระบบจะอัปเดตสถานะการให้บริการเป็น <b>เสร็จสิ้น (completed)</b></li>
                        <li><i class="fa-solid fa-check"></i> จะได้รับ <b>รหัสบริการ (Service Code)</b> เพื่อแจ้งให้แอดมินตรวจสอบ</li>
                        <li>
                            <i class="fa-solid fa-shield-halved"></i>
                            ข้อความจะถูกย้ายไปเก็บใน <b>คลังประวัติ 365 วัน</b> ตามประกาศสภาเภสัชกรรม —
                            เปิดดูได้ที่หน้า <b>ติดตามคนไข้ → ปุ่ม "📜 ประวัติแชท"</b>
                        </li>
                        <li><i class="fa-solid fa-check"></i> เมื่อคนไข้กลับมาคุยอีกครั้ง จะเป็นห้องสนทนาใหม่ (ข้อความเก่าจะไม่แสดง)</li>
                    </ul>
                    <div class="ec-actions">
                        <button class="ec-btn ec-cancel" :disabled="isEndingConsult" @click="closeEndConfirm">
                            ยกเลิก
                        </button>
                        <button class="ec-btn ec-confirm" :disabled="isEndingConsult" @click="endConsultation">
                            <i v-if="isEndingConsult" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-solid fa-circle-check"></i>
                            {{ isEndingConsult ? 'กำลังบันทึก...' : 'ยืนยันจบบทสนทนา' }}
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- ===== Modal: แสดงรหัสบริการหลังจบบทสนทนา ===== -->
        <transition name="fade">
            <div v-if="showEndResultModal" class="end-consult-modal-overlay">
                <div class="end-consult-modal result">
                    <button class="ec-close" @click="closeEndResult" aria-label="ปิด">×</button>
                    <div class="ec-icon-wrap success">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <h3 class="ec-title success">บริการเสร็จสมบูรณ์</h3>
                    <p class="ec-desc">
                        จบการให้บริการกับ <strong>{{ completedPatientName }}</strong> เรียบร้อยแล้ว
                    </p>

                    <div class="ec-code-card">
                        <div class="ec-code-label">รหัสอ้างอิงการให้บริการ</div>
                        <div class="ec-code-value">
                            <span class="ec-code-text">{{ completedServiceCode || '-' }}</span>
                            <button class="ec-copy-btn" @click="copyServiceCode" :disabled="!completedServiceCode">
                                <i class="fa-regular fa-copy"></i>
                                คัดลอก
                            </button>
                        </div>
                        <div v-if="copyFeedback" class="ec-copy-feedback">{{ copyFeedback }}</div>
                        <div class="ec-code-hint">
                            <i class="fa-solid fa-circle-info"></i>
                            <span>
                                ส่งรหัสนี้ให้ผู้ดูแลระบบ (Admin) ค้นหาในหน้า
                                <b>การให้บริการ</b> เพื่อยืนยันสถานะ
                                <b>"รับบริการแล้ว (Completed)"</b>
                                หรือเปิดลิงก์ตรงด้านล่างนี้ได้ทันที
                            </span>
                        </div>
                        <NuxtLink
                            v-if="completedServiceCode"
                            :to="{ path: '/admin/usage', query: { code: completedServiceCode } }"
                            target="_blank"
                            class="ec-admin-link"
                        >
                            <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            เปิดในหน้า Admin → การให้บริการ
                        </NuxtLink>
                    </div>

                    <div class="ec-actions ec-actions-result">
                        <button class="ec-btn ec-confirm" @click="finishToSummary">
                            <i class="fa-solid fa-file-invoice"></i>
                            ไปบันทึกใบสั่งยา (Summary)
                        </button>
                    </div>
                    <p class="ec-close-hint">
                        <i class="fa-solid fa-circle-info"></i>
                        กดปุ่ม <b>✕</b> มุมขวาบนเพื่อปิดหน้าต่างนี้ — ข้อมูลถูกบันทึกไว้ในหน้าติดตามคนไข้แล้ว
                    </p>
                </div>
            </div>
        </transition>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/pharmacy_web.css";

/* 🔧 บังคับ drawer มือถือให้ทำงานแน่นอน — กฎ scoped (มี [data-v]) specificity สูงกว่า
   .sidebar.open จากไฟล์ @import (global) กันเคสกด hamburger แล้ว sidebar ไม่เปิด */
@media (max-width: 1024px) {
    /* topbar เป็น positioned element เพื่อให้ปุ่มรับคลิกได้ชัวร์ (ต่ำกว่า navbar 1000
       เพื่อไม่บังเมนู nav) */
    .mobile-topbar {
        display: flex !important;
        position: relative;
        z-index: 91;
    }
    .hamburger {
        position: relative;
        z-index: 1;
        pointer-events: auto;
        cursor: pointer;
    }
    .sidebar-close { display: flex !important; }

    .sidebar-backdrop {
        position: fixed !important;
        inset: 0 !important;
        z-index: 2400 !important;
    }

    /* นิยาม drawer มือถือใหม่แบบสมบูรณ์ + !important ทุก property
       เพื่อชนะกฎ .sidebar ที่รั่วมาจาก CSS หน้าอื่น (global) ตอนสลับหน้าแบบ SPA */
    .sidebar {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: auto !important;
        bottom: 0 !important;
        height: 100vh !important;
        width: 86% !important;
        max-width: 360px !important;
        z-index: 2500 !important;
        transform: translateX(-105%) !important;
        transition: transform 0.3s ease !important;
        overflow-y: auto !important;
        align-self: auto !important;
        display: flex !important;
        flex-direction: column !important;
        background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%) !important;
        color: #fff !important;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.45) !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
    }
    .sidebar.open { transform: translateX(0) !important; }

    /* การันตีว่าทุกอย่างใน drawer คลิกได้ (กันกฎ pointer-events:none ที่อาจรั่วมา)
       และยกเนื้อหา drawer ให้อยู่เหนือ backdrop เสมอ */
    .sidebar > *,
    .sidebar a,
    .sidebar button,
    .sidebar input,
    .sidebar .patient-item,
    .sidebar .sidebar-search,
    .sidebar .sidebar-section {
        pointer-events: auto !important;
        position: relative;
        z-index: 1;
    }
}

.chat-wrapper { position: relative; }

/* ============================================================
   🩺 Patient Sidebar Item — เพิ่มอาการป่วยใต้ชื่อ
   ============================================================ */
.patient-item {
    align-items: flex-start !important;
    padding-top: 10px !important;
    padding-bottom: 10px !important;
}
.patient-item-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
}
.patient-item .patient-name-text {
    color: inherit;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
}
.patient-symptom-text {
    font-size: 0.72rem;
    color: #ffffff;
    background: rgba(14, 165, 233, 0.28);
    padding: 2px 8px;
    border-radius: 6px;
    border-left: 3px solid #7dd3fc;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    line-height: 1.4;
}
.patient-symptom-text i { font-size: 9px; color: #ffffff; }
.patient-symptom-text .symptom-ico { width: 11px; height: 11px; color: #ffffff; flex-shrink: 0; }
.patient-symptom-empty {
    font-size: 0.68rem;
    color: rgba(255, 255, 255, 0.55);
    font-style: italic;
    line-height: 1.3;
}
/* item active: แถบอาการ contrast สูงบนพื้นขาว */
.patient-item.active .patient-symptom-text {
    background: #dbeafe;
    border-left-color: #2563eb;
    color: #1e3a8a;
}
.patient-item.active .patient-symptom-text i,
.patient-item.active .patient-symptom-text .symptom-ico {
    color: #1e40af;
}
.patient-item.active .patient-symptom-empty {
    color: #64748b;
    font-style: italic;
}

/* ============================================================ */

.btn-end-chat {
    background-color: #ff4757;
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    transition: 0.3s;
    font-size: 0.85rem;
}
.btn-end-chat:hover {
    background-color: #ff6b81;
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(255, 71, 87, 0.3);
}
.btn-print-bill {
    background-color: #2f3542;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
}
.btn-print-bill:hover { background-color: #57606f; }
.status-dot { height: 10px; width: 10px; border-radius: 50%; display: inline-block; margin-right: 5px; }
.status-dot.online { background-color: #2ed573; }
.status-dot.offline { background-color: #cbd5e1; }

.close-preview-btn-top {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    color: white;
    font-size: 45px;
    font-weight: 200;
    cursor: pointer;
    line-height: 1;
    z-index: 10002;
    transition: transform 0.2s, color 0.2s;
    padding: 10px;
}
.close-preview-btn-top:hover { color: #ccc; transform: scale(1.1); }
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
.preview-container { max-width: 80%; max-height: 80%; display: flex; justify-content: center; align-items: center; }
.full-preview-image { max-width: 100%; max-height: 90vh; object-fit: contain; box-shadow: 0 0 20px rgba(0, 0, 0, 0.3); }

.empty-state-container { display: flex; align-items: center; justify-content: center; height: 100%; padding: 40px; }
.empty-state-content { text-align: center; max-width: 400px; animation: fadeIn 0.6s ease-out; }
.empty-state-icon {
    position: relative; font-size: 60px; margin-bottom: 24px; display: inline-flex; align-items: center; justify-content: center; width: 120px; height: 120px; background: white; border-radius: 50%; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
}
.empty-state-icon::after { content: ""; position: absolute; width: 100%; height: 100%; border-radius: 50%; border: 2px solid #3b82f6; animation: pulse 2s infinite; }
.empty-state-title { color: #1e293b; font-size: 1.5rem; font-weight: 700; margin-bottom: 12px; }
.empty-state-description { color: #64748b; font-size: 1rem; line-height: 1.6; margin-bottom: 24px; }
.empty-state-note { background-color: #eff6ff; padding: 12px 20px; border-radius: 12px; border: 1px solid #dbeafe; }
.empty-state-note p { color: #3b82f6; font-size: 0.875rem; margin: 0; }

@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.4); opacity: 0; } }

.end-consult-fab-wrap {
    padding: 12px 16px;
    background: linear-gradient(180deg, rgba(255, 243, 205, 0.95) 0%, #fff8e1 100%);
    border-top: 2px solid #ffc107;
    display: flex;
    justify-content: center;
}
.btn-end-consult {
    width: 100%;
    max-width: 480px;
    padding: 14px 20px;
    background: linear-gradient(135deg, #00469c 0%, #0066cc 100%);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(0, 70, 156, 0.35);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    animation: pulseEndBtn 1.5s ease-in-out infinite;
}
.btn-end-consult:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 70, 156, 0.45);
}
@keyframes pulseEndBtn {
    0%, 100% { box-shadow: 0 6px 20px rgba(0, 70, 156, 0.35); }
    50% { box-shadow: 0 8px 28px rgba(255, 193, 7, 0.6); }
}

/* ===================== Call Overlay (Incoming / Outgoing / Voice) ===================== */
.call-card.incoming,
.call-card.outgoing {
    background: linear-gradient(160deg, #ffffff 0%, #f0f7ff 100%);
    padding: 32px 28px;
    border-radius: 24px;
    min-width: 340px;
    max-width: 95vw;
    box-shadow: 0 30px 80px rgba(0, 70, 156, 0.25);
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
    background: #00469c;
    color: #fff;
    font-size: 0.78rem;
    font-weight: 700;
    border-radius: 20px;
    margin-bottom: 14px;
    letter-spacing: 0.3px;
}
.avatar-ring img.caller-img {
    object-fit: cover;
    aspect-ratio: 1 / 1;
}
.caller-name {
    color: #00469c;
    font-size: 1.45rem;
    font-weight: 800;
    margin: 10px 0 4px;
    word-break: break-word;
}
.caller-sub {
    color: #64748b;
    font-size: 0.95rem;
    margin: 0 0 18px;
}
.call-btns {
    display: flex;
    gap: 14px;
    justify-content: center;
    margin-top: 8px;
}
.call-btns button {
    border: none;
    padding: 12px 22px;
    border-radius: 30px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    font-size: 0.95rem;
    color: #fff;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}
.btn-decline { background: #ef4444; }
.btn-accept  { background: #10b981; }
.call-btns button:hover { transform: translateY(-2px); }
.btn-decline-full {
    width: 100%;
    margin-top: 10px;
    background: #ef4444;
    color: #fff;
    border: none;
    padding: 12px 22px;
    border-radius: 30px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

/* ----- Voice Call (เต็มจอ, ไม่มีวิดีโอ) ----- */
.voice-call-overlay {
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at center, #0a2e5c 0%, #051b3a 100%);
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
.avatar-ring.big {
    width: 180px;
    height: 180px;
    margin: 0 auto 18px;
    position: relative;
}
.avatar-ring.big img.caller-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    border: 4px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 12px 40px rgba(0, 70, 156, 0.5);
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
    color: #94d3ff;
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

/* ===== ปุ่มจบบทสนทนาใน header ===== */
.btn-end-consult-header {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%);
    color: #fff;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35);
    transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.15s ease;
    white-space: nowrap;
}
.btn-end-consult-header:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(239, 68, 68, 0.5);
    filter: brightness(1.05);
}
.btn-end-consult-header:active {
    transform: translateY(0);
}
.btn-end-consult-header i { font-size: 0.95rem; }
@media (max-width: 640px) {
    .btn-end-consult-header .btn-label { display: none; }
}

/* ===== Timer (โหมดปกติ + โหมดติดตามอาการ) ===== */
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
.consult-timer .timer-label-mini {
    font-size: 0.78rem;
    font-weight: 700;
}
/* แถบแจ้งสิ้นสุดการติดตาม + ล็อกช่องพิมพ์ */
.tracking-ended-notice {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    background: linear-gradient(90deg, #f1f5f9 0%, #f8fafc 100%);
    border-top: 1px solid #e2e8f0;
    color: #475569;
    font-size: 0.85rem;
    font-weight: 600;
}
.tracking-ended-notice i { color: #64748b; font-size: 1rem; }
.chat-input-area.input-disabled {
    opacity: 0.6;
    pointer-events: none;
    filter: grayscale(0.3);
}
@media (max-width: 1024px) {
    .consult-timer .timer-label-mini { display: none; }
}

/* ===== เส้นแบ่ง: ปรึกษา ←→ ติดตามอาการ ===== */
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

/* ===== Modal: จบบทสนทนา (Confirm + Result) ===== */
.end-consult-modal-overlay {
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
.end-consult-modal {
    background: #fff;
    width: 100%;
    max-width: 520px;
    border-radius: 20px;
    padding: 32px 28px 24px;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
    position: relative;
    text-align: center;
    animation: ecPop 0.25s ease-out;
}
@keyframes ecPop {
    0% { transform: translateY(20px) scale(0.95); opacity: 0; }
    100% { transform: translateY(0) scale(1); opacity: 1; }
}
.ec-close {
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
.ec-close:hover:not(:disabled) { color: #334155; }
.ec-close:disabled { opacity: 0.4; cursor: not-allowed; }

.ec-icon-wrap {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    margin: 0 auto 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.9rem;
}
.ec-icon-wrap.warn {
    background: #fff7ed;
    color: #ea580c;
    box-shadow: 0 0 0 8px rgba(234, 88, 12, 0.08);
}
.ec-icon-wrap.success {
    background: #ecfdf5;
    color: #059669;
    box-shadow: 0 0 0 8px rgba(5, 150, 105, 0.08);
}

.ec-title {
    color: #0f172a;
    font-size: 1.35rem;
    font-weight: 800;
    margin: 4px 0 8px;
}
.ec-title.success { color: #047857; }
.ec-desc {
    color: #475569;
    font-size: 0.95rem;
    margin: 0 0 18px;
    line-height: 1.55;
}

.ec-list {
    text-align: left;
    list-style: none;
    padding: 14px 18px;
    margin: 0 0 22px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    font-size: 0.9rem;
    color: #334155;
}
.ec-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 5px 0;
}
.ec-list li i {
    color: #10b981;
    margin-top: 4px;
    font-size: 0.85rem;
}

.ec-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
}
.ec-actions-result {
    flex-wrap: wrap;
    justify-content: center;
}
.ec-close-hint {
    margin: 14px 0 0;
    font-size: 0.8rem;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
    line-height: 1.5;
}
.ec-close-hint i { color: #2563eb; }
.ec-close-hint b { color: #334155; }
.ec-btn {
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
.ec-btn:disabled { opacity: 0.65; cursor: not-allowed; }
.ec-cancel {
    background: #f1f5f9;
    color: #475569;
}
.ec-cancel:hover:not(:disabled) { background: #e2e8f0; }
.ec-secondary {
    background: #e2e8f0;
    color: #334155;
}
.ec-secondary:hover { background: #cbd5e1; }
.ec-confirm {
    background: linear-gradient(135deg, #00469c 0%, #0066cc 100%);
    color: #fff;
    box-shadow: 0 6px 16px rgba(0, 70, 156, 0.3);
}
.ec-confirm:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(0, 70, 156, 0.4);
}

/* บล็อกแสดงรหัสบริการ */
.ec-code-card {
    background: linear-gradient(135deg, #f0f9ff 0%, #ecfdf5 100%);
    border: 1.5px dashed #10b981;
    border-radius: 14px;
    padding: 18px 18px 14px;
    margin: 6px 0 22px;
}
.ec-code-label {
    font-size: 0.78rem;
    color: #047857;
    font-weight: 700;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin-bottom: 8px;
}
.ec-code-value {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
}
.ec-code-text {
    font-family: 'Courier New', monospace;
    font-size: 1.9rem;
    font-weight: 800;
    color: #064e3b;
    letter-spacing: 2px;
    background: #fff;
    padding: 6px 18px;
    border-radius: 10px;
    border: 1px solid #d1fae5;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.04);
}
.ec-copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    background: #0ea5e9;
    color: #fff;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.85rem;
    transition: filter 0.15s, transform 0.15s;
}
.ec-copy-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
.ec-copy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ec-copy-feedback {
    margin-top: 10px;
    color: #047857;
    font-size: 0.85rem;
    font-weight: 700;
}
.ec-code-hint {
    margin-top: 14px;
    background: rgba(255, 255, 255, 0.65);
    border-radius: 10px;
    padding: 10px 12px;
    text-align: left;
    font-size: 0.82rem;
    line-height: 1.55;
    color: #1e3a8a;
    display: flex;
    gap: 8px;
    align-items: flex-start;
}
.ec-code-hint i {
    color: #2563eb;
    margin-top: 3px;
    font-size: 0.85rem;
}
.ec-admin-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 9px 14px;
    background: #1e3a8a;
    color: #fff;
    text-decoration: none;
    border-radius: 10px;
    font-weight: 700;
    font-size: 0.85rem;
    transition: filter 0.15s, transform 0.15s;
}
.ec-admin-link:hover {
    filter: brightness(1.1);
    transform: translateY(-1px);
}

/* ===== 📋 การ์ดใบสั่งยา ===== */
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