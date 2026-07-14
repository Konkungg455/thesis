<script setup>
import { ref, onMounted, nextTick, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

/* ================= State & Data ================= */
const newMessage = ref('');
const chatScroll = ref(null);
const isLoading = ref(false);
const userName = ref('คุณลูกค้า');
const userProfile = ref(null); // ข้อมูลโปรไฟล์เต็ม (ส่งให้ AI ใช้)

const chatMessages = ref([]);
// สร้าง Session ID แบบสุ่มสำหรับการคุยรอบนั้นๆ
const sessionId = ref("session-" + Math.random().toString(36).substring(7));

// 🆕 จำ session ปัจจุบันไว้ใน localStorage — เพื่อให้หน้าถัดไปที่กดปรึกษาเภสัช
//    (location → pharma_waiting) ส่ง session นี้ไปบันทึกใน consult_requests
//    ฝั่งเภสัชจะได้เปิดดูประวัติแชทตรง session ที่ผู้ป่วยกำลังคุยอยู่ตอนกด
const persistActiveBotSession = (sid) => {
    if (!import.meta.client || !sid) return
    try { localStorage.setItem('telebot_active_bot_session', sid) } catch {}
}
const goToPharmacist = () => {
    persistActiveBotSession(sessionId.value);
    try { localStorage.removeItem('telebot_skip_delivery_fee'); } catch {}
    router.push({
        path: '/pharmacist/location',
        query: sessionId.value ? { bot_session_id: sessionId.value } : {}
    });
};

/** อาการฉุกเฉิน → ไปหน้าเลือกเภสัชใกล้คุณ (พร้อม bot_session) */
const goToEmergency = async () => {
    persistActiveBotSession(sessionId.value);
    try { localStorage.setItem('telebot_skip_delivery_fee', '1'); } catch {}
    const q = {
        initialRadius: '500',
        fallbackRadius: '1000',
        emergency: '1',
        ...(sessionId.value ? { bot_session_id: sessionId.value } : {}),
    };

    const pushPhamacy = (lat, lng) => {
        router.push({
            path: '/user/phamacy',
            query: {
                ...q,
                lat: String(lat),
                lng: String(lng),
            },
        });
    };

    try {
        if (!import.meta.client || !navigator.geolocation) {
            pushPhamacy(14.3654, 100.4872);
            return;
        }
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 120000,
            });
        });
        pushPhamacy(pos.coords.latitude, pos.coords.longitude);
    } catch {
        // GPS ไม่ได้ → ใช้พิกัดสำรองแล้วให้เลือกเภสัชได้ทันที
        pushPhamacy(14.3654, 100.4872);
    }
};

const { apiUrl } = useApiBase();
const { saveMessage: saveChatMessage, rememberGuestSession } = useChatApi();

/* ================= Sidebar mobile drawer ================= */
const isSidebarOpen = ref(false);
const openSidebar = () => { isSidebarOpen.value = true; };
const closeSidebar = () => { isSidebarOpen.value = false; };

/** ชื่อ-นามสกุลเต็ม จากโปรไฟล์ (เช่น "นนทพัทธ์ เผือกประพันธุ์") */
const profileFullName = computed(() => {
    const p = userProfile.value;
    if (!p) return '';
    const first = String(p.firstname || '').trim();
    const last = String(p.lastname || '').trim();
    const full = [first, last].filter(Boolean).join(' ');
    if (full) return full;
    return String(p.username_account || '').trim();
});

/** สร้าง [PROFILE] string สั้นๆ แนบไปกับข้อความผู้ใช้ */
const buildProfileContext = () => {
    const p = userProfile.value;
    if (!p) return '';
    const v = (x) => (x !== null && x !== undefined && String(x).trim() !== '' ? String(x).trim() : '-');
    const fullName = profileFullName.value || v(p.username_account);
    const callName = fullName !== '-' ? fullName : 'ลูกค้า';
    return `[PROFILE] ชื่อ-นามสกุล: ${fullName} | อายุ: ${v(p.old)} | เพศ: ${v(p.gender)} | ส่วนสูง: ${v(p.height)} | น้ำหนัก: ${v(p.weight)} | โรคประจำตัว: ${v(p.personal_disease)}\n[คำสั่งเรียกชื่อ] ตลอดการสนทนา ห้ามใช้คำว่า "User" เด็ดขาด — ต้องเรียกผู้ใช้ว่า "คุณ ${callName}" (มีเว้นวรรคหลังคำว่า "คุณ") หรือ "คุณ" เท่านั้น (ตัวอย่างที่ถูกต้อง: "คุณ ${callName}", "สรุปอาการเบื้องต้นของคุณ ${callName}", "ความคิดเห็นของคุณ ${callName}")`;
};

/** ชื่อแสดงบนหน้าเว็บ (ใช้ชื่อ-นามสกุลเต็ม) */
const displayUserName = computed(() => {
    if (profileFullName.value) return profileFullName.value;
    if (userName.value && userName.value !== 'คุณลูกค้า') return userName.value;
    return 'ลูกค้า';
});

