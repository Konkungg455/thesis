<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';

definePageMeta({ middleware: 'user-only' });

const { apiUrl } = useApiBase();
const router = useRouter();

const errorMessage = ref('');
const selectedSession = ref(null);
const messages = ref([]);
const meta = ref({ retentionDays: 365, archivedAt: '', expiresAt: '' });
const deletingKey = ref('');
const loadingMessages = ref(false);

const { data: sessionsRes, pending: isLoading, refresh: reloadSessions } = await useAsyncData(
    'consult-archives-list',
    () => $fetch(apiUrl('consult-handler.php?action=list_consult_archives'), {
        credentials: 'include',
        timeout: 25_000,
    }),
    { default: () => ({ status: 'success', data: [], retention_days: 365 }) },
);

const sessions = computed(() => (
    sessionsRes.value?.status === 'success' ? (sessionsRes.value.data || []) : []
));

const loadSessions = async () => {
    errorMessage.value = '';
    try {
        await reloadSessions();
        if (sessionsRes.value?.status === 'success') {
            meta.value.retentionDays = sessionsRes.value.retention_days || 365;
            if (sessions.value.length > 0 && !selectedSession.value) {
                void selectSession(sessions.value[0]);
            }
        } else {
            errorMessage.value = sessionsRes.value?.message || 'ดึงประวัติไม่สำเร็จ';
        }
    } catch (err) {
        console.error('list_consult_archives error', err);
        errorMessage.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    }
};

