<script setup>
import { ref, computed, onMounted } from 'vue'

definePageMeta({ middleware: 'store-only' });

const { apiBase, apiUrl, imagesPharma } = useApiBase();
const { user, syncFromServer } = useAuthUser();

const currentMenu = ref('staff') // 'staff', 'statement', 'register'
const sidebarOpen = ref(false)

const menuList = [
    { id: 'staff', text: 'สมาชิกในร้านยา', icon: 'fa-users-viewfinder' },
    { id: 'statement', text: 'Statement', icon: 'fa-file-invoice-dollar' },
    { id: 'register', text: 'ลงทะเบียนเภสัชกร', icon: 'fa-user-plus' }
]
const currentMenuLabel = computed(() => menuList.find(m => m.id === currentMenu.value)?.text || '')

const switchMenu = (menu) => {
    currentMenu.value = menu;
    searchKeyword.value = '';
    sidebarOpen.value = false;
    if (menu === 'statement') loadStatement();
}

const approved = ref([])
const pending = ref([])
const available = ref([])
const isLoading = ref(false)
const errorMsg = ref('')
const searchKeyword = ref('')

const selectedPharma = ref(null) // สำหรับ modal รายละเอียด

// --- Statement state ---
const statementPeriod = ref('all') // all | today | week | month
const incomeTotal = ref(0)
const incomePrescriptions = ref(0)
const incomeSlips = ref(0)
const txCount = ref(0)
const transactions = ref([])
const schedule = ref([])
const editingSchedule = ref(null) // {day_of_week, open_time, close_time, is_open}
const isLoadingStmt = ref(false)

// --- Slip evidence state ---
const slips = ref([])
const slipsTotalApproved = ref(0)
const slipsPending = ref(0)
const slipPreviewImg = ref('')
const txTab = ref('tx') // 'tx' (ประวัติธุรกรรม) | 'slip' (สลิปรออนุมัติ)

const DEFAULT_AVATAR = imagesPharma('default.png')

const avatarUrl = (p) => {
    const file = (p?.images_pharma || '').trim()
    if (!file) return DEFAULT_AVATAR
    return imagesPharma(file)
}

const licenseUrl = (p) => {
    if (!p || !p.license_image) return ''
    return apiUrl(`uploads/licenses/${encodeURIComponent(p.license_image)}`)
}

const licenseLoadFailed = ref(false)
const openDetail = (p) => {
    licenseLoadFailed.value = false
    selectedPharma.value = p
}

const storeId = computed(() => user.value?.store_id || user.value?.id || 0)

