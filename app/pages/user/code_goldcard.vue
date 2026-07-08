<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';

definePageMeta({ middleware: 'user-only' });

const router = useRouter();
const discountCode = ref('');

const handleNext = () => {
  if (!discountCode.value) {
    // แนะนำให้ใช้ Toast หรือ Modal สวยๆ แทน alert
    alert('กรุณากรอกรหัสส่วนลดเพื่อรับสิทธิ์ครับ');
    return;
  }
  // นำทางไปหน้าถัดไป...
  console.log('Code Applied:', discountCode.value);
};
</script>

<template>
  <div class="discount-page">
    <Header />
    
    <main class="main-content">
      <div class="premium-wrapper">
        <!-- แสงฟุ้งด้านหลัง (Background Orbs) ช่วยให้ดูมีมิติ -->
        <div class="bg-orb orb-1"></div>
        <div class="bg-orb orb-2"></div>

        <div class="premium-card">
          <!-- ส่วนหัว: ไล่เฉดสีทองหรูหรา -->
          <div class="header-section">
            <h2 class="premium-title">กรอกส่วนลดบัตรทอง</h2>
            <div class="title-underline"></div>
          </div>
          
          <!-- ช่องกรอกข้อมูล: ดีไซน์ใหม่ให้ดูลึกและมีมิติ -->
          <div class="input-section">
            <div class="input-group">
              <span class="prefix-icon">🎫</span>
              <input 
                type="text" 
                v-model="discountCode" 
                placeholder="กรุณากรอกรหัสส่วนลด" 
                class="premium-input"
              />
              <div class="input-glow"></div>
            </div>
          </div>

          <!-- ปุ่มถัดไป: สีเหลืองทองสไตล์ Screenshot 2026-05-01 133206_2.png แต่มี Glow -->
          <div class="action-section">
            <button class="premium-btn" @click="handleNext">
              <span class="btn-text">ถัดไป</span>
              <div class="arrow-circle">
                <i class="fa-solid fa-arrow-right"></i>
              </div>
            </button>
          </div>
          
          <p class="helper-text">
            <i class="fa-solid fa-circle-info"></i>
            สิทธิ์บัตรทองครอบคลุมค่าปรึกษาพื้นฐาน 0.-
          </p>
        </div>
      </div>
    </main>

    <Footer />
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@200;400;500;600&display=swap');

.discount-page {
  font-family: 'Kanit', sans-serif;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #fcfdfe;
}

.main-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.premium-wrapper {
  position: relative;
  z-index: 1;
  padding: 20px;
  width: 100%;
  display: flex;
  justify-content: center;
}


/* 🚩 ตัวการ์ดพรีเมียม */
.premium-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  padding: 50px 45px;
  border-radius: 40px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.08);
  width: 100%;
  max-width: 440px;
  text-align: center;
  transition: transform 0.3s ease;
}

.premium-card:hover { transform: translateY(-5px); }

/* 🚩 หัวข้อทอง Gradient */
.premium-title {
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  font-size: 1.85rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.title-underline {
  width: 50px;
  height: 4px;
  background: linear-gradient(90deg, #fbbf24, transparent);
  margin: 0 auto 35px;
  border-radius: 2px;
}

/* 🚩 ช่อง Input */
.input-group {
  position: relative;
  margin-bottom: 30px;
}

.prefix-icon {
  position: absolute;
  left: 22px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.4rem;
  z-index: 5;
}

.premium-input {
  width: 100%;
  padding: 18px 25px 18px 65px;
  border-radius: 20px;
  border: 2px solid #f1f5f9;
  background: #f8fafc;
  font-size: 1.1rem;
  color: #1e293b;
  outline: none;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.premium-input:focus {
  background: #ffffff;
  border-color: #fbbf24;
  box-shadow: 0 10px 20px -5px rgba(251, 191, 36, 0.2);
  transform: scale(1.02);
}

/* 🚩 ปุ่มกดสีเหลืองน้ำเงิน */
.premium-btn {
  width: 100%;
  background: #fbbf24; /* สีเหลืองตามต้นฉบับ */
  color: #1e3a8a;    /* สีน้ำเงินเข้มตามต้นฉบับ */
  border: none;
  padding: 16px 30px;
  border-radius: 22px;
  font-size: 1.25rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
  transition: all 0.3s ease;
  box-shadow: 0 12px 24px -6px rgba(245, 158, 11, 0.4);
}

.premium-btn:hover {
  background: #f59e0b;
  box-shadow: 0 15px 30px -5px rgba(245, 158, 11, 0.5);
  transform: translateY(-2px);
}

.premium-btn:active { transform: translateY(0); }

.arrow-circle {
  background: rgba(30, 58, 138, 0.1);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
}

/* 🚩 Footer Text */
.helper-text {
  margin-top: 25px;
  font-size: 0.9rem;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>