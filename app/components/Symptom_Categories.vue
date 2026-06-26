<template>
  <section class="category-section">
    <div class="top-bar">
      <h1>หมวดหมู่อาการ <i class="fa-solid fa-capsules"></i></h1>
      
      <button 
        v-if="!search" 
        class="all-btn" 
        @click="isExpanded = !isExpanded"
      >
        {{ isExpanded ? 'แสดงน้อยลง' : 'ดูทั้งหมด' }}
      </button>
    </div>

    <div class="category-tags">
      <button
        v-for="category in displayedCategories"
        :key="category"
        class="tag"
        @click="selectCategory(category)"
      >
        {{ category }}
      </button>
      
      <div v-if="search && displayedCategories.length === 0" class="error-container">
        <p class="no-result">
          <i class="fa-solid fa-circle-xmark"></i> ไม่พบอาการที่เกี่ยวข้องกับ <strong>"{{ search }}"</strong>
        </p>
        <p class="error-subtext">ระบบ AI ออกแบบมาเพื่อปรึกษาเรื่องสุขภาพเท่านั้น กรุณาระบุอาการป่วยที่ชัดเจน</p>
      </div>
    </div>

    <div class="search-box">
      <input
        v-model="search"
        type="text"
        placeholder="ค้นหาอาการ เช่น ปวดหัว, ไอ..."
        @keyup.enter="handleSearch"
        :class="{ 'input-error': search && displayedCategories.length === 0 }"
      />

      <button 
        class="search-btn" 
        @click="handleSearch"
        :disabled="search && displayedCategories.length === 0"
      >
        ใช้งานเลย
      </button>
    </div>
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

/* --- State --- */
const search = ref('')
const isExpanded = ref(false)
const showError = ref(false) // ใช้สำหรับแสดงข้อความแจ้งเตือนเมื่อไม่พบข้อมูล

// ข้อมูลอาการทั้งหมด 32+ รายการ
const categories = ref([
  'เวียนศีรษะ', 
  'ปวดหัว', 
  'ปวดข้อ/ปวดกล้ามเนื้อ', 
  'ปวดฟัน', 
  'ปวดประจำเดือน', 
  'ปวดท้อง', 
  'ท้องเสีย', 
  'ท้องผูก/ริดสีดวงทวาร', 
  'ปัสสาวะแสบขัด', 
  'ตกขาว', 
  'แผล', 
  'ผื่นผิวหนัง', 
  'อาการทางตา', 
  'อาการทางหู', 
  'ไข้ ไอ เจ็บคอ', 
  'ติดเชื้อโควิด', 
  'น้ำมูก คัดจมูก', 
  'มีอาการแผลในปาก', 
  'ตุ่มน้ำใสที่ปาก', 
  'แผลน้ำร้อนลวกไม่รุนแรง', 
  'อาการคันผิวหนัง/ศีรษะ', 
  'อาการจากพยาธิ', 
  'อาการจากหิด เหา', 
  'ฝีหนองที่ผิวหนัง', 
  'อาการชา/เหน็บชา', 
  'อาการนอนไม่หลับ', 
  'เมารถ เมาเรือ', 
  'เบื่ออาหาร โดยไม่มีโรคร่วม', 
  'คลื่นไส้ อาเจียน', 
  'อาการแพ้ยา/แพ้อาหารเล็กน้อย/แมลงกัดต่อย', 
  'อาการเจ็บป่วยจากการสูบบุหรี่', 
  'เหงือกอักเสบ/มีกลิ่นปาก'
])

/* --- Computed --- */

// 1. กรองข้อมูลตามคำค้นหา
const filteredCategories = computed(() => {
  if (!search.value) return categories.value
  return categories.value.filter(cat => cat.includes(search.value))
})

// 2. จัดการการแสดงผล
const displayedCategories = computed(() => {
  if (search.value) return filteredCategories.value
  return isExpanded.value ? filteredCategories.value : filteredCategories.value.slice(0, 6)
})

/* --- Methods --- */

// สร้าง session id ใหม่สำหรับการสนทนา AI ครั้งใหม่
const newSessionId = () => `session-${Math.random().toString(36).substring(2, 9)}`

const selectCategory = (category) => {
  const sid = newSessionId()
  router.push(`/user/chat-history?session_id=${sid}&category=${encodeURIComponent(category)}`)
}

// ฟังก์ชันหัวใจหลัก: ตรวจสอบก่อนส่งไปหน้า Chat
const handleSearch = () => {
  const query = search.value.trim()
  if (!query) return

  const isMatch = categories.value.some(cat => cat.includes(query))

  if (isMatch) {
    showError.value = false
    const sid = newSessionId()
    router.push(`/user/chat-history?session_id=${sid}&category=${encodeURIComponent(query)}`)
  } else {
    showError.value = true
    setTimeout(() => { showError.value = false }, 3000)
  }
}
</script>

<style scoped>
@import "@/assets/Symptom_Categories.css";
</style>