const selectSession = async (session) => {
    if (!session) return;
    selectedSession.value = session;
    messages.value = [];
    loadingMessages.value = true;
    errorMessage.value = '';

    try {
        const url = session.consult_id
            ? `consult-handler.php?action=get_chat_archive&consult_id=${session.consult_id}`
            : `consult-handler.php?action=get_chat_archive&peer_id=${session.other_id}`;
        const res = await $fetch(apiUrl(url), { credentials: 'include', timeout: 22_000 });
        if (res?.status === 'success') {
            messages.value = res.data || [];
            meta.value.archivedAt = res.archived_at || '';
            meta.value.expiresAt = res.expires_at || '';
        } else {
            errorMessage.value = res?.message || 'ดึงข้อความไม่สำเร็จ';
        }
    } catch (err) {
        console.error('get_chat_archive error', err);
        errorMessage.value = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    } finally {
        loadingMessages.value = false;
    }
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

// แปลงวันคงเหลือเป็น "X วัน Y ชม. Z นาที"
//   - เคลื่อนไหวทุกนาที (computed ใช้ now)
const formatDaysLeft = (expiresAt) => {
    if (!expiresAt) return '';
    const expireMs = new Date(expiresAt).getTime();
    const diff = expireMs - Date.now();
    if (diff <= 0) return 'หมดอายุการเก็บแล้ว';
    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins  = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `เหลือเวลาติดตาม: ${days}\u00A0วัน ${hours}\u00A0ชั่วโมง ${mins}\u00A0นาที`;
};

// ปุ่ม "ปรึกษาอีกครั้ง" → เปิดแชทรอบ SRV ที่เลือก (consult_id + srv จากรายการ)
const goReconsult = (session) => {
    if (!session?.other_id) return;
    if (import.meta.client) {
        try {
            sessionStorage.removeItem(`consult-user-${session.other_id}-ended`);
            sessionStorage.removeItem(`consult-user-${session.other_id}-deadline`);
        } catch { /* ignore */ }
    }
    const params = new URLSearchParams({ id: String(session.other_id) });
    const cid = Number(session.consult_id) || 0;
    if (cid > 0) params.set('consult_id', String(cid));
    const srv = String(session.service_code || '').trim();
    if (srv) params.set('srv', srv);
    router.push(`/user/chat?${params.toString()}`);
};

// ลบการ์ดประวัติบทสนทนา (1 รอบ consult)
const deleteSession = async (session, ev) => {
    ev?.stopPropagation?.();
    if (!session) return;
    const cid = Number(session.consult_id) || 0;
    const peer = Number(session.other_id) || 0;
    if (cid <= 0 && peer <= 0) return;
    const label = session.service_code || `#${cid || '-'}`;
    if (!confirm(`ลบประวัติการปรึกษา "${label}" ออกจากรายการของคุณหรือไม่?\nข้อมูลจริงยังถูก freeze เก็บไว้ในฐานข้อมูล`)) return;

    const key = `${cid}-${peer}`;
    deletingKey.value = key;
    try {
        const fd = new FormData();
        if (cid > 0) fd.append('consult_id', String(cid));
        else fd.append('peer_id', String(peer));
        const res = await $fetch(apiUrl('consult-handler.php?action=delete_consult_archive'), {
            method: 'POST', body: fd, credentials: 'include'
        });
        if (res?.status === 'success') {
            sessionsRes.value = {
                ...sessionsRes.value,
                status: 'success',
                data: sessions.value.filter((s) => s !== session),
            };
            if (selectedSession.value === session) {
                selectedSession.value = null;
                messages.value = [];
                if (sessions.value.length > 0) await selectSession(sessions.value[0]);
            }
        } else {
            alert(res?.message || 'ลบไม่สำเร็จ');
        }
    } catch (err) {
        console.error('delete_consult_archive error', err);
        alert('ลบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
        deletingKey.value = '';
    }
};

onMounted(async () => {
    if (sessions.value.length > 0 && !selectedSession.value) {
        void selectSession(sessions.value[0]);
        return;
    }
    if (sessions.value.length === 0 && !isLoading.value) {
        for (let i = 0; i < 2; i++) {
            await loadSessions();
            if (sessions.value.length > 0) break;
            await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        }
    }
});
</script>

<template>
    <Header />
    <div class="consult-history-page">
        <div class="container">
            <div class="page-header">
                <h1>
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    ประวัติการปรึกษากับเภสัชกร
                </h1>
                <p class="page-sub">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span class="page-sub-text">
                        บทสนทนาที่จบไปแล้วจะถูกเก็บไว้ <strong>{{ meta.retentionDays }}&nbsp;วัน</strong>
                        ตามประกาศสภาเภสัชกรรม จากนั้นระบบจะลบอัตโนมัติ
                    </span>
                </p>
            </div>

            <div v-if="errorMessage" class="error-banner">
                <i class="fa-solid fa-triangle-exclamation"></i> {{ errorMessage }}
            </div>

            <div class="layout">
                <!-- รายการ session -->
                <aside class="sessions-panel">
                    <div class="panel-title">
                        <i class="fa-solid fa-list"></i>
                        ครั้งที่ปรึกษา ({{ sessions.length }})
                    </div>

                    <div v-if="isLoading && sessions.length === 0" class="loading-mini">
                        <div class="spinner-mini"></div>
                        <p>กำลังโหลด...</p>
                    </div>

                    <div v-else-if="sessions.length === 0" class="empty-mini">
                        <i class="fa-regular fa-folder-open"></i>
                        <p>ยังไม่มีบทสนทนากับเภสัชกร</p>
                        <p class="hint">เริ่มปรึกษาเภสัชกรเพื่อให้บทสนทนาแสดงที่นี่</p>
                    </div>

                    <ul v-else class="session-list">
                        <li
                            v-for="(s, idx) in sessions"
                            :key="`s-${s.consult_id}-${idx}`"
                            class="session-item"
                            :class="{ active: selectedSession && selectedSession === s }"
                            @click="selectSession(s)"
                        >
                            <button
                                type="button"
                                class="btn-delete-card"
                                :disabled="deletingKey === `${s.consult_id || 0}-${s.other_id || 0}`"
                                @click.stop="deleteSession(s, $event)"
                                title="ลบประวัติการปรึกษานี้"
                            >
                                <i
                                    :class="deletingKey === `${s.consult_id || 0}-${s.other_id || 0}`
                                        ? 'fa-solid fa-spinner fa-spin'
                                        : 'fa-regular fa-trash-can'"
                                ></i>
                            </button>
                            <div class="session-name">{{ s.other_name }}</div>
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
                                <span>
                                    <i class="fa-regular fa-comment"></i>
                                    {{ s.message_count }} ข้อความ
                                </span>
                                <span
                                    v-if="s.expires_at"
                                    class="days-left"
                                    :class="{ warn: s.days_left !== null && s.days_left <= 30 }"
                                    :title="`ระบบจะลบอัตโนมัติ ${formatShortDate(s.expires_at)}`"
                                >
                                    <i class="fa-regular fa-clock"></i>
                                    {{ formatDaysLeft(s.expires_at) }}
                                </span>
                            </div>
                            <button
                                type="button"
                                class="btn-reconsult"
                                @click.stop="goReconsult(s)"
                                title="เปิดแชทรอบ SRV นี้กับเภสัชกร"
                            >
                                <i class="fa-solid fa-comment-medical"></i>
                                ปรึกษาอีกครั้ง
                            </button>
                        </li>
                    </ul>
                </aside>

                <!-- กล่องข้อความ -->
                <main class="messages-panel">
                    <div v-if="loadingMessages && messages.length === 0 && selectedSession" class="loading">
                        <div class="spinner"></div>
                        <p>กำลังโหลดข้อความ...</p>
                    </div>

                    <div v-else-if="!selectedSession && !isLoading" class="empty">
                        <i class="fa-regular fa-comments"></i>
                        <p>เลือกครั้งที่ปรึกษาทางด้านซ้ายเพื่อดูบทสนทนา</p>
                    </div>

                    <div v-else-if="messages.length === 0 && selectedSession && !isLoading" class="empty">
                        <i class="fa-regular fa-folder-open"></i>
                        <p>ไม่พบข้อความในครั้งนี้</p>
                    </div>

                    <div v-else-if="messages.length > 0" class="messages-scroll">
                        <div class="meta-banner">
                            <span>
                                <i class="fa-solid fa-user-doctor"></i>
                                ปรึกษากับ <strong>{{ selectedSession?.other_name }}</strong>
                            </span>
                            <span>
                                <i class="fa-solid fa-box-archive"></i>
                                จบเมื่อ <strong>{{ formatChatTime(meta.archivedAt) }}</strong>
                            </span>
                            <span class="expires">
                                <i class="fa-regular fa-clock"></i>
                                ลบอัตโนมัติ <strong>{{ formatShortDate(meta.expiresAt) }}</strong>
                            </span>
                        </div>

                        <div
                            v-for="msg in messages"
                            :key="`m-${msg.id}`"
                            class="msg-row"
                            :class="msg.sender_role === 'user' ? 'mine' : 'theirs'"
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
    <Footer />
</template>

<style scoped>
.consult-history-page {
    background: linear-gradient(180deg, #f0f4f8 0%, #ffffff 100%);
    min-height: 100vh;
    padding: 100px 0 50px;
}

.container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 20px;
}

.page-header {
    text-align: center;
    margin-bottom: 30px;
}

.consult-history-page .page-header h1 {
    color: #00469c;
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    font-weight: 700;
    margin: 0 0 10px;
    /* display:flex (block-level) → หัวข้ออยู่บรรทัดของตัวเอง, คำบรรยายตกไปบรรทัดถัดไป */
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: nowrap;
    white-space: nowrap;
    gap: 10px;
    line-height: 1.3;
}
.consult-history-page .page-header h1 i { font-size: 0.9em; flex-shrink: 0; }
/* จอเล็ก: ลดขนาดลงนิดและให้ตัดบรรทัดได้ กันล้นจอ */
@media (max-width: 480px) {
    .consult-history-page .page-header h1 {
        font-size: 1.45rem !important;
        white-space: normal;
    }
}

.page-sub {
    color: #64748b;
    font-size: 0.95rem;
    display: inline-flex;
    align-items: flex-start;
    gap: 8px;
    background: #f1f5f9;
    padding: 8px 16px;
    border-radius: 999px;
    max-width: 100%;
    text-align: left;
    line-height: 1.5;
}
.page-sub > i { margin-top: 0.25em; flex-shrink: 0; }
.page-sub-text { min-width: 0; }

.page-sub strong { color: #00469c; white-space: nowrap; }

@media (max-width: 560px) {
    .page-sub { border-radius: 16px; }
}

.error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #b91c1c;
    padding: 12px 16px;
    border-radius: 12px;
    margin-bottom: 20px;
}

.layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 20px;
    min-height: 580px;
}

/* ============ Sessions list ============ */
.sessions-panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    height: fit-content;
    max-height: 720px;
    overflow-y: auto;
}

