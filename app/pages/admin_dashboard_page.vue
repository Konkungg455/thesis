<script setup>
/**
 * 🚩 admin_dashboard_page.vue — ถือเป็น "หน้าแรก (Home)" ของผู้ดูแลระบบ
 *    เนื้อหาคือ Overview (สถิติรวม, กราฟใบสรุปรายการยา 7 วัน, อันดับเภสัชกร)
 *    ส่วน tab อื่น ๆ ถูกแยกไปไว้ในโฟลเดอร์ /app/pages/admin/
 */
import { ref, computed, onMounted, watch } from 'vue'

definePageMeta({ middleware: 'admin-only' })

const isLoading = ref(false)
const historyData = ref([])       // ใบสรุปรายการยา (สำหรับกราฟ + อันดับเภสัชกร)
const overviewUsers = ref([])     // ผู้ใช้บริการ (ตัด role admin ออก)
const overviewPharmas = ref([])   // เภสัชกรทั้งหมด
const chartPeriod = ref('week')   // day | week | month | year
const rankView = ref('pharma')    // pharma | store
const onlineActivity = ref({
  active_users: 0,
  active_pharmas: 0,
  online_users_now: 0,
  online_pharmas_now: 0,
})

const ONLINE_PERIOD_LABELS = {
  day: 'วันนี้',
  week: '7 วันล่าสุด',
  month: '30 วันล่าสุด',
  year: '12 เดือนล่าสุด',
}

const CHART_PERIOD_OPTIONS = [
  { value: 'day', label: 'วัน', statLabel: 'ใบสรุปรายการยาวันนี้', title: 'วันนี้ (รายชั่วโมง)', empty: 'ยังไม่มีการบันทึกใบสรุปรายการยาวันนี้' },
  { value: 'week', label: 'สัปดาห์', statLabel: 'ใบสรุปรายการยา 7 วันล่าสุด', title: '7 วันล่าสุด', empty: 'ยังไม่มีการบันทึกใบสรุปรายการยาในช่วง 7 วันที่ผ่านมา' },
  { value: 'month', label: 'เดือน', statLabel: 'ใบสรุปรายการยา 30 วันล่าสุด', title: '30 วันล่าสุด', empty: 'ยังไม่มีการบันทึกใบสรุปรายการยาในช่วง 30 วันที่ผ่านมา' },
  { value: 'year', label: 'ปี', statLabel: 'ใบสรุปรายการยา 12 เดือนล่าสุด', title: '12 เดือนล่าสุด', empty: 'ยังไม่มีการบันทึกใบสรุปรายการยาในช่วง 12 เดือนที่ผ่านมา' },
]

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

const parseCreatedAt = (item) => {
  if (!item?.created_at) return null
  const d = new Date(item.created_at)
  return Number.isNaN(d.getTime()) ? null : d
}

const activePeriodMeta = computed(() =>
  CHART_PERIOD_OPTIONS.find(o => o.value === chartPeriod.value) || CHART_PERIOD_OPTIONS[1]
)

const onlinePeriodLabel = computed(() =>
  ONLINE_PERIOD_LABELS[chartPeriod.value] || ONLINE_PERIOD_LABELS.week
)

const getPeriodRange = (period) => {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (period === 'week') {
    start.setDate(start.getDate() - 6)
  } else if (period === 'month') {
    start.setDate(start.getDate() - 29)
  } else if (period === 'year') {
    start.setFullYear(start.getFullYear(), start.getMonth() - 11, 1)
    start.setHours(0, 0, 0, 0)
  }

  return { start, end }
}

const periodFilteredData = computed(() => {
  const { start, end } = getPeriodRange(chartPeriod.value)
  return historyData.value.filter((item) => {
    const created = parseCreatedAt(item)
    if (!created) return false
    return created >= start && created <= end
  })
})

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

const fetchOnlineActivity = async () => {
  const { $apiUrl } = useNuxtApp()
  try {
    const res = await $fetch($apiUrl(`get-admin-overview-activity.php?period=${chartPeriod.value}`), {
      credentials: 'include',
    })
    if (res?.status === 'success' && res.data) {
      onlineActivity.value = {
        active_users: Number(res.data.active_users || 0),
        active_pharmas: Number(res.data.active_pharmas || 0),
        online_users_now: Number(res.data.online_users_now || 0),
        online_pharmas_now: Number(res.data.online_pharmas_now || 0),
      }
    }
  } catch (err) {
    console.error('Fetch online activity error:', err)
    onlineActivity.value = {
      active_users: 0,
      active_pharmas: 0,
      online_users_now: 0,
      online_pharmas_now: 0,
    }
  }
}

