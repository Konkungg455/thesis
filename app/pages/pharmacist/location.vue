<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

definePageMeta({ middleware: 'user-only' });

const router = useRouter();
const route = useRoute();

// --- 1. State Management (ส่วนคำนวณราคา) ---
const selectedMethod = ref('chat');
const isGoldCard = ref(false);
const isDeliveryPrepaid = ref(false);

const isSearching = ref(false);
const searchError = ref('');
const isDesktopDevice = ref(false);

if (typeof window !== 'undefined') {
  const isMobileAgent = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  isDesktopDevice.value = !isMobileAgent && window.innerWidth >= 768;
}

const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });

// --- 2. Navigation Logic ---
const handleSearchNearMe = async () => {
  if (isSearching.value) return;

  searchError.value = '';
  isSearching.value = true;

  try {
    const position = await getCurrentPosition();
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;

    // เริ่มค้นหาที่ 500 เมตร และขยายเป็น 1 กม. ถ้าไม่พบผลลัพธ์
    router.push({
      path: '/user/phamacy',
      query: {
        lat: String(lat),
        lng: String(lng),
        initialRadius: '500',
        fallbackRadius: '1000',
        emergency: route.query.emergency === 'true' ? 'true' : undefined,
        // 🆕 ส่งต่อ session ของห้องแชท AI ที่ผู้ใช้กำลังคุยอยู่
        bot_session_id: route.query.bot_session_id || undefined
      }
    });
  } catch (error) {
    if (error?.code === 1) {
      searchError.value = 'กรุณาอนุญาตสิทธิ์ตำแหน่งก่อนค้นหาเภสัชกรใกล้คุณ';
    } else if (error?.code === 3) {
      searchError.value = 'หมดเวลารอตำแหน่ง กรุณาลองใหม่อีกครั้ง';
    } else {
      searchError.value = 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาตรวจสอบ GPS';
    }
  } finally {
    isSearching.value = false;
  }
};
</script>

<template>
  <Header />
  <div class="search-page-bg">
    <div class="glass-card">
      
      <!-- ส่วนภาพประกอบอนิเมชั่นพรีเมียม -->
      <div class="illustration-wrapper">
        <div class="location-pulse">
          <div class="pulse-ring"></div>
          <img src="https://cdn-icons-png.flaticon.com/512/854/854878.png" alt="Map" class="map-icon" />
          <div class="pin-marker">
             <i class="fa-solid fa-location-dot"></i>
          </div>
        </div>
      </div>

      <!-- ส่วนหัวข้อ -->
      <div class="content-text">
        <h1 class="main-title">ค้นหาเภสัชกรใกล้คุณ</h1>
        <p class="description">
          รับคำปรึกษาที่รวดเร็วและแม่นยำ <br>
          จากผู้เชี่ยวชาญด้านยาในพื้นที่ของคุณ
        </p>
      </div>

      <!-- ส่วนตัวเลือกสิทธิ์ (Card เล็กๆ ในหน้าค้นหา)
      <div class="quick-options">
        <div class="option-check" @click="isGoldCard = !isGoldCard" :class="{ 'active-gold': isGoldCard }">
            <div class="check-box"><span v-if="isGoldCard">✓</span></div>
            <span>ใช้สิทธิ์บัตรทอง (0.-)</span>
        </div>
        <div class="option-check" @click="isDeliveryPrepaid = !isDeliveryPrepaid" :class="{ 'active-blue': isDeliveryPrepaid }">
            <div class="check-box"><span v-if="isDeliveryPrepaid">✓</span></div>
            <span>จ่ายค่าส่งล่วงหน้า (+50.-)</span>
        </div>
      </div> -->
<!-- 
      <div class="total-display">
          ยอดชำระเบื้องต้น: <strong>{{ totalPrice }} บาท</strong>
      </div> -->

      <!-- 🚩 ปุ่มกดตามสไตล์ Screenshot 2026-05-01 131721.png -->
      <button class="btn-search-near" @click="handleSearchNearMe" :disabled="isSearching">
        <div class="btn-content">
          <i class="fa-solid fa-crosshairs"></i>
          <span>{{ isSearching ? 'กำลังขอสิทธิ์ตำแหน่ง...' : 'ค้นหาเภสัชใกล้ฉัน' }}</span>
        </div>
      </button>
      <p v-if="isSearching && isDesktopDevice" class="permission-hint">
        ถ้าใช้งานบนคอมพิวเตอร์: กรุณาดูมุมซ้ายบนของเว็บ แล้วกด <strong>Allow / อนุญาต</strong>
      </p>
      <p v-if="searchError" class="error-message">{{ searchError }}</p>

      <div class="footer-hint">
        <i class="fa-solid fa-shield-halved"></i>
        <span>ข้อมูลตำแหน่งจะถูกเก็บเป็นความลับ</span>
      </div>
    </div>
  </div>
  <Footer />
</template>

<style scoped>
/* ดีไซน์พื้นหลังและฟอนต์ */
.search-page-bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: 'Kanit', sans-serif;
}

/* Glassmorphism Card */
.glass-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(15px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  width: 100%;
  max-width: 420px;
  padding: 40px 30px;
  border-radius: 35px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.08);
  text-align: center;
}

/* Illustration & Animations */
.illustration-wrapper { position: relative; margin-bottom: 25px; display: flex; justify-content: center; }
.map-icon { width: 110px; filter: drop-shadow(0 10px 15px rgba(0,0,0,0.08)); }
.pin-marker { position: absolute; top: 15%; color: #ef4444; font-size: 2.2rem; animation: bounce 2s infinite; }
.pulse-ring { position: absolute; width: 90px; height: 45px; background: rgba(59, 130, 246, 0.2); border-radius: 50%; bottom: 5px; animation: pulse 2s infinite; }

/* Text Styles */
.main-title { color: #1e293b; font-size: 1.6rem; font-weight: 600; margin-bottom: 8px; }
.description { color: #64748b; font-size: 0.95rem; line-height: 1.5; margin-bottom: 25px; }

/* Quick Options Styles */
.quick-options { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
.option-check {
    display: flex; align-items: center; gap: 12px; padding: 12px 15px;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 15px;
    cursor: pointer; transition: 0.2s; font-size: 0.9rem;
}
.check-box { width: 18px; height: 18px; border: 1px solid #cbd5e1; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: white; }
.active-gold { background: #fffbeb; border-color: #fbbf24; }
.active-gold .check-box { background: #fbbf24; border-color: #fbbf24; }
.active-blue { background: #eff6ff; border-color: #3b82f6; }
.active-blue .check-box { background: #3b82f6; border-color: #3b82f6; }

.total-display { margin-bottom: 20px; font-size: 1rem; color: #475569; }

/* 🚩 ปุ่มค้นหาสไตล์ Screenshot (225) */
.btn-search-near {
  width: 100%;
  background: #3b82f6; /* สีน้ำเงินสไตล์ตามรูป */
  color: white;
  border: none;
  padding: 16px;
  border-radius: 12px;
  font-size: 1.05rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
}
.btn-search-near:hover { background: #2563eb; transform: translateY(-2px); }
.btn-content { display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-search-near:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}
.error-message {
  margin-top: 12px;
  color: #dc2626;
  font-size: 0.85rem;
}
.permission-hint {
  margin-top: 12px;
  font-size: 0.85rem;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.4;
}

/* Animations Keyframes */
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
@keyframes pulse { 0% { transform: scale(0.8); opacity: 0.8; } 100% { transform: scale(1.6); opacity: 0; } }

.footer-hint { margin-top: 20px; font-size: 0.8rem; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 5px; }
</style>