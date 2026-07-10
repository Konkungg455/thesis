<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useRoute } from 'vue-router'

definePageMeta({
    middleware: 'pharmacist-only'
})

const { apiUrl, imagesAccount } = useApiBase()
const route = useRoute()

const patientAvatarUrl = (item) => {
    const file = (item?.patient_image || '').trim()
    if (!file) return imagesAccount('default.png')
    return imagesAccount(file)
}

const displayPatientName = (item) =>
    String(item?.patient_full_name || item?.patient_name || '').trim() || '-'

// จัดที่อยู่ให้คำสุดท้าย (เลขไปรษณีย์) ไม่ตกบรรทัดเดี่ยว — ผูกกับคำก่อนหน้าด้วย non-breaking space
const formatAddress = (addr) => {
    const text = (addr || '').trim()
    if (!text) return ''
    return text.replace(/\s+(\S+)\s*$/, '\u00A0$1')
}
const onAvatarError = (e) => {
    e.target.src = imagesAccount('default.png')
}

const historyData = ref([])
const isLoading = ref(false)
const isAuthorized = ref(false)
const sidebarOpen = ref(false)
const showCompleted = ref(false)         // เปิดหน้ามาแสดง "กำลังติดตาม" ก่อน
let timerInterval = null

const toggleSidebar = () => { sidebarOpen.value = !sidebarOpen.value }
const closeSidebar = () => { sidebarOpen.value = false }

// ปิดเมนูทุกครั้งที่เปลี่ยนเส้นทาง
watch(() => route.fullPath, closeSidebar)

const checkAuth = () => {
    if (!import.meta.client) return false;
    try {
        const role = localStorage.getItem('user_role');
        const raw = localStorage.getItem('user_data');
        const user = raw ? JSON.parse(raw) : null;
        return role === 'pharmacist' || user?.role === 'pharmacist' || Number(user?.id_pharma) > 0;
    } catch {
        return false;
    }
}

const isTrackableItem = (item) => {
    const status = String(item?.tracking_status || 'active');
    const hasMeds = String(item?.med_details || '').trim() !== '';
    const autoCreated = Number(item?.auto_created || 0) === 1;
    if (status === 'active' && (hasMeds || autoCreated)) return true;
    if (status === 'completed' && hasMeds && !autoCreated) return true;
    return false;
};

/** คนไข้คนเดียวกันในรายการ active แสดงแค่รายการล่าสุด */
const dedupeTrackingItems = (items) => {
    const completed = [];
    const activeByPatient = new Map();

    for (const item of items) {
        if (item.tracking_status === 'completed') {
            completed.push(item);
            continue;
        }
        const accountId = Number(item.id_account) || 0;
        const key = accountId > 0
            ? `acc:${accountId}`
            : `name:${String(item.patient_name || '').trim().toLowerCase()}`;
        const prev = activeByPatient.get(key);
        if (!prev || Number(item.id) > Number(prev.id)) {
            activeByPatient.set(key, item);
        }
    }

    return [...completed, ...activeByPatient.values()];
};

const fetchPrescriptionHistory = async () => {
    if (!isAuthorized.value) return;
    isLoading.value = true
    try {
        const res = await $fetch(apiUrl('get-prescriptions.php'), { credentials: 'include' });
        if (res.status === 'success') {
            const trackable = dedupeTrackingItems((res.data || []).filter(isTrackableItem));
            historyData.value = trackable.map(item => ({
                ...item,
                remainingTime: calculateRemaining(item.created_at, item.last_followup_at)
            }));
        } else {
            historyData.value = [];
        }
    } catch (err) {
        console.error("Fetch error:", err);
        historyData.value = [];
    } finally {
        isLoading.value = false;
    }
}

const trackingStatusLabel = (item) => {
    const hasRx = String(item?.med_details || '').trim() !== '' && Number(item?.auto_created || 0) !== 1;
    if (item?.tracking_status === 'completed' && hasRx) {
        return 'ติดตามอาการเสร็จ · เขียนใบสรุปรายการยาแล้ว';
    }
    if (item?.tracking_status === 'completed') {
        return 'เสร็จสิ้นแล้ว';
    }
    return calculateRemaining(item.created_at, item.last_followup_at);
};

// ฟังก์ชันคำนวณเวลาที่เหลือ (3 วัน)
//   - ใช้ last_followup_at เป็นจุดเริ่ม ถ้ามี (รีเซ็ตเมื่อเภสัชกดกลับไปตอบในแชท)
//   - ไม่งั้นใช้ created_at เดิม
const calculateRemaining = (createdAt, lastFollowupAt = null) => {
    const baseTime = lastFollowupAt
        ? new Date(lastFollowupAt).getTime()
        : new Date(createdAt).getTime();
    const now = new Date().getTime();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
    const deadline = baseTime + threeDaysInMs;
    const diff = deadline - now;

    if (diff <= 0) return "ติดตามเสร็จสิ้น";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `เหลือเวลาติดตาม: ${days}\u00A0วัน ${hours}\u00A0ชั่วโมง ${mins}\u00A0นาที`;
}

onMounted(() => {
    isAuthorized.value = checkAuth();
    if (!isAuthorized.value) return;
    fetchPrescriptionHistory();
    timerInterval = setInterval(() => {
        historyData.value = historyData.value.map(item => ({
            ...item,
            remainingTime: calculateRemaining(item.created_at, item.last_followup_at)
        }));
    }, 60000);
})

onUnmounted(() => {
    if (timerInterval) clearInterval(timerInterval);
})

// ตัวแสดงผล toast เล็ก ๆ ภายในหน้า tracking — แจ้งสถานะการ ping คนไข้
const followupToast = ref({ show: false, text: '', type: 'success' })
let followupToastTimer = null
const showFollowupToast = (text, type = 'success') => {
    followupToast.value = { show: true, text, type }
    if (followupToastTimer) clearTimeout(followupToastTimer)
    followupToastTimer = setTimeout(() => { followupToast.value.show = false }, 2600)
}

/** เปิดแชทรอบ SRV ที่ระบุ (consult_id + srv) — หลักการเดียวกับฝั่งผู้ใช้ */
const openPharmaChatForRound = (patientId, patientName = '', session = null) => {
    const accountId = Number(patientId) || 0
    if (!accountId) {
        navigateTo('/pharmacy_web')
        return
    }
    const params = new URLSearchParams({ id: String(accountId) })
    const cid = Number(session?.consult_id) || 0
    if (cid > 0) params.set('consult_id', String(cid))
    const srv = String(session?.service_code || '').trim()
    if (srv) params.set('srv', srv)

    if (import.meta.client) {
        try {
            localStorage.setItem('bell-incoming-patient-id', String(accountId))
            if (patientName) localStorage.setItem('bell-incoming-patient-name', patientName)
        } catch { /* ignore */ }
    }
    navigateTo(`/pharmacy_web?${params.toString()}`)
}

