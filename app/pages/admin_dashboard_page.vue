<script setup>
/**
 * 🚩 admin_dashboard_page.vue — ถือเป็น "หน้าแรก (Home)" ของผู้ดูแลระบบ
 *    เนื้อหาคือ Overview (สถิติรวม, กราฟใบสั่งยา 7 วัน, อันดับเภสัชกร)
 *    ส่วน tab อื่น ๆ ถูกแยกไปไว้ในโฟลเดอร์ /app/pages/admin/
 */
import { ref, computed, onMounted } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const isLoading = ref(false)
const historyData = ref([])       // ใบสั่งยา (สำหรับกราฟ + อันดับเภสัชกร)
const overviewUsers = ref([])     // ผู้ใช้บริการ (ตัด role admin ออก)
const overviewPharmas = ref([])   // เภสัชกรทั้งหมด

// ดึงข้อมูล Overview จาก 3 endpoint พร้อมกัน
const fetchOverview = async () => {
  isLoading.value = true
  const { $getApiBase, $apiUrl } = useNuxtApp()
  const base = $getApiBase()
  try {
    const [prescRes, userRes, pharmaRes] = await Promise.allSettled([
      $fetch($apiUrl('get-prescriptions.php'), { credentials: 'include' }),
      $fetch(`${base}/get-user.php`, { credentials: 'include' }),
      $fetch(`${base}/get-pharma.php`, { credentials: 'include' }),
    ])

    if (prescRes.status === 'fulfilled' && prescRes.value?.status === 'success') {
      historyData.value = prescRes.value.data || []
    } else {
      historyData.value = []
    }

    if (userRes.status === 'fulfilled') {
      const r = userRes.value
      const ok = r?.status === 'success' || r?.authenticated
      const raw = ok ? (Array.isArray(r.data) ? r.data : [r.data]) : []
      overviewUsers.value = raw.filter(u => (u?.role ?? '').toLowerCase() !== 'admin')
    } else {
      overviewUsers.value = []
    }

    if (pharmaRes.status === 'fulfilled') {
      const r = pharmaRes.value
      const ok = r?.status === 'success' || r?.authenticated
      overviewPharmas.value = ok ? (Array.isArray(r.data) ? r.data : [r.data]) : []
    } else {
      overviewPharmas.value = []
    }
  } catch (err) {
    console.error('Fetch overview error:', err)
    historyData.value = []
    overviewUsers.value = []
    overviewPharmas.value = []
  } finally {
    isLoading.value = false
  }
}

// 🚩 [Overview] สถิติจริงจาก DB
const totalUserCount = computed(() => overviewUsers.value.length)
const totalPharmaCount = computed(() => overviewPharmas.value.filter(p => p.status_verify == 1).length)

// 🚩 [Overview] ข้อมูลกราฟแท่งจำนวนใบสั่งยา 7 วันล่าสุด
const weeklyChartData = computed(() => {
  const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push({
      key: d.toDateString(),
      label: dayNames[d.getDay()],
      dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
      count: 0,
    })
  }

  historyData.value.forEach(item => {
    if (!item.created_at) return
    const created = new Date(item.created_at)
    if (isNaN(created.getTime())) return
    created.setHours(0, 0, 0, 0)
    const bucket = days.find(d => d.key === created.toDateString())
    if (bucket) bucket.count += 1
  })

  return days
})

const maxChartCount = computed(() => {
  const max = Math.max(...weeklyChartData.value.map(d => d.count))
  return max > 0 ? max : 1
})

const totalWeeklyCount = computed(() => weeklyChartData.value.reduce((s, d) => s + d.count, 0))

// 🚩 [Overview] อันดับเภสัชกรที่บันทึกใบสั่งยามากที่สุด (Top 5)
const topPharmacists = computed(() => {
  const map = new Map()
  historyData.value.forEach(item => {
    const key = String(
      item.id_pharma || item.pharmacist_username || item.pharmacist_name || item.doctor_name || ''
    ).trim()
    if (!key) return

    if (!map.has(key)) {
      const rawName = item.pharmacist_name
        || (item.doctor_name || '').replace(/^ภก\.\s*/, '').trim()
        || item.pharmacist_username
        || 'ไม่ระบุชื่อ'
      map.set(key, {
        key,
        name: rawName,
        username: item.pharmacist_username || '',
        id_pharma: item.id_pharma || null,
        count: 0,
      })
    }
    map.get(key).count += 1
  })

  const profiles = overviewPharmas.value
  const findProfile = (entry) => {
    if (!profiles.length) return null
    return profiles.find(p =>
      (entry.id_pharma && String(p.id_pharma || p.id) === String(entry.id_pharma)) ||
      (entry.username && p.username && p.username === entry.username)
    )
  }

  const imagesPharma = useNuxtApp().$imagesPharma
  const defaultPharmaImage = imagesPharma('default.png')
  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(entry => {
      const profile = findProfile(entry)
      const displayName = profile
        ? `ภก. ${(profile.firstname || '').trim()} ${(profile.lastname || '').trim()}`.trim()
        : (entry.name.startsWith('ภก.') ? entry.name : `ภก. ${entry.name}`)
      const image = profile?.image
        ? imagesPharma(profile.image)
        : defaultPharmaImage
      // 🏪 แสดงชื่อร้านยาที่ทำงานอยู่ (แทน @username เดิม)
      //    เภสัชที่ยังไม่สังกัดร้าน → "ยังไม่ระบุร้าน"
      const storeName = profile?.store_name || profile?.work_place || ''
      return {
        ...entry,
        displayName,
        image,
        subText: storeName
          ? `🏪 ${storeName}`
          : 'ยังไม่ระบุร้านยา',
      }
    })
})

