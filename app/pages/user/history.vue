<script setup>
import { formatThaiDate, formatThaiTimeShort } from '@/utils/datetime';

definePageMeta({ middleware: 'user-only' });

const { getHistory, deleteSession } = useChatApi();

const historyList = ref([]);
const isLoading = ref(true);
const deletingId = ref('');

/* ================= Pagination ================= */
const currentPage = ref(1);
const perPage = ref(20);
const perPageOptions = [10, 20, 50, 100];

const totalItems = computed(() => historyList.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / perPage.value)));

// ตัด array ตามหน้าปัจจุบัน
const paginatedList = computed(() => {
    const start = (currentPage.value - 1) * perPage.value;
    return historyList.value.slice(start, start + perPage.value);
});

const rangeText = computed(() => {
    if (totalItems.value === 0) return '0 รายการ';
    const from = (currentPage.value - 1) * perPage.value + 1;
    const to = Math.min(currentPage.value * perPage.value, totalItems.value);
    return `${from}-${to} จาก ${totalItems.value} รายการ`;
});

// คำนวณ page numbers ที่แสดง — แสดงรอบๆ current 5 หน้า + first/last
const visiblePages = computed(() => {
    const total = totalPages.value;
    const cur = currentPage.value;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set([1, total, cur - 1, cur, cur + 1]);
    if (cur <= 3) [2, 3, 4].forEach(p => pages.add(p));
    if (cur >= total - 2) [total - 3, total - 2, total - 1].forEach(p => pages.add(p));
    return Array.from(pages).filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
});