/** เปิดแชทรอบ SRV ของเคสนี้โดยตรง
 *  - ไม่ยิง notify_followup → ไม่รีเซ็ตเวลาติดตาม 3 วัน (last_followup_at ไม่ถูกแตะ)
 *  - แนบ consult_id + service_code (SRV) ของ "รอบนั้น ๆ" → เปิดแชทตรงรอบ ไม่ใช่รอบล่าสุด
 */
const viewChat = (item) => {
    const accountId = Number(item?.id_account || item?.id) || 0
    if (!accountId) {
        navigateTo('/pharmacy_web')
        return
    }
    const session = {
        consult_id: item?.id_consult_request,
        service_code: item?.service_code
    }
    openPharmaChatForRound(accountId, displayPatientName(item), session)
}

const viewPDF = (id) => {
    window.open(`/prescription-view?id=${id}`, '_blank');
}

// ✍️ ไปหน้าเขียนใบสรุปรายการยา (Summary) สำหรับเคสที่จบบทสนทนาแล้วแต่ยังไม่ได้ออกใบสรุปรายการยา
const writePrescription = (item) => {
    const accountId = Number(item.id_account || item.id) || 0
    if (!accountId) return
    navigateTo(`/Summary?id=${accountId}`)
}

const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('th-TH');
}

// format เบอร์เป็น 0XX-XXX-XXXX สำหรับโชว์
const formatPhone = (raw) => {
    if (!raw) return '';
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) {
        return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (digits.length === 9) {
        return `${digits.slice(0,2)}-${digits.slice(2,5)}-${digits.slice(5)}`;
    }
    return raw;
}

const callPhone = (phone) => {
    if (!phone) return;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return;
    window.location.href = `tel:${digits}`;
}

const copyPhone = async (phone) => {
    if (!phone) return;
    try {
        await navigator.clipboard.writeText(String(phone).replace(/\D/g, ''));
        alert('คัดลอกเบอร์เรียบร้อยแล้ว');
    } catch {
        alert('ไม่สามารถคัดลอกเบอร์ได้');
    }
}

/* ======================== กดเสร็จสิ้น / เปิดติดตามอีกครั้ง ========================
 * - "เสร็จสิ้น" = สรุปเคสนี้จบ ไม่ต้องติดตามอาการต่อ → set tracking_status='completed'
 * - "เปิดติดตามอีกครั้ง" = พลิกกลับเป็น active (undo)
 * ============================================================================ */
const showCompleteConfirm = ref(false)
const completingItem = ref(null)
const isSavingComplete = ref(false)

const askCompleteTracking = (item) => {
    completingItem.value = item
    showCompleteConfirm.value = true
}

const closeCompleteConfirm = () => {
    if (isSavingComplete.value) return
    showCompleteConfirm.value = false
    completingItem.value = null
}

const confirmCompleteTracking = async () => {
    const item = completingItem.value
    if (!item) return
    isSavingComplete.value = true
    try {
        const body = new FormData()
        body.append('id', String(item.id))
        const res = await $fetch(apiUrl('complete-tracking.php'), {
            method: 'POST',
            body,
            credentials: 'include'
        })
        if (res?.status === 'success') {
            const idx = historyData.value.findIndex(x => Number(x.id) === Number(item.id))
            if (idx >= 0) {
                historyData.value[idx] = {
                    ...historyData.value[idx],
                    tracking_status: 'completed',
                    tracking_completed_at: res.completed_at
                }
            }
            showFollowupToast(`บันทึกเสร็จสิ้นการติดตามคนไข้ ${displayPatientName(item)} แล้ว`, 'success')
        } else {
            showFollowupToast(res?.message || 'บันทึกไม่สำเร็จ', 'warn')
        }
    } catch (err) {
        console.error('complete-tracking error', err)
        showFollowupToast('เครือข่ายมีปัญหา ลองใหม่อีกครั้ง', 'warn')
    } finally {
        isSavingComplete.value = false
        showCompleteConfirm.value = false
        completingItem.value = null
    }
}

const reopenTracking = async (item) => {
    if (!item) return
    try {
        const body = new FormData()
        body.append('id', String(item.id))
        body.append('action', 'reopen')
        const res = await $fetch(apiUrl('complete-tracking.php?action=reopen'), {
            method: 'POST',
            body,
            credentials: 'include'
        })
        if (res?.status === 'success') {
            const idx = historyData.value.findIndex(x => Number(x.id) === Number(item.id))
            if (idx >= 0) {
                historyData.value[idx] = {
                    ...historyData.value[idx],
                    tracking_status: 'active',
                    tracking_completed_at: null,
                    remainingTime: calculateRemaining(historyData.value[idx].created_at)
                }
            }
            showFollowupToast('เปิดติดตามอีกครั้งแล้ว', 'success')
        } else {
            showFollowupToast(res?.message || 'เปิดติดตามไม่สำเร็จ', 'warn')
        }
    } catch (err) {
        console.error('reopen tracking error', err)
        showFollowupToast('เครือข่ายมีปัญหา ลองใหม่อีกครั้ง', 'warn')
    }
}

// Filter list ตามสถานะ
const filteredHistoryData = computed(() => {
    if (showCompleted.value) return historyData.value
    return historyData.value.filter(item => item.tracking_status !== 'completed')
})

const counts = computed(() => {
    let active = 0, completed = 0
    historyData.value.forEach(item => {
        if (item.tracking_status === 'completed') completed++
        else active++
    })
    return { active, completed, total: historyData.value.length }
})

/* ======================== Archive Viewer ========================
 * ข้อความเก่าหลัง "จบการสนทนา" จะถูกย้ายไป chat_messages_archive
 * เก็บไว้ 365 วัน ตามประกาศสภาเภสัชกรรม → กดดูได้ที่นี่
 * ============================================================== */
const showArchiveModal = ref(false);
const archiveLoading = ref(false);
const archiveErrorMsg = ref('');
const archivePatient = ref({ id: 0, name: '' });
const archiveSessions = ref([]);          // รายการครั้งที่สนทนา
const archiveMessages = ref([]);          // ข้อความใน session ที่เลือก
const selectedArchiveSession = ref(null); // session ปัจจุบัน
const archiveMeta = ref({ retentionDays: 365, archivedAt: '', expiresAt: '' });
const archiveDeletingKey = ref('');

// กัน response เก่าทับใหม่ (เปลี่ยนคนไข้ / เปลี่ยนครั้งที่ปรึกษาเร็ว ๆ)
let archiveFetchGen = 0;

const archiveSessionKey = (s) => {
    if (!s) return '';
    return `${s.consult_id || 0}|${s.service_code || ''}|${s.archived_at || ''}`;
};

const isSameArchiveSession = (a, b) => archiveSessionKey(a) === archiveSessionKey(b);

