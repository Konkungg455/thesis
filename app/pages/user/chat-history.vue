<script setup>
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
// โหลด CSS แบบ side-effect — Nuxt/Vite จะ bundle เข้า chunk ของหน้านี้
// แล้ว inject <link rel="stylesheet"> ที่ถูกต้องตั้งแต่ SSR (กัน FOUC ตอน refresh)
// และจำกัด scope แค่ route นี้ (ไม่กระทบ chat.css ของ /user/chat)
import '@/assets/chat_bot.css';
import '@/assets/chat-history-page.css';

// 🆕 หน้านี้เปิดได้แม้ไม่ล็อกอิน (guest mode)
//    → ไม่ใส่ middleware 'user-only'; global guard จะเช็คผ่าน PUBLIC_PATH_PREFIXES
//    → fetchUserProfile() จะตั้ง isGuest=true เงียบ ๆ ถ้าไม่ login

const route = useRoute();
const router = useRouter();

const queryParam = (key) => {
    const v = route.query[key];
    if (Array.isArray(v)) return v[0] || '';
    return v ? String(v) : '';
};

const sessionCategoryKey = (sid) => `telebot_sess_cat_${sid}`;

const buildChatHistoryQuery = (overrides = {}) => {
    const q = {};
    const sid = overrides.session_id ?? queryParam('session_id') ?? sessionId.value;
    if (sid) q.session_id = sid;

    const cat = overrides.category
        ?? queryParam('category')
        ?? (symptomName.value && symptomName.value !== 'ทั่วไป' ? symptomName.value : '');
    if (cat) q.category = cat;

    const search = overrides.search ?? queryParam('search');
    if (search) q.search = search;

    return q;
};

const syncCategoryToUrl = () => {
    const sid = sessionId.value || queryParam('session_id');
    if (!sid || !import.meta.client) return;

    const cat = symptomName.value && symptomName.value !== 'ทั่วไป' ? symptomName.value : '';
    if (!cat) return;

    try { sessionStorage.setItem(sessionCategoryKey(sid), cat); } catch {}

    if (queryParam('category') === cat) return;
    router.replace({
        path: '/user/chat-history',
        query: buildChatHistoryQuery({ session_id: sid, category: cat }),
    });
};

/* ================= State & Data ================= */
const newMessage = ref('');
const chatScroll = ref(null);
const isLoading = ref(false);
const userName = ref('คุณลูกค้า');
const userProfile = ref(null);
const chatMessages = ref([]);
const sessionId = ref("");
const symptomName = ref("");

/* ================= Sidebar: รายการแชททั้งหมด (สไตล์ ChatGPT) ================= */
const sessionList = ref([]);          // [{session_id, symptom_name, message_count, last_at, first_message, round_no, round_total}]
const isLoadingSessions = ref(false);
const deletingSession = ref('');
const GUEST_SESSIONS_KEY = 'telebot_guest_sessions';

// guest mode: เก็บ session_id ที่ตัวเองสร้างไว้ใน localStorage
const readGuestSessions = () => {
    if (!import.meta.client) return [];
    try {
        const raw = localStorage.getItem(GUEST_SESSIONS_KEY) || '[]';
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(s => typeof s === 'string' && s.length > 0) : [];
    } catch { return []; }
};
const rememberGuestSession = (sid) => {
    if (!import.meta.client || !sid) return;
    try {
        const list = readGuestSessions();
        if (!list.includes(sid)) {
            list.unshift(sid);
            localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(list.slice(0, 200)));
        }
    } catch {}
};

const loadSessionList = async () => {
    isLoadingSessions.value = true;
    try {
        let url = `${useNuxtApp().$getApiBase()}/get-chat-history.php`;
        if (import.meta.client && !userProfile.value) {
            // guest: ส่งรายการ session_id ของตัวเอง
            const ids = readGuestSessions();
            if (ids.length > 0) url += `?sessions=${encodeURIComponent(ids.join(','))}`;
        }
        const res = await $fetch(url, { credentials: 'include' });
        if (res?.status === 'success' && Array.isArray(res.data)) {
            sessionList.value = res.data;
        }
    } catch (err) {
        console.warn('Load session list failed:', err);
    } finally {
        isLoadingSessions.value = false;
    }
};

const isActiveSession = (sid) => sid === sessionId.value;