const goToPage = (p) => {
    if (p < 1 || p > totalPages.value) return;
    currentPage.value = p;
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
const onPerPageChange = () => { currentPage.value = 1; };

const fetchHistory = async () => {
    try {
        const res = await getHistory();
        if (res.status === 'success') {
            historyList.value = res.data;
        }
    } catch (err) {
        console.error("Fetch history failed", err);
    } finally {
        isLoading.value = false;
    }
};

const viewChat = (sessionId) => {
    navigateTo(`/user/chat-history?session_id=${sessionId}`);
};

const formatDate = (ts) => formatThaiDate(ts);

const formatTimeShort = (ts) => formatThaiTimeShort(ts);

const previewMessage = (msg) => {
    const t = String(msg || '').trim();
    if (!t) return 'เริ่มต้นการสนทนา…';
    const clean = t.replace(/\[PROFILE\][\s\S]*?\n\n/, '').trim();
    return clean.length > 120 ? clean.slice(0, 120) + '…' : clean;
};

const deleteChat = async (item, ev) => {
    ev?.stopPropagation?.();
    if (!item?.session_id) return;
    const label = item.round_total > 1
        ? `${item.symptom_name} (รอบ ${item.round_no})`
        : item.symptom_name;
    if (!confirm(`ลบประวัติแชท "${label}" ออกจากหน้าจอหรือไม่?\nข้อมูลจริงจะถูก freeze เก็บไว้ในฐานข้อมูล`)) return;
    deletingId.value = item.session_id;
    try {
        const res = await deleteSession(item.session_id);
        if (res?.status === 'success') {
            historyList.value = historyList.value.filter(h => h.session_id !== item.session_id);
        } else {
            alert(res?.message || 'ลบไม่สำเร็จ');
        }
    } catch (err) {
        console.error('delete chat failed', err);
        alert('ลบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
        deletingId.value = '';
    }
};

onMounted(() => {
    fetchHistory();
});
</script>

<template>
    <Header />
    <div class="history-page">
        <main class="container">
            <div class="header-section">
                <h1>ประวัติการปรึกษา AI</h1>
                <p>บันทึกการพูดคุยกับเภสัชกร AI ของคุณ — แยกตามอาการและรอบที่ปรึกษา</p>
            </div>

            <div v-if="isLoading" class="state-container">
                <div class="loader"></div>
                <p>กำลังดึงข้อมูลประวัติ...</p>
            </div>

            <div v-else-if="historyList.length === 0" class="state-container empty">
                <div class="empty-icon">💬</div>
                <h3>ยังไม่มีประวัติการแชท</h3>
                <p>เริ่มปรึกษาเภสัชกร AI ครั้งแรกได้เลยตอนนี้</p>
                <NuxtLink to="/Advice" class="btn-primary">เริ่มแชทเลย</NuxtLink>
            </div>

            <div v-else class="history-list">
                <div v-for="item in paginatedList"
                     :key="item.session_id"
                     class="history-card"
                     @click="viewChat(item.session_id)">

                    <div class="card-icon">
                        <i class="fa-solid fa-comment-medical"></i>
                    </div>

                    <div class="card-content">
                        <!-- 🆕 หัวข้อเป็นอาการ + ป้าย "รอบ N" ถ้าซ้ำ -->
                        <div class="card-title-row">
                            <h3 class="card-title">{{ item.symptom_name }}</h3>
                            <span v-if="item.round_total > 1" class="round-badge">
                                <i class="fa-solid fa-repeat"></i> รอบที่ {{ item.round_no }}/{{ item.round_total }}
                            </span>
                        </div>

                        <div class="meta-row">
                            <span class="meta-item">
                                <i class="fa-regular fa-calendar"></i>
                                {{ formatDate(item.last_at || item.created_at) }}
                            </span>
                            <span class="meta-item">
                                <i class="fa-regular fa-clock"></i>
                                {{ formatTimeShort(item.last_at || item.created_at) }}
                            </span>
                            <span class="meta-item">
                                <i class="fa-regular fa-message"></i>
                                {{ item.message_count }} ข้อความ
                            </span>
                        </div>

                        <p class="chat-preview">{{ previewMessage(item.first_message || item.message) }}</p>
                    </div>

                    <div class="card-actions">
                        <button class="btn-delete"
                                :disabled="deletingId === item.session_id"
                                @click="deleteChat(item, $event)"
                                :title="'ลบประวัติแชทนี้'">
                            <i v-if="deletingId === item.session_id" class="fa-solid fa-spinner fa-spin"></i>
                            <i v-else class="fa-regular fa-trash-can"></i>
                        </button>
                        <span class="view-hint">
                            ดูแชท
                            <i class="fa-solid fa-chevron-right"></i>
                        </span>
                    </div>
                </div>

                <!-- 🆕 Pagination Bar — สไตล์เดียวกับภาพ 2 -->
                <div v-if="totalItems > 0" class="pagination-bar">
                    <div class="pagination-info">
                        แสดง <strong>{{ rangeText }}</strong>
                    </div>

                    <nav class="pagination-controls" aria-label="หน้าผลลัพธ์">
                        <button class="pg-btn" :disabled="currentPage === 1" @click="goToPage(1)" title="หน้าแรก">
                            <i class="fa-solid fa-angles-left"></i>
                        </button>
                        <button class="pg-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" title="ก่อนหน้า">
                            <i class="fa-solid fa-angle-left"></i>
                        </button>

                        <template v-for="(p, idx) in visiblePages" :key="p">
                            <span v-if="idx > 0 && p - visiblePages[idx - 1] > 1" class="pg-ellipsis">…</span>
                            <button class="pg-num" :class="{ 'pg-num--active': p === currentPage }" @click="goToPage(p)">
                                {{ p }}
                            </button>
                        </template>

                        <button class="pg-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)" title="ถัดไป">
                            <i class="fa-solid fa-angle-right"></i>
                        </button>
                        <button class="pg-btn" :disabled="currentPage >= totalPages" @click="goToPage(totalPages)" title="หน้าสุดท้าย">
                            <i class="fa-solid fa-angles-right"></i>
                        </button>
                    </nav>

                    <div class="pagination-perpage">
                        <label>ต่อหน้า</label>
                        <select v-model.number="perPage" @change="onPerPageChange">
                            <option v-for="n in perPageOptions" :key="n" :value="n">{{ n }}</option>
                        </select>
                    </div>
                </div>
            </div>
        </main>
    </div>
    <Footer />
</template>

<style scoped>
.history-page {
    background: linear-gradient(180deg, #f0f4f8 0%, #ffffff 100%);
    min-height: 100vh;
    padding-top: 100px;
    padding-bottom: 50px;
}

.container {
    max-width: 800px;
    margin: 0 auto;
    padding: 0 20px;
}

.header-section {
    text-align: center;
    margin-bottom: 40px;
}

.header-section h1 {
    color: #00469c;
    font-size: 2.2rem;
    font-weight: 700;
    margin-bottom: 8px;
}

.header-section p {
    color: #64748b;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.history-card {
    background: white;
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    gap: 16px;
    align-items: flex-start;
    cursor: pointer;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    border: 1px solid #e2e8f0;
    position: relative;
}

.history-card:hover {
    transform: translateY(-2px);
    border-color: #00469c;
    box-shadow: 0 10px 25px rgba(0, 70, 156, 0.08);
}

.card-icon {
    flex-shrink: 0;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
}

.card-content {
    flex: 1;
    min-width: 0;
}

.card-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 6px;
}

.card-title {
    color: #1e293b;
    font-size: 1.15rem;
    font-weight: 700;
    margin: 0;
}

.round-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
    border-radius: 20px;
    font-size: 0.72rem;
    font-weight: 700;
}

.meta-row {
    display: flex;
    gap: 14px;
    color: #94a3b8;
    font-size: 0.82rem;
    margin-bottom: 8px;
    flex-wrap: wrap;
}

.meta-item { display: inline-flex; align-items: center; gap: 5px; }

.chat-preview {
    color: #475569;
    font-size: 0.92rem;
    line-height: 1.5;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.card-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
}

.btn-delete {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #fecaca;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
}
.btn-delete:hover:not(:disabled) {
    background: #dc2626;
    color: white;
    border-color: #dc2626;
}
.btn-delete:disabled { opacity: 0.6; cursor: wait; }

.view-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #00469c;
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.7;
}
.history-card:hover .view-hint { opacity: 1; }

