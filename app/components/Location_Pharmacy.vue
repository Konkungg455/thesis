<template>
  <div class="page-wrapper">
    <div class="content-card">
      <div class="card-layout">
        
        <div class="visual-section">
          <div class="logo-container">
            <img 
              src="/images/pharmacy-store.png" 
              alt="ร้านขายยา Pharmacy" 
              class="main-img"
            />
          </div>
        </div>

        <div class="info-section">
          <h1 class="main-title">ร้านขายยาใกล้ฉัน</h1>
          <p class="description-text">ค้นหาร้านขายยาที่ใกล้ที่สุด หรือค้นหาหน่วยบริการใช้สิทธิบัตรทอง</p>
          
          <div class="button-group">
            <button class="action-btn" @click="handleSearch" :disabled="loading">
              <span class="pin-icon">
                <i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-location-dot'"></i>
              </span>
              {{ loading ? `กำลังค้นหาพิกัด (${countdown}s)...` : 'ค้นหาร้านขายยาใกล้ฉัน' }}
            </button>

          </div>

          <transition name="fade">
            <div v-if="searchStatus" :class="['status-msg', searchStatus.type]">
              <span v-if="searchStatus.type === 'success'"><i class="fa-solid fa-circle-check"></i></span>
              <span v-else-if="searchStatus.type === 'error'"><i class="fa-solid fa-circle-xmark"></i></span>
              <span v-else><i class="fa-solid fa-circle-info"></i></span>
              {{ searchStatus.text }}
            </div>
          </transition>

          <div v-if="loading" class="progress-container">
            <div class="progress-bar" :style="{ width: (countdown / 60) * 100 + '%' }"></div>
          </div>
        </div>

      </div>

      <!-- ===== ร้านยาในระบบของเรา (มีลิงก์ Google Maps แนบ) ===== -->
      <transition name="fade">
        <div v-if="partners.length > 0" class="results-container partner-results">
          <h2 class="section-subtitle">
            <i class="fa-solid fa-store"></i> ร้านยาในระบบของเรา
            <small class="result-count">({{ partners.length }} ร้าน)</small>
          </h2>
          <div class="pharmacy-grid">
            <div v-for="(shop, index) in partners" :key="`p-${shop.id}`" class="pharmacy-card partner-card">
              <div v-if="index === 0 && shop.distance_km != null" class="card-badge nearest">
                <i class="fa-solid fa-circle-check"></i> ใกล้คุณที่สุด
              </div>
              <div class="partner-card-head">
                <h3>{{ shop.store_name }}</h3>
                <div class="partner-badge"><i class="fa-solid fa-handshake"></i> ร้านพันธมิตร</div>
              </div>
              <p class="address"><i class="fa-solid fa-location-dot"></i> {{ shop.address }}</p>
              <p v-if="shop.store_phone" class="phone">
                <i class="fa-solid fa-phone"></i> {{ shop.store_phone }}
              </p>
              <div class="card-footer">
                <span v-if="shop.distance_km != null" class="distance">
                  📏 {{ shop.distance_km }} กม.
                </span>
                <span v-else-if="shop.latitude && shop.longitude" class="distance no-distance">
                  <i class="fa-solid fa-location-dot"></i> พร้อมนำทาง
                </span>
                <span v-else class="distance no-distance">
                  <i class="fa-solid fa-circle-info"></i> ไม่มีพิกัด
                </span>
                <button class="nav-btn" @click="openStoreMaps(shop)">
                  <i class="fa-solid fa-diamond-turn-right"></i> นำทาง
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>

      <!-- ===== ร้านยาทั่วไปจาก Google Places ===== -->
      <transition name="fade">
        <div v-if="pharmacies.length > 0" class="results-container">
          <h2 class="section-subtitle">
            <i class="fa-solid fa-magnifying-glass-location"></i> ร้านขายยาทั่วไปใกล้คุณ
            <small class="result-count">(จาก Google Maps)</small>
          </h2>
          <div class="pharmacy-grid">
            <div v-for="(shop, index) in pharmacies" :key="shop.id" class="pharmacy-card">
              <div v-if="index === 0" class="card-badge">ใกล้คุณที่สุด</div>
              <h3>{{ shop.name }}</h3>
              <p class="address"><i class="fa-solid fa-location-dot"></i> {{ shop.address }}</p>
              <div class="card-footer">
                <span class="distance">📏 {{ shop.distance }} กม.</span>
                <button class="nav-btn" @click="openMap(shop.id, shop.name)">นำทาง</button>
              </div>
            </div>
          </div>
        </div>
      </transition>

    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { loadGoogleMaps } from '~/composables/useGoogleMaps'

const { apiUrl } = useApiBase()