/** 🛡️ Safety net — แทนที่คำว่า "User" ที่ AI ตอบกลับมา ด้วยชื่อ-นามสกุลเต็ม (มีเว้นวรรคหลัง คุณ เสมอ) */
const sanitizeAiText = (text) => {
    if (!text) return text;
    const name = profileFullName.value || displayUserName.value || 'ลูกค้า';
    const callName = `คุณ ${name}`;
    let out = String(text);
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
        const firstName = name.split(' ')[0];
        if (firstName && firstName !== name) {
            const safeFirst = firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(`คุณ(?!\\s)(?=${safeFirst})`, 'g'), 'คุณ ');
        }
    }
    return rewritePharmacyConsultCta(out);
};

/** ตรวจว่าเป็นข้อความขอบคุณ/รีวิวหรือไม่ */
const isThanksOrReviewText = (text) => {
    if (!text) return false;
    const t = String(text);
    return /ขอบคุณที่ใช้บริการ|รบกวนฝากรีวิว|เขียนรีวิว|ให้คะแนน|ฝากรีวิว|ขอบคุณค่ะ|ด้วยความยินดี/i.test(t);
};

// 🆕 guest mode: หน้านี้เปิดได้โดยไม่ต้องล็อกอิน
//    - ถ้า fetch profile ไม่ผ่าน → ใช้ค่า default "คุณลูกค้า" / "ผู้ใช้ทั่วไป"
//    - ไม่ throw / ไม่ redirect ใด ๆ
const isGuest = ref(false);
const fetchUserProfile = async () => {
    try {
        const res = await $fetch(apiUrl('vue-get-user-profile.php'), { credentials: 'include' });
        if (res?.status === 'success') {
            userProfile.value = res.data;
            try {
                const stored = JSON.parse(localStorage.getItem('user_data') || 'null') || {};
                if (res.data?.gender != null && String(res.data.gender).trim() !== '') {
                    stored.gender = res.data.gender;
                }
                if (res.data?.id_account) stored.id_account = res.data.id_account;
                if (res.data?.firstname) stored.firstname = res.data.firstname;
                if (res.data?.lastname) stored.lastname = res.data.lastname;
                localStorage.setItem('user_data', JSON.stringify(stored));
            } catch { /* ignore */ }
            const fullName = [res.data.firstname, res.data.lastname].filter(Boolean).join(' ').trim();
            const username = String(res.data.username_account || '').trim();
            // ใช้ชื่อ-นามสกุลเต็มก่อน เพราะ AI ต้องเรียกชื่อจริง
            if (fullName) userName.value = fullName;
            else if (username) userName.value = username;
            isGuest.value = false;
        } else {
            // backend คืน error (เช่น "กรุณาเข้าสู่ระบบ") → ใช้โหมด guest
            isGuest.value = true;
        }
    } catch (err) {
        // 401 / network error → ใช้โหมด guest แทน
        isGuest.value = true;
        console.warn('Guest mode (no login):', err?.statusCode || err?.message || err);
    }
};

/* ================= Computed (หัวข้อเปลี่ยนตาม Query) ================= */
const displayTitle = computed(() => {
    const category = route.query.category;
    const search = route.query.search;
    if (category) return `ปรึกษาอาการ: ${category}`;
    if (search) return `ผลการค้นหา: ${search}`;
    return 'ปรึกษาเภสัชกร AI';
});

/* ================= ฟังก์ชันบันทึกลง Supabase (ผ่าน Nuxt API — ไม่ต้องเปิด XAMPP) ================= */
const saveMessageToDB = async (role, message, extra = {}) => {
    try {
        const body = {
            role: role,
            message: message,
            session_id: sessionId.value,
            symptom_name: route.query.category || 'ทั่วไป',
        };
        if (role === 'assistant' && extra.parts?.length) {
            body.meta_json = JSON.stringify({
                parts: extra.parts,
                isSummary: !!extra.isSummary,
                isRedFlag: !!extra.isRedFlag,
                isReview: !!extra.isReview,
            });
        }
        rememberGuestSession(sessionId.value);
        await saveChatMessage(body);
    } catch (err) {
        console.error("Failed to save chat history:", err);
    }
};

/* ================= ฟังก์ชันหลัก (ส่งข้อความเชื่อม n8n + Logic ต่างๆ) ================= */

const { classifyInput, parseAiMessage, getOptions, buildAssistantMeta, normalizeMessageText, stripOffTopicLeak, buildScreeningHint, getFixedScreeningReply, coerceSummaryOrPass, buildSummaryChatInput, getChatProgress, buildOffSymptomReply, rewritePharmacyConsultCta, resolveUserGender, adaptScreeningPartsForGender, REPLY_REDFLAG, REPLY_IRRELEVANT, REPLY_PROFANITY, REPLY_THANKS } = useAiChatRules();

const getMessageParts = (msg) => {
    const raw = msg.parts?.length ? msg.parts : parseAiMessage(normalizeMessageText(msg.text));
    return adaptScreeningPartsForGender(
        raw,
        route.query.category,
        resolveUserGender(userProfile.value),
    );
};