const buildArchiveMessagesUrl = (session) => {
    const params = new URLSearchParams({ action: 'get_chat_archive', t: String(Date.now()) });
    const cid = Number(session?.consult_id) || 0;
    const srv = String(session?.service_code || '').trim();
    if (cid > 0) {
        params.set('consult_id', String(cid));
        if (srv) params.set('service_code', srv);
    } else if (srv) {
        params.set('peer_id', String(archivePatient.value.id || ''));
        params.set('service_code', srv);
    } else {
        params.set('peer_id', String(archivePatient.value.id || ''));
        if (session?.archived_at) params.set('archived_at', session.archived_at);
    }
    return `consult-handler.php?${params.toString()}`;
};

/** หา session ในรายการที่ตรงกับเคส tracking (SRV / consult_id) */
const findMatchingArchiveSession = (sessions, item) => {
    if (!item || !sessions?.length) return null;
    const srv = String(item.service_code || '').trim().toUpperCase();
    if (srv) {
        const bySrv = sessions.find(
            (s) => String(s.service_code || '').trim().toUpperCase() === srv
        );
        if (bySrv) return bySrv;
    }
    const cid = Number(item.id_consult_request) || 0;
    if (cid > 0) {
        const byCid = sessions.find((s) => Number(s.consult_id) === cid);
        if (byCid) return byCid;
    }
    return null;
};

/** กด「ประวัติแชท」→ เปิดป๊อปอัพประวัติบทสนทนา (modal) */
const openHistoryChat = async (item) => {
    const pid = Number(item?.id_account || item?.id) || 0;
    const name = displayPatientName(item);
    await openArchiveModal(pid, name, item);
};

const openArchiveModal = async (patientId, patientName = '', preferItem = null) => {
    const id = Number(patientId) || patientId;
    if (!id) return;
    const myGen = ++archiveFetchGen;

    archivePatient.value = { id, name: patientName || `ผู้ป่วย #${id}` };
    showArchiveModal.value = true;
    archiveErrorMsg.value = '';
    archiveSessions.value = [];
    archiveMessages.value = [];
    selectedArchiveSession.value = null;
    archiveLoading.value = true;

    try {
        const res = await $fetch(
            apiUrl(`consult-handler.php?action=list_consult_archives&patient_id=${id}&t=${Date.now()}`),
            { credentials: 'include' }
        );
        if (myGen !== archiveFetchGen) return;

        if (res?.status === 'success') {
            archiveSessions.value = res.data || [];
            archiveMeta.value.retentionDays = res.retention_days || 365;
            if (archiveSessions.value.length > 0) {
                const preferred = findMatchingArchiveSession(archiveSessions.value, preferItem);
                await selectArchiveSession(preferred || archiveSessions.value[0], myGen);
            }
        } else {
            archiveErrorMsg.value = res?.message || 'ดึงประวัติไม่สำเร็จ';
        }
    } catch (err) {
        if (myGen !== archiveFetchGen) return;
        console.error('list_consult_archives error', err);
        archiveErrorMsg.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    } finally {
        if (myGen === archiveFetchGen) {
            archiveLoading.value = false;
        }
    }
};

const selectArchiveSession = async (session, parentGen = null) => {
    if (!session) return;
    const myGen = parentGen ?? ++archiveFetchGen;
    if (parentGen === null) {
        archiveFetchGen = myGen;
    }

    selectedArchiveSession.value = { ...session };
    archiveMessages.value = [];
    archiveLoading.value = true;
    archiveErrorMsg.value = '';

    try {
        const res = await $fetch(apiUrl(buildArchiveMessagesUrl(session)), { credentials: 'include' });
        if (myGen !== archiveFetchGen) return;

        if (res?.status === 'success') {
            archiveMessages.value = res.data || [];
            archiveMeta.value.archivedAt = res.archived_at || '';
            archiveMeta.value.expiresAt = res.expires_at || '';
        } else {
            archiveErrorMsg.value = res?.message || 'ดึงข้อความไม่สำเร็จ';
        }
    } catch (err) {
        if (myGen !== archiveFetchGen) return;
        console.error('get_chat_archive error', err);
        archiveErrorMsg.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    } finally {
        if (myGen === archiveFetchGen) {
            archiveLoading.value = false;
        }
    }
};

const closeArchiveModal = () => {
    archiveFetchGen += 1;
    showArchiveModal.value = false;
    archiveSessions.value = [];
    archiveMessages.value = [];
    selectedArchiveSession.value = null;
    archiveErrorMsg.value = '';
    archiveDeletingKey.value = '';
};

/** ลบการ์ดประวัติบทสนทนา (1 รอบ consult) ออกจากรายการของเภสัช */
const deleteArchiveSession = async (session, ev) => {
    ev?.stopPropagation?.();
    if (!session) return;
    const cid = Number(session.consult_id) || 0;
    const peer = Number(archivePatient.value.id) || 0;
    if (cid <= 0 && peer <= 0) return;
    const label = session.service_code || `#${cid || '-'}`;
    if (!confirm(`ลบประวัติการปรึกษา "${label}" ออกจากรายการของคุณหรือไม่?\nข้อมูลจริงยังถูก freeze เก็บไว้ในฐานข้อมูล`)) return;

    const key = `${cid}-${peer}`;
    archiveDeletingKey.value = key;
    try {
        const fd = new FormData();
        if (cid > 0) fd.append('consult_id', String(cid));
        else fd.append('peer_id', String(peer));
        const res = await $fetch(apiUrl('consult-handler.php?action=delete_consult_archive'), {
            method: 'POST',
            body: fd,
            credentials: 'include',
        });
        if (res?.status === 'success') {
            archiveSessions.value = archiveSessions.value.filter((s) => !isSameArchiveSession(s, session));
            if (isSameArchiveSession(selectedArchiveSession.value, session)) {
                selectedArchiveSession.value = null;
                archiveMessages.value = [];
                archiveMeta.value.archivedAt = '';
                archiveMeta.value.expiresAt = '';
                if (archiveSessions.value.length > 0) {
                    await selectArchiveSession(archiveSessions.value[0]);
                }
            }
            showFollowupToast('ลบออกจากรายการแล้ว', 'success');
        } else {
            showFollowupToast(res?.message || 'ลบไม่สำเร็จ', 'warn');
        }
    } catch (err) {
        console.error('delete_consult_archive error', err);
        showFollowupToast('ลบไม่สำเร็จ กรุณาลองใหม่', 'warn');
    } finally {
        archiveDeletingKey.value = '';
    }
};

// ===== ปุ่ม "กลับไปตอบในแชท" จาก modal — เปิดแชทรอบ SRV ที่เลือก (เหมือนผู้ใช้กดปรึกษาอีกครั้ง) =====
const goReplyChat = () => {
    if (!archivePatient.value.id) return;
    const session = selectedArchiveSession.value;
    if (!session?.consult_id && !session?.service_code) {
        showFollowupToast('กรุณาเลือกครั้งที่ปรึกษา (SRV) ทางซ้ายก่อน', 'warn');
        return;
    }
    openPharmaChatForRound(
        archivePatient.value.id,
        archivePatient.value.name,
        session
    );
    closeArchiveModal();
};

