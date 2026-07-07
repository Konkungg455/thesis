<script setup>
import { ref, onMounted, computed, nextTick } from 'vue';
import { useRoute } from 'vue-router';

// 1. ตั้งค่าไม่ใช้งาน Layout หลัก เพื่อให้หน้าพิมพ์สะอาดไม่มี Sidebar/Footer
definePageMeta({
    layout: false,
    middleware: ['auth-required', 'force-light']
});

const route = useRoute();
const { apiUrl } = useApiBase();
const data = ref(null);
const isLoading = ref(true);
const autoPrint = computed(() => route.query.print !== '0');

/** มือถือไม่ auto-print — iOS เปิด print sheet แล้วมักทำให้ปุ่มบนหน้ากดไม่ได้ */
const shouldAutoPrint = () => {
    if (!autoPrint.value || !import.meta.client) return false;
    const narrow = window.matchMedia('(max-width: 820px)').matches;
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    return !narrow && !touch;
};

const parseNum = (v) => {
    const n = parseFloat(String(v ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
};

const formatMoney = (v) => parseNum(v).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const lineItems = computed(() => {
    if (!data.value) return [];
    const names = String(data.value.med_details || '').split('\n');
    const qtyUnits = String(data.value.med_qty || '').split('\n');
    const prices = String(data.value.med_price || '').split('\n');
    const maxRows = Math.max(names.length, qtyUnits.length, prices.length, 10);

    return Array.from({ length: maxRows }, (_, i) => {
        const [qty = '', unit = ''] = String(qtyUnits[i] || '').split('|');
        const totalRaw = String(prices[i] || '').trim();
        const totalNum = parseNum(totalRaw);
        const unitPrice = qty && totalNum ? totalNum / Math.max(parseNum(qty), 1) : 0;
        return {
            name: (names[i] || '').trim(),
            qty: qty || '',
            unit: unit || '',
            unitPrice: unitPrice ? formatMoney(unitPrice) : '0.00',
            total: totalRaw ? formatMoney(totalRaw) : '0.00',
        };
    });
});

const subtotal = computed(() =>
    lineItems.value.reduce((sum, item) => sum + parseNum(item.total), 0),
);
const discountAmount = computed(() => parseNum(data.value?.discount_amount));
const grandTotal = computed(() => {
    const raw = parseNum(data.value?.total_amount);
    return raw || Math.max(0, subtotal.value - discountAmount.value);
});
const amountReceived = computed(() => parseNum(data.value?.amount_received));
const changeAmount = computed(() => {
    const raw = parseNum(data.value?.change_amount);
    return raw || Math.max(0, amountReceived.value - grandTotal.value);
});

onMounted(async () => {
    const id = route.query.id;
    if (!id) {
        isLoading.value = false;
        return;
    }

    try {
        const res = await $fetch(apiUrl(`get-prescription-detail.php?id=${id}`), {
            credentials: 'include'
        });
        if (res.status === 'success') {
            data.value = res.data;

            // รอให้ Vue Render ข้อมูลลง HTML ก่อนสั่งพิมพ์ (เฉพาะ desktop — มือถือกดปุ่มพิมพ์เอง)
            if (shouldAutoPrint()) {
                await nextTick();
                await new Promise((r) => setTimeout(r, 500));
                window.print();
            }
        }
    } catch (err) {
        console.error("Fetch detail error:", err);
    } finally {
        isLoading.value = false;
    }
});

const reprint = () => {
    window.print();
};

const closeWindow = () => {
    if (import.meta.client && window.history.length > 1) {
        window.history.back();
        return;
    }
    window.close();
};

const openEmailPreview = () => {
    const id = route.query.id;
    if (!id) return;
    window.open(`/prescription-email-preview?id=${id}`, '_blank', 'noopener,noreferrer');
};

</script>

<template>
    <div v-if="isLoading" class="loading-state no-print">
        <p>⏳ กำลังโหลดข้อมูลใบสรุปรายการยา...</p>
    </div>

    <div v-else-if="!data" class="empty-state no-print">
        <p>❌ ไม่พบข้อมูลใบสรุปรายการยา (id ไม่ถูกต้องหรือถูกลบ)</p>
    </div>

    <div v-if="data" class="print-page">
        <!-- แถบเครื่องมือพิมพ์/ปิด (เห็นบนหน้าจอเท่านั้น) -->
        <div class="print-toolbar no-print">
            <button class="tb-btn tb-email" @click="openEmailPreview">📧 ดูตัวอย่างอีเมล</button>
            <button class="tb-btn tb-print" @click="reprint">🖨️ พิมพ์อีกครั้ง</button>
            <button class="tb-btn tb-close" @click="closeWindow">✖ ปิดหน้าต่าง</button>
        </div>

        <div class="receipt-card">
            <header class="receipt-top">
                <div class="receipt-brand">
                    <div class="brand-name">{{ data.clinic_name || 'ร้านยา' }}</div>
                    <div class="brand-web">{{ data.clinic_website || 'Telebot-pharmacy' }}</div>
                </div>
                <span class="page-no">หน้า 1 / 1</span>
            </header>

            <div class="receipt-title-box">ใบสรุปรายการยา</div>

            <div class="info-grid">
                <div class="info-col">
                    <div class="info-row">
                        <span class="info-label">รหัสลูกค้า</span>
                        <span class="info-value">{{ data.customer_code || '-' }}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">ชื่อลูกค้า</span>
                        <span class="info-value">{{ data.patient_name || '-' }}</span>
                    </div>
                </div>
                <div class="info-col info-col--right">
                    <div class="info-row">
                        <span class="info-label">เลขที่บิล</span>
                        <span class="info-value">{{ data.doc_no || '-' }}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">วันที่บิล</span>
                        <span class="info-value">{{ data.prescription_date || '-' }}</span>
                    </div>
                </div>
            </div>

            <table class="items-table">
                <thead>
                    <tr>
                        <th class="col-no">ลำดับ</th>
                        <th class="col-name">รายการ</th>
                        <th class="col-qty">จำนวน</th>
                        <th class="col-price">ราคาต่อหน่วย</th>
                        <th class="col-total">ราคารวม</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(item, idx) in lineItems" :key="idx">
                        <td class="text-center">{{ idx + 1 }}</td>
                        <td>{{ item.name || '-' }}</td>
                        <td class="text-center">{{ item.qty || '-' }}</td>
                        <td class="text-right">{{ item.unitPrice }}</td>
                        <td class="text-right">{{ item.total }}</td>
                    </tr>
                </tbody>
            </table>

            <div class="totals-section totals-section--single">
                <div class="totals-right">
                    <div class="total-line">
                        <span>ราคารวม</span>
                        <span class="total-num">{{ formatMoney(subtotal) }}</span>
                    </div>
                    <div class="total-line">
                        <span>ลดรวม</span>
                        <span class="total-num">{{ formatMoney(discountAmount) }}</span>
                    </div>
                    <div class="total-line total-line--grand">
                        <span>เป็นเงินทั้งสิ้น</span>
                        <span class="total-num">{{ formatMoney(grandTotal) }}</span>
                    </div>
                    <div class="total-words">
                        {{ data.amount_in_words || '(...........................................)' }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
@import "@/assets/prescription-view.css";

/* มือถือ: บังคับให้แถบปุ่มกดได้ (กัน CSS global จากหน้าอื่นใน SPA) */
@media screen and (max-width: 900px) {
  .print-toolbar {
    position: sticky !important;
    top: 0 !important;
    z-index: 300 !important;
    pointer-events: auto !important;
  }
  .tb-btn {
    pointer-events: auto !important;
    touch-action: manipulation;
    min-height: 44px;
  }
}
</style>