.panel-title {
    font-weight: 700;
    color: #00469c;
    padding: 8px 4px 16px;
    border-bottom: 2px solid #e2e8f0;
    margin-bottom: 12px;
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
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    padding: 14px;
    margin-bottom: 10px;
    background: #f8fafc;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
}
/* กันเนื้อหาในการ์ดถูกบีบเป็นคอลัมน์แนวนอน (เผื่อมีกฎ flex-row จาก global) */
.session-item > * { width: 100%; min-width: 0; }

/* ปุ่มลบการ์ด — มุมขวาบน โผล่ตอน hover (มือถือโชว์ตลอด) */
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
.session-item:hover .btn-delete-card { opacity: 1; }
.btn-delete-card:hover {
    background: #fee2e2;
    color: #dc2626;
    box-shadow: 0 3px 10px rgba(220, 38, 38, 0.3);
}
.btn-delete-card:disabled { opacity: 0.6; cursor: wait; }

.session-item:hover {
    border-color: #00469c;
    background: #eff6ff;
}

.session-item.active {
    border-color: #00469c;
    background: linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%);
    box-shadow: 0 4px 10px rgba(0, 70, 156, 0.18);
}

.session-name {
    font-weight: 700;
    color: #0f172a;
    font-size: 0.95rem;
    line-height: 1.3;
    margin-bottom: 0;
    padding-right: 32px;
}

.session-code {
    color: #00469c;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.3;
}

.session-date {
    color: #64748b;
    font-size: 0.78rem;
    margin-top: 0;
    margin-bottom: 0;
    line-height: 1.3;
}