const pushAssistant = async (text, extra = {}) => {
    let payload = { role: 'assistant', text, ...extra };
    if (!payload.parts) {
        const built = buildAssistantMeta(text);
        payload = { ...built, ...payload, text };
    }
    chatMessages.value.push(payload);
    await saveMessageToDB('assistant', text, payload);
    // 🚫 ไม่เลื่อนลงเองตอน AI ตอบ — แค่โชว์ปุ่ม "ไปข้อความล่าสุด" ถ้าผู้ใช้เลื่อนอ่านอยู่ด้านบน
    await nextTick();
    updateJumpButtonVisibility();
};

const sendMessage = async (overrideText = null, isSilent = false) => {
    const textToSend = (overrideText || newMessage.value).trim();
    if (!textToSend || isLoading.value) return;

    if (!isSilent) {
        chatMessages.value.push({ role: 'user', text: textToSend });
        await saveMessageToDB('user', textToSend);
    }
    newMessage.value = '';
    isLoading.value = true;
    // เลื่อนลงเฉพาะตอน "ผู้ใช้กดส่งเอง" (ไม่ใช่ข้อความ bootstrap ของระบบ)
    if (!isSilent) await scrollToBottom(true);

    // ข้อความ bootstrap (silent) จากระบบ → ข้าม classifier ส่งให้ AI ตรงๆ
    const classifyOpts = { messages: chatMessages.value, symptomName: route.query.category };
    const kind = isSilent ? 'normal' : classifyInput(textToSend, classifyOpts);

    if (kind === 'redflag') {
        await new Promise(r => setTimeout(r, 400));
        await pushAssistant(REPLY_REDFLAG, {
            isRedFlag: true,
            options: ['🚑 ติดต่อเภสัชกรของเราทันที']
        });
        isLoading.value = false;
        return;
    }

    if (kind === 'profanity') {
        const last = chatMessages.value[chatMessages.value.length - 1];
        if (last?.role === 'user') last.skipProgress = true;
        await new Promise(r => setTimeout(r, 400));
        await pushAssistant(REPLY_PROFANITY);
        isLoading.value = false;
        return;
    }

    if (kind === 'irrelevant') {
        const last = chatMessages.value[chatMessages.value.length - 1];
        if (last?.role === 'user') last.skipProgress = true;
        await new Promise(r => setTimeout(r, 400));
        await pushAssistant(REPLY_IRRELEVANT);
        isLoading.value = false;
        return;
    }

    if (kind === 'off_topic_symptom') {
        const last = chatMessages.value[chatMessages.value.length - 1];
        if (last?.role === 'user') last.skipProgress = true;
        await new Promise(r => setTimeout(r, 400));
        await pushAssistant(buildOffSymptomReply(route.query.category));
        isLoading.value = false;
        return;
    }

    if (kind === 'thanks') {
        await new Promise(r => setTimeout(r, 400));
        await pushAssistant(REPLY_THANKS, {
            isReview: true,
            options: ['⭐ เขียนรีวิวให้เรา']
        });
        isLoading.value = false;
        return;
    }

    try {
        // คำถามข้อ 1–5 ใช้ชุด fix — ไม่เรียก AI
        const fixed = getFixedScreeningReply(chatMessages.value, route.query.category, {
            gender: resolveUserGender(userProfile.value),
            profile: userProfile.value,
        });
        if (fixed?.text) {
            await new Promise(r => setTimeout(r, 350));
            await pushAssistant(fixed.text);
            isLoading.value = false;
            await nextTick();
            updateJumpButtonVisibility();
            return;
        }

        const progress = getChatProgress(chatMessages.value);
        const profileLine = buildProfileContext();
        const chatUser = profileUsername.value || userName.value || 'guest';
        // ครบ 5 ข้อ → ให้ AI เขียนสรุปเอง (ไม่ใช้เทมเพลต fix)
        const enhancedInput = (progress.readyForSummary || progress.highestAsked >= 5)
            ? buildSummaryChatInput(chatMessages.value, route.query.category, profileLine, textToSend)
            : [profileLine, buildScreeningHint(chatMessages.value, route.query.category), textToSend].filter(Boolean).join('\n\n');

        const response = await $fetch(useNuxtApp().$n8nChatUrl(), {
            method: 'POST',
            timeout: 180000,
            body: {
                chatInput: enhancedInput,
                sessionId: sessionId.value,
                user: chatUser,
                userName: chatUser,
                symptom: String(route.query.category || ''),
                category: String(route.query.category || ''),
            }
        });

        let rawOutput = response.output || 'ขออภัยค่ะ AI ตอบไม่ได้ในตอนนี้ ลองพิมพ์อาการของคุณใหม่อีกครั้งนะคะ';
        const coerced = coerceSummaryOrPass(chatMessages.value, route.query.category, rawOutput);
        rawOutput = coerced.text;
        const aiOutput = sanitizeAiText(stripOffTopicLeak(rawOutput, textToSend, classifyOpts));
        const meta = buildAssistantMeta(aiOutput);
        const isSummary = response.isFinalSummary || meta.isSummary || coerced.isSummary
            || progress.readyForSummary || progress.highestAsked >= 5;

        await pushAssistant(aiOutput, {
            options: meta.isReview ? [] : (response.options || []),
            isSummary,
            isRedFlag: meta.isRedFlag,
            isReview: meta.isReview,
            parts: meta.parts,
        });

        if (isSummary && !meta.isRedFlag) {
            await new Promise(r => setTimeout(r, 800));
            const thxName = displayUserName.value;
            await pushAssistant(
                `ขอบคุณที่ใช้บริการ telebot ครับ คุณ ${thxName} 🙏\n\nหากมีเวลาสักครู่ รบกวนฝากรีวิวและให้คะแนนการบริการของเราหน่อยนะครับ ความคิดเห็นของคุณ ${thxName} ช่วยให้เราพัฒนาบริการได้ดียิ่งขึ้นครับ`,
                {
                    isReview: true,
                    options: []
                }
            );
        }
    } catch (err) {
        console.error('[AI Chat]', err);
        await pushAssistant(getAiChatErrorMessage(err));
    } finally {
        isLoading.value = false;
        // 🚫 ไม่บังคับเลื่อนลงหลัง AI ตอบเสร็จ — ปล่อยให้ผู้ใช้เลื่อนเอง
        await nextTick();
        updateJumpButtonVisibility();
    }
};