const openSession = (sid) => {
    if (!sid || sid === sessionId.value) {
        closeSidebar();
        return;
    }
    const session = sessionList.value.find(s => s.session_id === sid);
    const category = session?.symptom_name || queryParam('category');
    router.push({
        path: '/user/chat-history',
        query: buildChatHistoryQuery({ session_id: sid, category }),
    });
    closeSidebar();
};

const startNewChat = () => {
    router.push('/Advice');
    closeSidebar();
};

const formatSessionTimeShort = (ts) => {
    if (!ts) return '';
    try {
        const d = new Date(ts.replace(' ', 'T'));
        const now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
        if (sameDay) return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        if (d.toDateString() === yesterday.toDateString()) return 'เมื่อวาน';
        return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
    } catch { return ''; }
};

const previewSessionMsg = (s) => {
    const t = String(s || '').trim();
    if (!t) return 'เริ่มต้น…';
    const clean = t.replace(/\[PROFILE\][\s\S]*?\n\n/, '').trim();
    return clean.length > 48 ? clean.slice(0, 48) + '…' : clean;
};

// 🆕 ลบข้อความเดียวออกจากแชท (per-message delete)
const deletingMessageId = ref(null);
const deleteMessage = async (msg, idx, ev) => {
    ev?.stopPropagation?.();
    if (!msg) return;
    if (!confirm('ลบข้อความนี้ออกจากหน้าจอหรือไม่?\nข้อมูลจริงจะถูก freeze เก็บไว้ในฐานข้อมูล')) return;

    // ถ้ามี id ใน DB → เรียก backend เพื่อซ่อนและ freeze ข้อมูลไว้
    if (msg.id) {
        deletingMessageId.value = msg.id;
        try {
            const fd = new FormData();
            fd.append('message_id', String(msg.id));
            if (sessionId.value) fd.append('session_id', sessionId.value);
            const res = await $fetch(`${useNuxtApp().$getApiBase()}/delete-chat-message.php`, {
                method: 'POST', body: fd, credentials: 'include'
            });
            if (res?.status !== 'success') {
                alert(res?.message || 'ลบไม่สำเร็จ');
                return;
            }
        } catch (err) {
            console.error('delete message failed', err);
            alert('ลบไม่สำเร็จ กรุณาลองใหม่');
            return;
        } finally {
            deletingMessageId.value = null;
        }
    }
    // ลบออกจาก UI
    chatMessages.value.splice(idx, 1);
    // refresh sidebar ให้นับข้อความใหม่
    setTimeout(() => loadSessionList(), 300);
};

const deleteSession = async (item, ev) => {
    ev?.stopPropagation?.();
    if (!item?.session_id) return;
    const label = item.round_total > 1
        ? `${item.symptom_name} (รอบ ${item.round_no})`
        : item.symptom_name;
    if (!confirm(`ลบประวัติแชท "${label}" ออกจากหน้าจอหรือไม่?\nข้อมูลจริงจะถูก freeze เก็บไว้ในฐานข้อมูล`)) return;
    deletingSession.value = item.session_id;
    try {
        const fd = new FormData();
        fd.append('session_id', item.session_id);
        const res = await $fetch(`${useNuxtApp().$getApiBase()}/delete-chat-session.php`, {
            method: 'POST', body: fd, credentials: 'include'
        });
        if (res?.status === 'success') {
            // ลบจาก localStorage guest list ด้วย
            if (import.meta.client) {
                try {
                    const list = readGuestSessions().filter(s => s !== item.session_id);
                    localStorage.setItem(GUEST_SESSIONS_KEY, JSON.stringify(list));
                } catch {}
            }
            sessionList.value = sessionList.value.filter(s => s.session_id !== item.session_id);
            // ถ้าลบ session ปัจจุบัน → ไปแชทใหม่ หรือ session ถัดไป
            if (item.session_id === sessionId.value) {
                const next = sessionList.value[0];
                if (next) {
                    router.push({
                        path: '/user/chat-history',
                        query: buildChatHistoryQuery({
                            session_id: next.session_id,
                            category: next.symptom_name,
                        }),
                    });
                } else {
                    router.push('/Advice');
                }
            }
        } else {
            alert(res?.message || 'ลบไม่สำเร็จ');
        }
    } catch (err) {
        console.error('delete session failed', err);
        alert('ลบไม่สำเร็จ');
    } finally {
        deletingSession.value = '';
    }
};