const formatChatTime = (t) => {
    if (!t) return '';
    try {
        return new Date(t).toLocaleString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return t;
    }
};

const formatShortDate = (t) => {
    if (!t) return '';
    try {
        return new Date(t).toLocaleDateString('th-TH', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    } catch {
        return t;
    }
};

// แปลงเวลาคงเหลือก่อนลบ archive อัตโนมัติ → "เหลือเวลาติดตาม: X วัน Y ชม. Z นาที"
const formatArchiveExpiry = (expiresAt) => {
    if (!expiresAt) return '';
    const expireMs = new Date(expiresAt).getTime();
    const diff = expireMs - Date.now();
    if (diff <= 0) return 'หมดอายุการเก็บแล้ว';
    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `เหลือเวลาติดตาม: ${days}\u00A0วัน ${hours}\u00A0ชั่วโมง ${mins}\u00A0นาที`;
};
</script>

<template>
    <div class="admin-layout">
        <Pharmacy_header />

        <!-- Topbar (มือถือ): หัวข้อหน้า (ตัดปุ่ม hamburger ออกตามที่ร้องขอ) -->
        <div class="mobile-topbar mobile-topbar--no-menu">
            <div class="mobile-title">📋 ติดตามคนไข้</div>
        </div>

        <!-- Backdrop -->
        <transition name="fade-bd">
            <div v-if="sidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
        </transition>

        <div class="main-content">
            <aside class="sidebar" :class="{ open: sidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-clipboard-list"></i>
                    <span>ติดตามอาการคนไข้ (3 วัน)</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <NuxtLink to="/tracking" class="menu-item active" @click="closeSidebar">
                    <i class="fa-solid fa-clipboard-list"></i> ติดตามอาการคนไข้ (3 วัน)
                </NuxtLink>
            </aside>

            <section class="history-section">
                <div class="header-bar">
                    <h2><i class="fa-solid fa-clipboard-list"></i> รายการติดตามอาการคนไข้ (3 วัน)</h2>
                    <p class="header-sub">แตะปุ่ม "เปิดแชท" เพื่อกลับไปคุยกับคนไข้ได้ทันที <span class="nowrap">หรือกด "เสร็จสิ้น" หากไม่ต้องติดตามต่อ</span></p>

                    <!-- Filter toggle -->
                    <div class="status-filter-bar">
                        <button
                            type="button"
                            class="filter-chip"
                            :class="{ active: !showCompleted }"
                            @click="showCompleted = false"
                        >
                            <i class="fa-solid fa-circle-play"></i>
                            กำลังติดตาม
                            <span class="count">{{ counts.active }}</span>
                        </button>
                        <button
                            type="button"
                            class="filter-chip"
                            :class="{ active: showCompleted }"
                            @click="showCompleted = true"
                        >
                            <i class="fa-solid fa-list-check"></i>
                            แสดงทั้งหมด
                            <span class="count">{{ counts.total }}</span>
                        </button>
                        <span class="completed-badge-count" v-if="counts.completed > 0">
                            <i class="fa-solid fa-circle-check"></i>
                            เสร็จสิ้นแล้ว {{ counts.completed }} เคส
                        </span>
                    </div>
                </div>

                <div class="table-container shadow-card">
                    <div v-if="isLoading" class="loading-state">
                        <div class="spinner"></div>
                        <p>กำลังโหลดข้อมูล...</p>
                    </div>

                    <!-- Desktop Table -->
                    <table v-else-if="filteredHistoryData.length > 0" class="history-table">
                        <thead>
                            <tr>
                                <th>ผู้ใช้บริการ</th>
                                <th>รายการยา / หมายเหตุ</th>
                                <th>อาการป่วย</th>
                                <th>วันที่บันทึก</th>
                                <th>สถานะการติดตาม</th>
                                <th class="text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="item in filteredHistoryData"
                                :key="item.id"
                                :class="{ 'row-completed': item.tracking_status === 'completed' }"
                            >
                                <td>
                                    <div class="patient-cell">
                                        <img class="avatar avatar-img"
                                             :src="patientAvatarUrl(item)"
                                             :alt="displayPatientName(item)"
                                             @error="onAvatarError" />
                                        <div class="patient-cell__body">
                                            <div class="patient-line patient-line--name">
                                                <span class="patient-name-strong">{{ displayPatientName(item) }}</span>
                                            </div>
                                            <div v-if="item.patient_phone" class="patient-line patient-line--phone">
                                                <i class="fa-solid fa-phone"></i>
                                                <a :href="`tel:${item.patient_phone}`"
                                                   class="patient-phone-link"
                                                   @click.stop>{{ formatPhone(item.patient_phone) }}</a>
                                            </div>
                                            <div v-if="item.patient_address" class="patient-line patient-line--address">
                                                <i class="fa-solid fa-location-dot"></i>
                                                <span>{{ formatAddress(item.patient_address) }}</span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div class="symptom-text">{{ item.med_details || '-' }}</div>
                                </td>
                                <td>
                                    <span class="symptom-text">{{ item.symptom_name || '-' }}</span>
                                </td>
                                <td>{{ formatDate(item.created_at) }}</td>
                                <td>
                                    <span
                                        v-if="item.tracking_status === 'completed'"
                                        class="status-badge done complete-mark"
                                        :title="`ปิดเคสเมื่อ ${formatDate(item.tracking_completed_at)}`"
                                    >
                                        <i class="fa-solid fa-circle-check"></i> {{ trackingStatusLabel(item) }}
                                    </span>
                                    <span
                                        v-else
                                        :class="['status-badge', item.remainingTime === 'ติดตามเสร็จสิ้น' ? 'done' : 'waiting']"
                                    >
                                        {{ trackingStatusLabel(item) }}
                                    </span>
                                </td>
                                <td class="text-center">
                                    <div class="btn-group">
                                        <button @click="viewChat(item)" class="btn-chat">
                                            💬 เปิดแชท
                                        </button>
                                        <button
                                            @click="openHistoryChat(item)"
                                            class="btn-archive"
                                            title="ดูประวัติบทสนทนา (ป๊อปอัพ) เก็บ 365 วัน"
                                        >
                                            📜 ประวัติแชท
                                        </button>
                                        <button
                                            v-if="Number(item.auto_created) === 1"
                                            @click="writePrescription(item)"
                                            class="btn-write-rx"
                                            title="ยังไม่ได้ออกใบสรุปรายการยา — กดเพื่อเขียนใบสรุปรายการยา"
                                        >
                                            📝 เขียนใบสรุปรายการยา
                                        </button>
                                        <button v-else @click="viewPDF(item.id)" class="btn-pdf">
                                            📄 ดูใบสรุปรายการยา
                                        </button>
                                        <button
                                            v-if="item.tracking_status !== 'completed'"
                                            @click="askCompleteTracking(item)"
                                            class="btn-complete"
                                            title="ปิดเคสนี้ (ไม่ต้องติดตามอาการต่อ)"
                                        >
                                            <i class="fa-solid fa-circle-check"></i> เสร็จสิ้น
                                        </button>
                                        <button
                                            v-else
                                            @click="reopenTracking(item)"
                                            class="btn-reopen"
                                            title="กลับมาติดตามอีกครั้ง"
                                        >
                                            <i class="fa-solid fa-rotate-left"></i> เปิดติดตาม
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Mobile Card View -->
                    <div v-if="!isLoading && filteredHistoryData.length > 0" class="card-list">
                        <div
                            v-for="item in filteredHistoryData"
                            :key="'c-'+item.id"
                            class="patient-card"
                            :class="{ 'card-completed': item.tracking_status === 'completed' }"
                        >
                            <div class="card-row top">
                                <div class="card-top-left">
                                    <img class="avatar avatar-lg avatar-img"
                                         :src="patientAvatarUrl(item)"
                                         :alt="displayPatientName(item)"
                                         @error="onAvatarError" />
                                    <div class="patient-cell__body">
                                        <div class="patient-line patient-line--name">
                                            <span class="patient-name">{{ displayPatientName(item) }}</span>
                                        </div>
                                        <div v-if="item.patient_phone" class="patient-line patient-line--phone">
                                            <i class="fa-solid fa-phone"></i>
                                            <a :href="`tel:${item.patient_phone}`"
                                               class="patient-phone-link"
                                               @click.stop>{{ formatPhone(item.patient_phone) }}</a>
                                        </div>
                                        <div v-if="item.patient_address" class="patient-line patient-line--address">
                                            <i class="fa-solid fa-location-dot"></i>
                                            <span>{{ formatAddress(item.patient_address) }}</span>
                                        </div>
                                    </div>
                                </div>
                                <span
                                    v-if="item.tracking_status === 'completed'"
                                    class="status-badge done complete-mark"
                                >
                                    <i class="fa-solid fa-circle-check"></i> {{ trackingStatusLabel(item) }}
                                </span>
                                <span
                                    v-else
                                    :class="['status-badge', item.remainingTime === 'ติดตามเสร็จสิ้น' ? 'done' : 'waiting']"
                                >
                                    {{ trackingStatusLabel(item) }}
                                </span>
                            </div>
                            <div class="card-row">
                                <span class="card-label">💊 ยา</span>
                                <span class="card-value">{{ item.med_details || '-' }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label">🤒 อาการ</span>
                                <span class="card-value">{{ item.symptom_name || '-' }}</span>
                            </div>
                            <div class="card-row">
                                <span class="card-label">🕒 บันทึก</span>
                                <span class="card-value">{{ formatDate(item.created_at) }}</span>
                            </div>
                            <div class="card-actions">
                                <button @click="viewChat(item)" class="btn-chat">
                                    💬 เปิดแชท
                                </button>
                                <button
                                    @click="openHistoryChat(item)"
                                    class="btn-archive"
                                    title="ดูประวัติบทสนทนา (ป๊อปอัพ) เก็บ 365 วัน"
                                >
                                    📜 ประวัติแชท
                                </button>
                                <button
                                    v-if="Number(item.auto_created) === 1"
                                    @click="writePrescription(item)"
                                    class="btn-write-rx"
                                >
                                    📝 เขียนใบสรุปรายการยา
                                </button>
                                <button v-else @click="viewPDF(item.id)" class="btn-pdf">
                                    📄 ดูใบสรุปรายการยา
                                </button>
                                <button
                                    v-if="item.tracking_status !== 'completed'"
                                    @click="askCompleteTracking(item)"
                                    class="btn-complete"
                                >
                                    <i class="fa-solid fa-circle-check"></i> เสร็จสิ้น
                                </button>
                                <button
                                    v-else
                                    @click="reopenTracking(item)"
                                    class="btn-reopen"
                                >
                                    <i class="fa-solid fa-rotate-left"></i> เปิดติดตาม
                                </button>
                            </div>
                        </div>
                    </div>

                    <div v-if="!isLoading && filteredHistoryData.length === 0" class="empty-state">
                        <div class="empty-icon">📭</div>
                        <p v-if="!showCompleted && counts.completed > 0">
                            ไม่มีเคสที่ต้องติดตามแล้ว — กดปุ่ม "แสดงทั้งหมด" เพื่อดูเคสที่ปิดไปแล้ว
                        </p>
                        <p v-else>ไม่มีรายการที่ต้องติดตามในขณะนี้</p>
                    </div>
                </div>
            </section>
        </div>

        <!-- 🔔 Toast: ผลการ ping คนไข้ผ่านกระดิ่ง -->
        <transition name="followup-toast">
            <div v-if="followupToast.show"
                 :class="['followup-toast', `followup-toast-${followupToast.type}`]">
                <i :class="followupToast.type === 'success' ? 'fa-solid fa-bell' : 'fa-solid fa-triangle-exclamation'"></i>
                <span>{{ followupToast.text }}</span>
            </div>
        </transition>

        <!-- ✅ Modal: ยืนยันการกดเสร็จสิ้นการติดตาม -->
        <transition name="archive-modal">
            <div v-if="showCompleteConfirm" class="archive-overlay" @click.self="closeCompleteConfirm">
                <div class="confirm-modal">
                    <div class="confirm-icon">
                        <i class="fa-solid fa-circle-check"></i>
                    </div>
                    <h3>ยืนยันการปิดเคสนี้</h3>
                    <p>
                        คุณกำลังจะปิดการติดตามอาการของ<br>
                        <strong>{{ completingItem ? displayPatientName(completingItem) : 'ผู้ป่วยรายนี้' }}</strong>
                    </p>
                    <ul class="confirm-list">
                        <li><i class="fa-solid fa-check"></i> สถานะจะเปลี่ยนเป็น <b>"เสร็จสิ้นแล้ว"</b></li>
                        <li><i class="fa-solid fa-check"></i> ระบบจะไม่นับเป็นเคสที่ต้องติดตามต่อ</li>
                        <li><i class="fa-solid fa-rotate-left"></i> เปลี่ยนใจกลับมาติดตามอีกครั้งได้ภายหลัง</li>
                    </ul>
                    <div class="confirm-actions">
                        <button
                            type="button"
                            class="cm-btn cancel"
                            :disabled="isSavingComplete"
                            @click="closeCompleteConfirm"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="button"
                            class="cm-btn confirm"
                            :disabled="isSavingComplete"
                            @click="confirmCompleteTracking"
                        >
                            <i v-if="isSavingComplete" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-solid fa-circle-check"></i>
                            {{ isSavingComplete ? 'กำลังบันทึก...' : 'ยืนยันเสร็จสิ้น' }}
                        </button>
                    </div>
                </div>
            </div>
        </transition>

        <!-- 📜 Modal: ประวัติบทสนทนาเก่า (เก็บ 365 วัน) -->
        <transition name="archive-modal">
            <div v-if="showArchiveModal" class="archive-overlay" @click.self="closeArchiveModal">
                <div class="archive-modal">
                    <div class="archive-header">
                        <div>
                            <h3>
                                <i class="fa-solid fa-clock-rotate-left"></i>
                                ประวัติบทสนทนา
                            </h3>
                            <p class="archive-sub">
                                คนไข้: <strong>{{ archivePatient.name }}</strong>
                                <span class="retention-note">
                                    <i class="fa-solid fa-shield-halved"></i>
                                    เก็บข้อมูล {{ archiveMeta.retentionDays }} วัน ตามประกาศสภาเภสัชกรรม
                                </span>
                            </p>
                        </div>
                        <div class="archive-header-actions">
                            <button
                                class="btn-reply-chat"
                                @click="goReplyChat"
                                :disabled="!selectedArchiveSession"
                                title="เปิดแชทรอบ SRV ที่เลือกใน /pharmacy_web"
                            >
                                <i class="fa-solid fa-comment-medical"></i>
                                เปิดแชทรอบนี้
                            </button>
                            <button class="archive-close" @click="closeArchiveModal" aria-label="ปิด">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    </div>

                    <div class="archive-body">
                        <!-- รายการ session ทางซ้าย -->
                        <aside class="archive-sessions">
                            <div class="sessions-title">
                                <i class="fa-solid fa-list"></i>
                                ครั้งที่ปรึกษา ({{ archiveSessions.length }})
                            </div>
                            <div v-if="archiveLoading && archiveSessions.length === 0" class="archive-loading-mini">
                                <div class="spinner-mini"></div>
                                <p>กำลังโหลด...</p>
                            </div>
                            <div v-else-if="archiveSessions.length === 0" class="archive-empty-mini">
                                <i class="fa-regular fa-folder-open"></i>
                                <p>ยังไม่มีบทสนทนาที่จบไปแล้วของคนไข้รายนี้</p>
                                <p class="hint">บทสนทนาจะมาแสดงตรงนี้หลังจากกด "จบบทสนทนา" หรือหมดเวลาให้คำปรึกษา</p>
                            </div>
                            <ul v-else class="session-list">
                                <li
                                    v-for="(s, idx) in archiveSessions"
                                    :key="`s-${s.consult_id}-${idx}`"
                                    class="session-item"
                                    :class="{ active: isSameArchiveSession(selectedArchiveSession, s) }"
                                    @click="selectArchiveSession(s)"
                                >
                                    <button
                                        type="button"
                                        class="btn-delete-card"
                                        :disabled="archiveDeletingKey === `${s.consult_id || 0}-${archivePatient.id || 0}`"
                                        @click.stop="deleteArchiveSession(s, $event)"
                                        title="ลบประวัติการปรึกษานี้"
                                    >
                                        <i
                                            :class="archiveDeletingKey === `${s.consult_id || 0}-${archivePatient.id || 0}`
                                                ? 'fa-solid fa-spinner fa-spin'
                                                : 'fa-regular fa-trash-can'"
                                        ></i>
                                    </button>
                                    <div class="session-code">
                                        {{ s.service_code || `#${s.consult_id || '-'}` }}
                                    </div>
                                    <div class="session-date">
                                        {{ formatShortDate(s.last_message_at || s.archived_at) }}
                                    </div>
                                    <div v-if="s.symptom_name" class="session-symptom">
                                        <i class="fa-solid fa-notes-medical"></i> {{ s.symptom_name }}
                                    </div>
                                    <div class="session-meta">
                                        <span><i class="fa-regular fa-comment"></i> {{ s.message_count }} ข้อความ</span>
                                        <span
                                            v-if="s.expires_at"
                                            class="days-left"
                                            :class="{ warn: s.days_left !== null && s.days_left <= 30 }"
                                            :title="`ระบบจะลบอัตโนมัติ ${formatShortDate(s.expires_at)}`"
                                        >
                                            <i class="fa-regular fa-clock"></i>
                                            {{ formatArchiveExpiry(s.expires_at) }}
                                        </span>
                                    </div>
                                </li>
                            </ul>
                        </aside>

                        <!-- ข้อความทางขวา -->
                        <main class="archive-messages">
                            <div v-if="archiveErrorMsg" class="archive-error">
                                <i class="fa-solid fa-triangle-exclamation"></i> {{ archiveErrorMsg }}
                            </div>

                            <div v-if="archiveLoading && archiveMessages.length === 0" class="archive-loading">
                                <div class="spinner"></div>
                                <p>กำลังโหลดข้อความ...</p>
                            </div>

                            <div v-else-if="!selectedArchiveSession" class="archive-empty">
                                <i class="fa-regular fa-comments"></i>
                                <p>เลือก "ครั้งที่ปรึกษา" จากด้านซ้าย เพื่อดูข้อความ</p>
                            </div>

                            <div v-else-if="archiveMessages.length === 0" class="archive-empty">
                                <i class="fa-regular fa-folder-open"></i>
                                <p>ไม่พบข้อความในครั้งนี้</p>
                            </div>

                            <div v-else class="messages-scroll">
                                <div class="messages-meta-banner">
                                    <span>
                                        <i class="fa-solid fa-box-archive"></i>
                                        จบการสนทนาเมื่อ
                                        <strong>{{ formatChatTime(archiveMeta.archivedAt) }}</strong>
                                    </span>
                                    <span class="expires">
                                        <i class="fa-regular fa-clock"></i>
                                        ระบบจะลบอัตโนมัติวันที่
                                        <strong>{{ formatShortDate(archiveMeta.expiresAt) }}</strong>
                                    </span>
                                </div>

                                <div
                                    v-for="msg in archiveMessages"
                                    :key="`m-${msg.id}`"
                                    class="msg-row"
                                    :class="msg.sender_role === 'pharma' ? 'from-pharma' : 'from-user'"
                                >
                                    <div class="msg-bubble">
                                        <div v-if="msg.message_text" class="msg-text">{{ msg.message_text }}</div>
                                        <div v-if="msg.file_path" class="msg-file">
                                            <i class="fa-solid fa-paperclip"></i> ไฟล์แนบ: {{ msg.file_path }}
                                        </div>
                                        <div class="msg-time">{{ formatChatTime(msg.created_at) }}</div>
                                    </div>
                                </div>
                            </div>
                        </main>
                    </div>
                </div>
            </div>
        </transition>

        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/tracking.css";

/* กันไม่ให้ตัดบรรทัดกลางวลี — ให้ "เสร็จสิ้น" อยู่บรรทัดเดียวกับ "หากไม่ต้องติดตามต่อ" */
.header-sub .nowrap { white-space: nowrap; }

/* ============================================================
   🆕 BTN GROUP — 2×2 grid (สวย เป็นระเบียบ ดูง่าย)
   ============================================================ */
.btn-group {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
    max-width: 360px;
    min-width: 320px;
    margin: 0 auto;
    justify-items: stretch;
}
.btn-group > button {
    width: 100%;
    min-height: 40px;
    height: auto;
    padding: 8px 10px;
    font-size: 0.76rem;
    font-weight: 700;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    color: white;
    transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
    white-space: normal;
    line-height: 1.3;
    text-align: center;
    word-break: break-word;
    box-sizing: border-box;
}
.btn-group > button:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
}

/* สีเฉพาะของแต่ละปุ่ม (override สีเดิม) */
.btn-group .btn-chat     { background: linear-gradient(135deg, #10b981, #059669) !important; box-shadow: 0 3px 8px rgba(16,185,129,.30); }
.btn-group .btn-archive  { background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important; box-shadow: 0 3px 8px rgba(37,99,235,.30); }
.btn-group .btn-pdf      { background: linear-gradient(135deg, #ef4444, #dc2626) !important; box-shadow: 0 3px 8px rgba(239,68,68,.30); }
.btn-group .btn-write-rx { background: linear-gradient(135deg, #f59e0b, #d97706) !important; box-shadow: 0 3px 8px rgba(245,158,11,.30); }
.btn-group .btn-complete { background: linear-gradient(135deg, #22c55e, #16a34a) !important; box-shadow: 0 3px 8px rgba(34,197,94,.30); }
.btn-group .btn-reopen   { background: linear-gradient(135deg, #f59e0b, #d97706) !important; box-shadow: 0 3px 8px rgba(245,158,11,.30); }

/* คอลัมน์ "จัดการ" — grid 2×2 กว้างพอสำหรับข้อความ EN */
.history-table th:last-child,
.history-table td.text-center {
    min-width: 340px;
    width: 340px;
    vertical-align: middle;
}

@media (max-width: 900px) {
    .btn-group { max-width: 100%; }
}

/* ปุ่ม chat แบบเดิม (สีเขียวกลม ใช้ตอนที่ไม่ได้อยู่ใน .btn-group, เช่นใน mobile card) */
.card-actions .btn-chat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #28a745 0%, #218838 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(40, 167, 69, 0.2);
    white-space: nowrap;
}
.card-actions .btn-chat:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(40, 167, 69, 0.3);
}

/* 🔔 Follow-up Toast */
.followup-toast {
    position: fixed;
    top: 90px;
    right: 24px;
    z-index: 9999;
    padding: 12px 18px;
    border-radius: 14px;
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: #fff;
    font-weight: 700;
    font-size: 0.92rem;
    box-shadow: 0 10px 25px rgba(22, 163, 74, 0.35);
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 260px;
    max-width: 90vw;
}
.followup-toast-warn {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    box-shadow: 0 10px 25px rgba(245, 158, 11, 0.35);
}
.followup-toast i { font-size: 1.1rem; }

.followup-toast-enter-active,
.followup-toast-leave-active { transition: all 0.3s ease; }
.followup-toast-enter-from { opacity: 0; transform: translateY(-10px) scale(0.95); }
.followup-toast-leave-to   { opacity: 0; transform: translateY(-10px) scale(0.95); }

@media (max-width: 640px) {
    .followup-toast {
        top: 70px;
        right: 12px;
        left: 12px;
        min-width: 0;
    }
}

/* ============================================================
   ✅ ปุ่มเสร็จสิ้น / เปิดติดตามอีกครั้ง + filter chips
   ============================================================ */
.status-filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-top: 14px;
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    color: #475569;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.88rem;
    transition: all 0.2s ease;
}
.filter-chip:hover {
    border-color: #00469c;
    color: #00469c;
}
.filter-chip.active {
    background: #00469c;
    border-color: #00469c;
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(0, 70, 156, 0.2);
}
.filter-chip .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    padding: 0 8px;
    height: 22px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    font-size: 0.72rem;
    font-weight: 700;
}
.filter-chip.active .count {
    background: rgba(255, 255, 255, 0.25);
    color: #ffffff;
}
.completed-badge-count {
    margin-left: auto;
    color: #15803d;
    font-weight: 700;
    font-size: 0.85rem;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

/* แถวที่ทำเสร็จแล้วในตาราง / การ์ดมือถือ */
.row-completed { background: #f0fdf4 !important; }
.row-completed td { color: #475569; }
.card-completed {
    background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%) !important;
    border-left: 4px solid #16a34a;
}

.status-badge.complete-mark {
    background: #ecfdf5;
    color: #15803d;
    border: 1px solid #bbf7d0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

/* ✍️ ปุ่ม เขียนใบสรุปรายการยา (เคสที่ยังไม่ได้ออกใบ) — ใช้ในการ์ดมือถือ */
.btn-write-rx {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(245, 158, 11, 0.2);
    white-space: nowrap;
}
.btn-write-rx:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(245, 158, 11, 0.35);
}

/* ปุ่ม เสร็จสิ้น */
.btn-complete {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(22, 163, 74, 0.2);
    white-space: nowrap;
}
.btn-complete:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(22, 163, 74, 0.35);
}

/* ปุ่ม เปิดติดตามอีกครั้ง */
.btn-reopen {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #ffffff;
    color: #b45309;
    border: 1.5px solid #fdba74;
    padding: 7px 14px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
}
.btn-reopen:hover {
    background: #fff7ed;
    border-color: #f97316;
    color: #9a3412;
}

/* Confirm modal สำหรับเสร็จสิ้น */
.confirm-modal {
    background: #ffffff;
    max-width: 460px;
    width: 100%;
    border-radius: 18px;
    padding: 28px 26px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
    text-align: center;
}

.confirm-icon {
    width: 70px;
    height: 70px;
    background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%);
    color: #15803d;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    font-size: 2rem;
}

.confirm-modal h3 {
    margin: 0 0 10px;
    color: #0f172a;
    font-size: 1.3rem;
}

.confirm-modal p {
    color: #475569;
    font-size: 0.95rem;
    line-height: 1.6;
    margin: 0 0 18px;
}

.confirm-modal p strong { color: #00469c; font-size: 1.05rem; }

.confirm-list {
    list-style: none;
    margin: 0 0 22px;
    padding: 16px 18px;
    background: #f8fafc;
    border-radius: 12px;
    text-align: left;
    font-size: 0.88rem;
    color: #475569;
}

.confirm-list li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0;
}

.confirm-list i {
    color: #16a34a;
    margin-top: 3px;
    flex-shrink: 0;
}

.confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
}

.cm-btn {
    padding: 11px 22px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-weight: 700;
    font-size: 0.95rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
}

.cm-btn.cancel {
    background: #f1f5f9;
    color: #475569;
}
.cm-btn.cancel:hover { background: #e2e8f0; }

.cm-btn.confirm {
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    color: #ffffff;
    box-shadow: 0 4px 10px rgba(22, 163, 74, 0.3);
}
.cm-btn.confirm:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 14px rgba(22, 163, 74, 0.4);
}

.cm-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
    transform: none;
}

/* ============================================================
   📜 Archive Modal — ดูประวัติบทสนทนาเก่า (เก็บ 365 วัน)
   ============================================================ */
.btn-archive {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(99, 102, 241, 0.2);
    white-space: nowrap;
}
.btn-archive:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 12px rgba(99, 102, 241, 0.35);
}

.archive-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(4px);
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}

.archive-modal {
    background: #ffffff;
    width: 100%;
    max-width: 1080px;
    max-height: 90vh;
    border-radius: 18px;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.archive-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    background: linear-gradient(135deg, #00469c 0%, #003373 100%);
    color: white;
}

.archive-header h3 {
    margin: 0;
    font-size: 1.2rem;
    display: inline-flex;
    align-items: center;
    gap: 10px;
}

.archive-sub {
    margin: 6px 0 0;
    font-size: 0.85rem;
    opacity: 0.95;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
}

.retention-note {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    background: rgba(255, 255, 255, 0.18);
    padding: 4px 10px;
    border-radius: 999px;
}

.archive-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
}

.btn-view-archive-chat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 14px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: #fff;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.2s, filter 0.15s;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
    white-space: nowrap;
    font-family: inherit;
}
.btn-view-archive-chat:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.08);
}
.btn-view-archive-chat:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    box-shadow: none;
}

