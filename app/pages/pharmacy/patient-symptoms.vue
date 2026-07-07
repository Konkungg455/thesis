<script setup>
import { ref, onMounted } from 'vue';

definePageMeta({ middleware: 'pharmacist-only' });

const { apiUrl } = useApiBase();
const patients = ref([]);
const isLoading = ref(false);

const fetchSymptoms = async () => {
    isLoading.value = true;
    try {
        const res = await $fetch(apiUrl('get-pharma-patient-symptoms.php'), { credentials: 'include' });
        if (res?.status === 'success') {
            patients.value = res.data || [];
        } else {
            patients.value = [];
        }
    } catch (e) {
        console.error(e);
        patients.value = [];
    } finally {
        isLoading.value = false;
    }
};

const openChat = (id) => {
    navigateTo(`/pharmacy_web?id=${id}`);
};

const formatDate = (d) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('th-TH');
};

onMounted(fetchSymptoms);
</script>

<template>
    <div class="admin-layout">
        <Pharmacy_header />

        <div class="main-content">
            <aside class="sidebar">
                <div class="menu-item active">🩺 ติดอาการคนไข้</div>
            </aside>

            <section class="history-section">
                <div class="header-bar">
                    <h2>รายชื่อคนไข้ที่รับเคส — ข้อมูลอาการ / โรคประจำตัว</h2>
                    <p class="sub-hint">แสดงเฉพาะคนไข้ที่คุณรับคำปรึกษาแล้ว</p>
                </div>

                <div class="table-container shadow-card">
                    <div v-if="isLoading" class="loading-state">
                        <div class="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>

                    <table v-else-if="patients.length > 0" class="history-table">
                        <thead>
                            <tr>
                                <th>ผู้ใช้บริการ</th>
                                <th>โทรศัพท์</th>
                                <th>โรคประจำตัว / อาการ</th>
                                <th>เพศ / อายุ</th>
                                <th>สถานะเคส</th>
                                <th>วันที่รับเคส</th>
                                <th class="text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="p in patients" :key="p.id_account">
                                <td><strong>{{ p.patient_name }}</strong></td>
                                <td>{{ p.phone_number || '-' }}</td>
                                <td class="symptom-text">{{ p.personal_disease || '-' }}</td>
                                <td>{{ p.gender || '-' }} / {{ p.old || '-' }} ปี</td>
                                <td>
                                    <span :class="['status-badge', p.consult_status === 'accepted' ? 'waiting' : 'done']">
                                        {{ p.consult_status === 'accepted' ? 'กำลังดูแล' : 'จบแล้ว' }}
                                    </span>
                                </td>
                                <td>{{ formatDate(p.consult_at) }}</td>
                                <td class="text-center">
                                    <button class="btn-chat" @click="openChat(p.id_account)">💬 เปิดแชท</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-else class="empty-state">
                        <p>ยังไม่มีคนไข้ที่คุณรับเคส</p>
                    </div>
                </div>
            </section>
        </div>
        <Footer />
    </div>
</template>

<style scoped>
@import '@/assets/history.css';

.sub-hint {
    margin: 4px 0 0;
    color: #64748b;
    font-size: 0.9rem;
}
</style>