// 🆕 จำ session ปัจจุบันไว้ใน localStorage — เพื่อให้หน้าถัดไปที่กดปรึกษาเภสัช
//    (location → pharma_waiting) ส่ง session นี้ไปบันทึกใน consult_requests
const persistActiveBotSession = (sid) => {
    if (!import.meta.client || !sid) return
    try { localStorage.setItem('telebot_active_bot_session', sid) } catch {}
}
// ส่งทั้ง localStorage และ query string ไปด้วย — กันพลาดถ้า localStorage ถูกล้าง/ไม่ทำงาน
const goToPharmacist = () => {
    persistActiveBotSession(sessionId.value);
    router.push({
        path: '/pharmacist/location',
        query: sessionId.value ? { bot_session_id: sessionId.value } : {}
    });
}

/* ================= Sidebar mobile drawer ================= */
const isSidebarOpen = ref(false);
const openSidebar = () => { isSidebarOpen.value = true; };
const closeSidebar = () => { isSidebarOpen.value = false; };

// ใช้กฎร่วม (32 อาการบัตรทอง / red flag / off-topic) จาก composable
const { classifyInput, parseAiMessage, getOptions, buildAssistantMeta, normalizeMessageText, stripOffTopicLeak, buildScreeningHint, REPLY_REDFLAG, REPLY_IRRELEVANT, REPLY_THANKS } = useAiChatRules();
const { apiUrl } = useApiBase();

/** ชื่อ-นามสกุลเต็ม จากโปรไฟล์ */
const profileFullName = computed(() => {
    const p = userProfile.value;
    if (!p) return '';
    const first = String(p.firstname || '').trim();
    const last = String(p.lastname || '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    return full || String(p.username_account || '').trim();
});

/** ชื่อแสดง */
const displayUserName = computed(() => {
    if (profileFullName.value) return profileFullName.value;
    if (userName.value && userName.value !== 'คุณลูกค้า') return userName.value;
    return 'ลูกค้า';
});

/** สร้าง [PROFILE] string สั้นๆ แนบไปกับข้อความผู้ใช้ */
const buildProfileContext = () => {
    const p = userProfile.value;
    if (!p) return '';
    const v = (x) => (x !== null && x !== undefined && String(x).trim() !== '' ? String(x).trim() : '-');
    const fullName = profileFullName.value || v(p.username_account);
    const callName = fullName !== '-' ? fullName : 'ลูกค้า';
    return `[PROFILE] ชื่อ-นามสกุล: ${fullName} | อายุ: ${v(p.old)} | เพศ: ${v(p.gender)} | ส่วนสูง: ${v(p.height)} | น้ำหนัก: ${v(p.weight)} | โรคประจำตัว: ${v(p.personal_disease)}\n[คำสั่งเรียกชื่อ] ห้ามใช้ "User" — ต้องเรียก "คุณ ${callName}" หรือ "คุณ" เท่านั้น`;
};

/** 🛡️ Safety net แทน "User" → "คุณ <ชื่อจริง>" (มีเว้นวรรค หลังคุณ เสมอ) */
const sanitizeAiText = (text) => {
    if (!text) return text;
    const name = profileFullName.value || displayUserName.value || 'ลูกค้า';
    const callName = `คุณ ${name}`;
    let out = String(text);
    // แทน User ก่อน
    out = out.replace(/ความคิดเห็นของ\s*User\b/gi, `ความคิดเห็นของ${callName}`);
    out = out.replace(/อาการของ\s*User\b/gi, `อาการของ${callName}`);
    out = out.replace(/ที่\s*User\s*ตอบ/gi, `ที่${callName} ตอบ`);
    out = out.replace(/ที่\s*User\s*แจ้ง/gi, `ที่${callName} แจ้ง`);
    out = out.replace(/ผู้ป่วย:\s*User\b/gi, `ผู้ป่วย: ${callName}`);
    out = out.replace(/เบื้องต้นของ\s*User\b/gi, `เบื้องต้นของ${callName}`);
    out = out.replace(/ของ\s*User\b/gi, `ของ${callName}`);
    out = out.replace(/คุณ\s*User\b/gi, callName);
    out = out.replace(/ผู้ใช้\s*User\b/gi, callName);
    out = out.replace(/\bUser\b/g, callName);
    // เพิ่มเว้นวรรคหลัง "คุณ" ถ้า AI ดันต่อชื่อติดกัน เช่น "คุณนนทพัทธ์" → "คุณ นนทพัทธ์"
    if (name && name !== 'ลูกค้า') {
        const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        out = out.replace(new RegExp(`คุณ(?!\\s)(?=${safeName})`, 'g'), 'คุณ ');
        // กรณีชื่อแรกอย่างเดียว
        const firstName = name.split(' ')[0];
        if (firstName && firstName !== name) {
            const safeFirst = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(`คุณ(?!\\s)(?=${safeFirst})`, 'g'), 'คุณ ');
        }
    }
    return out;
};