/* ================= Lifecycle & Helpers ================= */

/* 🪶 smart scroll — เลื่อนลงให้อัตโนมัติเฉพาะกรณีผู้ใช้อยู่ใกล้ล่าง
 *   ถ้าผู้ใช้เลื่อนขึ้นไปอ่านข้างบน จะไม่บังคับเลื่อน
 *   ผู้ใช้สามารถกดปุ่ม "เลื่อนล่างสุด" เพื่อเลื่อนเองได้
 */
const NEAR_BOTTOM_THRESHOLD = 120; // px — ห่างจากล่างไม่เกิน 120px ถือว่า "ใกล้ล่าง"
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
    // ✅ scroll อัตโนมัติ "เฉพาะ" ถ้า user อยู่ใกล้ล่างอยู่แล้ว — หรือบังคับ
    if (force || isNearBottom()) {
        chatScroll.value.scrollTo({ top: chatScroll.value.scrollHeight, behavior: 'smooth' });
        showJumpToBottom.value = false;
    } else {
        showJumpToBottom.value = true;
    }
};

const jumpToBottom = () => scrollToBottom(true);

const onChatScroll = () => {
    updateJumpButtonVisibility();
};

onMounted(async () => {
    // 🛡️ guard SSR: localStorage มีเฉพาะบน client
    if (import.meta.client) {
        try {
            const storedUser = JSON.parse(localStorage.getItem('user_data') || 'null');
            if (storedUser?.username) userName.value = storedUser.username;
        } catch {}
        // 🆕 บันทึก session ปัจจุบันลง localStorage ทันที — เผื่อกด "ปรึกษาเภสัช" จาก path อื่น
        persistActiveBotSession(sessionId.value);
    }
    await fetchUserProfile();

    const category = route.query.category;
    const searchVal = route.query.search;

    if (category) {
        await sendMessage(`สวัสดี telebot ฉันมีอาการ: ${category} กรุณาเริ่มซักประวัติทีละข้อ`, true);
    } else if (searchVal) {
        await sendMessage(searchVal);
    } else {
        await sendMessage('สวัสดี telebot ฉันต้องการปรึกษาอาการ กรุณาเริ่มทักทายและถามอาการ', true);
    }
});
</script>

