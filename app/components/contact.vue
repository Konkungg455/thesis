<template>
  <div class="contact-page">
    <h1 class="page-title">แบบฟอร์มติดต่อ/สอบถามข้อมูลทั่วไป</h1>

    <div class="main-container">
      <section class="form-section">
        <h2 class="form-title">แบบฟอร์มการติดต่อ</h2>
        <form @submit.prevent="handleSubmit">
          <div class="form-row">
            <div class="input-group">
              <label>ชื่อ-นามสกุล <span class="required">*</span></label>
              <input v-model="form.name" type="text" placeholder="กรอกชื่อ-นามสกุลของคุณ" required />
            </div>
            <div class="input-group">
              <label>เบอร์โทรศัพท์ <span class="required">*</span></label>
              <input v-model="form.phone" type="tel" placeholder="กรอกเบอร์โทรศัพท์ของคุณ" required />
            </div>
          </div>

          <div class="form-row">
            <div class="input-group">
              <label>อีเมล <span class="required">*</span></label>
              <input v-model="form.email" type="email" placeholder="กรอกอีเมลของคุณ" required />
            </div>
            <div class="input-group">
              <label>หัวข้อการติดต่อ <span class="required">*</span></label>
              <div class="select-wrapper">
                <select v-model="form.subject" required>
                  <option value="" disabled>เลือกหัวข้อการติดต่อ</option>
                  <option value="สอบถามทั่วไป">สอบถามทั่วไป</option>
                  <option value="ปัญหาการใช้งาน">ปัญหาการใช้งาน</option>
                </select>
              </div>
            </div>
          </div>

          <div class="input-group full-width">
            <textarea v-model="form.message" placeholder="รายละเอียดเพิ่มเติม :"></textarea>
          </div>

          <div class="button-container">
            <button type="submit" class="submit-btn" :disabled="isSending">
              {{ isSending ? 'กำลังส่ง...' : 'ส่งข้อความติดต่อ' }}
            </button>
          </div>
        </form>
      </section>

      <aside class="info-section">
        <h2 class="brand-name">TELEBOTPHARCY</h2>
        <div class="info-card">
          <h3>ที่อยู่ :</h3>
          <p>บ้านเลขที่ 99/9 หมู่ 4<br>อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50100</p>
        </div>
        <div class="info-card small">
          <h3>โทรศัพท์ :</h3>
          <p>091-111-1111</p>
        </div>
        <div class="info-card small">
          <h3>อีเมล :</h3>
          <p>TELEBOTPHARCY@gmail.com</p>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const isSending = ref(false)
const form = ref({
  name: '',
  phone: '',
  email: '',
  subject: '',
  message: ''
})

const handleSubmit = async () => {
  isSending.value = true
  try {
    const response = await $fetch(`${useNuxtApp().$getApiBase()}/send-contact.php`, {
      method: 'POST',
      body: form.value
    })

    if (response.status === 'success') {
      alert('ส่งเมลสำเร็จ! เราจะติดต่อกลับโดยเร็วที่สุด')
      // ล้างข้อมูลฟอร์ม
      form.value = { name: '', phone: '', email: '', subject: '', message: '' }
    } else {
      alert('เกิดข้อผิดพลาด: ' + response.message)
    }
  } catch (error) {
    console.error(error)
    alert('ส่งเมลไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์')
  } finally {
    isSending.value = false
  }
}
</script>

<style scoped>
@import "@/assets/contact.css";
</style>