/** แปลงข้อความจาก DB → object ใน state (รองรับ meta_json + fallback parse) */
const mapStoredMessage = (msg) => {
    if (msg.role === 'user') {
        return { id: msg.id || null, role: 'user', text: msg.text };
    }
    const text = sanitizeAiText(msg.text);
    let meta = null;
    if (msg.meta_json) {
        try { meta = typeof msg.meta_json === 'string' ? JSON.parse(msg.meta_json) : msg.meta_json; } catch {}
    }
    if (meta?.parts?.length) {
        return {
            id: msg.id || null,
            role: 'assistant',
            text,
            parts: meta.parts,
            isSummary: !!meta.isSummary,
            isRedFlag: !!meta.isRedFlag,
            isReview: !!meta.isReview,
        };
    }
    const built = buildAssistantMeta(text);
    return {
        id: msg.id || null,
        role: 'assistant',
        text,
        parts: built.parts,
        isSummary: built.isSummary,
        isRedFlag: built.isRedFlag,
        isReview: built.isReview,
    };
};

/** ใช้ใน template — ใช้ parts ที่บันทึกไว้ก่อน แล้วค่อย parse ใหม่ */
const getMessageParts = (msg) => {
    if (msg.parts?.length) return msg.parts;
    return parseAiMessage(normalizeMessageText(msg.text));
};

// 🆕 guest mode: หน้านี้ใช้งานได้แม้ไม่ login → ตั้ง isGuest=true เงียบ ๆ ถ้าไม่ผ่าน
const isGuest = ref(false);
const fetchUserProfile = async () => {
    try {
        const res = await $fetch(apiUrl('vue-get-user-profile.php'), { credentials: 'include' });
        if (res?.status === 'success') {
            userProfile.value = res.data;
            const fullName = [res.data.firstname, res.data.lastname].filter(Boolean).join(' ').trim();
            const username = String(res.data.username_account || '').trim();
            if (fullName) userName.value = fullName;
            else if (username) userName.value = username;
            isGuest.value = false;
        } else {
            isGuest.value = true;
        }
    } catch (err) {
        isGuest.value = true;
        console.warn('Guest mode (no login):', err?.statusCode || err?.message || err);
    }
};

/* ================= Computed ================= */
const displayTitle = computed(() => {
    return `แชทต่อเนื่อง (ID: ${sessionId.value.substring(0, 8)}...)`;
});

/* ================= Helper Functions ================= */
/* 🪶 smart scroll — auto เฉพาะถ้าผู้ใช้ใกล้ล่าง / มีปุ่ม jump-to-bottom */
const NEAR_BOTTOM_THRESHOLD = 120;
const showJumpToBottom = ref(false);

const isNearBottom = () => {
    if (!chatScroll.value) return true;
    const el = chatScroll.value;
    return el.scrollHeight - (el.scrollTop + el.clientHeight) <= NEAR_BOTTOM_THRESHOLD;
};

const updateJumpButtonVisibility = () => {
    showJumpToBottom.value = !isNearBottom();
};

const scrollToBottom = async (force = false) => {
    await nextTick();
    if (!chatScroll.value) return;
    if (force || isNearBottom()) {
        chatScroll.value.scrollTo({ top: chatScroll.value.scrollHeight, behavior: 'smooth' });
        showJumpToBottom.value = false;
    } else {
        showJumpToBottom.value = true;
    }
};

const jumpToBottom = () => scrollToBottom(true);
const onChatScroll = () => updateJumpButtonVisibility();