<template>
    <div class="user-layout">
        <Header />

        <!-- Mobile topbar — hamburger + ชื่อหัวข้อ -->
        <div class="mobile-topbar">
            <button class="hamburger" @click="openSidebar" aria-label="เปิดเมนู">
                <i class="fa-solid fa-bars"></i>
            </button>
            <div class="mobile-title">
                <i class="fa-solid fa-robot"></i>
                <span>{{ displayTitle }}</span>
            </div>
        </div>

        <div class="main-content">
            <transition name="fade-bd">
                <div v-if="isSidebarOpen" class="sidebar-backdrop" @click="closeSidebar"></div>
            </transition>

            <aside class="sidebar" :class="{ 'is-open': isSidebarOpen }">
                <div class="sidebar-brand">
                    <i class="fa-solid fa-robot"></i>
                    <span>เมนูปรึกษา AI</span>
                    <button class="sidebar-close" @click="closeSidebar" aria-label="ปิดเมนู">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="menu-item active" @click="closeSidebar">
                    <i class="fa-solid fa-comment-medical"></i>
                    <span>{{ displayTitle }}</span>
                </div>

                <div class="menu-item" @click="router.push('/user/history'); closeSidebar();">
                    <i class="fa-solid fa-clock-rotate-left"></i> ประวัติการปรึกษา
                </div>
                <div class="sidebar-filler"></div>
            </aside>

            <section class="chat-section">
                <div class="chat-container">
                    <div class="chat-header">
                        <div class="pharma-profile">
                            <div class="status-dot online"></div>
                            <h3>telebot — ผู้ช่วยปรึกษาอาการ AI</h3>
                        </div>

                        <div class="header-actions">
                            <button class="real-pharma-btn" @click="goToPharmacist">
                                <i class="fa-solid fa-user-doctor"></i> ปรึกษาเภสัชกร (คนจริง)
                            </button>
                        </div>
                    </div>

                    <div class="chat-messages" ref="chatScroll" @scroll.passive="onChatScroll">
                        <div v-for="(msg, index) in chatMessages" :key="index" class="message-group">
                            <div :class="[
                                'message-bubble',
                                msg.role === 'user' ? 'me' : 'pharma',
                                {
                                    'summary-box': msg.isSummary,
                                    'red-flag-box': msg.isRedFlag,
                                    'thanks-bubble': msg.isReview
                                }
                            ]">
                                <strong v-if="msg.isRedFlag">🚨 คำเตือนอาการฉุกเฉิน</strong>
                                <strong v-else-if="msg.isSummary">📋 สรุปผลการประเมินอาการ</strong>
                                <div v-else-if="msg.isReview" class="thanks-header">
                                    <span class="thanks-header__icon">🙏</span>
                                    <span class="thanks-header__title">ขอบคุณที่ใช้บริการ</span>
                                    <span class="thanks-header__badge">⭐</span>
                                </div>

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
                                        <div v-else-if="part.type === 'section_title'" class="summary-section-title">{{ part.text }}</div>
                                        <div v-else-if="part.type === 'list_item'" class="summary-list-item">
                                            <span class="summary-list-num">{{ part.number ? part.number + '.' : '•' }}</span>
                                            <span class="summary-list-text">{{ part.text }}</span>
                                        </div>
                                        <div v-else class="t-line">{{ part.text }}</div>
                                    </template>
                                </div>

                                <div v-if="msg.isRedFlag" class="red-flag-action">
                                    <p>กรุณาติดต่อเภสัชกรของเราโดยด่วน:</p>
                                    <a href="#" class="chat-redirect-link" @click.prevent="goToEmergency">
                                        🚑 ติดต่อเภสัชกรของเราทันที
                                    </a>
                                </div>

                                <!-- ✨ พื้นที่ปุ่ม Action สำหรับข้อความขอบคุณ -->
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
                                <button v-for="opt in msg.options" :key="opt" class="choice-btn" @click="
                                    opt.includes('รีวิว') ? router.push('/review_write') :
                                        msg.isRedFlag || opt.includes('ติดต่อเภสัชกรของเราทันที') || opt.includes('🚑') ? goToEmergency() :
                                            opt.includes('เภสัชกร') ? goToPharmacist() :
                                                sendMessage(opt)
                                    " :disabled="isLoading">
                                    {{ opt }}
                                </button>
                            </div>
                        </div>

                        <div v-if="isLoading" class="message-bubble pharma">
                            <div class="text loading-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </div>
                        </div>
                    </div>

                    <transition name="fade">
                        <button
                            v-if="showJumpToBottom"
                            type="button"
                            class="chat-jump-btn"
                            title="ไปข้อความล่าสุด"
                            @click="jumpToBottom"
                        >
                            <i class="fa-solid fa-arrow-down"></i>
                        </button>
                    </transition>

                    <div class="chat-input-area">
                        <input type="text" v-model="newMessage" placeholder="พิมพ์ตอบ หรือเลือก Choice ด้านบน..."
                            @keyup.enter="sendMessage()" :disabled="isLoading">
                        <button class="btn-send" @click="sendMessage()" :disabled="isLoading">
                            ส่ง ✈️
                        </button>
                    </div>
                </div>
            </section>
        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import "@/assets/chat_bot.css";

/* 🚩 เพิ่ม CSS สำหรับปุ่มทางด้านขวา */
.chat-header {
    display: flex;
    justify-content: space-between; /* ดันโปรไฟล์ไปซ้าย ดันปุ่มไปขวา */
    align-items: center;
    padding: 0 20px;
}

.header-actions {
    display: flex;
    align-items: center;
}

.real-pharma-btn {
    background: #e1effe;
    color: #1a56db;
    border: 1px solid #bfdbfe;
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
}