.btn-reply-chat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, #10b981 0%, #047857 100%);
    color: #fff;
    font-weight: 700;
    font-size: 0.88rem;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.2s, filter 0.15s;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
    white-space: nowrap;
    font-family: inherit;
}
.btn-reply-chat:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.08);
    box-shadow: 0 6px 18px rgba(16, 185, 129, 0.48);
}
.btn-reply-chat:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    box-shadow: none;
}
.btn-reply-chat i {
    font-size: 0.95rem;
}

.archive-close {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.2s ease;
}
.archive-close:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: rotate(90deg);
}

@media (max-width: 640px) {
    .btn-reply-chat {
        padding: 8px 12px;
        font-size: 0.8rem;
    }
}

.archive-body {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    overflow: hidden;
}

.archive-sessions {
    background: #f8fafc;
    border-right: 1px solid #e2e8f0;
    overflow-y: auto;
    padding: 12px;
}

.sessions-title {
    font-weight: 700;
    color: #00469c;
    padding: 8px 12px;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.session-list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.session-item {
    position: relative;
    padding: 12px 14px;
    padding-right: 40px;
    margin-bottom: 8px;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}
.btn-delete-card {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    border: none;
    background: #ffffff;
    color: #94a3b8;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    opacity: 0;
    transition: all 0.18s ease;
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.12);
    z-index: 2;
}
.session-item:hover .btn-delete-card,
.session-item.active .btn-delete-card {
    opacity: 1;
}
.btn-delete-card:hover {
    background: #fee2e2;
    color: #dc2626;
    box-shadow: 0 3px 10px rgba(220, 38, 38, 0.3);
}
.btn-delete-card:disabled {
    opacity: 0.6;
    cursor: wait;
}
.session-item:hover {
    border-color: #00469c;
    background: #eff6ff;
}
.session-item.active {
    border-color: #00469c;
    background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
    box-shadow: 0 4px 10px rgba(0, 70, 156, 0.15);
}