// 🚩 [Overview] สถิติจริงจาก DB
const totalUserCount = computed(() => overviewUsers.value.length)
const totalPharmaCount = computed(() => overviewPharmas.value.filter(p => p.status_verify == 1).length)

// 🚩 [Overview] ข้อมูลกราฟแท่งจำนวนใบสรุปรายการยา — เลือกช่วง วัน / สัปดาห์ / เดือน / ปี
const chartPeriodData = computed(() => {
  const period = chartPeriod.value
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayNames = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

  if (period === 'day') {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      key: `h-${hour}`,
      label: `${hour}`,
      dateLabel: 'น.',
      count: 0,
    }))
    periodFilteredData.value.forEach((item) => {
      const created = parseCreatedAt(item)
      if (!created) return
      const h = created.getHours()
      if (buckets[h]) buckets[h].count += 1
    })
    return buckets
  }

  if (period === 'week' || period === 'month') {
    const span = period === 'week' ? 7 : 30
    const days = []
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      days.push({
        key: d.toDateString(),
        label: dayNames[d.getDay()],
        dateLabel: `${d.getDate()}/${d.getMonth() + 1}`,
        count: 0,
      })
    }
    periodFilteredData.value.forEach((item) => {
      const created = parseCreatedAt(item)
      if (!created) return
      created.setHours(0, 0, 0, 0)
      const bucket = days.find(d => d.key === created.toDateString())
      if (bucket) bucket.count += 1
    })
    return days
  }

  // year — 12 เดือนล่าสุด
  const months = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: TH_MONTHS[d.getMonth()],
      dateLabel: String(d.getFullYear() + 543).slice(-2),
      count: 0,
      year: d.getFullYear(),
      month: d.getMonth(),
    })
  }
  periodFilteredData.value.forEach((item) => {
    const created = parseCreatedAt(item)
    if (!created) return
    const bucket = months.find(m => m.year === created.getFullYear() && m.month === created.getMonth())
    if (bucket) bucket.count += 1
  })
  return months
})

const maxChartCount = computed(() => {
  const max = Math.max(...chartPeriodData.value.map(d => d.count), 0)
  return max > 0 ? max : 1
})

const totalChartCount = computed(() => chartPeriodData.value.reduce((s, d) => s + d.count, 0))

const chartColumnClass = computed(() => ({
  'bar-chart-bars--week': chartPeriod.value === 'week',
  'bar-chart-bars--day': chartPeriod.value === 'day',
  'bar-chart-bars--month': chartPeriod.value === 'month',
  'bar-chart-bars--year': chartPeriod.value === 'year',
}))

const resolvePharmaRankKey = (item) => String(
  item.id_pharma || item.pharmacist_username || item.pharmacist_name || item.doctor_name || ''
).trim()

const resolvePharmaDisplayName = (item, profiles) => {
  const rawName = item.pharmacist_name
    || (item.doctor_name || '').replace(/^ภก\.\s*/, '').trim()
    || item.pharmacist_username
    || 'ไม่ระบุชื่อ'
  const idPharma = item.id_pharma || null
  const username = item.pharmacist_username || ''
  const profile = profiles.find(p =>
    (idPharma && String(p.id_pharma || p.id) === String(idPharma)) ||
    (username && p.username && p.username === username)
  )
  if (profile) {
    const full = `ภก. ${(profile.firstname || '').trim()} ${(profile.lastname || '').trim()}`.trim()
    if (full !== 'ภก.') return full
  }
  return rawName.startsWith('ภก.') ? rawName : `ภก. ${rawName}`
}

const resolveStoreName = (item, profiles) => {
  const direct = String(item.store_name || item.work_place || '').trim()
  if (direct) return direct
  const id = item.id_pharma
  if (!id || !profiles.length) return ''
  const profile = profiles.find(p => String(p.id_pharma || p.id) === String(id))
  return String(profile?.store_name || profile?.work_place || '').trim()
}