.real-pharma-btn:hover {
    background: #1a56db;
    color: white;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.real-pharma-btn i {
    font-size: 1rem;
}

/* === Highlight คำถาม "ข้อ N: ..." ของ AI === */
.ai-text .t-line {
    line-height: 1.6;
    min-height: 0.6em;
}
.ai-text .ack-line {
    color: #6b7280;
    font-size: 0.85rem;
    font-style: italic;
    margin: 6px 0 2px;
}
.ai-text .q-block {
    margin: 12px 0 8px;
    padding: 0;
}
.ai-text .q-line {
    display: block;
    background: linear-gradient(135deg, #2563eb 0%, #4f46e5 50%, #7c3aed 100%);
    color: #fff;
    padding: 14px 20px;
    border-radius: 18px 18px 18px 4px;
    font-weight: 700;
    font-size: 1rem;
    line-height: 1.55;
    box-shadow: 0 4px 14px rgba(79, 70, 229, 0.32);
    letter-spacing: 0.2px;
    position: relative;
}
.ai-text .q-hint {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    padding: 10px 12px;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px dashed #cbd5e1;
}
.ai-text .sub-q-list {
    margin-top: 10px;
    padding: 14px 16px;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #e2e8f0;
}
.ai-text .sub-q-item {
    margin-bottom: 10px;
}
.ai-text .sub-q-item:last-child {
    margin-bottom: 0;
}
.ai-text .sub-q-text {
    color: #1e293b;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.6;
}
.ai-text .sub-q-hint {
    color: #64748b;
    font-weight: 400;
    font-size: 0.88rem;
    margin-left: 6px;
}
.ai-text .q-line-hint {
    display: block;
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.85);
    font-weight: 400;
    font-size: 0.88rem;
}
.ai-text .q-input-hint {
    margin-top: 10px;
    padding: 8px 12px;
    background: #fef3c7;
    border-left: 3px solid #f59e0b;
    border-radius: 8px;
    color: #92400e;
    font-size: 0.88rem;
    font-weight: 600;
}
.ai-text .q-hint-label {
    width: 100%;
    color: #475569;
    font-size: 0.82rem;
    font-weight: 600;
    margin-bottom: 2px;
}
.ai-text .q-hint-chip {
    background: #fff;
    color: #1d4ed8;
    border: 1.5px solid #93c5fd;
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.12);
}
.ai-text .q-hint-chip:hover:not(:disabled) {
    background: #1d4ed8;
    color: #fff;
    border-color: #1d4ed8;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(37, 99, 235, 0.25);
}
.ai-text .q-hint-chip:active:not(:disabled) {
    transform: translateY(0);
}
.ai-text .q-hint-chip:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* chat container: relative ใช้สำหรับจัด layout ภายใน */
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
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(8px) scale(0.9); }

/* ============================================================
   ✨ THANKS BUBBLE — bubble แบบเดิม แต่ตกแต่งสวยขึ้น
   ============================================================ */
.message-bubble.thanks-bubble {
    background:
        radial-gradient(circle at 0% 0%, rgba(254, 243, 199, 0.7) 0%, transparent 50%),
        linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
    border: 2px solid transparent;
    background-clip: padding-box;
    position: relative;
    padding: 18px 22px 16px;
    border-radius: 20px 20px 20px 6px;
    box-shadow:
        0 8px 24px -4px rgba(245, 158, 11, 0.18),
        0 2px 8px rgba(0, 0, 0, 0.04),
        inset 0 1px 0 rgba(255, 255, 255, 0.8);
    max-width: 78%;
    overflow: hidden;
    animation: thanksBubblePop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.message-bubble.thanks-bubble::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    padding: 2px;
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%);
    -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
}
@keyframes thanksBubblePop {
    0%   { opacity: 0; transform: translateY(8px) scale(0.96); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
}

/* Header ของ bubble ขอบคุณ */
.thanks-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1.5px dashed rgba(245, 158, 11, 0.35);
}
.thanks-header__icon {
    font-size: 1.5rem;
    filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.3));
    animation: thanksIconWave 2s ease-in-out infinite;
}
@keyframes thanksIconWave {
    0%, 100% { transform: rotate(0deg); }
    25%      { transform: rotate(-12deg); }
    75%      { transform: rotate(12deg); }
}
.thanks-header__title {
    font-size: 1.05rem;
    font-weight: 800;
    background: linear-gradient(135deg, #b45309 0%, #92400e 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    letter-spacing: 0.3px;
    flex: 1;
}
.thanks-header__badge {
    font-size: 1.1rem;
    filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.4));
    animation: badgeSpin 3s ease-in-out infinite;
}
@keyframes badgeSpin {
    0%, 100% { transform: rotate(0deg) scale(1); }
    50%      { transform: rotate(360deg) scale(1.15); }
}

/* ปุ่ม action ภายใน bubble ขอบคุณ */
.thanks-actions {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1.5px dashed rgba(245, 158, 11, 0.35);
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.thanks-stars {
    display: flex;
    justify-content: center;
    gap: 4px;
    margin-bottom: 6px;
}
.thanks-stars span {
    font-size: 1.3rem;
    filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.4));
    animation: starGlow 2s ease-in-out infinite;
    cursor: default;
}
.thanks-stars span:nth-child(2) { animation-delay: 0.1s; }
.thanks-stars span:nth-child(3) { animation-delay: 0.2s; }
.thanks-stars span:nth-child(4) { animation-delay: 0.3s; }
.thanks-stars span:nth-child(5) { animation-delay: 0.4s; }
@keyframes starGlow {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.4)); }
    50%      { transform: scale(1.15); filter: drop-shadow(0 4px 10px rgba(245, 158, 11, 0.7)); }
}