const addMessage = async (role, text, extra = {}) => {
    let payload = { role, text, ...extra };
    if (role === 'assistant' && !payload.parts) {
        const built = buildAssistantMeta(text);
        payload = { ...built, ...payload, text };
    }
    chatMessages.value.push(payload);
    await saveMessageToDB(role, text, payload);
    await scrollToBottom();
};

/* ================= API / Database ================= */
const saveMessageToDB = async (role, message, extra = {}) => {
    try {
        const categoryName = symptomName.value || queryParam('category') || 'ทั่วไป';
        const body = {
            role: role,
            message: message,
            session_id: sessionId.value,
            symptom_name: categoryName,
        };
        if (role === 'assistant' && extra.parts?.length) {
            body.meta_json = JSON.stringify({
                parts: extra.parts,
                isSummary: !!extra.isSummary,
                isRedFlag: !!extra.isRedFlag,
                isReview: !!extra.isReview,
            });
        }

        await $fetch(`${useNuxtApp().$getApiBase()}/save-chat.php`, {
            method: 'POST',
            credentials: 'include',
            body,
        });
    } catch (err) {
        console.error("Failed to save chat:", err);
    }
};

/**
 * โหลดประวัติแชทตาม session_id
 * - ถ้ามี records → load มาแสดง
 * - ถ้าไม่มี records → ถือเป็นห้องใหม่ (ไม่ redirect ออก) เพื่อให้คุยต่อในหน้านี้ได้เลย
 */
const loadChatHistory = async (sid) => {
    isLoading.value = true;
    try {
        const res = await $fetch(`${useNuxtApp().$getApiBase()}/get-chat-detail.php?session_id=${sid}`, {
            credentials: 'include'
        });

        if (res?.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
            symptomName.value = res.symptom_name || symptomName.value || 'ทั่วไป';
            chatMessages.value = res.data.map(mapStoredMessage);
            await scrollToBottom();
            return true;
        }
        return false; // ห้องใหม่
    } catch (err) {
        console.error('Load history error:', err);
        return false;
    } finally {
        isLoading.value = false;
    }
};

/* ================= Main Chat Logic ================= */
const sendMessage = async (overrideText = null, isSilent = false) => {
    const textToSend = (overrideText || newMessage.value).trim();
    if (!textToSend || isLoading.value) return;

    if (!isSilent) {
        chatMessages.value.push({ role: 'user', text: textToSend });
        await saveMessageToDB('user', textToSend);
        if (!overrideText) newMessage.value = '';
        // อัพเดท sidebar สะท้อนความเปลี่ยนแปลง (delay เล็กน้อยให้ DB commit ทัน)
        setTimeout(() => loadSessionList(), 400);
    }

    isLoading.value = true;
    await scrollToBottom();

    // ข้อความ bootstrap (silent) จากระบบ → ข้าม classifier ส่งให้ AI ตรงๆ
    const classifyOpts = { messages: chatMessages.value, symptomName: symptomName.value };
    const kind = isSilent ? 'normal' : classifyInput(textToSend, classifyOpts);

    if (kind === 'redflag') {
        await addMessage('assistant', REPLY_REDFLAG, {
            isRedFlag: true,
            options: ['🚑 ติดต่อเภสัชกรของเราทันที']
        });
        isLoading.value = false;
        return;
    }

    if (kind === 'irrelevant') {
        await addMessage('assistant', REPLY_IRRELEVANT);
        isLoading.value = false;
        return;
    }

    if (kind === 'thanks') {
        await addMessage('assistant', REPLY_THANKS, {
            isReview: true,
            options: ['⭐ เขียนรีวิวให้เรา']
        });
        isLoading.value = false;
        return;
    }

    try {
        const profileLine = buildProfileContext();
        const screeningHint = buildScreeningHint(chatMessages.value, symptomName.value);
        const enhancedInput = [profileLine, screeningHint, textToSend].filter(Boolean).join('\n\n');
        const response = await $fetch(useNuxtApp().$n8nChatUrl(), {
            method: 'POST',
            timeout: 180000, // Ollama อาจใช้เวลา 30–120 วินาที (ครั้งแรกช้ากว่า)
            body: {
                chatInput: enhancedInput,
                sessionId: sessionId.value,
                userName: userName.value
            }
        });

        const rawOutput = response.output || 'ขออภัยค่ะ AI ตอบไม่ได้ในตอนนี้ ลองพิมพ์อาการของคุณใหม่อีกครั้งนะคะ';
        const aiOutput = sanitizeAiText(stripOffTopicLeak(rawOutput, textToSend, classifyOpts));
        const meta = buildAssistantMeta(aiOutput);

        await addMessage('assistant', aiOutput, {
            options: meta.isReview ? [] : (response.options || []),
            isSummary: response.isFinalSummary || meta.isSummary,
            isRedFlag: meta.isRedFlag,
            isReview: meta.isReview,
            parts: meta.parts,
        });

        // ถ้าเป็นข้อความสรุป → ส่งข้อความเชิญเขียนรีวิวตามมา
        if ((response.isFinalSummary || meta.isSummary) && !meta.isRedFlag) {
            await new Promise(r => setTimeout(r, 800));
            const thxName = displayUserName.value;
            await addMessage('assistant',
                `ขอบคุณที่ใช้บริการ telebot ครับ คุณ ${thxName} 🙏\n\nหากมีเวลาสักครู่ รบกวนฝากรีวิวและให้คะแนนการบริการของเราหน่อยนะครับ ความคิดเห็นของคุณ ${thxName} ช่วยให้เราพัฒนาบริการได้ดียิ่งขึ้นครับ`,
                {
                    isReview: true,
                    options: []
                }
            );
        }
    } catch (err) {
        console.error('[AI Chat]', err);
        const hint = err?.statusCode === 502
            ? ' (ตรวจว่า n8n เปิดอยู่และ workflow ถูก Activate)'
            : '';
        await addMessage('assistant', `ไม่สามารถเชื่อมต่อ AI ได้ในขณะนี้ค่ะ${hint} ลองใหม่อีกครั้งนะคะ`);
    } finally {
        isLoading.value = false;
        await scrollToBottom();
    }
};