const loading = ref(false)
const pharmacies = ref([])      // ผลลัพธ์ Google Places nearbySearch (ทั่วไป)
const partners = ref([])        // ร้านยาในระบบของเรา (มีลิงก์ Google Maps)
const partnersLoading = ref(false)
const countdown = ref(60)
const searchStatus = ref(null)
let timerInterval = null

const loadPartners = async (userPos = null) => {
    partnersLoading.value = true
    try {
        let url = apiUrl('get-nearby-pharmacies.php?limit=20')
        if (userPos) {
            url += `&lat=${userPos.lat}&lng=${userPos.lng}`
        }
        const res = await $fetch(url, { credentials: 'include' })
        if (res.status === 'success') {
            partners.value = (res.stores || []).map((s) => ({
                ...s,
                distance_km: s.distance ?? null,
                store_phone: s.phone || ''
            }))
        }
    } catch (e) {
        console.warn('โหลดร้านยาในระบบไม่สำเร็จ', e)
    } finally {
        partnersLoading.value = false
    }
}

const openStoreMaps = (store) => {
    if (store.google_maps_url) {
        window.open(store.google_maps_url, '_blank', 'noopener')
        return
    }
    if (store.latitude && store.longitude) {
        const url = `https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`
        window.open(url, '_blank', 'noopener')
        return
    }
    const q = encodeURIComponent(store.store_name + ' ' + (store.address || ''))
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank', 'noopener')
}

const startTimer = () => {
  countdown.value = 60
  timerInterval = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      stopTimer()
      if (pharmacies.value.length === 0) {
        searchStatus.value = { text: 'หาไม่เจอ: หมดเวลาค้นหาสัญญาณ GPS (1 นาที)', type: 'error' }
      }
    }
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  loading.value = false
}

const runGooglePlacesSearch = (userPos) => {
  if (typeof google === 'undefined' || !google.maps?.places) return;
  try {
    const dummyMap = new google.maps.Map(document.createElement('div'));
    const service = new google.maps.places.PlacesService(dummyMap);
    const request = {
      location: userPos,
      radius: 5000,
      type: ['pharmacy'],
      keyword: 'ร้านขายยา'
    };
    service.nearbySearch(request, (results, status) => {
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length > 0) {
        pharmacies.value = results.map(place => {
          const dist = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(userPos.lat, userPos.lng),
            place.geometry.location
          );
          return {
            id: place.place_id,
            name: place.name,
            address: place.vicinity,
            distance: (dist / 1000).toFixed(1)
          };
        })
        .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
        .slice(0, 3);
      }
    });
  } catch (e) {
    console.warn('Google Places search failed:', e);
  }
}

const handleSearch = async () => {
  loading.value = true
  pharmacies.value = []
  partners.value = []
  searchStatus.value = { text: 'กำลังยืนยันตำแหน่งที่แม่นยำของคุณ...', type: 'info' }
  startTimer()

  try {
    await loadGoogleMaps()
  } catch {
    searchStatus.value = { text: 'โหลด Google Maps ไม่สำเร็จ — ลองใหม่อีกครั้ง', type: 'error' }
    stopTimer()
    loadPartners(null)
    return
  }

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 60000,
    maximumAge: 0
  };

  if (!navigator.geolocation) {
    searchStatus.value = { text: 'หาไม่ได้: เบราว์เซอร์นี้ไม่รองรับ GPS', type: 'error' }
    stopTimer()
    // ยังโหลดร้านในระบบให้ดูได้ (ไม่มีระยะทาง)
    loadPartners(null)
    return
  }

  navigator.geolocation.getCurrentPosition(async (position) => {
    const userPos = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    stopTimer()
    searchStatus.value = { text: 'กำลังค้นหาร้านยาในระบบของเรา...', type: 'info' }

    // 1) ดึงร้านในระบบ (มี google_maps_url)
    await loadPartners(userPos)

    // 2) ค้นหาร้านยาทั่วไปจาก Google Places (ถ้า library โหลดได้)
    runGooglePlacesSearch(userPos)

    const totalPartners = partners.value.length
    if (totalPartners > 0) {
      searchStatus.value = {
        text: `พบร้านยาในระบบ ${totalPartners} ร้าน — เรียงตามระยะทางจากตำแหน่งของคุณ`,
        type: 'success'
      }
    } else {
      searchStatus.value = {
        text: 'ยังไม่มีร้านยาในระบบใกล้คุณ ลองดูร้านยาทั่วไปด้านล่าง',
        type: 'info'
      }
    }
  }, (error) => {
    stopTimer()
    let errorMsg = 'หาไม่ได้: กรุณาเปิด GPS และอนุญาตสิทธิ์ตำแหน่ง'
    if (error.code === 3) errorMsg = 'หาไม่ได้: หมดเวลาค้นหาพิกัด (1 นาที)'
    if (error.code === 1) errorMsg = 'หาไม่ได้: คุณปฏิเสธสิทธิ์การเข้าถึง GPS — แสดงร้านในระบบทั้งหมดให้แทน'
    searchStatus.value = { text: errorMsg, type: error.code === 1 ? 'info' : 'error' }
    // ถ้าผู้ใช้ปฏิเสธ GPS ก็ยังดูร้านในระบบได้ (ไม่มีระยะทาง)
    if (error.code === 1) loadPartners(null)
  }, geoOptions);
}