.thanks-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    padding: 11px 18px;
    border-radius: 12px;
    font-size: 0.92rem;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.22s ease;
    border: none;
    letter-spacing: 0.2px;
}
.thanks-action-btn--primary {
    background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%);
    color: #fff;
    box-shadow:
        0 5px 14px rgba(124, 58, 237, 0.35),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.thanks-action-btn--primary:hover {
    transform: translateY(-1.5px);
    box-shadow: 0 8px 20px rgba(124, 58, 237, 0.5);
}
.thanks-action-btn--secondary {
    background: #fff;
    color: #1d4ed8;
    border: 1.5px solid #bfdbfe;
    box-shadow: 0 3px 10px rgba(29, 78, 216, 0.1);
}
.thanks-action-btn--secondary:hover {
    background: #eff6ff;
    border-color: #1d4ed8;
    transform: translateY(-1.5px);
    box-shadow: 0 6px 14px rgba(29, 78, 216, 0.18);
}
.thanks-action-btn i { font-size: 0.95rem; }

/* mobile */
@media (max-width: 560px) {
    .message-bubble.thanks-bubble { max-width: 92%; padding: 16px 18px 14px; }
    .thanks-header__title { font-size: 0.98rem; }
    .thanks-stars span { font-size: 1.15rem; }
    .thanks-action-btn { font-size: 0.88rem; padding: 10px 16px; }
}

/* === KEEP — legacy classes (ไม่ใช้แล้ว แต่กันพัง) === */
.thanks-card {
    position: relative;
    align-self: center;
    width: 100%;
    max-width: 480px;
    margin: 20px auto 12px;
    padding: 36px 30px 26px;
    border-radius: 28px;
    background:
        radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.55) 0%, transparent 45%),
        radial-gradient(circle at 100% 100%, rgba(255, 255, 255, 0.3) 0%, transparent 50%),
        linear-gradient(135deg, #fff7ed 0%, #fef3c7 30%, #fde68a 65%, #fbbf24 100%);
    box-shadow:
        0 25px 60px -12px rgba(251, 191, 36, 0.45),
        0 10px 25px -5px rgba(245, 158, 11, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.6),
        inset 0 2px 0 rgba(255, 255, 255, 0.8);
    overflow: hidden;
    text-align: center;
    animation: thanksCardPop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* shimmer แสงวิ่งบนการ์ด */
.thanks-card__shine {
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
        115deg,
        transparent 30%,
        rgba(255, 255, 255, 0.45) 50%,
        transparent 70%
    );
    transform: translateX(-100%);
    animation: cardShine 3.5s ease-in-out infinite;
    animation-delay: 0.8s;
    pointer-events: none;
    z-index: 2;
}
@keyframes cardShine {
    0%   { transform: translateX(-100%) rotate(0deg); }
    50%  { transform: translateX(100%) rotate(0deg); }
    100% { transform: translateX(100%) rotate(0deg); }
}

/* confetti ลอย */
.thanks-card__confetti {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
}
.confetti-dot {
    position: absolute;
    font-size: 1.2rem;
    animation: confettiFloat 4s ease-in-out infinite;
    opacity: 0;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}
.confetti-dot.c1 { top: 8%;  left: 10%; animation-delay: 0s; }
.confetti-dot.c2 { top: 20%; right: 8%; animation-delay: 0.6s; font-size: 1rem; }
.confetti-dot.c3 { top: 12%; left: 80%; animation-delay: 1.2s; }
.confetti-dot.c4 { top: 32%; left: 6%;  animation-delay: 1.8s; font-size: 1.1rem; }
.confetti-dot.c5 { top: 4%;  left: 48%; animation-delay: 2.4s; }
@keyframes confettiFloat {
    0%   { opacity: 0; transform: translateY(10px) rotate(0deg); }
    20%  { opacity: 1; }
    50%  { transform: translateY(-12px) rotate(15deg); }
    80%  { opacity: 1; }
    100% { opacity: 0; transform: translateY(-24px) rotate(-10deg); }
}

@keyframes thanksCardPop {
    0%   { opacity: 0; transform: translateY(20px) scale(0.92); }
    60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
}

