<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import medicineList from '@/assets/medicines.json'

definePageMeta({
  middleware: ['pharmacist-only', 'force-light']
})

const route = useRoute()
const router = useRouter()
const { apiUrl } = useApiBase()

const activePatientId = ref(route.query.id || null)

/** เปิดมาจากปุ่ม "ใบปรึกษา" ในแชท → บันทึกได้แต่ยังไม่เข้า /tracking */
const skipTracking = computed(() =>
  route.query.source === 'consult_form' || route.query.skip_tracking === '1'
)

// ===== Autocomplete รายชื่อยาสามัญประจำบ้าน =====
const MEDICINES = medicineList || []
const activeSuggestRow = ref(-1)
const suggestionIndex = ref(0)

const normalizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, '')

const medicineSuggestions = computed(() => {
  if (activeSuggestRow.value < 0) return []
  const row = lineItems.value[activeSuggestRow.value]
  if (!row) return []
  const q = String(row.name || '').trim().toLowerCase()
  if (!q) return MEDICINES.slice(0, 12) // โชว์รายการแนะนำ 12 อันแรกเมื่อช่องยังว่าง
  const qNorm = normalizeKey(q)
  return MEDICINES.filter((m) => {
    const hay = [m.name, m.generic, m.category, m.indication].map(normalizeKey).join('|')
    return hay.includes(qNorm)
  }).slice(0, 12)
})

const onMedicineFocus = (index) => {
  activeSuggestRow.value = index
  suggestionIndex.value = 0
}

const onMedicineBlur = () => {
  // หน่วงเล็กน้อยให้ click ที่รายการ suggestion ทำงานก่อน
  setTimeout(() => {
    activeSuggestRow.value = -1
    suggestionIndex.value = 0
  }, 180)
}

const onMedicineInput = (index) => {
  activeSuggestRow.value = index
  suggestionIndex.value = 0
}

const selectMedicine = (index, med) => {
  const item = lineItems.value[index]
  if (!item) return
  item.name = med.name
  activeSuggestRow.value = -1
  suggestionIndex.value = 0
  // โฟกัสไปช่องจำนวน
  nextTick(() => {
    const cells = document.querySelectorAll(`tbody tr:nth-child(${index + 1}) .col-qty .cell-input`)
    cells.forEach((el) => el.focus && el.focus())
  })
}

const onMedicineKeydown = (e, index) => {
  if (activeSuggestRow.value !== index) return
  const list = medicineSuggestions.value
  if (!list.length) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    suggestionIndex.value = (suggestionIndex.value + 1) % list.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    suggestionIndex.value = (suggestionIndex.value - 1 + list.length) % list.length
  } else if (e.key === 'Enter') {
    if (suggestionIndex.value >= 0 && list[suggestionIndex.value]) {
      e.preventDefault()
      selectMedicine(index, list[suggestionIndex.value])
    }
  } else if (e.key === 'Escape') {
    activeSuggestRow.value = -1
  }
}

const initialForm = {
  customer_code: '',
  clinic_name: '',
  clinic_website: '',
  doc_no: '',
  patient_name: '',
  prescription_date: '',
  hn_no: '',
  df_value: '',
  med_details: '',
  med_qty: '',
  med_price: '',
  total_amount: '',
  discount_amount: '0.00',
  amount_received: '',
  change_amount: '0.00',
  amount_in_words: '',
  doctor_name: '',
}

const form = ref({ ...initialForm })
const isSaving = ref(false)

const emptyItem = () => ({
  name: '',
  qty: '',
  unit: '',
  unitPrice: '',
  total: '',
})

const lineItems = ref(Array.from({ length: 10 }, emptyItem))

const generateDF = () => {
  const d = new Date()
  const year = (d.getFullYear() + 543).toString().slice(-2)
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  const randomNum = Math.floor(1000 + Math.random() * 9000)
  return `PC${year}-${randomNum}`
}