.session-symptom {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 3px 8px;
    font-size: 0.78rem;
    font-weight: 600;
    margin-bottom: 2px;
    word-break: break-word;
    line-height: 1.25;
}
.session-symptom i { margin-top: 2px; flex-shrink: 0; }

.session-meta {
    display: flex;
    justify-content: space-between;
    gap: 8px 6px;
    flex-wrap: wrap;
    font-size: 0.74rem;
    color: #475569;
    line-height: 1.4;
}

.session-meta .days-left { color: #15803d; font-weight: 700; }
.session-meta .days-left.warn { color: #b45309; }

.btn-reconsult {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    margin-top: 4px;
    padding: 8px 12px;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #00469c 0%, #0066cc 100%);
    color: #ffffff;
    font-weight: 700;
    font-size: 0.82rem;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.15s ease;
    box-shadow: 0 3px 8px rgba(0, 70, 156, 0.25);
    font-family: inherit;
}
.btn-reconsult:hover {
    transform: translateY(-1px);
    filter: brightness(1.08);
    box-shadow: 0 5px 14px rgba(0, 70, 156, 0.38);
}
.btn-reconsult i { font-size: 0.9rem; }

/* ============ Messages panel ============ */
.messages-panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
    display: flex;
    flex-direction: column;
    max-height: 720px;
    overflow: hidden;
}

.meta-banner {
    background: #f1f5f9;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 16px;
    font-size: 0.82rem;
    color: #475569;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
}
.meta-banner strong { color: #00469c; }
.meta-banner .expires strong { color: #b45309; }

.messages-scroll {
    flex: 1;
    overflow-y: auto;
    padding-right: 6px;
}

.msg-row {
    display: flex;
    margin-bottom: 12px;
}
.msg-row.mine { justify-content: flex-end; }
.msg-row.theirs { justify-content: flex-start; }

.msg-bubble {
    max-width: 70%;
    padding: 10px 14px;
    border-radius: 16px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
    font-size: 0.92rem;
}
.msg-row.mine .msg-bubble {
    background: linear-gradient(135deg, #00469c 0%, #003373 100%);
    color: #ffffff;
    border-bottom-right-radius: 4px;
}
.msg-row.theirs .msg-bubble {
    background: #f1f5f9;
    color: #1e293b;
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

.loading,
.empty {
    text-align: center;
    padding: 80px 20px;
    color: #64748b;
    margin: auto;
}

.empty i {
    font-size: 3.5rem;
    color: #cbd5e1;
    margin-bottom: 16px;
    display: block;
}

.spinner,
.spinner-mini {
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #cbd5e1;
    border-top-color: #00469c;
}

.spinner-mini {
    width: 22px;
    height: 22px;
    border: 3px solid #cbd5e1;
    border-top-color: #00469c;
}

.loading-mini,
.empty-mini {
    text-align: center;
    padding: 30px 10px;
    font-size: 0.85rem;
    color: #64748b;
}

.empty-mini i {
    font-size: 2.4rem;
    color: #cbd5e1;
    margin-bottom: 10px;
    display: block;
}
.empty-mini .hint {
    font-size: 0.78rem;
    color: #94a3b8;
    margin-top: 6px;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
}

@media (max-width: 760px) {
    .layout {
        grid-template-columns: 1fr;
        min-height: 0;
    }
    /* มือถือ: เลิกใช้กล่องเลื่อนซ้อนในหน้า → ให้ทั้งสองพาเนลไหลไปกับการเลื่อนหน้าปกติ */
    .sessions-panel {
        max-height: none;
        overflow: visible;
    }
    .messages-panel {
        max-height: none;
        overflow: visible;
        min-height: 300px;
    }
    .messages-scroll {
        overflow: visible;
        padding-right: 0;
    }
    .btn-delete-card { opacity: 0.7; }
}

/* จอเล็กมาก: ขยายความกว้างฟองข้อความ + ลดระยะให้พอดีจอ */
@media (max-width: 480px) {
    .messages-panel { padding: 16px 14px; }
    .msg-bubble { max-width: 85%; }
    .meta-banner { font-size: 0.78rem; gap: 8px; }

    /* การ์ดครั้งที่ปรึกษา: ให้องค์ประกอบห่างกันอ่านง่ายขึ้นบน iPhone 12 */
    .session-item { gap: 7px; padding: 16px; }
    .session-name { line-height: 1.3; margin-bottom: 0; }
    .session-code { line-height: 1.3; }
    .session-date { line-height: 1.3; margin-top: 0; margin-bottom: 0; }
    .session-symptom { margin: 2px 0; padding: 6px 10px; }
    .session-meta { margin-top: 2px; }
    .btn-reconsult { margin-top: 6px; padding: 11px 12px; }
}
</style>
