<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';

definePageMeta({
    layout: false,
    middleware: ['auth-required', 'force-light'],
});

const route = useRoute();
const { apiUrl } = useApiBase();
const preview = ref(null);
const isLoading = ref(true);
const errorMsg = ref('');

const rxId = computed(() => String(route.query.id || '').trim());

onMounted(async () => {
    if (!rxId.value) {
        errorMsg.value = 'ไม่พบรหัสใบสรุปรายการยา';
        isLoading.value = false;
        return;
    }

    try {
        const res = await $fetch(apiUrl(`preview-prescription-email.php?id=${rxId.value}`), {
            credentials: 'include',
        });
        if (res.status === 'success') {
            preview.value = res.data;
        } else {
            errorMsg.value = res.message || 'โหลดตัวอย่างอีเมลไม่สำเร็จ';
        }
    } catch (err) {
        console.error('Email preview error:', err);
        errorMsg.value = 'ไม่สามารถโหลดตัวอย่างอีเมลได้';
    } finally {
        isLoading.value = false;
    }
});

const closeWindow = () => {
    if (import.meta.client && window.history.length > 1) {
        window.history.back();
        return;
    }
    window.close();
};

const openReceipt = () => {
    if (!rxId.value) return;
    window.open(`/prescription-view?id=${rxId.value}`, '_blank', 'noopener,noreferrer');
};
</script>

<template>
    <div class="email-preview-page">
        <div class="preview-toolbar no-print">
            <div class="toolbar-left">
                <h1>ตัวอย่างอีเมลใบสรุปรายการยา</h1>
                <p v-if="preview" class="toolbar-meta">
                    หัวข้อ: <strong>{{ preview.subject }}</strong>
                    <span v-if="preview.sent_to"> · ส่งถึง: {{ preview.sent_to }}</span>
                    <span v-else> · ลูกค้ายังไม่มีอีเมลในระบบ</span>
                </p>
            </div>
            <div class="toolbar-actions">
                <button class="tb-btn tb-receipt" type="button" @click="openReceipt">🧾 ดูใบสรุปรายการยา</button>
                <button class="tb-btn tb-close" type="button" @click="closeWindow">✖ ปิด</button>
            </div>
        </div>

        <div v-if="isLoading" class="state-box">⏳ กำลังโหลดตัวอย่างอีเมล...</div>
        <div v-else-if="errorMsg" class="state-box state-box--error">{{ errorMsg }}</div>
        <div v-else-if="preview" class="email-frame-wrap">
            <iframe
                class="email-frame"
                :srcdoc="preview.html"
                title="ตัวอย่างอีเมลใบสรุปรายการยา"
            />
        </div>
    </div>
</template>

<style scoped>
.email-preview-page {
    min-height: 100vh;
    background: #e2e8f0;
}

.preview-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 16px 20px;
    background: #fff;
    border-bottom: 1px solid #cbd5e1;
    position: sticky;
    top: 0;
    z-index: 10;
}

.toolbar-left h1 {
    margin: 0;
    font-size: 1.1rem;
    color: #0f172a;
}

.toolbar-meta {
    margin: 6px 0 0;
    font-size: 0.85rem;
    color: #64748b;
}

.toolbar-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
}

.tb-btn {
    border: none;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 0.9rem;
    cursor: pointer;
}

.tb-receipt {
    background: #e0f2fe;
    color: #0369a1;
}

.tb-close {
    background: #fee2e2;
    color: #b91c1c;
}

.state-box {
    max-width: 560px;
    margin: 40px auto;
    padding: 20px;
    background: #fff;
    border-radius: 10px;
    text-align: center;
    color: #334155;
}

.state-box--error {
    color: #b91c1c;
}

.email-frame-wrap {
    max-width: 640px;
    margin: 24px auto;
    padding: 0 16px 24px;
}

.email-frame {
    width: 100%;
    min-height: calc(100vh - 140px);
    border: none;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

@media (max-width: 720px) {
    .preview-toolbar {
        flex-direction: column;
    }

    .toolbar-actions {
        width: 100%;
    }

    .tb-btn {
        flex: 1;
    }
}
</style>