/* Loading & Empty State */
.state-container { text-align: center; padding: 60px 0; color: #64748b; }
.empty-icon { font-size: 4rem; margin-bottom: 16px; }

.btn-primary {
    display: inline-block;
    margin-top: 20px;
    background: #00469c;
    color: white;
    padding: 12px 32px;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    transition: 0.3s;
}
.btn-primary:hover {
    background: #003373;
    box-shadow: 0 4px 12px rgba(0, 70, 156, 0.2);
}

.loader {
    width: 40px; height: 40px;
    border: 4px solid #f3f3f3;
    border-top: 4px solid #00469c;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
}
@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@media (max-width: 600px) {
    .history-card { flex-direction: column; padding: 16px; }
    .card-actions { flex-direction: row; align-self: stretch; justify-content: space-between; align-items: center; }
}

/* ============================================================
   🆕 Pagination Bar — สไตล์ภาพ 2 (clean rounded)
   ============================================================ */
.pagination-bar {
    margin-top: 28px;
    padding: 14px 18px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.pagination-info {
    color: #475569;
    font-size: 0.88rem;
}
.pagination-info strong { color: #1e293b; font-weight: 700; }

.pagination-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
    flex: 1 1 auto;
}

.pg-btn, .pg-num {
    background: white;
    border: 1px solid #e2e8f0;
    color: #64748b;
    min-width: 34px;
    height: 34px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.pg-btn:hover:not(:disabled),
.pg-num:hover:not(.pg-num--active) {
    background: #f1f5f9;
    border-color: #cbd5e1;
    color: #1e293b;
}
.pg-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
.pg-num--active {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%) !important;
    border-color: #4338ca !important;
    color: white !important;
    box-shadow: 0 3px 8px rgba(99, 102, 241, 0.35);
    cursor: default;
}

.pg-ellipsis {
    color: #cbd5e1;
    padding: 0 6px;
    font-weight: 700;
    user-select: none;
}

.pagination-perpage {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #475569;
    font-size: 0.88rem;
}
.pagination-perpage select {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 6px 10px;
    background: white;
    color: #1e293b;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
}
.pagination-perpage select:hover,
.pagination-perpage select:focus {
    border-color: #6366f1;
}

@media (max-width: 600px) {
    .pagination-bar {
        flex-direction: column;
        align-items: stretch;
        padding: 12px;
    }
    .pagination-info, .pagination-perpage {
        text-align: center;
        justify-content: center;
    }
    .pagination-controls { order: -1; }
}
</style>