const formatBillDate = (d = new Date()) => {
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const year = d.getFullYear() + 543
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${day}/${month}/${year} ${h}:${m}`
}

function parseNum(val) {
  const n = parseFloat(String(val).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function formatMoney(n) {
  return parseNum(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcLineTotal(item) {
  const q = parseNum(item.qty)
  const p = parseNum(item.unitPrice)
  if (!q || !p) return ''
  return formatMoney(q * p)
}

function updateLineTotal(index) {
  const item = lineItems.value[index]
  item.total = calcLineTotal(item)
}

const subtotal = computed(() =>
  lineItems.value.reduce((sum, item) => sum + parseNum(item.total), 0),
)

const discountTotal = computed(() => parseNum(form.value.discount_amount))

const grandTotal = computed(() => Math.max(0, subtotal.value - discountTotal.value))

const changeAmount = computed(() => {
  const received = parseNum(form.value.amount_received)
  if (!received) return 0
  return Math.max(0, received - grandTotal.value)
})

const THAI_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']

function readTwoDigits(n) {
  if (n === 0) return ''
  if (n === 1) return 'สิบ'
  if (n === 2) return 'ยี่สิบ'
  if (n < 10) return THAI_DIGITS[n] + 'สิบ'
  const tens = Math.floor(n / 10)
  const ones = n % 10
  let text = (tens === 2 ? 'ยี่' : THAI_DIGITS[tens]) + 'สิบ'
  if (ones === 1) text += 'เอ็ด'
  else if (ones > 0) text += THAI_DIGITS[ones]
  return text
}

function readIntegerPart(n) {
  if (n === 0) return 'ศูนย์'
  const parts = []
  const million = Math.floor(n / 1_000_000)
  const thousand = Math.floor((n % 1_000_000) / 1_000)
  const rest = n % 1_000
  if (million) {
    parts.push(readIntegerPart(million) + 'ล้าน')
  }
  if (thousand) {
    parts.push(readTwoDigits(Math.floor(thousand / 100)) + (thousand % 100 ? readTwoDigits(thousand % 100) : ''))
    if (thousand >= 100) parts[parts.length - 1] = readTwoDigits(Math.floor(thousand / 100)) + 'ร้อย' + readTwoDigits(thousand % 100)
    else parts[parts.length - 1] = readTwoDigits(thousand)
    if (thousand >= 100 && thousand % 100 === 0) parts[parts.length - 1] += 'ร้อย'
  }
  if (rest) {
    const hundred = Math.floor(rest / 100)
    const two = rest % 100
    let chunk = ''
    if (hundred) chunk += THAI_DIGITS[hundred] + 'ร้อย'
    if (two) chunk += readTwoDigits(two)
    if (chunk) parts.push(chunk)
  }
  return parts.join('') || 'ศูนย์'
}

function bahtText(amount) {
  const n = parseNum(amount)
  if (!n) return ''
  const baht = Math.floor(n)
  const satang = Math.round((n - baht) * 100)
  let text = readIntegerPart(baht) + 'บาท'
  if (satang) text += readTwoDigits(satang) + 'สตางค์'
  else text += 'ถ้วน'
  return `(${text})`
}

function syncItemsToForm() {
  const filled = lineItems.value.filter((i) => i.name.trim() || i.qty || i.unitPrice || i.total)
  form.value.med_details = filled.map((i) => i.name.trim()).join('\n')
  form.value.med_qty = filled.map((i) => `${i.qty}|${i.unit}`).join('\n')
  form.value.med_price = filled.map((i) => i.total).join('\n')
  form.value.total_amount = formatMoney(grandTotal.value)
  form.value.change_amount = formatMoney(changeAmount.value)
  form.value.amount_in_words = bahtText(grandTotal.value)
}

function loadItemsFromForm() {
  const names = (form.value.med_details || '').split('\n')
  const qtyUnits = (form.value.med_qty || '').split('\n')
  const prices = (form.value.med_price || '').split('\n')
  const count = Math.max(names.length, qtyUnits.length, prices.length, 10)
  lineItems.value = Array.from({ length: count }, (_, i) => {
    const [qty = '', unit = ''] = (qtyUnits[i] || '').split('|')
    return {
      name: names[i] || '',
      qty,
      unit,
      unitPrice: '',
      total: prices[i] || '',
    }
  })
}

watch([subtotal, discountTotal, grandTotal], () => {
  form.value.total_amount = formatMoney(grandTotal.value)
  form.value.amount_in_words = bahtText(grandTotal.value)
})

watch(
  () => form.value.amount_received,
  () => {
    form.value.change_amount = formatMoney(changeAmount.value)
  },
)

const loadPatientAndPharma = async () => {
  const pid = activePatientId.value
  if (!pid) return
  form.value.customer_code = `CT-${String(pid).padStart(7, '0')}`
  try {
    const res = await $fetch(apiUrl(`get-patient-info.php?id=${pid}&lookup=user`), { credentials: 'include' })
    if (res?.status === 'success' && res.data) {
      form.value.patient_name = res.data.patient_name || form.value.patient_name
    }
  } catch (e) {
    console.warn('loadPatientAndPharma', e)
  }
  try {
    const session = await $fetch(apiUrl('get-user-session.php'), { credentials: 'include' })
    if (session?.authenticated && session.user?.role === 'pharmacist') {
      const profile = await $fetch(apiUrl('vue-get-pharma-profile.php'), { credentials: 'include' })
      if (profile?.status === 'success' && profile.data) {
        const p = profile.data
        form.value.doctor_name = `ภก. ${p.firstname_pharma} ${p.lastname_pharma}`.trim()
        const storeName = (p.current_store_name || '').trim()
        form.value.clinic_name = storeName ? `ร้านยา ${storeName}` : 'ร้านยา'
      }
    }
  } catch (e) {
    console.warn('pharma profile', e)
  }
}

onMounted(async () => {
  form.value.prescription_date = formatBillDate()
  form.value.df_value = generateDF()
  form.value.doc_no = form.value.df_value
  form.value.clinic_name = form.value.clinic_name || 'ร้านยา'
  form.value.clinic_website = form.value.clinic_website || 'Telebot-pharmacy'
  await loadPatientAndPharma()
  loadItemsFromForm()
})

const customerCode = computed(() => form.value.customer_code || 'CT-0000001')

const validateForm = () => {
  if (!form.value.patient_name?.trim()) {
    alert('⚠️ กรุณากรอกชื่อลูกค้าก่อนบันทึก')
    return false
  }
  const hasAnyItem = lineItems.value.some(
    (i) => i.name?.trim() || parseNum(i.qty) > 0 || parseNum(i.unitPrice) > 0
  )
  if (!hasAnyItem) {
    alert('⚠️ กรุณาเพิ่มรายการยาอย่างน้อย 1 รายการ')
    return false
  }
  return true
}

/**
 * savePrescription — ส่งฟอร์มไป save-prescription.php
 * คืน { ok, insertedId } เพื่อให้ saveAndPrint นำ id ไปเปิดหน้า prescription-view
 */
const savePrescription = async ({ redirectAfterSave = true, silent = false } = {}) => {
  if (!validateForm()) return { ok: false, insertedId: 0, emailSent: false, emailTo: '', emailError: '' }

  syncItemsToForm()
  form.value.df_value = form.value.doc_no
  const payload = {
    ...form.value,
    id_account: Number(activePatientId.value) || 0,
    skip_tracking: skipTracking.value ? 1 : 0,
  }
  isSaving.value = true
  try {
    const res = await $fetch(apiUrl('save-prescription.php'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'include',
    })
    if (res.status === 'success') {
      const insertedId = Number(res.inserted_id) || 0
      const billNo = res.bill_no || ''
      if (!silent) {
        const chatLine = res.notified_patient
          ? `\n📤 ส่งเลขที่บิล + ลิงก์ใบสรุปรายการยา (PDF) ให้ผู้ป่วยทางแชทแล้ว`
          : ''
        let emailLine = ''
        if (res.email_sent) {
          emailLine = `\n📧 ส่งใบสรุปรายการยา (PDF) ทางอีเมลให้ลูกค้าแล้ว (${res.email_to || ''})`
          if (res.payment_bank_included) {
            emailLine += `\n💳 แนบเลขบัญชีธนาคารให้ลูกค้าแล้ว`
          }
          if (res.payment_qr_attached) {
            emailLine += `\n📱 แนบ QR Payment ในอีเมลให้ลูกค้าแล้ว`
          }
        } else if (res.email_error) {
          emailLine = `\n⚠️ ส่งอีเมลไม่สำเร็จ: ${res.email_error}`
        }
        alert(`✅ บันทึกข้อมูลเรียบร้อยแล้ว${billNo ? `\nเลขที่บิล: ${billNo}` : ''}${chatLine}${emailLine}`)
      }
      if (redirectAfterSave) {
        router.push({
          path: '/pharmacy_web',
          query: skipTracking.value
            ? { id: activePatientId.value }
            : {
                consult_done: '1',
                patient_id: activePatientId.value,
              },
        })
      }
      return { ok: true, insertedId, emailSent: !!res.email_sent, emailTo: res.email_to || '', emailError: res.email_error || '' }
    }
    alert('❌ บันทึกไม่สำเร็จ: ' + (res.message || 'ไม่ทราบสาเหตุ'))
    return { ok: false, insertedId: 0, emailSent: false, emailTo: '', emailError: '' }
  } catch (err) {
    console.error('Save error:', err)
    const status = err?.response?.status
    if (status === 401) {
      alert('❌ session หมดอายุ กรุณาเข้าสู่ระบบใหม่')
      router.push('/auth/login-pharmacist')
    } else {
      alert('❌ ไม่สามารถเชื่อมต่อกับ Server ได้')
    }
    return { ok: false, insertedId: 0, emailSent: false, emailTo: '', emailError: '' }
  } finally {
    isSaving.value = false
  }
}

/**
 * saveAndPrint
 *  - บันทึกใบสรุปรายการยาเงียบๆ → ได้ inserted_id
 *  - เปิดหน้า /prescription-view?id=<inserted_id> ใน tab ใหม่ (auto-print)
 *  - เด้งกลับหน้า pharmacy_web พร้อม flag consult_done=1
 */
const saveAndPrint = async () => {
  const { ok, insertedId, emailSent, emailTo, emailError } = await savePrescription({
    redirectAfterSave: false,
    silent: true
  })
  if (!ok || !insertedId) return

  if (import.meta.client) {
    window.open(`/prescription-view?id=${insertedId}`, '_blank', 'noopener,noreferrer')
    if (emailSent) {
      alert(`📧 ส่งใบสรุปรายการยา (PDF) ทางอีเมลให้ลูกค้าแล้ว (${emailTo})`)
    } else if (emailError) {
      alert(`⚠️ บันทึกและพิมพ์แล้ว แต่ส่งอีเมลไม่สำเร็จ: ${emailError}`)
    }
  }

  router.push({
    path: '/pharmacy_web',
    query: skipTracking.value
      ? { id: activePatientId.value }
      : {
          consult_done: '1',
          patient_id: activePatientId.value,
        },
  })
}

const resetForm = () => {
  if (!confirm('คุณต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?')) return
  form.value = { ...initialForm }
  lineItems.value = Array.from({ length: 10 }, emptyItem)
  form.value.prescription_date = formatBillDate()
  form.value.df_value = generateDF()
  form.value.doc_no = form.value.df_value
  form.value.clinic_name = 'ร้านยา'
  form.value.clinic_website = 'Telebot-pharmacy'
  if (activePatientId.value) {
    form.value.customer_code = `CT-${String(activePatientId.value).padStart(7, '0')}`
  }
  // โหลดชื่อร้านยาที่สังกัดกลับมาใหม่ (กรณีเภสัชยังอยู่ในระบบ)
  loadPatientAndPharma()
}

const addRow = () => {
  lineItems.value.push(emptyItem())
}
</script>

<template>
  <div class="page-wrapper">
    <div class="no-print controls">
      <button
        type="button"
        class="btn-back"
        @click="router.push({ path: '/pharmacy_web', query: { id: activePatientId } })"
      >
        ⬅️ ย้อนกลับ
      </button>
      <button type="button" class="btn-save-print" :disabled="isSaving" @click="saveAndPrint">
        {{ isSaving ? '⏳ กำลังบันทึก...' : '🖨️ บันทึกและพิมพ์' }}
      </button>
      <button type="button" class="btn-save-only" :disabled="isSaving" @click="() => savePrescription()">
        {{ isSaving ? '⏳ กำลังบันทึก...' : '💾 บันทึกอย่างเดียว' }}
      </button>
      <button type="button" class="btn-reset" @click="resetForm">🧹 ล้างข้อมูล</button>
      <button type="button" class="btn-add-row" @click="addRow">➕ เพิ่มแถว</button>
    </div>

    <div class="receipt-card">
      <!-- หัวเอกสาร -->
      <header class="receipt-top">
        <div class="receipt-brand">
          <input
            v-model="form.clinic_name"
            type="text"
            class="brand-name"
            placeholder="ชื่อร้านยา"
          >
          <input
            v-model="form.clinic_website"
            type="text"
            class="brand-web"
            placeholder="เว็บไซต์"
          >
        </div>
        <span class="page-no">หน้า 1 / 1</span>
      </header>

      <div class="receipt-title-box">ใบสรุปรายการยา</div>

      <!-- ข้อมูลลูกค้า / บิล -->
      <div class="info-grid">
        <div class="info-col">
          <div class="info-row">
            <span class="info-label">รหัสลูกค้า</span>
            <input v-model="form.customer_code" type="text" class="info-input" :placeholder="customerCode">
          </div>
          <div class="info-row">
            <span class="info-label">ชื่อลูกค้า</span>
            <input v-model="form.patient_name" type="text" class="info-input" placeholder="ชื่อ-นามสกุล">
          </div>
        </div>
        <div class="info-col info-col--right">
          <div class="info-row">
            <span class="info-label">เลขที่บิล</span>
            <input v-model="form.doc_no" type="text" class="info-input">
          </div>
          <div class="info-row">
            <span class="info-label">วันที่บิล</span>
            <input v-model="form.prescription_date" type="text" class="info-input">
          </div>
        </div>
      </div>

      <!-- ตารางรายการ -->
      <div class="items-table-wrap">
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
          <tr v-for="(item, index) in lineItems" :key="index">
            <td class="col-no text-center">{{ index + 1 }}</td>
            <td class="col-name med-cell">
              <div class="med-cell-wrap">
              <input
                v-model="item.name"
                type="text"
                class="cell-input"
                placeholder="ชื่อสินค้า / ยา (พิมพ์เพื่อค้นหา)"
                autocomplete="off"
                @focus="onMedicineFocus(index)"
                @blur="onMedicineBlur"
                @input="onMedicineInput(index)"
                @keydown="onMedicineKeydown($event, index)"
              >
              <div
                v-if="activeSuggestRow === index && medicineSuggestions.length"
                class="med-suggest no-print"
              >
                <div class="med-suggest-head">
                  <i class="fa-solid fa-pills"></i>
                  รายชื่อยาสามัญประจำบ้าน
                  <span class="med-suggest-tip">↑↓ เลือก · Enter ยืนยัน · Esc ปิด</span>
                </div>
                <div
                  v-for="(med, sIdx) in medicineSuggestions"
                  :key="med.name + sIdx"
                  class="med-suggest-item"
                  :class="{ active: suggestionIndex === sIdx }"
                  @mouseenter="suggestionIndex = sIdx"
                  @mousedown.prevent="selectMedicine(index, med)"
                >
                  <div class="med-suggest-main">
                    <div class="med-suggest-name-wrap">
                      <span class="med-suggest-name">{{ med.name }}</span>
                      <span v-if="med.generic" class="med-suggest-generic">{{ med.generic }}</span>
                    </div>
                  </div>
                  <div class="med-suggest-meta">
                    <span v-if="med.dose" class="med-dose"><i class="fa-regular fa-clock"></i> {{ med.dose }}</span>
                    <span v-if="med.indication" class="med-indication">{{ med.indication }}</span>
                  </div>
                </div>
              </div>
              </div>
            </td>
            <td class="col-qty">
              <input
                v-model="item.qty"
                type="text"
                class="cell-input text-center"
                @input="updateLineTotal(index)"
              >
            </td>
            <td class="col-price">
              <input
                v-model="item.unitPrice"
                type="text"
                class="cell-input text-right"
                placeholder="0.00"
                @input="updateLineTotal(index)"
              >
            </td>
            <td class="col-total text-right">
              <input
                v-model="item.total"
                type="text"
                class="cell-input text-right"
                placeholder="0.00"
              >
            </td>
          </tr>
        </tbody>
      </table>
      </div>

      <!-- สรุปยอด -->
      <div class="totals-section totals-section--single">
        <div class="totals-right">
          <div class="total-line">
            <span>ราคารวม</span>
            <span class="total-num">{{ formatMoney(subtotal) }}</span>
          </div>
          <div class="total-line">
            <span>ลดรวม</span>
            <input
              v-model="form.discount_amount"
              type="text"
              class="total-input"
            >
          </div>
          <div class="total-line total-line--grand">
            <span>เป็นเงินทั้งสิ้น</span>
            <span class="total-num">{{ formatMoney(grandTotal) }}</span>
          </div>
          <div class="total-words">
            {{ form.amount_in_words || bahtText(grandTotal) }}
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import "@/assets/Summary.css";

/* ===== Autocomplete: รายชื่อยาสามัญประจำบ้าน ===== */
.med-cell {
  position: relative;
  overflow: visible;
}
.med-cell-wrap {
  position: relative;
  width: 100%;
}

.med-suggest {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: max(380px, 100%);
  max-width: 480px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.18);
  max-height: 360px;
  overflow-y: auto;
  z-index: 200;
  font-family: 'Sarabun', sans-serif;
}

.med-suggest-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: linear-gradient(135deg, #eff6ff 0%, #ecfdf5 100%);
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.78rem;
  font-weight: 700;
  color: #0f172a;
  position: sticky;
  top: 0;
  z-index: 1;
}
.med-suggest-head i { color: #0ea5e9; }
.med-suggest-tip {
  margin-left: auto;
  font-weight: 500;
  color: #64748b;
  font-size: 0.72rem;
}

.med-suggest-item {
  padding: 9px 14px;
  cursor: pointer;
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.12s;
}
.med-suggest-item:last-child { border-bottom: none; }
.med-suggest-item:hover,
.med-suggest-item.active {
  background: linear-gradient(90deg, #eff6ff 0%, #ecfdf5 100%);
}

.med-suggest-main {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 3px;
}
.med-suggest-name-wrap {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.med-suggest-name {
  font-weight: 700;
  color: #0f172a;
  font-size: 0.92rem;
  line-height: 1.25;
}
.med-suggest-generic {
  color: #64748b;
  font-size: 0.72rem;
  font-style: italic;
  line-height: 1.2;
  margin-top: 1px;
}
.med-suggest-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 0.76rem;
  color: #475569;
  line-height: 1.4;
}
.med-dose i { color: #16a34a; margin-right: 4px; }
.med-indication { font-style: italic; }

/* scrollbar */
.med-suggest::-webkit-scrollbar { width: 8px; }
.med-suggest::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
.med-suggest::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

@media print {
  .med-suggest { display: none !important; }
}

/* มือถือ: บังคับให้ปุ่มควบคุมกดได้ (กัน CSS global จากหน้าอื่นใน SPA) */
@media screen and (max-width: 900px) {
  .controls {
    position: sticky !important;
    top: 0 !important;
    z-index: 300 !important;
    pointer-events: auto !important;
  }
  .controls button {
    pointer-events: auto !important;
    touch-action: manipulation;
    min-height: 44px;
  }
}
</style>