const handleOptionClick = (option) => {
    if (option.includes('รีวิว')) {
        router.push('/review_write');
    } else if (option.includes('เภสัชกร') || option.includes('🚑')) {
        goToPharmacist();
    } else if (option.includes('หน้าหลัก')) {
        router.push('/');
    } else {
        sendMessage(option);
    }
};

const initSessionFromRoute = async () => {
    let sid = queryParam('session_id');
    let category = queryParam('category');
    if (!category && sid && import.meta.client) {
        try { category = sessionStorage.getItem(sessionCategoryKey(sid)) || ''; } catch {}
    }
    symptomName.value = category || 'ทั่วไป';

    if (!sid) {
        sid = `session-${Math.random().toString(36).substring(2, 9)}`;
        router.replace({
            path: '/user/chat-history',
            query: buildChatHistoryQuery({ session_id: sid }),
        });
    }
    sessionId.value = sid;
    persistActiveBotSession(sid);
    rememberGuestSession(sid);

    chatMessages.value = []; // เคลียร์ก่อนโหลดของใหม่
    const hasHistory = await loadChatHistory(sid);
    syncCategoryToUrl();

    if (!hasHistory) {
        const categoryForGreet = queryParam('category') || symptomName.value;
        const searchVal = queryParam('search');
        if (categoryForGreet && categoryForGreet !== 'ทั่วไป') {
            await sendMessage(`สวัสดี telebot ฉันมีอาการ: ${categoryForGreet} กรุณาเริ่มซักประวัติทีละข้อ`, true);
        } else if (searchVal) {
            await sendMessage(`สวัสดี telebot ฉันมีอาการเกี่ยวกับ ${searchVal} กรุณาเริ่มซักประวัติทีละข้อ`, true);
        }
        // ไม่ auto-greet ถ้าไม่มี category/search → ปล่อยให้ user พิมพ์เอง
    }
};

onMounted(async () => {
    if (import.meta.client) {
        try {
            const storedUser = JSON.parse(localStorage.getItem('user_data') || 'null');
            if (storedUser?.username) userName.value = storedUser.username;
        } catch {}
    }
    await fetchUserProfile();
    await initSessionFromRoute();
    // โหลด sidebar รายการแชทคู่ขนาน
    loadSessionList();
});

// 🆕 เมื่อ user คลิก session ใน sidebar → URL query.session_id เปลี่ยน → โหลดใหม่
watch(() => queryParam('session_id'), (newSid, oldSid) => {
    if (!newSid || newSid === oldSid || newSid === sessionId.value) return;
    initSessionFromRoute();
});
</script>