const loadPharmacists = async () => {
    if (!storeId.value) return
    isLoading.value = true
    errorMsg.value = ''
    try {
        const data = await $fetch(apiUrl('get-store-pharmacists.php'), {
            params: { store_id: storeId.value, t: Date.now() },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            approved.value = data.approved || []
            pending.value = data.pending || []
            available.value = data.available || []
        } else {
            errorMsg.value = data?.message || 'โหลดข้อมูลไม่สำเร็จ'
        }
    } catch (e) {
        console.error(e)
        errorMsg.value = 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    } finally {
        isLoading.value = false
    }
}

const filteredList = computed(() => {
    const list = currentMenu.value === 'staff'
        ? approved.value
        : available.value
    const kw = searchKeyword.value.trim().toLowerCase()
    if (!kw) return list
    return list.filter(p =>
        (`${p.firstname} ${p.lastname}`).toLowerCase().includes(kw)
        || (p.fullname || '').toLowerCase().includes(kw)
        || (p.username || '').toLowerCase().includes(kw)
        || (p.email || '').toLowerCase().includes(kw)
    )
})

const pharmaDisplayName = (p) => {
    const name = (p?.fullname || `${p?.firstname || ''} ${p?.lastname || ''}`).trim()
    if (!name) return 'เภสัชกร'
    return name.startsWith('ภก.') ? name : `ภก. ${name}`
}

const genderLabel = (g) => {
    const v = String(g || '').toUpperCase()
    if (v === 'M' || v === 'ชาย') return 'ชาย'
    if (v === 'F' || v === 'หญิง') return 'หญิง'
    return g || '-'
}

const approvePharma = async (p) => {
    if (!confirm(`อนุมัติเภสัชกร ${p.fullname} ให้เข้าทำงานในร้านนี้ใช่หรือไม่?`)) return
    try {
        const data = await $fetch(`${apiBase.value}/approve-pharmacist.php`, {
            method: 'POST',
            body: { id_pharma: p.id_pharma, store_id: storeId.value },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            await loadPharmacists()
            currentMenu.value = 'staff'
        } else {
            alert(data?.message || 'อนุมัติไม่สำเร็จ')
        }
    } catch (e) {
        alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    }
}

const invitePharma = async (p) => {
    if (!confirm(`เพิ่ม ${pharmaDisplayName(p)} เข้าข่ายร้านนี้ใช่หรือไม่?`)) return
    try {
        const data = await $fetch(apiUrl('invite-pharmacist-to-store.php'), {
            method: 'POST',
            body: { id_pharma: p.id_pharma, store_id: storeId.value },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            closeDetail()
            await loadPharmacists()
            currentMenu.value = 'staff'
            alert(data?.message || 'เพิ่มเภสัชกรเข้าร้านเรียบร้อย')
        } else {
            alert(data?.message || 'เพิ่มเข้าข่ายไม่สำเร็จ')
        }
    } catch (e) {
        alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    }
}

const rejectPharma = async (p) => {
    if (!confirm(`ปฏิเสธคำขอของเภสัชกร ${p.fullname} ใช่หรือไม่?`)) return
    try {
        const data = await $fetch(`${apiBase.value}/reject-pharmacist.php`, {
            method: 'POST',
            body: { id_pharma: p.id_pharma, store_id: storeId.value },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            await loadPharmacists()
        } else {
            alert(data?.message || 'ปฏิเสธไม่สำเร็จ')
        }
    } catch (e) {
        alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    }
}

const closeDetail = () => { selectedPharma.value = null }

const formatMoney = (n) => Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const formatDateThai = (iso) => {
    if (!iso) return ''
    const d = new Date(iso)
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })
}

const loadStatement = async () => {
    if (!storeId.value) return
    isLoadingStmt.value = true
    try {
        const [stmt, slipsData] = await Promise.all([
            $fetch(`${apiBase.value}/get-store-statement.php`, {
                params: { store_id: storeId.value, period: statementPeriod.value, t: Date.now() },
                credentials: 'include'
            }),
            $fetch(`${apiBase.value}/get-store-billing-slips.php`, {
                params: { store_id: storeId.value, t: Date.now() },
                credentials: 'include'
            })
        ])
        if (stmt?.status === 'success') {
            incomeTotal.value = stmt.income_total || 0
            incomePrescriptions.value = stmt.income_prescriptions || 0
            incomeSlips.value = stmt.income_slips || 0
            txCount.value = stmt.tx_count || 0
            transactions.value = stmt.transactions || []
            schedule.value = stmt.schedule || []
        }
        if (slipsData?.status === 'success') {
            slips.value = slipsData.slips || []
            slipsTotalApproved.value = slipsData.total_approved || 0
            slipsPending.value = slipsData.count_pending || 0
        }
    } catch (e) {
        console.error('โหลด Statement ไม่สำเร็จ:', e)
    } finally {
        isLoadingStmt.value = false
    }
}

const slipUrl = (filename) => filename ? `${apiBase.value}/uploads/slips/${filename}` : ''
const openSlipPreview = (filename) => { slipPreviewImg.value = slipUrl(filename) }
const closeSlipPreview = () => { slipPreviewImg.value = '' }

/* ----- Modal รายละเอียดสลิป ----- */
const selectedSlip = ref(null)
const openSlipDetail = (slip) => { selectedSlip.value = slip }
const closeSlipDetail = () => { selectedSlip.value = null }

const reviewSlip = async (slip, action) => {
    const label = action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'
    if (!confirm(`${label}สลิปจาก ${slip.pharmacist_name} จำนวน ฿ ${formatMoney(slip.amount)} ใช่หรือไม่?`)) return
    try {
        const data = await $fetch(`${apiBase.value}/review-billing-slip.php`, {
            method: 'POST',
            body: { id: slip.id, store_id: storeId.value, action },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            await loadStatement()
            closeSlipDetail()
            // ถ้าอนุมัติ → เด้งไปดูประวัติธุรกรรมที่เพิ่งถูกเพิ่มเข้าไป
            if (action === 'approve') {
                txTab.value = 'tx'
            }
        } else {
            alert(data?.message || 'อัปเดตไม่สำเร็จ')
        }
    } catch (e) {
        alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    }
}

const slipStatusLabel = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ปฏิเสธ' }
const slipStatusIcon = { pending: 'fa-hourglass-half', approved: 'fa-circle-check', rejected: 'fa-circle-xmark' }

const openEditSchedule = (s) => {
    editingSchedule.value = { ...s }
}
const closeEditSchedule = () => { editingSchedule.value = null }

const saveSchedule = async () => {
    const s = editingSchedule.value
    if (!s) return
    try {
        const data = await $fetch(`${apiBase.value}/update-store-schedule.php`, {
            method: 'POST',
            body: {
                store_id: storeId.value,
                day_of_week: s.day_of_week,
                open_time: s.open_time,
                close_time: s.close_time,
                is_open: s.is_open
            },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            closeEditSchedule()
            await loadStatement()
        } else {
            alert(data?.message || 'บันทึกไม่สำเร็จ')
        }
    } catch (e) {
        alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้')
    }
}

onMounted(async () => {
    await syncFromServer()
    await loadPharmacists()
})
</script>

<template>
   <header_store />

  <!-- Mobile top bar -->
  <div class="mobile-topbar">
    <button class="hamburger-btn" @click="sidebarOpen = true" aria-label="เปิดเมนู">
      <i class="fa-solid fa-bars"></i>
    </button>
    <div class="mobile-title">
      <i class="fa-solid fa-store"></i>
      <span>{{ currentMenuLabel }}</span>
    </div>
    <span v-if="pending.length" class="mobile-badge" @click="switchMenu('register')">{{ pending.length }}</span>
  </div>

  <div class="partner-layout">
    <!-- Sidebar -->
    <transition name="overlay-fade">
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>
    </transition>

    <aside class="sidebar shadow-lg" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <span><i class="fa-solid fa-store"></i> หมวดหมู่เมนู</span>
        <button class="sidebar-close" @click="sidebarOpen = false" aria-label="ปิดเมนู">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <nav class="menu-list">
        <button v-for="m in menuList" :key="m.id"
          class="menu-btn" :class="{ active: currentMenu === m.id, register: m.id === 'register' }"
          @click="switchMenu(m.id)">
          <i :class="['fa-solid', m.icon]"></i>
          <span class="menu-text">{{ m.text }}</span>
          <span v-if="m.id === 'register' && pending.length" class="menu-badge">{{ pending.length }}</span>
        </button>
      </nav>
    </aside>

    <main class="content-area">
      <!-- Staff List & Pharmacist Registration -->
      <div v-if="currentMenu === 'staff' || currentMenu === 'register'" class="fade-in">
        <header class="content-header shadow-sm">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input v-model="searchKeyword" type="text"
            :placeholder="currentMenu === 'staff' ? 'ค้นหาชื่อพนักงาน...' : 'ค้นหาเภสัชกรที่พร้อมเพิ่มเข้าข่าย...'"
            class="search-input">
          <button class="btn-refresh" @click="loadPharmacists" title="โหลดใหม่"><i class="fa-solid fa-rotate" :class="{ spin: isLoading }"></i></button>
        </header>

        <div v-if="errorMsg" class="error-banner">{{ errorMsg }}</div>

        <section class="list-container">
          <div v-if="isLoading && !filteredList.length" class="empty-state">
            <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลด...
          </div>
          <div v-else-if="!filteredList.length && !(currentMenu === 'register' && pending.length)" class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <p v-if="currentMenu === 'staff'">ยังไม่มีเภสัชกรประจำร้าน</p>
            <p v-else>ยังไม่มีเภสัชกรที่พร้อมเพิ่มเข้าข่าย</p>
          </div>

          <div v-if="currentMenu === 'register' && pending.length" class="pending-banner">
            <div class="pending-banner-head">
              <i class="fa-solid fa-user-clock"></i>
              <span>คำขอเข้าร้านรออนุมัติ ({{ pending.length }})</span>
            </div>
            <div v-for="p in pending" :key="'pending-' + p.id_pharma" class="data-card shadow-sm pending-card">
              <div class="info-group" @click="openDetail(p)">
                <div class="avatar"><img :src="avatarUrl(p)" @error="$event.target.src = DEFAULT_AVATAR"></div>
                <div class="details">
                  <span class="name">{{ pharmaDisplayName(p) }}</span>
                  <span class="role">รอการตรวจสอบสิทธิ์</span>
                </div>
              </div>
              <div class="actions">
                <button class="btn-green" @click="approvePharma(p)">อนุมัติ</button>
                <button class="btn-red" @click="rejectPharma(p)">ปฏิเสธ</button>
              </div>
            </div>
          </div>

          <div v-for="p in filteredList" :key="p.id_pharma" class="data-card shadow-sm" :class="{ 'register-card': currentMenu === 'register' }">
            <div class="info-group register-click" @click="currentMenu === 'register' ? openDetail(p) : null">
              <div class="avatar"><img :src="avatarUrl(p)" @error="$event.target.src = DEFAULT_AVATAR"></div>
              <div class="details">
                <span class="name">{{ currentMenu === 'register' ? pharmaDisplayName(p) : p.fullname }}</span>
                <span class="role">{{ currentMenu === 'staff' ? 'เภสัชกรประจำร้าน' : 'Pharmacist' }}</span>
              </div>
            </div>
            <div class="actions">
              <template v-if="currentMenu === 'staff'">
                <button class="btn-link" @click="openDetail(p)">แสดงรายละเอียด</button>
                <button class="btn-yellow" @click="rejectPharma(p)">นำออก</button>
              </template>
              <template v-else>
                <button class="btn-green btn-add-network" @click.stop="openDetail(p)">
                  <i class="fa-solid fa-plus"></i> เพิ่มเข้าข่าย
                </button>
              </template>
            </div>
          </div>
        </section>
      </div>

      <!-- Statement & Schedule -->
      <div v-if="currentMenu === 'statement'" class="fade-in dashboard-grid">
        <div class="main-stats">
          <!-- Hero รายได้สุทธิ -->
          <div class="income-card shadow-sm">
            <div class="income-head">
              <div class="income-head-title">
                <div class="income-icon"><i class="fa-solid fa-sack-dollar"></i></div>
                <div>
                  <h2>รายได้สุทธิ</h2>
                  <small class="text-muted">รายรับสะสมตามช่วงเวลา</small>
                </div>
              </div>
              <select v-model="statementPeriod" class="period-select" @change="loadStatement">
                <option value="all">ทั้งหมด</option>
                <option value="today">วันนี้</option>
                <option value="week">7 วันล่าสุด</option>
                <option value="month">30 วันล่าสุด</option>
              </select>
            </div>
            <div class="income-value">
              <template v-if="isLoadingStmt"><i class="fa-solid fa-spinner fa-spin"></i></template>
              <template v-else>
                <span class="income-currency">฿</span>{{ formatMoney(incomeTotal) }}
              </template>
            </div>
            <div class="income-breakdown">
              <div class="brk-item">
                <span><i class="fa-solid fa-file-prescription"></i> ใบสั่งยา</span>
                <strong>฿ {{ formatMoney(incomePrescriptions) }}</strong>
              </div>
              <div class="brk-item">
                <span><i class="fa-solid fa-money-check-dollar"></i> โอนเข้าบัญชี</span>
                <strong>฿ {{ formatMoney(incomeSlips) }}</strong>
              </div>
              <div class="brk-item highlight">
                <span><i class="fa-solid fa-receipt"></i> ธุรกรรม</span>
                <strong>{{ txCount }} รายการ</strong>
              </div>
            </div>
          </div>

          <!-- ตารางเวลาทำการ -->
          <div class="schedule-card shadow-sm">
            <div class="schedule-head">
              <h2><i class="fa-solid fa-calendar-week"></i> วันที่ให้บริการ</h2>
              <small class="text-muted">แตะเพื่อแก้ไขเวลา</small>
            </div>
            <div class="schedule-list">
              <div
                v-for="s in schedule"
                :key="s.day_of_week"
                class="schedule-row"
                :class="{ 'is-closed': !s.is_open }"
                @click="openEditSchedule(s)"
              >
                <div class="sch-day">
                  <span class="sch-dot" :class="{ off: !s.is_open }"></span>
                  <span class="sch-day-label">{{ s.day_label }}</span>
                </div>
                <div class="sch-time">
                  <i class="fa-regular fa-clock"></i>
                  <span v-if="s.is_open">{{ s.open_time }} – {{ s.close_time }}</span>
                  <span v-else class="closed-text">ปิดทำการ</span>
                </div>
                <div class="sch-right">
                  <span class="status-badge" :class="{ closed: !s.is_open }">
                    {{ s.is_open ? 'เปิด' : 'ปิด' }}
                  </span>
                  <button class="sch-edit-btn" @click.stop="openEditSchedule(s)" aria-label="แก้ไข">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside class="history-panel shadow-sm">
          <div class="tx-tabs">
            <button class="tx-tab" :class="{ active: txTab === 'tx' }" @click="txTab = 'tx'">
              <i class="fa-solid fa-receipt"></i> ประวัติธุรกรรม
              <span class="tx-tab-count">{{ transactions.length }}</span>
            </button>
            <button class="tx-tab" :class="{ active: txTab === 'slip' }" @click="txTab = 'slip'">
              <i class="fa-solid fa-money-check-dollar"></i> สลิปรออนุมัติ
              <span v-if="slipsPending" class="tx-tab-badge">{{ slipsPending }}</span>
            </button>
            <button class="btn-refresh ml-auto" @click="loadStatement" title="โหลดใหม่"><i class="fa-solid fa-rotate" :class="{ spin: isLoadingStmt }"></i></button>
          </div>

          <!-- Tab: ประวัติธุรกรรม (ใบสั่งยา + สลิปอนุมัติ รวมกัน) -->
          <div v-if="txTab === 'tx'">
            <div v-if="!transactions.length" class="empty-state-small">
              <i class="fa-solid fa-receipt"></i>
              <p>ยังไม่มีรายการธุรกรรม</p>
            </div>
            <div v-for="t in transactions" :key="`${t.type}-${t.id}`" class="transaction-item" :class="{ 'is-slip': t.type === 'slip' }">
              <div class="tx-row-top">
                <span class="tx-type-badge" :class="`type-${t.type}`">
                  <i :class="t.type === 'slip' ? 'fa-solid fa-money-check-dollar' : 'fa-solid fa-file-prescription'"></i>
                  {{ t.type === 'slip' ? 'โอนเข้าบัญชี' : 'ใบสั่งยา' }}
                </span>
                <img v-if="t.type === 'slip' && t.slip_image" :src="slipUrl(t.slip_image)" class="tx-slip-thumb" @click="openSlipPreview(t.slip_image)" title="ดูสลิป" />
              </div>
              <p class="user-name">{{ t.patient_name }}<small v-if="t.type !== 'slip'"> (ผู้ใช้บริการ)</small></p>
              <p class="staff-ref">โดย : {{ t.pharmacist_name }}</p>
              <div class="meta-info">
                <span>{{ formatDateThai(t.created_at) }}</span>
                <span>{{ t.time }} น.</span>
                <span class="price">฿ {{ formatMoney(t.amount) }}</span>
              </div>
            </div>
          </div>

          <!-- Tab: สลิปรออนุมัติ -->
          <div v-if="txTab === 'slip'">
            <div class="slip-summary">
              <div class="summary-row">
                <span>อนุมัติแล้วรวม</span>
                <strong class="price">฿ {{ formatMoney(slipsTotalApproved) }}</strong>
              </div>
              <div class="summary-row">
                <span>รออนุมัติ</span>
                <strong class="warn">{{ slipsPending }} รายการ</strong>
              </div>
            </div>

            <div v-if="!slips.length" class="empty-state-small">
              <i class="fa-solid fa-money-check-dollar"></i>
              <p>ยังไม่มีสลิปการโอน</p>
            </div>

            <div v-for="s in slips" :key="s.id" class="slip-item" :class="`st-${s.status}`">
              <div class="slip-head">
                <img :src="slipUrl(s.slip_image)" class="slip-thumb-store" @click="openSlipPreview(s.slip_image)" />
                <div class="slip-info">
                  <p class="slip-from">{{ s.pharmacist_name }}</p>
                  <p class="slip-note">{{ s.note || '—' }}</p>
                  <div class="slip-meta">
                    <span><i class="fa-solid fa-calendar"></i> {{ formatDateThai(s.transfer_date || s.created_at) }}</span>
                    <span class="slip-amount">฿ {{ formatMoney(s.amount) }}</span>
                  </div>
                </div>
              </div>
              <div class="slip-actions">
                <span class="slip-status-pill" :class="`pill-${s.status}`">{{ slipStatusLabel[s.status] }}</span>
                <button class="btn-info-sm" @click="openSlipDetail(s)">
                  <i class="fa-solid fa-circle-info"></i> ดูรายละเอียด
                </button>
                <template v-if="s.status === 'pending'">
                  <button class="btn-green-sm" @click="reviewSlip(s, 'approve')">
                    <i class="fa-solid fa-check"></i> อนุมัติ
                  </button>
                  <button class="btn-red-sm" @click="reviewSlip(s, 'reject')">
                    <i class="fa-solid fa-xmark"></i> ปฏิเสธ
                  </button>
                </template>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  </div>

  <!-- Modal รายละเอียดเภสัชกร -->
  <div v-if="selectedPharma" class="modal-overlay" @click.self="closeDetail">
    <div class="modal-card shadow-lg pharma-detail-modal">
      <div class="modal-body">
        <div class="pharma-modal-head">
          <div class="modal-avatar"><img :src="avatarUrl(selectedPharma)" @error="$event.target.src = DEFAULT_AVATAR"></div>
          <div>
            <h3>{{ pharmaDisplayName(selectedPharma) }}</h3>
            <p class="pharma-role">Pharmacist</p>
          </div>
        </div>

        <div class="pharma-form-grid">
          <div class="pharma-field full">
            <label>ชื่อผู้ใช้งาน</label>
            <div class="pharma-value">{{ selectedPharma.username || '-' }}</div>
          </div>
          <div class="pharma-field">
            <label>ชื่อ</label>
            <div class="pharma-value">{{ selectedPharma.firstname || '-' }}</div>
          </div>
          <div class="pharma-field">
            <label>นามสกุล</label>
            <div class="pharma-value">{{ selectedPharma.lastname || '-' }}</div>
          </div>
          <div class="pharma-field">
            <label>อายุ</label>
            <div class="pharma-value">{{ selectedPharma.age ? `${selectedPharma.age} ปี` : '-' }}</div>
          </div>
          <div class="pharma-field">
            <label>เพศ</label>
            <div class="pharma-value">{{ genderLabel(selectedPharma.gender) }}</div>
          </div>
          <div class="pharma-field full">
            <label>ตารางเวลาปฏิบัติงาน</label>
            <div class="pharma-value">{{ selectedPharma.work_time || '-' }}</div>
          </div>
          <div class="pharma-field full">
            <label>ใบประกอบวิชาชีพเภสัชกรรม</label>
            <div class="pharma-license-box">
              <template v-if="selectedPharma.license_image && selectedPharma.license_exists !== false && licenseUrl(selectedPharma) && !licenseLoadFailed">
                <a :href="licenseUrl(selectedPharma)" target="_blank" rel="noopener noreferrer">
                  <img
                    :src="licenseUrl(selectedPharma)"
                    alt="ใบประกอบวิชาชีพ"
                    class="license-img"
                    @error="licenseLoadFailed = true"
                  />
                </a>
              </template>
              <div v-else class="license-empty">
                <i class="fa-solid fa-file-medical"></i>
                <span>ยังไม่มีใบประกอบวิชาชีพ</span>
              </div>
            </div>
          </div>
          <div class="pharma-field">
            <label>หมายเลขโทรศัพท์</label>
            <div class="pharma-value">{{ selectedPharma.phone || '-' }}</div>
          </div>
          <div class="pharma-field">
            <label>อีเมล</label>
            <div class="pharma-value">{{ selectedPharma.email || '-' }}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer pharma-modal-footer">
        <template v-if="currentMenu === 'register' && !selectedPharma.id_store">
          <button class="btn-green btn-add-network" @click="invitePharma(selectedPharma)">
            <i class="fa-solid fa-plus"></i> เพิ่มเข้าข่าย
          </button>
        </template>
        <template v-else-if="selectedPharma.pending_store_id && selectedPharma.pending_store_id === storeId">
          <button class="btn-green" @click="approvePharma(selectedPharma); closeDetail()">อนุมัติ</button>
          <button class="btn-red" @click="rejectPharma(selectedPharma); closeDetail()">ปฏิเสธ</button>
        </template>
        <template v-else-if="currentMenu === 'staff'">
          <button class="btn-yellow" @click="rejectPharma(selectedPharma); closeDetail()">นำออก</button>
        </template>
        <button class="btn-grey" @click="closeDetail">ปิด</button>
      </div>
    </div>
  </div>

  <!-- Slip image preview -->
  <div v-if="slipPreviewImg" class="preview-overlay" @click.self="closeSlipPreview">
    <button class="preview-close" @click="closeSlipPreview"><i class="fa-solid fa-xmark"></i></button>
    <img :src="slipPreviewImg" alt="slip" class="preview-img" />
  </div>

  <!-- Modal รายละเอียดสลิป (ปุ่ม "ดูรายละเอียด") -->
  <div v-if="selectedSlip" class="modal-overlay" @click.self="closeSlipDetail">
    <div class="modal-card slip-detail-card shadow-lg">
      <div class="modal-header">
        <h2><i class="fa-solid fa-receipt"></i> รายละเอียดสลิปการโอน</h2>
        <button class="modal-close" @click="closeSlipDetail"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="slip-detail-status" :class="`st-${selectedSlip.status}`">
          <i class="fa-solid" :class="slipStatusIcon[selectedSlip.status]"></i>
          {{ slipStatusLabel[selectedSlip.status] }}
        </div>

        <div class="slip-detail-grid">
          <div class="sd-row"><label>เภสัชกรผู้โอน</label><span>{{ selectedSlip.pharmacist_name }}</span></div>
          <div class="sd-row"><label>จำนวนเงิน</label><span class="amount">฿ {{ formatMoney(selectedSlip.amount) }}</span></div>
          <div class="sd-row"><label>วันที่โอน</label><span>{{ formatDateThai(selectedSlip.transfer_date) }}</span></div>
          <div class="sd-row"><label>วันที่อัปโหลด</label><span>{{ formatDateThai(selectedSlip.created_at) }}</span></div>
          <div v-if="selectedSlip.reviewed_at" class="sd-row">
            <label>วันที่อนุมัติ/ปฏิเสธ</label><span>{{ formatDateThai(selectedSlip.reviewed_at) }}</span>
          </div>
          <div class="sd-row full"><label>หมายเหตุ</label><span>{{ selectedSlip.note || '—' }}</span></div>
        </div>

        <div class="slip-detail-image-wrap">
          <label class="sd-img-label"><i class="fa-solid fa-image"></i> ภาพสลิปการโอน</label>
          <div v-if="selectedSlip.slip_image" class="sd-img-box">
            <img
              :src="slipUrl(selectedSlip.slip_image)"
              alt="slip"
              class="sd-img"
              @click="openSlipPreview(selectedSlip.slip_image)"
              @error="(e) => e.target.style.display = 'none'"
            />
            <p class="sd-img-hint">
              <i class="fa-solid fa-magnifying-glass-plus"></i> คลิกที่รูปเพื่อขยายดูภาพเต็ม
            </p>
          </div>
          <div v-else class="sd-img-missing">
            <i class="fa-solid fa-file-circle-xmark"></i>
            <p>ไม่พบไฟล์สลิป</p>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <template v-if="selectedSlip.status === 'pending'">
          <button class="btn-green" @click="reviewSlip(selectedSlip, 'approve')">
            <i class="fa-solid fa-check"></i> อนุมัติสลิป
          </button>
          <button class="btn-red" @click="reviewSlip(selectedSlip, 'reject')">
            <i class="fa-solid fa-xmark"></i> ปฏิเสธสลิป
          </button>
        </template>
        <button class="btn-grey" @click="closeSlipDetail">ปิด</button>
      </div>
    </div>
  </div>

  <!-- Modal แก้ไขเวลาทำการ -->
  <div v-if="editingSchedule" class="modal-overlay" @click.self="closeEditSchedule">
    <div class="modal-card schedule-modal shadow-lg">
      <div class="modal-header">
        <h2>แก้ไขเวลาทำการ — {{ editingSchedule.day_label }}</h2>
        <button class="modal-close" @click="closeEditSchedule"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="switch-row">
          <label>สถานะวันนี้</label>
          <div class="switch-toggle">
            <button class="toggle-btn" :class="{ active: editingSchedule.is_open === 1 }"
                    @click="editingSchedule.is_open = 1">เปิด</button>
            <button class="toggle-btn" :class="{ active: editingSchedule.is_open === 0 }"
                    @click="editingSchedule.is_open = 0">ปิด</button>
          </div>
        </div>
        <div class="time-grid">
          <div>
            <label>เวลาเปิด</label>
            <input v-model="editingSchedule.open_time" type="time" :disabled="!editingSchedule.is_open" />
          </div>
          <div>
            <label>เวลาปิด</label>
            <input v-model="editingSchedule.close_time" type="time" :disabled="!editingSchedule.is_open" />
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-grey" @click="closeEditSchedule">ยกเลิก</button>
        <button class="btn-green" @click="saveSchedule">บันทึก</button>
      </div>
    </div>
  </div>

  <Footer1 />
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600&display=swap');
@import "@/assets/admin_dashboard_page.css";

/* --- Layout Base --- */
.partner-layout {
  font-family: 'Kanit', sans-serif;
  display: flex;
  min-height: 100vh;
  background: linear-gradient(180deg, #eef2f9 0%, #f8fafc 100%);
}

/* Mobile top bar (hidden on desktop) */
.mobile-topbar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 50;
  background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%);
  color: white;
  padding: 12px 16px;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(30, 58, 138, 0.18);
}
.hamburger-btn {
  background: rgba(255,255,255,0.15);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: 0.2s;
}
.hamburger-btn:hover { background: rgba(255,255,255,0.25); }
.mobile-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 1.05rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  /* บังคับสีขาว — กันกฎ global .mobile-title { color:#00469c } จากหน้าอื่นรั่วมาทับ (SPA) */
  color: #fff;
}
.mobile-title i,
.mobile-title span { color: #fff; }
.mobile-badge {
  background: #ef4444; color: white; padding: 4px 10px;
  border-radius: 999px; font-weight: 600; font-size: 0.8rem;
  cursor: pointer; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
}

/* Sidebar overlay (mobile only) */
.sidebar-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 90;
  backdrop-filter: blur(2px);
}
.overlay-fade-enter-active, .overlay-fade-leave-active { transition: opacity 0.25s; }
.overlay-fade-enter-from, .overlay-fade-leave-to { opacity: 0; }

.sidebar {
  width: 280px;
  background: linear-gradient(180deg, #0d4c9e 0%, #1e3a8a 18%, #3b82f6 100%);
  color: white;
  padding: 0 20px 30px;
  flex-shrink: 0;
}
.sidebar-header {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 -20px 24px;
  padding: 18px 20px;
  background: rgba(13, 76, 158, 0.45);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.sidebar-header span { display: inline-flex; align-items: center; gap: 10px; }
.sidebar-close {
  display: none;
  background: rgba(255,255,255,0.15);
  border: none;
  color: white;
  width: 36px; height: 36px;
  border-radius: 10px;
  font-size: 1rem;
  cursor: pointer;
}
.content-area { flex: 1; padding: 40px; display: flex; flex-direction: column; gap: 25px; min-width: 0; }

/* --- Menu & Sidebar --- */
.menu-list { display: flex; flex-direction: column; gap: 12px; }
.menu-btn {
  width: 100%;
  padding: 14px 16px;
  border-radius: 12px;
  border: none;
  background: rgba(255,255,255,0.1);
  color: white;
  text-align: left;
  cursor: pointer;
  transition: all 0.25s ease;
  display: flex;
  gap: 12px;
  align-items: center;
  position: relative;
  font-size: 0.95rem;
}
.menu-btn:hover { background: rgba(255,255,255,0.22); transform: translateX(2px); }
.menu-btn.active {
  background: #ffffff;
  color: #1e3a8a;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(0,0,0,0.12);
  transform: translateX(0);
}
.menu-btn.register { margin-top: 12px; border: 1px dashed rgba(255,255,255,0.4); }
.menu-text { flex: 1; min-width: 0; }
.menu-badge {
  background: #ef4444; color: white; font-size: 0.75rem;
  padding: 2px 8px; border-radius: 999px; font-weight: 600;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);
}

/* --- Cards & General UI --- */
.content-header { background: white; border-radius: 15px; padding: 15px 25px; display: flex; gap: 15px; align-items: center; border: 1px solid #e2e8f0; }
.search-input { border: none; width: 100%; outline: none; font-size: 1rem; }
.btn-refresh {
  background: #f1f5f9; border: none; padding: 8px 12px; border-radius: 8px;
  cursor: pointer; color: #475569; transition: 0.2s;
}
.btn-refresh:hover { background: #e2e8f0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.data-card, .income-card, .schedule-card, .history-panel { background: white; border-radius: 15px; padding: 20px; border: 1px solid #e2e8f0; }

.error-banner {
  background: #fef2f2; color: #991b1b; padding: 12px 18px;
  border-radius: 12px; border: 1px solid #fecaca; margin-top: 12px;
}
.empty-state {
  text-align: center; padding: 60px 20px; color: #94a3b8;
  background: white; border-radius: 15px; border: 1px dashed #cbd5e1;
}
.empty-state i { font-size: 2.5rem; display: block; margin-bottom: 12px; }

/* --- Data Lists (Staff & Register) --- */
.list-container { display: flex; flex-direction: column; gap: 12px; margin-top: 20px; }
.data-card { display: flex; justify-content: space-between; align-items: center; transition: 0.2s; }
.data-card:hover { transform: translateY(-2px); border-color: #3b82f6; }
.info-group { display: flex; align-items: center; gap: 15px; }
.avatar img { width: 50px; height: 50px; border-radius: 50%; background: #f1f5f9; padding: 5px; object-fit: cover; }
.details .name { font-weight: 500; color: #1e293b; display: block; }
.details .role { font-size: 0.85rem; color: #64748b; }

/* --- Dashboard & Statement --- */
.dashboard-grid { display: grid; grid-template-columns: 1fr 350px; gap: 20px; }
.main-stats { display: flex; flex-direction: column; gap: 20px; }

/* === Income hero card === */
.income-card {
  background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #e2e8f0;
  position: relative;
  overflow: hidden;
}
.income-card::before {
  content: '';
  position: absolute;
  top: -40px; right: -40px;
  width: 180px; height: 180px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%);
  pointer-events: none;
}
.income-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
  position: relative;
}
.income-head-title { display: flex; gap: 12px; align-items: center; }
.income-icon {
  width: 48px; height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
  color: white;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.25rem;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.25);
  flex-shrink: 0;
}
.income-head h2 { margin: 0; font-size: 1.05rem; color: #1e293b; font-weight: 600; line-height: 1.2; }
.income-head .text-muted { font-size: 0.78rem; }

.period-select {
  border: 1px solid #cbd5e1;
  background: white;
  color: #1e3a8a;
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: 0.2s;
  font-family: inherit;
}
.period-select:hover { border-color: #3b82f6; }
.period-select:focus { border-color: #1e3a8a; box-shadow: 0 0 0 3px rgba(30, 58, 138, 0.1); }

.income-value {
  font-size: 2.6rem; font-weight: 700;
  text-align: center;
  margin: 22px 0 6px;
  color: #1e293b;
  letter-spacing: -1px;
  position: relative;
}
.income-currency {
  font-size: 1.4rem; font-weight: 500;
  color: #64748b; margin-right: 6px;
  vertical-align: top; line-height: 1;
}
.income-value small { font-size: 1rem; color: #64748b; font-weight: 400; }
.income-meta { text-align: center; color: #64748b; font-size: 0.85rem; }
.income-breakdown {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
  margin-top: 18px; padding-top: 16px; border-top: 1px dashed #e2e8f0;
  position: relative;
}
.brk-item {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 12px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 4px;
  font-size: 0.82rem;
  transition: 0.2s;
}
.brk-item:hover { transform: translateY(-2px); border-color: #3b82f6; }
.brk-item span { color: #64748b; display: flex; align-items: center; gap: 6px; }
.brk-item strong { color: #1e293b; font-size: 1rem; font-weight: 600; }
.brk-item.highlight { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-color: #86efac; }
.brk-item.highlight strong { color: #15803d; }

/* === Schedule card === */
.schedule-card { padding: 22px; }
.schedule-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 14px; gap: 10px; flex-wrap: wrap;
}
.schedule-head h2 {
  margin: 0; font-size: 1.05rem; color: #1e293b; font-weight: 600;
  display: flex; align-items: center; gap: 8px;
}
.schedule-head h2 i { color: #3b82f6; }
.schedule-list { display: flex; flex-direction: column; gap: 8px; }
.schedule-row {
  display: grid;
  grid-template-columns: 110px 1fr auto;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fafbfc;
  cursor: pointer;
  transition: 0.2s;
}
.schedule-row:hover { border-color: #3b82f6; background: #eff6ff; transform: translateX(2px); }
.schedule-row.is-closed { background: #fff7f7; border-color: #fecaca; }
.schedule-row.is-closed:hover { background: #fee2e2; border-color: #ef4444; }
.sch-day { display: flex; align-items: center; gap: 10px; }
.sch-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
}
.sch-dot.off { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.18); }
.sch-day-label { font-weight: 600; color: #1e293b; }
.sch-time {
  display: flex; align-items: center; gap: 8px;
  color: #475569; font-size: 0.9rem; font-variant-numeric: tabular-nums;
}
.sch-time i { color: #94a3b8; }
.sch-time .closed-text { color: #b91c1c; font-style: italic; }
.sch-right { display: flex; align-items: center; gap: 10px; }
.sch-edit-btn {
  background: white;
  border: 1px solid #cbd5e1;
  color: #475569;
  width: 34px; height: 34px;
  border-radius: 10px;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: 0.2s;
}
.sch-edit-btn:hover { background: #3b82f6; color: white; border-color: #3b82f6; transform: scale(1.05); }
.status-badge.closed { background: #fee2e2; color: #991b1b; }
.transaction-item { padding: 12px; border: 1px solid #eee; border-radius: 10px; margin-top: 10px; font-size: 0.85rem; }
.transaction-item.is-slip { background: #f0fdf4; border-color: #bbf7d0; border-left: 4px solid #22c55e; }
.tx-row-top {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 6px;
}
.tx-type-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 2px 9px; border-radius: 999px;
  font-size: 0.72rem; font-weight: 600;
}
.tx-type-badge.type-prescription { background: #eff6ff; color: #1d4ed8; }
.tx-type-badge.type-slip { background: #dcfce7; color: #166534; }
.tx-slip-thumb {
  width: 36px; height: 36px; object-fit: cover; border-radius: 6px;
  border: 1px solid #bbf7d0; cursor: pointer; transition: 0.2s;
}
.tx-slip-thumb:hover { transform: scale(1.1); border-color: #22c55e; }
.user-name { font-weight: 600; color: #3b82f6; }
.staff-ref { color: #64748b; margin: 4px 0; }
.meta-info { display: flex; justify-content: space-between; margin-top: 5px; color: #94a3b8; gap: 8px; }
.price { color: #10b981; font-weight: 600; }
.empty-state-small {
  text-align: center; color: #94a3b8; padding: 30px 10px;
}
.empty-state-small i { font-size: 1.8rem; display: block; margin-bottom: 8px; }

/* --- Slip transaction tabs --- */
.tx-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 12px;
  padding-bottom: 4px;
}
.tx-tab {
  background: none;
  border: none;
  padding: 8px 12px;
  cursor: pointer;
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 500;
  border-radius: 8px 8px 0 0;
  position: relative;
  transition: 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}
.tx-tab:hover { background: #f8fafc; color: #1e293b; }
.tx-tab.active { color: #1e3a8a; font-weight: 600; border-bottom: 2px solid #1e3a8a; margin-bottom: -1px; }
.tx-tab-count {
  background: #e2e8f0; color: #475569;
  padding: 1px 8px; border-radius: 999px; font-size: 0.75rem;
}
.tx-tab.active .tx-tab-count { background: #1e3a8a; color: white; }
.tx-tab-badge {
  background: #ef4444; color: white;
  padding: 1px 8px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
}
.ml-auto { margin-left: auto; }

.slip-summary {
  background: #f8fafc;
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.summary-row {
  display: flex; justify-content: space-between;
  padding: 4px 0; font-size: 0.85rem; color: #475569;
}
.summary-row .warn { color: #b45309; }

.slip-item {
  padding: 12px; border: 1px solid #eee; border-radius: 10px;
  margin-top: 10px; transition: 0.2s;
}
.slip-item.st-approved { border-left: 4px solid #22c55e; }
.slip-item.st-pending  { border-left: 4px solid #f59e0b; }
.slip-item.st-rejected { border-left: 4px solid #ef4444; opacity: 0.75; }

.slip-head { display: flex; gap: 10px; align-items: flex-start; }
.slip-thumb-store {
  width: 48px; height: 48px; object-fit: cover; border-radius: 8px;
  border: 1px solid #e2e8f0; cursor: pointer; flex-shrink: 0;
  transition: transform 0.2s;
}
.slip-thumb-store:hover { transform: scale(1.05); border-color: #3b82f6; }
.slip-info { flex: 1; min-width: 0; }
.slip-from { font-weight: 600; color: #1e293b; margin: 0 0 2px; font-size: 0.9rem; }
.slip-note { color: #64748b; font-size: 0.8rem; margin: 0 0 6px; }
.slip-meta {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.78rem; color: #94a3b8; gap: 8px;
}
.slip-amount { color: #10b981; font-weight: 600; font-size: 0.95rem; }
.slip-actions {
  display: flex; gap: 6px; margin-top: 10px;
  align-items: center; justify-content: flex-end; flex-wrap: wrap;
}
.slip-status-pill {
  padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; font-weight: 600;
  margin-right: auto;
}
.pill-pending { background: #fef9c3; color: #854d0e; }
.pill-approved { background: #dcfce7; color: #166534; }
.pill-rejected { background: #fee2e2; color: #991b1b; }

.btn-green-sm, .btn-red-sm, .btn-info-sm {
  padding: 5px 12px; border: none; border-radius: 8px;
  font-size: 0.8rem; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  transition: all 0.15s ease;
}
.btn-green-sm { background: #22c55e; color: white; }
.btn-green-sm:hover { background: #16a34a; }
.btn-red-sm { background: #ef4444; color: white; }
.btn-red-sm:hover { background: #dc2626; }
.btn-info-sm { background: #3b82f6; color: white; }
.btn-info-sm:hover { background: #2563eb; }

/* ===== Modal รายละเอียดสลิป ===== */
.slip-detail-card { max-width: 560px; }
.slip-detail-status {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 999px;
  font-weight: 700; font-size: 0.9rem;
  margin-bottom: 18px;
}
.slip-detail-status.st-pending  { background: #fef3c7; color: #92400e; }
.slip-detail-status.st-approved { background: #dcfce7; color: #166534; }
.slip-detail-status.st-rejected { background: #fee2e2; color: #991b1b; }

.slip-detail-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px;
  margin-bottom: 20px;
  padding: 14px 16px;
  background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;
}
.slip-detail-grid .sd-row { display: flex; flex-direction: column; gap: 4px; }
.slip-detail-grid .sd-row.full { grid-column: 1 / -1; }
.slip-detail-grid label { font-size: 0.78rem; color: #64748b; font-weight: 600; }
.slip-detail-grid span { color: #0f172a; font-size: 0.92rem; font-weight: 500; word-break: break-word; }
.slip-detail-grid .amount { color: #059669; font-size: 1.1rem; font-weight: 700; }

.slip-detail-image-wrap { margin-bottom: 8px; }
.sd-img-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 0.85rem; color: #475569; font-weight: 700;
  margin-bottom: 8px;
}
.sd-img-box {
  text-align: center;
  padding: 14px;
  background: #f1f5f9; border-radius: 10px; border: 1px dashed #cbd5e1;
}
.sd-img {
  max-width: 100%; max-height: 360px;
  border-radius: 8px; cursor: zoom-in;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  transition: transform 0.15s ease;
}
.sd-img:hover { transform: scale(1.02); }
.sd-img-hint {
  margin: 10px 0 0; font-size: 0.78rem; color: #64748b;
}
.sd-img-missing {
  text-align: center; padding: 30px;
  background: #fef2f2; border: 1px dashed #fca5a5; border-radius: 10px;
  color: #991b1b;
}
.sd-img-missing i { font-size: 2rem; margin-bottom: 6px; display: block; }
.sd-img-missing p { margin: 0; font-size: 0.9rem; font-weight: 600; }

@media (max-width: 600px) {
  .slip-detail-grid { grid-template-columns: 1fr; }
}

/* Preview overlay */
.preview-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.85);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000; padding: 30px;
}
.preview-img { max-width: 90vw; max-height: 90vh; border-radius: 12px; }
.preview-close {
  position: absolute; top: 20px; right: 24px;
  background: rgba(255,255,255,0.2); color: white; border: none;
  width: 44px; height: 44px; border-radius: 50%;
  font-size: 1.4rem; cursor: pointer;
}
.preview-close:hover { background: rgba(255,255,255,0.35); }

/* --- Schedule edit modal --- */
.schedule-modal { max-width: 460px; }
.switch-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.switch-row label { font-weight: 500; color: #334155; }
.switch-toggle { display: inline-flex; background: #f1f5f9; border-radius: 999px; padding: 4px; gap: 4px; }
.toggle-btn {
  border: none; background: transparent; padding: 8px 18px; cursor: pointer;
  border-radius: 999px; color: #64748b; font-weight: 500; transition: 0.2s;
}
.toggle-btn.active { background: #1e3a8a; color: white; }
.time-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.time-grid label { display: block; font-size: 0.8rem; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
.time-grid input {
  width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px;
  font-size: 1rem; font-family: inherit;
}
.time-grid input:disabled { background: #f1f5f9; color: #94a3b8; cursor: not-allowed; }

/* --- Shared Buttons & Helpers --- */
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.flex-center { display: flex; align-items: center; }
.gap-3 { gap: 15px; }
.actions { display: flex; gap: 10px; align-items: center; }

.btn-yellow, .btn-green, .btn-red, .btn-grey { border: none; padding: 8px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-yellow { background: #fbbf24; color: #78350f; }
.btn-yellow:hover { background: #f59e0b; }
.btn-green { background: #22c55e; color: white; }
.btn-green:hover { background: #16a34a; }
.btn-red { background: #ef4444; color: white; }
.btn-red:hover { background: #dc2626; }
.btn-grey { background: #e2e8f0; color: #334155; }
.btn-grey:hover { background: #cbd5e1; }
.btn-link { background: none; border: none; color: #3b82f6; text-decoration: underline; cursor: pointer; font-size: 0.9rem; }
.btn-add-network {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; white-space: nowrap;
}
.register-card { cursor: default; }
.register-click { cursor: pointer; flex: 1; min-width: 0; }

.pending-banner {
  margin-bottom: 16px; padding: 14px;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 14px;
}
.pending-banner-head {
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; color: #92400e; margin-bottom: 10px;
}
.pending-card { margin-top: 8px; }

/* Pharmacist detail modal (register) */
.pharma-detail-modal { max-width: 520px; border-radius: 16px; }
.pharma-modal-head {
  display: flex; gap: 16px; align-items: center;
  margin-bottom: 20px; padding-bottom: 16px;
  border-bottom: 1px solid #e2e8f0;
}
.pharma-modal-head h3 { margin: 0; font-size: 1.15rem; color: #1e293b; }
.pharma-role { margin: 4px 0 0; color: #64748b; font-size: 0.9rem; }
.pharma-form-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px;
}
.pharma-field { display: flex; flex-direction: column; gap: 6px; }
.pharma-field.full { grid-column: 1 / -1; }
.pharma-field label {
  font-size: 0.78rem; color: #64748b; font-weight: 500;
}
.pharma-value {
  background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 10px; padding: 10px 12px;
  color: #1e293b; font-size: 0.92rem; min-height: 42px;
  display: flex; align-items: center; word-break: break-word;
}
.pharma-license-box {
  min-height: 120px; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #f8fafc; display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
.pharma-license-box .license-img {
  max-width: 100%; max-height: 200px; object-fit: contain; display: block;
}
.license-empty {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  color: #94a3b8; padding: 24px; font-size: 0.88rem;
}
.license-empty i { font-size: 1.6rem; }
.pharma-modal-footer { justify-content: center; gap: 12px; flex-wrap: wrap; }
.pharma-modal-footer .btn-add-network { min-width: 160px; justify-content: center; }
.pharma-modal-footer .btn-grey { min-width: 100px; }

.btn-blue-sm { background: #0ea5e9; color: white; border: none; padding: 5px 12px; border-radius: 8px; cursor: pointer; }
.status-badge { font-size: 0.8rem; background: #dcfce7; color: #166534; padding: 3px 10px; border-radius: 6px; }

/* --- Modal --- */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
  padding: 20px; backdrop-filter: blur(2px);
}
.modal-card {
  background: white; border-radius: 18px; width: 100%; max-width: 600px;
  max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;
  animation: modalIn 0.25s ease;
}
@keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-header {
  padding: 18px 25px; border-bottom: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-header h2 { margin: 0; font-size: 1.2rem; color: #1e293b; font-weight: 600; }
.modal-close {
  background: none; border: none; font-size: 1.4rem; color: #64748b;
  cursor: pointer; padding: 4px 10px; border-radius: 8px;
}
.modal-close:hover { background: #f1f5f9; }

.modal-body { padding: 25px; overflow-y: auto; }
.modal-top { display: flex; gap: 18px; align-items: center; margin-bottom: 20px; }
.modal-avatar img { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid #e2e8f0; }
.modal-top h3 { margin: 0 0 4px; color: #1e293b; }
.text-muted { color: #64748b; font-size: 0.9rem; }

.badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; margin-top: 6px; }
.badge-green { background: #dcfce7; color: #166534; }
.badge-yellow { background: #fef9c3; color: #854d0e; }

.info-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px;
  padding: 15px; background: #f8fafc; border-radius: 12px;
}
.info-grid > div { display: flex; flex-direction: column; }
.info-grid > div.full { grid-column: 1 / -1; }
.info-grid label { font-size: 0.78rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.info-grid span { color: #1e293b; font-weight: 500; margin-top: 2px; }

.license-section { margin-top: 20px; }
.license-section label { font-size: 0.85rem; color: #475569; display: block; margin-bottom: 8px; font-weight: 500; }
.license-img { max-width: 100%; max-height: 420px; object-fit: contain; border-radius: 10px; border: 1px solid #e2e8f0; display: block; background: #f8fafc; }
.license-hint { margin: 8px 0 0; font-size: 0.8rem; color: #64748b; }
.license-missing {
  padding: 20px; border-radius: 10px; background: #fef2f2; border: 1px dashed #fecaca;
  text-align: center; color: #991b1b;
}
.license-missing i { font-size: 2rem; margin-bottom: 8px; display: block; }
.license-missing p { margin: 0 0 4px; font-weight: 500; }
.license-missing small { color: #b91c1c; opacity: 0.85; }

.modal-footer {
  padding: 16px 25px; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: flex-end; gap: 10px;
}

/* --- Anim --- */
.fade-in { animation: fadeIn 0.4s ease forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

/* ============================================================
   RESPONSIVE — Desktop (≥ 901px)
   ============================================================ */
@media (min-width: 901px) {
  .mobile-topbar { display: none !important; }
}

/* Tablet landscape & small desktop ≤ 1280px */
@media (max-width: 1280px) and (min-width: 901px) {
  .sidebar { width: 240px !important; padding: 0 20px 26px !important; }
  .content-area { padding: 28px; }
  .dashboard-grid { grid-template-columns: 1fr 320px; gap: 18px; }
}

/* Tablet ≤ 1024px — collapse dashboard to single column (but sidebar still inline) */
@media (max-width: 1024px) and (min-width: 901px) {
  .content-area { padding: 24px; gap: 20px; }
  .dashboard-grid { grid-template-columns: 1fr; gap: 18px; }
  .history-panel { order: 2; }
  .modal-card { max-width: 90vw; }
  .income-value { font-size: 2.1rem; }
}

/* ============================================================
   Mobile / Tablet portrait ≤ 900px — Hamburger drawer
   ============================================================ */
@media (max-width: 900px) {
  .mobile-topbar { display: flex !important; }
  .partner-layout {
    flex-direction: column !important;
    background: #f0f4f8;
  }

  /* Sidebar = off-canvas drawer */
  .sidebar {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    height: 100vh !important;
    width: 82% !important;
    max-width: 320px !important;
    padding: 0 20px 26px !important;
    z-index: 2000 !important;
    transform: translateX(-105%);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0.3s;
    overflow-y: auto;
    box-shadow: 6px 0 30px rgba(0, 0, 0, 0.35);
    visibility: hidden;
    pointer-events: none;
  }
  .sidebar.open {
    transform: translateX(0);
    visibility: visible;
    pointer-events: auto;
  }
  .sidebar-close { display: inline-flex !important; align-items: center; justify-content: center; }
  .sidebar-overlay { display: block !important; z-index: 1900 !important; }

  .content-area {
    padding: 14px !important;
    gap: 12px !important;
    width: 100% !important;
  }

  /* Statement layout — stack 1 column */
  .dashboard-grid {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
  }
  .main-stats { gap: 14px !important; }
  .history-panel { order: 2; }

  .content-header { padding: 11px 14px !important; border-radius: 12px !important; gap: 10px !important; }
  .content-header > i.fa-magnifying-glass { font-size: 0.95rem; color: #94a3b8; }
  .search-input { font-size: 0.95rem !important; }
  .btn-refresh { padding: 7px 10px !important; }

  /* Data card → stacked layout */
  .list-container { gap: 10px !important; margin-top: 14px !important; }
  .data-card {
    flex-direction: column !important;
    align-items: stretch !important;
    padding: 14px !important;
    gap: 12px !important;
    border-radius: 14px !important;
  }
  .info-group { width: 100% !important; gap: 12px !important; align-items: flex-start !important; }
  .avatar img { width: 46px !important; height: 46px !important; flex-shrink: 0; }
  .details { min-width: 0; flex: 1; }
  .details .name {
    font-size: 0.97rem;
    white-space: normal;
    word-break: break-word;
    line-height: 1.3;
  }
  .details .role { font-size: 0.78rem; }
  .actions {
    width: 100% !important;
    gap: 8px !important;
    padding-top: 12px;
    border-top: 1px solid #f1f5f9;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .actions .btn-link { margin-right: auto; padding: 6px 4px; }
  .btn-yellow, .btn-green, .btn-red, .btn-grey {
    padding: 8px 14px !important;
    font-size: 0.85rem !important;
    border-radius: 9px;
  }

  /* Income card */
  .income-card { padding: 18px !important; border-radius: 16px !important; }
  .income-head { gap: 12px !important; }
  .income-head-title { gap: 10px !important; flex: 1; min-width: 0; }
  .income-icon { width: 42px !important; height: 42px !important; font-size: 1.05rem !important; border-radius: 12px !important; }
  .income-head h2 { font-size: 0.98rem !important; }
  .income-head .text-muted { font-size: 0.72rem !important; }
  .period-select { padding: 6px 10px !important; font-size: 0.82rem !important; }
  .income-value { font-size: 2rem !important; margin: 16px 0 4px !important; }
  .income-currency { font-size: 1.1rem !important; margin-right: 4px; }
  .income-breakdown {
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    margin-top: 14px !important;
    padding-top: 12px !important;
  }
  .brk-item { padding: 10px 12px !important; font-size: 0.78rem; }
  .brk-item strong { font-size: 0.92rem; }
  .brk-item.highlight {
    grid-column: 1 / -1;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
  }
  .brk-item.highlight strong { font-size: 0.95rem; }

  /* Schedule card */
  .schedule-card { padding: 18px !important; border-radius: 16px !important; }
  .schedule-head h2 { font-size: 1rem !important; }
  .schedule-row {
    grid-template-columns: 90px 1fr auto !important;
    gap: 10px !important;
    padding: 11px 12px !important;
  }
  .schedule-row:hover { transform: none; }
  .sch-day-label { font-size: 0.92rem; }
  .sch-time { font-size: 0.85rem; }
  .sch-right { gap: 8px; }
  .sch-edit-btn { width: 32px; height: 32px; }
  .status-badge { font-size: 0.72rem; padding: 3px 8px; }

  /* History panel */
  .history-panel { padding: 16px !important; border-radius: 14px !important; }
  .tx-tabs { gap: 4px; flex-wrap: wrap; }
  .tx-tab { padding: 7px 10px; font-size: 0.82rem; }
  .transaction-item { padding: 10px; font-size: 0.8rem; }
  .meta-info { flex-wrap: wrap; }

  /* Slip cards */
  .slip-item { padding: 10px; }
  .slip-head { gap: 8px; }
  .slip-thumb-store { width: 42px; height: 42px; }
  .slip-from { font-size: 0.85rem; }
  .slip-actions { gap: 4px; }

  /* Modal — bottom sheet */
  .modal-overlay { padding: 0 !important; align-items: flex-end !important; }
  .modal-card {
    max-width: 100% !important;
    width: 100% !important;
    max-height: 94vh !important;
    border-radius: 20px 20px 0 0 !important;
    animation: modalInMobile 0.3s ease;
  }
  @keyframes modalInMobile {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .modal-header { padding: 14px 18px !important; }
  .modal-header h2 { font-size: 1.05rem !important; }
  .modal-body { padding: 18px !important; }
  .modal-top { gap: 14px !important; }
  .modal-avatar img { width: 72px !important; height: 72px !important; }
  .info-grid {
    grid-template-columns: 1fr !important;
    gap: 10px !important;
    padding: 12px !important;
  }
  .modal-footer {
    padding: 12px 18px !important;
    flex-wrap: wrap;
  }
  .modal-footer button { flex: 1; min-width: 100px; }

  /* Schedule edit modal */
  .schedule-modal .time-grid { grid-template-columns: 1fr !important; gap: 12px; }
  .switch-row { flex-wrap: wrap; gap: 12px; }

  /* Preview overlay */
  .preview-overlay { padding: 16px; }
  .preview-close { top: 12px; right: 12px; width: 38px; height: 38px; font-size: 1.1rem; }

  /* License section */
  .license-img { max-height: 320px !important; }
}

/* iPhone 12 / 13 (≤ 480px) — fine-tune */
@media (max-width: 480px) {
  .sidebar { width: 88% !important; max-width: 320px !important; }
  .content-area { padding: 12px !important; gap: 10px !important; }
  .mobile-topbar { padding: 10px 12px !important; gap: 10px !important; }
  .mobile-title { font-size: 0.95rem !important; }
  .hamburger-btn { width: 38px; height: 38px; }

  .data-card { padding: 13px !important; }
  .details .name { font-size: 0.93rem; }

  /* Income hero — stack title/select */
  .income-head {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 12px !important;
  }
  .income-head-title { gap: 12px !important; }
  .period-select { width: 100%; padding: 9px 12px !important; font-size: 0.88rem !important; }
  .income-value { font-size: 1.85rem !important; }

  /* Schedule row — 2 บรรทัด (บรรทัดบน: วัน + badge/edit, บรรทัดล่าง: เวลา) */
  .schedule-row {
    grid-template-columns: 1fr auto !important;
    grid-template-areas:
      "day status"
      "time time" !important;
    row-gap: 10px !important;
    column-gap: 10px !important;
    padding: 12px 14px !important;
  }
  .sch-day { grid-area: day; }
  .sch-right {
    grid-area: status;
    justify-content: flex-end;
    gap: 8px !important;
  }
  .sch-time {
    grid-area: time;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.85rem;
    width: 100%;
  }
  .schedule-row.is-closed .sch-time { background: #fff5f5; border-color: #fecaca; }

  /* Schedule header */
  .schedule-head { gap: 6px; }
  .schedule-head .text-muted { font-size: 0.72rem; }

  .modal-top { gap: 12px !important; }
  .modal-avatar img { width: 64px !important; height: 64px !important; }
  .badge { font-size: 0.74rem; }

  .empty-state { padding: 40px 16px; }
  .empty-state i { font-size: 2rem; }
}

/* Tiny phones ≤ 360px (iPhone SE) */
@media (max-width: 360px) {
  .content-area { padding: 10px !important; }
  .income-value { font-size: 1.5rem !important; }
  .menu-btn { padding: 12px 14px; font-size: 0.92rem; }
  .modal-top { flex-direction: column !important; text-align: center !important; align-items: center !important; }
  .actions button { font-size: 0.8rem !important; padding: 7px 10px !important; }
}

/* Touch devices: ลด hover transform */
@media (hover: none) and (pointer: coarse) {
  .menu-btn:hover { transform: none; }
  .data-card:hover { transform: none; border-color: #e2e8f0; }
}
</style>
