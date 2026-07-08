<script setup>
const props = defineProps({
    pageStart: { type: Number, required: true },
    pageEnd: { type: Number, required: true },
    totalItems: { type: Number, required: true },
    currentPage: { type: Number, required: true },
    totalPages: { type: Number, required: true },
    pageNumbers: { type: Array, required: true },
    pageSize: { type: Number, required: true },
    sizes: { type: Array, default: () => [10, 20, 50, 100] },
});

const emit = defineEmits(['go', 'size-change']);

const go = (p) => emit('go', p);
const prev = () => emit('go', props.currentPage - 1);
const next = () => emit('go', props.currentPage + 1);
const onSize = (e) => emit('size-change', Number(e.target.value));
</script>

<template>
    <div v-if="totalItems > 0" class="admin-pagination">
        <div class="pagination-info">
            แสดง <strong>{{ pageStart }}–{{ pageEnd }}</strong> จาก
            <strong>{{ totalItems.toLocaleString('th-TH') }}</strong> รายการ
        </div>

        <div class="pagination-controls">
            <button class="page-btn" :disabled="currentPage === 1" title="หน้าแรก" @click="go(1)">
                <i class="fa-solid fa-angles-left"></i>
            </button>
            <button class="page-btn" :disabled="currentPage === 1" title="ก่อนหน้า" @click="prev">
                <i class="fa-solid fa-angle-left"></i>
            </button>

            <template v-for="(p, idx) in pageNumbers" :key="idx">
                <span v-if="p === '...'" class="page-ellipsis">…</span>
                <button
                    v-else
                    class="page-btn page-num"
                    :class="{ active: p === currentPage }"
                    @click="go(p)"
                >
                    {{ p }}
                </button>
            </template>

            <button class="page-btn" :disabled="currentPage === totalPages" title="ถัดไป" @click="next">
                <i class="fa-solid fa-angle-right"></i>
            </button>
            <button class="page-btn" :disabled="currentPage === totalPages" title="หน้าสุดท้าย" @click="go(totalPages)">
                <i class="fa-solid fa-angles-right"></i>
            </button>
        </div>

        <div class="pagination-size">
            <label>ต่อหน้า</label>
            <select :value="pageSize" @change="onSize">
                <option v-for="opt in sizes" :key="opt" :value="opt">{{ opt }}</option>
            </select>
        </div>
    </div>
</template>

<style scoped>
.admin-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 20px;
    margin-top: 16px;
    background: #fff;
    border-radius: 14px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    flex-wrap: wrap;
}

.pagination-info {
    font-size: 0.9rem;
    color: #475569;
}
.pagination-info strong {
    color: #0f172a;
    font-weight: 600;
}

.pagination-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
}

.page-btn {
    min-width: 36px;
    height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #475569;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, transform 0.1s;
}
.page-btn:hover:not(:disabled) {
    background: #f1f5f9;
    border-color: #cbd5e1;
}
.page-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.page-btn.active {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: #fff;
    border-color: #4f46e5;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.page-ellipsis {
    color: #94a3b8;
    padding: 0 4px;
    user-select: none;
}

.pagination-size {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    color: #475569;
}
.pagination-size select {
    height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
    background: #fff;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
}

@media (max-width: 720px) {
    .admin-pagination {
        flex-direction: column;
        align-items: stretch;
        padding: 14px;
    }
    .pagination-info,
    .pagination-size {
        justify-content: center;
        text-align: center;
    }
    .pagination-controls {
        justify-content: center;
    }
}
</style>