// 🚩 [Overview] อันดับเภสัชกรที่บันทึกใบสรุปรายการยามากที่สุด (Top 5) — ตามช่วงเวลาที่เลือก
const topPharmacists = computed(() => {
  const map = new Map()
  periodFilteredData.value.forEach(item => {
    const key = resolvePharmaRankKey(item)
    if (!key) return

    if (!map.has(key)) {
      map.set(key, {
        key,
        name: item.pharmacist_name
          || (item.doctor_name || '').replace(/^ภก\.\s*/, '').trim()
          || item.pharmacist_username
          || 'ไม่ระบุชื่อ',
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
  const top = activeRankList.value[0]?.count || 0
  return top > 0 ? top : 1
})

const topStores = computed(() => {
  const map = new Map()
  const profiles = overviewPharmas.value

  periodFilteredData.value.forEach((item) => {
    const storeName = resolveStoreName(item, profiles)
    if (!storeName) return
    const storeKey = storeName.toLowerCase()
    if (!map.has(storeKey)) {
      map.set(storeKey, { key: storeKey, name: storeName, count: 0, pharmaMap: new Map() })
    }
    const store = map.get(storeKey)
    store.count += 1

    const pharmaKey = resolvePharmaRankKey(item) || `rx-${store.count}`
    if (!store.pharmaMap.has(pharmaKey)) {
      store.pharmaMap.set(pharmaKey, {
        key: pharmaKey,
        displayName: resolvePharmaDisplayName(item, profiles),
        count: 0,
      })
    }
    store.pharmaMap.get(pharmaKey).count += 1
  })

  return [...map.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((entry, idx) => ({
      key: entry.key,
      name: entry.name,
      count: entry.count,
      displayName: entry.name,
      pharmaBreakdown: [...entry.pharmaMap.values()].sort((a, b) => b.count - a.count),
      image: null,
      rank: idx + 1,
    }))
})

const activeRankList = computed(() =>
  rankView.value === 'store' ? topStores.value : topPharmacists.value
)

const rankListTitle = computed(() =>
  rankView.value === 'store'
    ? 'ร้านยาที่ออกใบสรุปรายการยามากที่สุด'
    : 'เภสัชกรที่บันทึกใบสรุปรายการยามากที่สุด'
)

watch(chartPeriod, () => {
  fetchOnlineActivity()
})

onMounted(() => {
  fetchOverview()
  fetchOnlineActivity()
})
</script>

<template>
  <AdminLayout active-tab="overview">
    <div class="overview-view fade-in">
      <header class="overview-hero">
        <div class="overview-hero-text">
          <span class="overview-eyebrow"><i class="fa-solid fa-chart-line"></i> Admin Overview</span>
          <h2 class="overview-title">ภาพรวมระบบ Telepharmacy</h2>
          <p class="overview-subtitle">สถิติผู้ใช้ เภสัชกร และใบสรุปรายการยาจากฐานข้อมูลจริง</p>
        </div>
      </header>

      <div class="stat-grid">
        <div class="stat-card main-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-users"><i class="fa-solid fa-users"></i></span>
            <span class="stat-label">ผู้ใช้บริการในระบบ</span>
          </div>
          <span class="stat-value">{{ totalUserCount.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">บัญชีผู้ใช้บริการที่ลงทะเบียน</span>
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
            <span class="stat-label">{{ activePeriodMeta.statLabel }}</span>
          </div>
          <span class="stat-value">{{ totalChartCount.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">บันทึกจากระบบ Telepharmacy</span>
        </div>
        <div class="stat-card teal-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-teal"><i class="fa-solid fa-signal"></i></span>
            <span class="stat-label">ผู้ใช้บริการที่ใช้งาน ({{ onlinePeriodLabel }})</span>
          </div>
          <span class="stat-value">{{ onlineActivity.active_users.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">
            ออนไลน์ขณะนี้ {{ onlineActivity.online_users_now.toLocaleString('th-TH') }} คน
          </span>
        </div>
        <div class="stat-card amber-stat">
          <div class="stat-card-top">
            <span class="stat-icon stat-icon-amber"><i class="fa-solid fa-user-doctor"></i></span>
            <span class="stat-label">เภสัชกรที่ใช้งาน ({{ onlinePeriodLabel }})</span>
          </div>
          <span class="stat-value">{{ onlineActivity.active_pharmas.toLocaleString('th-TH') }}</span>
          <span class="stat-footnote">
            ออนไลน์ขณะนี้ {{ onlineActivity.online_pharmas_now.toLocaleString('th-TH') }} คน
          </span>
        </div>
      </div>

      <div class="dashboard-content">
        <div class="chart-card shadow-sm">
          <div class="chart-header">
            <div class="chart-header-text">
              <h3><i class="fa-solid fa-chart-column"></i> จำนวนใบสรุปรายการยาที่บันทึก ({{ activePeriodMeta.title }})</h3>
              <p>ข้อมูลจริงจากระบบ • รวมทั้งหมด <strong>{{ totalChartCount }}</strong> ใบ</p>
            </div>
            <div class="chart-period-tools">
              <div class="chart-period-badge">
                <i class="fa-solid fa-calendar-days"></i>
                <select v-model="chartPeriod" class="chart-period-select" aria-label="เลือกช่วงเวลา">
                  <option v-for="opt in CHART_PERIOD_OPTIONS" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </select>
              </div>
              <button type="button" class="chart-period-refresh" :disabled="isLoading" @click="fetchOverview(); fetchOnlineActivity()" title="รีเฟรชข้อมูล">
                <i class="fa-solid fa-rotate-right" :class="{ 'fa-spin': isLoading }"></i>
              </button>
            </div>
          </div>

          <div v-if="isLoading" class="chart-loading">
            <div class="loading-ring"></div>
            <span>กำลังโหลดข้อมูล...</span>
          </div>
          <div v-else-if="totalChartCount === 0" class="chart-empty">
            <i class="fa-regular fa-folder-open"></i>
            <span>{{ activePeriodMeta.empty }}</span>
          </div>
          <div v-else class="bar-chart" :class="{ 'bar-chart--compact': chartPeriod === 'month' || chartPeriod === 'day' }">
            <div class="bar-chart-grid">
              <div class="bar-chart-line" v-for="n in 4" :key="n"></div>
            </div>
            <div class="bar-chart-scroll">
              <div class="bar-chart-bars" :class="chartColumnClass">
                <div
                  v-for="bucket in chartPeriodData"
                  :key="bucket.key"
                  class="bar-column"
                >
                  <div class="bar-track">
                    <div
                      class="bar"
                      :class="{ 'bar-zero': bucket.count === 0 }"
                      :style="{ height: ((bucket.count / maxChartCount) * 100) + '%' }"
                    >
                      <span class="bar-value">{{ bucket.count }}</span>
                      <div class="bar-fill"></div>
                    </div>
                  </div>
                  <div class="bar-label">
                    <span class="bar-day">{{ bucket.label }}</span>
                    <span v-if="bucket.dateLabel" class="bar-date">{{ bucket.dateLabel }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="top-list-card shadow-sm">
          <div class="top-list-header">
            <h3><i class="fa-solid fa-trophy"></i> {{ rankListTitle }}</h3>
            <div class="top-list-tools">
              <div class="rank-view-toggle" role="group" aria-label="สลับมุมมองอันดับ">
                <button
                  type="button"
                  class="rank-view-btn"
                  :class="{ active: rankView === 'pharma' }"
                  @click="rankView = 'pharma'"
                >
                  <i class="fa-solid fa-user-doctor"></i> เภสัชกร
                </button>
                <button
                  type="button"
                  class="rank-view-btn"
                  :class="{ active: rankView === 'store' }"
                  @click="rankView = 'store'"
                >
                  <i class="fa-solid fa-store"></i> ร้านยาเภสัช
                </button>
              </div>
              <span class="top-list-badge">Top 5</span>
            </div>
          </div>
          <div v-if="isLoading" class="empty-state-mini">
            <div class="loading-ring small"></div>
            <span>กำลังโหลด...</span>
          </div>
          <div v-else-if="activeRankList.length === 0" class="empty-state-mini">
            <i class="fa-regular fa-clipboard"></i>
            <span>ยังไม่มีข้อมูลการบันทึกใบสรุปรายการยาในช่วงเวลาที่เลือก</span>
          </div>
          <div v-else class="pharma-rank-container">
            <div
              v-for="(entry, idx) in activeRankList"
              :key="entry.key"
              class="rank-row"
              :class="{
                'rank-row-gold': idx === 0,
                'rank-row-store': rankView === 'store' && entry.pharmaBreakdown?.length
              }"
            >
              <div class="rank-row-body">
                <span class="rank-medal" :class="`medal-${idx + 1}`">{{ idx + 1 }}</span>
                <div class="rank-avatar-wrap" :class="{ 'rank-avatar-store': rankView === 'store' }">
                  <img
                    v-if="entry.image"
                    :src="entry.image"
                    alt="profile"
                    @error="(e) => e.target.src = useNuxtApp().$imagesPharma('default.png')"
                  >
                  <i v-else class="fa-solid fa-store rank-store-icon"></i>
                </div>
                <div class="rank-name">
                  <strong>{{ entry.displayName }}</strong>
                  <div
                    v-if="rankView === 'store' && entry.pharmaBreakdown?.length"
                    class="rank-pharma-breakdown"
                  >
                    <div
                      v-for="pharma in entry.pharmaBreakdown"
                      :key="pharma.key"
                      class="rank-pharma-line"
                    >
                      <span class="rank-pharma-name">{{ pharma.displayName }}</span>
                      <span class="rank-pharma-count">{{ pharma.count }} ใบ</span>
                    </div>
                  </div>
                  <small v-else>{{ entry.subText || '—' }}</small>
                </div>
                <span class="rank-count">{{ entry.count }} ใบ</span>
              </div>
              <div class="rank-progress">
                <div
                  class="rank-progress-fill"
                  :style="{ width: Math.round((entry.count / maxRankCount) * 100) + '%' }"
                ></div>
              </div>
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