<template>
    <div class="user-layout chat-history-page">
        <Header />

        <!-- Mobile topbar — hamburger + ชื่ออาการ -->
        <div class="mobile-topbar">
            <button class="hamburger" @click="openSidebar" aria-label="เปิดเมนู">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">
                <i class="fa-solid fa-comment-medical"></i>
                <span>{{ symptomName ? `อาการ: ${symptomName}` : 'แชทต่อเนื่อง' }}</span>
            </div>
        </div>

        <div class="main-content">
            <transition name="fade-bd">
                <div v-if="isSidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
            </transition>

            <!-- 🆕 Sidebar สไตล์ ChatGPT — รายการแชททั้งหมด เลือกได้, hover ลบได้ -->
            <aside class="sidebar sidebar--chatgpt" :class="{ 'is-open': isSidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-comments"></i>
                    <span>แชทของฉัน</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <button class="btn-new-chat" @click="startNewChat">
                    <i class="fa-solid fa-plus"></i>
                    <span>เริ่มแชทใหม่</span>
                </button>

                <div class="session-list-header">
                    <span><i class="fa-regular fa-clock"></i> ประวัติแชท</span>
                    <span class="session-count">{{ sessionList.length }}</span>
                </div>

                <div class="session-list">
                    <div v-if="isLoadingSessions" class="session-empty">
                        <i class="fa-solid fa-spinner fa-spin"></i> โหลด…
                    </div>
                    <div v-else-if="sessionList.length === 0" class="session-empty">
                        <i class="fa-regular fa-folder-open"></i>
                        <span>ยังไม่มีประวัติ</span>
                    </div>
                    <div
                        v-for="s in sessionList"
                        :key="s.session_id"
                        class="session-item"
                        :class="{ 'session-item--active': isActiveSession(s.session_id) }"
                        @click="openSession(s.session_id)"
                        :title="s.symptom_name"
                    >
                        <div class="session-item__icon">
                            <i class="fa-solid fa-comment-medical"></i>
                        </div>
                        <div class="session-item__body">
                            <div class="session-item__title-row">
                                <div class="session-item__title">{{ s.symptom_name }}</div>
                                <span v-if="s.round_total > 1" class="session-item__round">รอบ {{ s.round_no }}</span>
                            </div>
                            <div class="session-item__preview">{{ previewSessionMsg(s.first_message) }}</div>
                            <div class="session-item__meta">
                                <span>{{ s.message_count }} ข้อ</span>
                                <span>{{ formatSessionTimeShort(s.last_at) }}</span>
                            </div>
                        </div>
                        <button
                            class="session-item__delete"
                            :disabled="deletingSession === s.session_id"
                            @click="deleteSession(s, $event)"
                            :title="'ลบแชทนี้'"
                        >
                            <i v-if="deletingSession === s.session_id" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>

            </aside>

            <section class="chat-section">
                <div class="chat-container">
                    <!-- Chat Header: ข้อมูลระบบและ Session ID -->
                    <div class="chat-header">
                        <div class="pharma-profile">
                            <div class="status-dot online"></div>
                            <div>
                                <h3>telebot — ผู้ช่วยปรึกษาอาการ AI</h3>
                                <small class="session-id" v-if="symptomName">อาการ: {{ symptomName }}</small>
                            </div>
                        </div>

                        <div class="header-actions">
                            <button class="real-pharma-btn" @click="goToPharmacist">
                                <i class="fa-solid fa-user-doctor"></i> ปรึกษาเภสัชกร (คนจริง)
                            </button>
                        </div>
                    </div>

                    <!-- Chat Messages: พื้นที่แสดงการสนทนา -->
                    <div class="chat-messages" ref="chatScroll" @scroll.passive="onChatScroll">
                        <div v-for="(msg, index) in chatMessages" :key="msg.id || index" class="message-group">
                            <div :class="[
                                'message-bubble',
                                msg.role === 'user' ? 'me' : 'pharma',
                                {
                                    'summary-box': msg.isSummary,
                                    'red-flag-box': msg.isRedFlag,
                                    'thanks-bubble': msg.isReview
                                }
                            ]">
                                <!-- Header ของ Bubble ตามประเภทเนื้อหา -->
                                <strong v-if="msg.isRedFlag">🚨 คำเตือนอาการฉุกเฉิน</strong>
                                <strong v-else-if="msg.isSummary">📋 สรุปผลการประเมินอาการ</strong>
                                <div v-else-if="msg.isReview" class="thanks-header">
                                    <span class="thanks-header__icon">🙏</span>
                                    <span class="thanks-header__title">ขอบคุณที่ใช้บริการ</span>
                                    <span class="thanks-header__badge">⭐</span>
                                </div>

                                <!-- เนื้อหาข้อความ -->
                                <div class="text" v-if="msg.role === 'user'" style="white-space: pre-line;">{{ msg.text }}</div>
                                <div class="text ai-text" v-else>
                                    <template v-for="(part, i) in getMessageParts(msg)" :key="i">
                                        <div v-if="part.type === 'question_block'" class="q-block">
                                            <div class="q-line">🩺 ข้อ {{ part.number }}: {{ part.header }}?</div>
                                            <div class="sub-q-list">
                                                <div
                                                    v-for="(sub, si) in part.subQuestions"
                                                    :key="si"
                                                    class="sub-q-item"
                                                >
                                                    <div class="sub-q-text">
                                                        • {{ sub.text }}?
                                                        <span v-if="sub.hint" class="sub-q-hint">(เช่น {{ sub.hint }})</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="q-input-hint">✍️ กรุณาพิมพ์คำตอบในช่องด้านล่างได้เลยครับ</div>
                                        </div>
                                        <div v-else-if="part.type === 'question'" class="q-block">
                                            <div class="q-line">
                                                {{ part.text }}
                                                <span v-if="part.hint" class="q-line-hint">(เช่น {{ part.hint }})</span>
                                            </div>
                                            <div class="q-input-hint">✍️ กรุณาพิมพ์คำตอบในช่องด้านล่างได้เลยครับ</div>
                                        </div>
                                        <div v-else-if="part.type === 'ack'" class="ack-line">{{ part.text }}</div>
                                        <div v-else class="t-line">{{ part.text }}</div>
                                    </template>
                                </div>

                                <!-- ส่วนของ Action Buttons ภายใน Bubble -->
                                <div v-if="msg.isRedFlag" class="bubble-action-area">
                                    <hr>
                                    <p>เพื่อความปลอดภัย กรุณาพบผู้เชี่ยวชาญทันที:</p>
                                    <button @click="goToPharmacist" class="action-link-btn">
                                        ไปหน้าแชทเภสัชกร (คลิก) 👩‍⚕️
                                    </button>
                                </div>

                                <!-- ✨ ปุ่ม Action ในข้อความขอบคุณ -->
                                <div v-if="msg.isReview" class="thanks-actions">
                                    <div class="thanks-stars">
                                        <span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span>
                                    </div>
                                    <NuxtLink to="/review_write" class="thanks-action-btn thanks-action-btn--primary">
                                        <i class="fa-solid fa-pen-to-square"></i>
                                        เขียนรีวิวให้คะแนน
                                    </NuxtLink>
                                    <a href="#" class="thanks-action-btn thanks-action-btn--secondary" @click.prevent="goToPharmacist">
                                        <i class="fa-solid fa-user-doctor"></i>
                                        ปรึกษาเภสัชกร
                                    </a>
                                </div>
                            </div>

                            <div v-if="msg.options && msg.options.length > 0 && !msg.isReview" class="options-grid">
                                <button 
                                    v-for="opt in msg.options" 
                                    :key="opt" 
                                    class="choice-btn" 
                                    @click="handleOptionClick(opt, msg)" 
                                    :disabled="isLoading"
                                >
                                    {{ opt }}
                                </button>
                            </div>
                        </div>

                        <div v-if="isLoading" class="message-bubble pharma loading-bubble">
                            <div class="loading-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </div>
                        </div>
                    </div>

                    <!-- Input Area: ส่วนรับข้อความ -->
                    <div class="chat-input-area">
                        <input 
                            type="text" 
                            v-model="newMessage" 
                            placeholder="พิมพ์ตอบ หรือเลือกตัวเลือกด้านบน..."
                            @keyup.enter="sendMessage()" 
                            :disabled="isLoading"
                        >
                        <button class="btn-send" @click="sendMessage()" :disabled="isLoading || !newMessage.trim()">
                            ส่ง ✈️
                        </button>
                    </div>
                </div>
            </section>
        </div>
        <Footer />
    </div>
</template>

