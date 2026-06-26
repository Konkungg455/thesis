<script setup>
import { ref, computed, onMounted } from 'vue'

definePageMeta({
  layout: false,
  middleware: 'pharmacist-only'
})

const { apiUrl } = useApiBase()

const pharmacistName = ref('เภสัชกร')
const activeCaseCount = ref(0)
const followUpCount = ref(0)
const isAuthorized = ref(false)

const HERO_LOGO_URL = '/images/telebot-logo.png'

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

// 🚩 1. เพิ่มฟังก์ชันสร้างคีย์ Dynamic แยกตาม ID เภสัชกร (แบบเดียวกับที่ใช้ในหน้าแชทหลัก)
const getSidebarStorageKey = () => {
  if (!import.meta.client) return 'pharma-sidebar-patients-guest';
  try {
    const raw = localStorage.getItem('user_data')
    if (!raw) return 'pharma-sidebar-patients-guest';
    const parsed = JSON.parse(raw)
    // เช็คทั้งโครงสร้าง id_pharma และ id ป้องกันข้อมูลหลุดหลง
    const pharmaId = parsed?.id_pharma || parsed?.id || 'guest';
    return `pharma-sidebar-patients-${pharmaId}`;
  } catch {
    return 'pharma-sidebar-patients-guest';
  }
};

const loadPharmacistName = () => {
  if (!import.meta.client) return
  try {
    const raw = localStorage.getItem('user_data')
    if (!raw) return
    const user = JSON.parse(raw)
    pharmacistName.value = user?.username || user?.name || 'เภสัชกร'
  } catch {
    // ignore
  }
}

// 🚩 2. แก้ฟังก์ชันนับจำนวนเคส: เปลี่ยนจาก sessionStorage มาใช้คีย์ไดนามิกใน localStorage
const loadActiveCaseCount = () => {
  if (!import.meta.client) return
  try {
    const key = getSidebarStorageKey(); // ดึงคีย์เฉพาะของเภสัชกรคนนี้
    const raw = localStorage.getItem(key); // อ่านจาก localStorage เพื่อความอยู่ยาวถาวร
    if (!raw) {
      activeCaseCount.value = 0
      return
    }
    const list = JSON.parse(raw)
    activeCaseCount.value = Array.isArray(list) ? list.length : 0
  } catch {
    activeCaseCount.value = 0
  }
}

const isWithinFollowUpWindow = (createdAt) => {
  const start = new Date(createdAt).getTime()
  if (Number.isNaN(start)) return false
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000
  return Date.now() < start + threeDaysMs
}

const fetchFollowUpCount = async () => {
  if (!isAuthorized.value) return;
  try {
    const res = await $fetch(apiUrl('get-prescriptions.php'), { credentials: 'include' })
    if (res.status === 'success' && Array.isArray(res.data)) {
      followUpCount.value = res.data.filter((item) =>
        String(item?.med_details || '').trim() !== ''
        && String(item?.tracking_status || 'active') === 'active'
        && isWithinFollowUpWindow(item.created_at)
      ).length
    } else {
      followUpCount.value = 0
    }
  } catch {
    followUpCount.value = 0
  }
}

const displayName = computed(() => pharmacistName.value)

onMounted(() => {
  isAuthorized.value = checkAuth();
  if (!isAuthorized.value) return;
  loadPharmacistName()
  loadActiveCaseCount()
  fetchFollowUpCount()
})
</script>

<template>
  <div class="pharma-home-page">
    <Pharmacy_header />

    <main class="pharma-home">
      <section class="pharma-home__hero">
        <img
          class="pharma-home__logo"
          :src="HERO_LOGO_URL"
          alt="TELEBOT-PHARCY"
        />
        <h1 class="pharma-home__title">ยินดีต้อนรับ TELEBOT-PHAMACY</h1>
        <p class="pharma-home__subtitle">
          เภสัชกร ({{ displayName }})
        </p>
      </section>

      <section class="pharma-home__cards">
        <article class="pharma-home__card">
          <h2 class="pharma-home__card-title">ไฟล์บันทึกการปรึกษา</h2>
          <div class="pharma-home__card-body">
            <span class="pharma-home__pdf-icon" aria-hidden="true">📄</span>
          </div>
          <NuxtLink to="/history" class="pharma-home__btn">เช็คไฟล์</NuxtLink>
        </article>

        <article class="pharma-home__card">
          <h2 class="pharma-home__card-title">จำนวนเคสคนไข้ที่มีในขณะนี้</h2>
          <div class="pharma-home__card-body">
            <span class="pharma-home__count">{{ activeCaseCount }}</span>
          </div>
          <NuxtLink to="/pharmacy_web" class="pharma-home__btn">ตรวจเช็ค</NuxtLink>
        </article>

        <article class="pharma-home__card">
          <h2 class="pharma-home__card-title">ติดตามอาการคนไข้</h2>
          <div class="pharma-home__card-body">
            <span class="pharma-home__count">{{ followUpCount }}</span>
          </div>
          <NuxtLink to="/tracking" class="pharma-home__btn">เรียกติดตาม</NuxtLink>
        </article>
      </section>
    </main>

    <Footer />
  </div>
</template>

<style scoped>
@import "@/assets/pharmacist-home.css";

.pharma-home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #fff;
}
</style>