.session-code {
    font-weight: 800;
    color: #00469c;
    font-size: 0.95rem;
}

.session-date {
    color: #64748b;
    font-size: 0.78rem;
    margin: 2px 0 6px;
}

.session-symptom {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    margin-bottom: 6px;
    word-break: break-word;
}
.session-symptom i { margin-top: 2px; flex-shrink: 0; }

.session-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    color: #475569;
}

.session-meta .days-left {
    color: #15803d;
    font-weight: 700;
}
.session-meta .days-left.warn {
    color: #b45309;
}

.archive-empty-mini .hint {
    font-size: 0.78rem;
    color: #94a3b8;
    margin-top: 6px;
    line-height: 1.5;
}

.archive-messages {
    overflow-y: auto;
    padding: 20px 24px;
    background: #f1f5f9;
}

.messages-meta-banner {
    background: #ffffff;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 0.8rem;
    color: #475569;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
}

.messages-meta-banner strong {
    color: #00469c;
}

.messages-meta-banner .expires strong {
    color: #b45309;
}

.msg-row {
    display: flex;
    margin-bottom: 12px;
}
.msg-row.from-pharma { justify-content: flex-end; }
.msg-row.from-user { justify-content: flex-start; }

.msg-bubble {
    max-width: 70%;
    padding: 10px 14px;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    font-size: 0.9rem;
    color: #1e293b;
}
.msg-row.from-pharma .msg-bubble {
    background: linear-gradient(135deg, #00469c 0%, #003373 100%);
    color: #ffffff;
    border-bottom-right-radius: 4px;
}
.msg-row.from-user .msg-bubble {
    background: #ffffff;
    border-bottom-left-radius: 4px;
}

.msg-text { white-space: pre-wrap; word-break: break-word; }

.msg-file {
    margin-top: 6px;
    font-size: 0.78rem;
    opacity: 0.85;
}

.msg-time {
    margin-top: 4px;
    font-size: 0.7rem;
    opacity: 0.7;
    text-align: right;
}

.archive-error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    padding: 10px 14px;
    border-radius: 10px;
    margin-bottom: 12px;
    font-size: 0.9rem;
}

.archive-loading,
.archive-empty,
.archive-loading-mini,
.archive-empty-mini {
    text-align: center;
    padding: 40px 20px;
    color: #64748b;
}
.archive-loading-mini,
.archive-empty-mini {
    padding: 30px 10px;
    font-size: 0.85rem;
}
.archive-empty i,
.archive-empty-mini i {
    font-size: 2.4rem;
    color: #cbd5e1;
    margin-bottom: 12px;
    display: block;
}

.spinner-mini {
    width: 22px;
    height: 22px;
    border: 3px solid #cbd5e1;
    border-top-color: #00469c;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 10px;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

/* Modal transition */
.archive-modal-enter-active,
.archive-modal-leave-active { transition: all 0.25s ease; }
.archive-modal-enter-from,
.archive-modal-leave-to { opacity: 0; transform: scale(0.95); }

@media (max-width: 760px) {
    .archive-body {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr;
    }
    .archive-sessions {
        max-height: 200px;
        border-right: none;
        border-bottom: 1px solid #e2e8f0;
    }
    .archive-header {
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
    }
    .archive-close {
        align-self: flex-end;
    }
    .btn-delete-card {
        opacity: 1;
    }
}
</style>