const maxRankCount = computed(() => {
  const top = topPharmacists.value[0]?.count || 0
  return top > 0 ? top : 1
})

onMounted(() => {
  fetchOverview()
})
</script>

<template>
  <AdminLayout active-tab="overview">
    <div class="overview-view fade-in">
      <header class="overview-hero">
        <div class="overview-hero-text">
          <span class="overview-eyebrow"><i class="fa-solid fa-chart-line"></i> Admin Overview</span>
          <h2 class="overview-title">ภาพรวมระบบ Telepharmacy</h2>
          <p class="overview-subtitle">สถิติผู้ใช้ เภสัชกร และใบสั่งยาจากฐานข้อมูลจริง</p>
        </div>
        <div class="overview-hero-badge">
          <i class="fa-solid fa-calendar-days"></i>
          <span>7 วันล่าสุด</span>
          <button type="button" class="overview-refresh" :disabled="isLoading" @click="fetchOverview" title="รีเฟรชข้อมูล">
            <i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': isLoading }"></i>
          </button>
        </div>
      </header>

      <div class="stat-grid">
        <div class="stat-card main-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-users"><i class="fa-solid fa-users"></i></span>
            <span class="stat-label">ผู้ใช้บริการในระบบ</span>
          </div>
          <span class="stat-value">{{ totalUserCount.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">บัญชีผู้ป่วยที่ลงทะเบียน</span>
        </div>
        <div class="stat-card dark-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-pharma"><i class="fa-solid fa-user-doctor"></i></span>
            <span class="stat-label">เภสัชกรที่ได้รับการอนุมัติ</span>
          </div>
          <span class="stat-value text-white">{{ totalPharmaCount.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote light">พร้อมให้บริการในแพลตฟอร์ม</span>
        </div>
        <div class="stat-card accent-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-rx"><i class="fa-solid fa-file-prescription"></i></span>
            <span class="stat-label">ใบสั่งยา 7 วันล่าสุด</span>
          </div>
          <span class="stat-value">{{ totalWeeklyCount.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">บันทึกจากระบบ Telepharmacy</span>
        </div>
      </div>

      <div class="dashboard-content">
        <div class="chart-card shadow-sm">
          <div class="chart-header">
            <div>
              <h3><i class="fa-solid fa-chart-column"></i> จำนวนใบสั่งยาที่บันทึก (7 วันล่าสุด)</h3>
              <p>ข้อมูลจริงจากระบบ • รวมทั้งหมด <strong>{{ totalWeeklyCount }}</strong> ใบ</p>
            </div>
          </div>

          <div v-if="isLoading" class="chart-loading">
            <div class="loading-ring"></div>
            <span>กำลังโหลดข้อมูล...</span>
          </div>
          <div v-else-if="totalWeeklyCount === 0" class="chart-empty">
            <i class="fa-regular fa-folder-open"></i>
            <span>ยังไม่มีการบันทึกใบสั่งยาในช่วง 7 วันที่ผ่านมา</span>
          </div>
          <div v-else class="bar-chart">
            <div class="bar-chart-grid">
              <div class="bar-chart-line" v-for="n in 4" :key="n"></div>
            </div>
            <div class="bar-chart-bars">
              <div
                v-for="day in weeklyChartData"
                :key="day.key"
                class="bar-column"
              >
                <div class="bar-track">
                  <div
                    class="bar"
                    :class="{ 'bar-zero': day.count === 0 }"
                    :style="{ height: ((day.count / maxChartCount) * 100) + '%' }"
                  >
                    <span class="bar-value">{{ day.count }}</span>
                    <div class="bar-fill"></div>
                  </div>
                </div>
                <div class="bar-label">
                  <span class="bar-day">{{ day.label }}</span>
                  <span class="bar-date">{{ day.dateLabel }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="top-list-card shadow-sm">
          <div class="top-list-header">
            <h3><i class="fa-solid fa-trophy"></i> เภสัชกรที่บันทึกใบสั่งยามากที่สุด</h3>
            <span class="top-list-badge">Top 5</span>
          </div>
          <div v-if="isLoading" class="empty-state-mini">
            <div class="loading-ring small"></div>
            <span>กำลังโหลด...</span>
          </div>
          <div v-else-if="topPharmacists.length === 0" class="empty-state-mini">
            <i class="fa-regular fa-clipboard"></i>
            <span>ยังไม่มีข้อมูลการบันทึกใบสั่งยา</span>
          </div>
          <div v-else class="pharma-rank-container">
            <div
              v-for="(pharma, idx) in topPharmacists"
              :key="pharma.key"
              class="rank-row"
              :class="{ 'rank-row-gold': idx === 0 }"
            >
              <div class="rank-profile">
                <span class="rank-medal" :class="`medal-${idx + 1}`">{{ idx + 1 }}</span>
                <div class="rank-avatar-wrap">
                  <img
                    :src="pharma.image"
                    alt="pharma"
                    @error="(e) => e.target.src = useNuxtApp().$imagesPharma('default.png')"
                  >
                </div>
                <div class="rank-name">
                  <strong>{{ pharma.displayName }}</strong>
                  <small>{{ pharma.subText || '—' }}</small>
                  <div class="rank-progress">
                    <div
                      class="rank-progress-fill"
                      :style="{ width: Math.round((pharma.count / maxRankCount) * 100) + '%' }"
                    ></div>
                  </div>
                </div>
              </div>
              <span class="rank-count">{{ pharma.count }} ใบ</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AdminLayout>
</template>

<style scoped>
@import "@/assets/admin_dashboard_page.css";
@import "@/assets/overview.css";
@import "@/assets/admin-shared.css";
</style>