// แก้ไขฟังก์ชันนำทางให้ถูกต้อง
const openMap = (placeId, name) => {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${placeId}`;
  window.open(url, '_blank');
}

onUnmounted(() => stopTimer())
</script>

<style scoped>
@import "@/assets/location_pharmacy.css";

.button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 20px;
}

/* ปุ่มลิงก์ 30 บาท */
.nhso-link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #28a745;
  color: white;
  padding: 14px 20px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: bold;
  font-size: 16px;
  transition: background 0.2s;
  box-shadow: 0 4px 10px rgba(40, 167, 69, 0.2);
}

.nhso-link-btn:hover {
  background: #218838;
}

.status-msg {
  margin-top: 15px;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
}

.status-msg span {
  margin-right: 6px;
}
.status-msg.success { background: #e6f4ea; color: #1e7e34; border: 1px solid #c3e6cb; }
.status-msg.error { background: #fce8e6; color: #d93025; border: 1px solid #f5c6cb; }
.status-msg.info { background: #e8f0fe; color: #1967d2; border: 1px solid #d2e3fc; }

.progress-container {
  width: 100%;
  height: 6px;
  background: #eee;
  border-radius: 3px;
  margin-top: 10px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background: #00469c;
  transition: width 1s linear;
}

.results-container { 
  margin-top: 30px; 
  padding: 20px; 
  border-top: 2px solid #00469c; 
  background: #ffffff; 
  border-radius: 15px;
}
.section-subtitle { color: #00469c; font-size: 18px; margin-bottom: 20px; text-align: left; font-weight: bold; }
.pharmacy-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.pharmacy-card { 
  background: white; 
  padding: 20px; 
  border-radius: 15px; 
  box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
  border-left: 5px solid #00469c; 
  text-align: left; 
}
.card-badge { background: #28a745; color: white; font-size: 11px; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; display: inline-block; font-weight: bold; }
.address { font-size: 14px; color: #666; margin: 12px 0; line-height: 1.4; }
.card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 12px; }
.distance { font-weight: 800; color: #00469c; font-size: 16px; }
.nav-btn { background: #00469c; color: white; border: none; padding: 10px 20px; border-radius: 10px; cursor: pointer; font-weight: bold; display: inline-flex; align-items: center; gap: 6px; }
.nav-btn:hover { background: #003a7a; transform: translateY(-1px); }

.result-count {
    font-size: 13px;
    color: #94a3b8;
    font-weight: 400;
    margin-left: 8px;
}

.partner-results { border-top-color: #16a34a; }
.partner-card {
    border-left-color: #16a34a !important;
    position: relative;
    background: linear-gradient(to bottom right, #f0fdf4 0%, #ffffff 60%);
}
.partner-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}
.partner-card-head h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    padding-right: 0;
    line-height: 1.35;
    word-break: break-word;
}
.partner-badge {
    background: #16a34a;
    color: white;
    font-size: 10px;
    padding: 4px 10px;
    border-radius: 20px;
    font-weight: bold;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    white-space: nowrap;
    margin-top: 1px;
}
.card-badge.nearest {
    background: linear-gradient(135deg, #f59e0b, #d97706);
}
.phone {
    font-size: 13px;
    color: #475569;
    margin: 4px 0 0;
}
.no-distance {
    color: #94a3b8 !important;
    font-size: 13px !important;
    font-weight: 400 !important;
}

.fade-enter-active, .fade-leave-active { transition: all 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* เพิ่ม margin ให้ไอคอนห่างจากตัวหนังสือ */
.nhso-link-btn .pin-icon {
  margin-right: 1px; /* ปรับค่าตัวเลขนี้ได้ตามความต้องการ (ยิ่งมากยิ่งห่าง) */
  display: flex;
  align-items: center;
}

/* หรือจะแก้ที่ปุ่มหลักให้ใช้ gap แทนก็ได้ (วิธีที่ทันสมัยกว่า) */
.nhso-link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px; /* ระยะห่างระหว่างลูกๆ ทุกตัวในปุ่ม */
  background: #28a745;
  color: white;
  padding: 14px 20px;
  border-radius: 12px;
  text-decoration: none;
  font-weight: bold;
  font-size: 16px;
  transition: background 0.2s;
  box-shadow: 0 4px 10px rgba(40, 167, 69, 0.2);
}
</style>