.thanks-card__deco-left,
.thanks-card__deco-right {
    position: absolute;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    pointer-events: none;
    opacity: 0.55;
}
.thanks-card__deco-left {
    top: -40px;
    left: -40px;
    background: radial-gradient(circle, #fff 0%, transparent 70%);
}
.thanks-card__deco-right {
    bottom: -50px;
    right: -50px;
    background: radial-gradient(circle, #fff 0%, transparent 70%);
}

.thanks-card__icon {
    width: 86px;
    height: 86px;
    margin: 0 auto 16px;
    border-radius: 50%;
    background:
        radial-gradient(circle at 30% 30%, #ffffff 0%, #fef3c7 70%, #fde68a 100%);
    box-shadow:
        0 12px 28px rgba(245, 158, 11, 0.4),
        0 4px 10px rgba(245, 158, 11, 0.25),
        inset 0 -4px 8px rgba(245, 158, 11, 0.18),
        inset 0 3px 0 rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    z-index: 3;
    animation: thanksIconBounce 2.2s ease-in-out infinite;
}
.thanks-card__icon::before {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 2px dashed rgba(146, 64, 14, 0.3);
    animation: ringRotate 12s linear infinite;
}
@keyframes ringRotate {
    to { transform: rotate(360deg); }
}

@keyframes thanksIconBounce {
    0%, 100% { transform: translateY(0) scale(1); }
    50%      { transform: translateY(-8px) scale(1.05); }
}

.thanks-card__icon-emoji {
    font-size: 2.8rem;
    line-height: 1;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.15));
}

.thanks-card__badge {
    display: inline-block;
    background: linear-gradient(135deg, #ffffff 0%, #fffbeb 100%);
    color: #92400e;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 0.82rem;
    font-weight: 800;
    margin-bottom: 18px;
    letter-spacing: 0.5px;
    box-shadow:
        0 4px 12px rgba(146, 64, 14, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.9);
    border: 1.5px solid rgba(255, 255, 255, 0.8);
    position: relative;
    z-index: 3;
}

.thanks-card__greet {
    color: #78350f;
    font-size: 1.05rem;
    font-weight: 600;
    margin-bottom: 6px;
    position: relative;
    z-index: 3;
    opacity: 0.85;
}

.thanks-card__name {
    color: #7c2d12;
    font-size: 1.65rem;
    font-weight: 900;
    line-height: 1.3;
    margin: 4px 0 8px;
    padding: 0 8px;
    text-shadow:
        0 1px 0 rgba(255, 255, 255, 0.7),
        0 2px 8px rgba(146, 64, 14, 0.15);
    position: relative;
    z-index: 3;
    word-break: break-word;
    letter-spacing: 0.3px;
}

.thanks-card__brand-row {
    color: #78350f;
    font-size: 1rem;
    font-weight: 500;
    margin-bottom: 16px;
    position: relative;
    z-index: 3;
}

.thanks-card__brand {
    background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 50%, #db2777 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    font-weight: 900;
    font-size: 1.1rem;
    letter-spacing: 0.5px;
}

.thanks-card__divider {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 4px auto 14px;
    position: relative;
    z-index: 3;
    width: 80%;
}
.thanks-card__divider::before,
.thanks-card__divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(146, 64, 14, 0.35), transparent);
}
.divider-heart {
    margin: 0 10px;
    font-size: 1rem;
    animation: heartPulse 1.5s ease-in-out infinite;
}
@keyframes heartPulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.2); }
}

.thanks-card__message {
    color: #78350f;
    font-size: 0.97rem;
    line-height: 1.7;
    margin: 4px 0 20px;
    padding: 14px 16px;
    background: rgba(255, 255, 255, 0.45);
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(4px);
    position: relative;
    z-index: 3;
}

.thanks-card__stars {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 22px;
    position: relative;
    z-index: 3;
}
.thanks-card__stars span {
    font-size: 1.8rem;
    filter: drop-shadow(0 3px 6px rgba(245, 158, 11, 0.45));
    animation: starGlow 2s ease-in-out infinite;
    cursor: default;
}
.thanks-card__stars span:nth-child(2) { animation-delay: 0.1s; }
.thanks-card__stars span:nth-child(3) { animation-delay: 0.2s; }
.thanks-card__stars span:nth-child(4) { animation-delay: 0.3s; }
.thanks-card__stars span:nth-child(5) { animation-delay: 0.4s; }

@keyframes starGlow {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 2px 4px rgba(245, 158, 11, 0.4)); }
    50%      { transform: scale(1.15); filter: drop-shadow(0 4px 10px rgba(245, 158, 11, 0.7)); }
}

.thanks-card__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
    position: relative;
    z-index: 3;
}

.thanks-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 13px 22px;
    border-radius: 14px;
    font-size: 0.97rem;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.25s ease;
    border: none;
    letter-spacing: 0.2px;
}

.thanks-btn--primary {
    background: linear-gradient(135deg, #1d4ed8 0%, #7c3aed 100%);
    color: #fff;
    box-shadow:
        0 6px 18px rgba(124, 58, 237, 0.4),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
.thanks-btn--primary:hover {
    transform: translateY(-2px);
    box-shadow:
        0 10px 26px rgba(124, 58, 237, 0.55),
        inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.thanks-btn--secondary {
    background: #ffffff;
    color: #1d4ed8;
    border: 2px solid #bfdbfe;
    box-shadow: 0 4px 12px rgba(29, 78, 216, 0.12);
}
.thanks-btn--secondary:hover {
    background: #eff6ff;
    border-color: #1d4ed8;
    transform: translateY(-2px);
    box-shadow: 0 8px 18px rgba(29, 78, 216, 0.2);
}

.thanks-btn i {
    font-size: 1.05rem;
}

.thanks-card__footer {
    color: #92400e;
    font-size: 0.85rem;
    font-weight: 700;
    opacity: 0.85;
    position: relative;
    z-index: 3;
    padding-top: 16px;
    border-top: 1.5px dashed rgba(146, 64, 14, 0.28);
    letter-spacing: 0.3px;
}

/* mobile responsive */
@media (max-width: 560px) {
    .thanks-card {
        max-width: 100%;
        padding: 28px 22px 22px;
        border-radius: 22px;
    }
    .thanks-card__name { font-size: 1.35rem; }
    .thanks-card__icon { width: 72px; height: 72px; }
    .thanks-card__icon-emoji { font-size: 2.3rem; }
    .thanks-card__stars span { font-size: 1.5rem; }
    .thanks-card__message { font-size: 0.9rem; padding: 12px 14px; }
}
</style>