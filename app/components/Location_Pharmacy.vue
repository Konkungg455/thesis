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
            <div v-if="searchStatus && (hasSearched || loading)" :class="['status-msg', searchStatus.type]">
              <span v-if="searchStatus.type === 'success'"><i class="fa-solid fa-circle-check"></i></span>
              <span v-else-if="searchStatus.type === 'error'"><i class="fa-solid fa-circle-xmark"></i></span>
              <span v-else><i class="fa-solid fa-circle-info"></i></span>
              {{ searchStatus.text }}
            </div>
          </transition>

          <div v-if="loading" class="progress-container">
            <div class="progress-bar" :style="{ width: (countdown / 20) * 100 + '%' }"></div>
          </div>
        </div>

      </div>

      <!-- ===== ร้านยาในระบบของเรา (มีลิงก์ Google Maps แนบ) ===== -->
      <transition name="fade">
        <div v-if="hasSearched && (partners.length > 0 || partnersLoading)" class="results-container partner-results">
          <h2 class="section-subtitle">
            <i class="fa-solid fa-store"></i> ร้านยาในระบบของเรา
            <small class="result-count">
              ({{ displayPartners.length }} ร้าน
              <span v-if="userPos && maxDistanceKm > 0">ไม่เกิน {{ maxDistanceKm }} กม.</span>)
            </small>
          </h2>

          <div class="distance-filter-bar">
            <div v-if="userPos" class="distance-filter">
              <label>
                <i class="fa-solid fa-location-crosshairs"></i>
                ระยะทางจากคุณ:
              </label>
              <select v-model.number="maxDistanceKm" class="filter-select" @change="reloadWithDistance">
                <option :value="0">ทั้งหมด (ไม่จำกัดระยะ)</option>
                <option :value="2">ไม่เกิน 2 กม.</option>
                <option :value="5">ไม่เกิน 5 กม.</option>
                <option :value="10">ไม่เกิน 10 กม.</option>
                <option :value="25">ไม่เกิน 25 กม.</option>
                <option :value="50">ไม่เกิน 50 กม.</option>
                <option :value="100">ไม่เกิน 100 กม.</option>
              </select>
            </div>
            <div v-else class="distance-filter denied-state">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <span>เปิด GPS เพื่อกรองตามระยะทาง</span>
              <button type="button" class="btn-retry-loc" @click="requestLocation">
                <i class="fa-solid fa-arrows-rotate"></i> ลองใหม่
              </button>
            </div>
          </div>

          <div v-if="partnersLoading" class="loading-inline">
            <i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดร้านยาใกล้คุณ...
          </div>

          <div v-else-if="displayPartners.length > 0" class="pharmacy-grid">
            <div v-for="(shop, index) in displayPartners" :key="`p-${shop.id}`" class="pharmacy-card partner-card">
              <div v-if="index === 0 && shop.distance_km != null" class="shop-badge nearest">
                <i class="fa-solid fa-circle-check"></i> ใกล้คุณที่สุด
              </div>
              <div class="partner-head">
                <h3>{{ shop.store_name }}</h3>
                <div class="partner-badge"><i class="fa-solid fa-handshake"></i> ร้านพันธมิตร</div>
              </div>
              <p class="address"><i class="fa-solid fa-location-dot"></i> {{ shop.address }}</p>
              <p v-if="shop.store_phone" class="phone">
                <i class="fa-solid fa-phone"></i> {{ shop.store_phone }}
              </p>
              <div class="shop-foot">
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

          <div v-else-if="userPos && maxDistanceKm > 0 && displayPartners.length === 0" class="empty-filter-state">
            <i class="fa-solid fa-map-location-dot"></i>
            <p>ไม่พบร้านยาในระยะไม่เกิน {{ maxDistanceKm }} กม. ลองขยายระยะการค้นหา</p>
          </div>
        </div>
      </transition>

      <!-- ===== ร้านยาทั่วไปจาก Google Places ===== -->
      <transition name="fade">
        <div v-if="hasSearched && pharmacies.length > 0" class="results-container">
          <h2 class="section-subtitle">
            <i class="fa-solid fa-magnifying-glass-location"></i> ร้านขายยาทั่วไปใกล้คุณ
            <small class="result-count">(จาก Google Maps)</small>
          </h2>
          <div class="pharmacy-grid">
            <div v-for="(shop, index) in pharmacies" :key="shop.id" class="pharmacy-card">
              <div v-if="index === 0" class="shop-badge">ใกล้คุณที่สุด</div>
              <h3>{{ shop.name }}</h3>
              <p class="address"><i class="fa-solid fa-location-dot"></i> {{ shop.address }}</p>
              <div class="shop-foot">
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { loadGoogleMaps } from '~/composables/useGoogleMaps'
import { openGoogleMapsNavigation } from '#shared/utils/googleMapsLinks'

const { apiUrl } = useApiBase()

const appendQuery = (base, params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            q.set(key, String(value))
        }
    })
    const qs = q.toString()
    if (!qs) return base
    return base + (base.includes('?') ? '&' : '?') + qs
}

const loading = ref(false)
const pharmacies = ref([])      // ผลลัพธ์ Google Places nearbySearch (ทั่วไป)
const partners = ref([])        // ร้านยาในระบบของเรา (มีลิงก์ Google Maps)
const partnersLoading = ref(false)
const userPos = ref(null)
const locationStatus = ref('idle') // idle | locating | granted | denied | unavailable
const maxDistanceKm = ref(0)       // 0 = ไม่จำกัดระยะ (ค่าเริ่มต้น)
const hasSearched = ref(false)     // แสดงผลค้นหาเฉพาะหลังกดปุ่ม
const countdown = ref(20)
const searchStatus = ref(null)
let timerInterval = null
let loadingStartedAt = 0
let searchSession = 0
let pageHiddenAt = 0
let awaitingGeolocation = false

const resetSearchState = () => {
  stopTimer()
  loading.value = false
}

const clearSearchResults = () => {
  partners.value = []
  pharmacies.value = []
  searchStatus.value = null
  partnersLoading.value = false
  hasSearched.value = false
}

const onVisibilityChange = () => {
  if (typeof document === 'undefined') return

  if (document.visibilityState === 'hidden') {
    pageHiddenAt = Date.now()
    return
  }

  // กลับมาแท็บ — อย่ายกเลิกระหว่างรอ GPS permission (มักหายไปไม่กี่วินาที)
  if (!loading.value || awaitingGeolocation) {
    pageHiddenAt = 0
    return
  }

  const hiddenMs = pageHiddenAt ? Date.now() - pageHiddenAt : 0
  pageHiddenAt = 0
  if (hiddenMs < 60_000) return

  searchSession += 1
  clearSearchResults()
  resetSearchState()
  searchStatus.value = {
    text: 'การค้นหาถูกยกเลิก — กดปุ่มค้นหาอีกครั้งได้',
    type: 'info',
  }
  hasSearched.value = true
}

const onPageShow = (event) => {
  if (event?.persisted) {
    searchSession += 1
    clearSearchResults()
    resetSearchState()
  }
}

const bindPageLifecycle = () => {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)
}

const unbindPageLifecycle = () => {
  if (typeof document === 'undefined') return
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pageshow', onPageShow)
}

const getPositionWithTimeout = (options, timeoutMs = 20000) =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 0, message: 'unsupported' })
      return
    }
    let settled = false
    awaitingGeolocation = true
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      awaitingGeolocation = false
      reject({ code: 3, message: 'timeout' })
    }, timeoutMs)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return
        settled = true
        awaitingGeolocation = false
        clearTimeout(timer)
        resolve(position)
      },
      (error) => {
        if (settled) return
        settled = true
        awaitingGeolocation = false
        clearTimeout(timer)
        reject(error)
      },
      options,
    )
  })

const filteredPartners = computed(() => {
    if (!userPos.value || maxDistanceKm.value <= 0) {
        return partners.value
    }
    return partners.value.filter((shop) => {
        if (shop.distance_km === null || shop.distance_km === undefined) return false
        return Number(shop.distance_km) <= Number(maxDistanceKm.value)
    })
})

const displayPartners = computed(() => filteredPartners.value)

const getUserPosition = () =>
    new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            locationStatus.value = 'unavailable'
            resolve(null)
            return
        }
        locationStatus.value = 'locating'
        navigator.geolocation.getCurrentPosition(
            (position) => {
                locationStatus.value = 'granted'
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                })
            },
            () => {
                locationStatus.value = 'denied'
                resolve(null)
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
        )
    })

const loadPartners = async (pos = null) => {
    partnersLoading.value = true
    try {
        const params = { t: Date.now() }
        if (pos) {
            params.lat = pos.lat
            params.lng = pos.lng
        }
        const res = await $fetch(
            appendQuery(apiUrl('get-nearby-pharmacies.php'), params),
            { credentials: 'include' },
        )
        const stores = res?.status === 'success' ? (res.stores || []) : []
        partners.value = stores.map((s) => ({
            ...s,
            distance_km: s.distance ?? null,
            store_phone: s.phone || '',
        }))
    } catch (e) {
        console.warn('โหลดร้านยาในระบบไม่สำเร็จ', e)
        partners.value = []
    } finally {
        partnersLoading.value = false
    }
}

const reloadWithDistance = () => {
    updateSearchStatus(displayPartners.value.length, pharmacies.value.length)
}

const requestLocation = async () => {
    userPos.value = await getUserPosition()
    if (userPos.value) {
        await loadPartners(userPos.value)
        updateSearchStatus(displayPartners.value.length, pharmacies.value.length)
    }
}

const openStoreMaps = (store) => {
    openGoogleMapsNavigation({
        lat: store.latitude,
        lng: store.longitude,
        name: store.store_name,
        address: store.address,
        googleMapsUrl: store.google_maps_url,
    })
}

const startTimer = () => {
  countdown.value = 20
  timerInterval = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    } else {
      stopTimer()
      if (pharmacies.value.length === 0 && loading.value) {
        searchSession += 1
        resetSearchState()
        searchStatus.value = { text: 'หาไม่เจอ: หมดเวลาค้นหาสัญญาณ GPS', type: 'error' }
      }
    }
  }, 1000)
}

const stopTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  loading.value = false
}

const runGooglePlacesSearch = (userPos) =>
    Promise.race([
        new Promise((resolve) => {
            if (typeof google === 'undefined' || !google.maps?.places) {
                resolve(0)
                return
            }
            try {
                const dummyMap = new google.maps.Map(document.createElement('div'))
                const service = new google.maps.places.PlacesService(dummyMap)
                const request = {
                    location: userPos,
                    radius: 5000,
                    type: ['pharmacy'],
                    keyword: 'ร้านขายยา',
                }
                service.nearbySearch(request, (results, status) => {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results?.length > 0) {
                        pharmacies.value = results.map((place) => {
                            const dist = google.maps.geometry.spherical.computeDistanceBetween(
                                new google.maps.LatLng(userPos.lat, userPos.lng),
                                place.geometry.location,
                            )
                            return {
                                id: place.place_id,
                                name: place.name,
                                address: place.vicinity,
                                distance: (dist / 1000).toFixed(1),
                            }
                        })
                            .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
                            .slice(0, 3)
                        resolve(pharmacies.value.length)
                        return
                    }
                    pharmacies.value = []
                    resolve(0)
                })
            } catch (e) {
                console.warn('Google Places search failed:', e)
                pharmacies.value = []
                resolve(0)
            }
        }),
        new Promise((resolve) => {
            setTimeout(() => resolve(0), 8000)
        }),
    ])

const updateSearchStatus = (partnerCount, googleCount) => {
    if (partnerCount > 0) {
        const radiusLabel = userPos.value && maxDistanceKm.value > 0
            ? ` (ไม่เกิน ${maxDistanceKm.value} กม.)`
            : ''
        searchStatus.value = {
            text: `พบร้านยาในระบบ ${partnerCount} ร้าน${radiusLabel} — เรียงตามระยะทางจากตำแหน่งของคุณ`,
            type: 'success',
        }
        return
    }
    if (partners.value.length > 0 && userPos.value && maxDistanceKm.value > 0) {
        searchStatus.value = {
            text: `ไม่พบร้านยาในระยะไม่เกิน ${maxDistanceKm.value} กม. — ลองขยายระยะการค้นหา`,
            type: 'info',
        }
        return
    }
    if (googleCount > 0) {
        searchStatus.value = {
            text: `พบร้านขายยาทั่วไปจาก Google Maps ${googleCount} ร้านด้านล่าง`,
            type: 'success'
        }
        return
    }
    searchStatus.value = {
        text: 'ยังไม่พบร้านยาใกล้คุณในระบบ — ลองขยายระยะการค้นหาหรือเปิด GPS อีกครั้ง',
        type: 'info'
    }
}

const handleSearch = async () => {
  if (loading.value) return

  const mySession = ++searchSession
  hasSearched.value = true
  loading.value = true
  loadingStartedAt = Date.now()
  pharmacies.value = []
  partners.value = []
  searchStatus.value = { text: 'กำลังยืนยันตำแหน่งที่แม่นยำของคุณ...', type: 'info' }
  startTimer()

  try {
    await Promise.race([
      loadGoogleMaps(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Google Maps load timeout')), 12_000)
      }),
    ])
  } catch {
    if (mySession !== searchSession) return
    searchStatus.value = { text: 'โหลด Google Maps ไม่สำเร็จ — ลองใหม่อีกครั้ง', type: 'error' }
    resetSearchState()
    loadPartners(null)
    return
  }

  if (!navigator.geolocation) {
    if (mySession !== searchSession) return
    searchStatus.value = { text: 'หาไม่ได้: เบราว์เซอร์นี้ไม่รองรับ GPS', type: 'error' }
    resetSearchState()
    loadPartners(null)
    return
  }

  const geoOptions = {
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 120000,
  }

  try {
    let position
    try {
      position = await getPositionWithTimeout(geoOptions, 14000)
    } catch {
      position = await getPositionWithTimeout({
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }, 22000)
    }
    if (mySession !== searchSession) return

    const pos = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    }
    userPos.value = pos
    resetSearchState()
    searchStatus.value = { text: 'กำลังค้นหาร้านยาในระบบของเรา...', type: 'info' }

    await loadPartners(pos)
    if (mySession !== searchSession) return

    updateSearchStatus(displayPartners.value.length, 0)

    const googleCount = await runGooglePlacesSearch(pos)
    if (mySession !== searchSession) return
    updateSearchStatus(displayPartners.value.length, googleCount)
  } catch (error) {
    if (mySession !== searchSession) return
    resetSearchState()
    const code = Number(error?.code || 0)
    let errorMsg = 'หาไม่ได้: กรุณาเปิด GPS และอนุญาตสิทธิ์ตำแหน่ง'
    if (code === 3) errorMsg = 'หาไม่ได้: หมดเวลาค้นหาพิกัด — ลองใหม่อีกครั้ง'
    if (code === 1) errorMsg = 'หาไม่ได้: คุณปฏิเสธสิทธิ์การเข้าถึง GPS — แสดงร้านในระบบทั้งหมดให้แทน'
    searchStatus.value = { text: errorMsg, type: code === 1 ? 'info' : 'error' }
    if (code === 1) loadPartners(null)
  }
}

const openMap = (placeId, name) => {
    openGoogleMapsNavigation({ placeId, name })
}

onMounted(() => {
    bindPageLifecycle()
})

onUnmounted(() => {
    searchSession += 1
    unbindPageLifecycle()
    clearSearchResults()
    resetSearchState()
})
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
.card-badge,
.shop-badge { background: #28a745; color: white; font-size: 11px; padding: 4px 12px; border-radius: 20px; margin-bottom: 12px; display: inline-block; font-weight: bold; }
.address { font-size: 14px; color: #666; margin: 12px 0; line-height: 1.4; }
.card-footer,
.shop-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; border-top: 1px solid #eee; padding-top: 12px; }
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
.partner-card-head,
.partner-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}
.partner-card-head h3,
.partner-head h3 {
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
.card-badge.nearest,
.shop-badge.nearest {
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

.distance-filter-bar {
    display: flex;
    justify-content: center;
    margin-bottom: 20px;
}

.distance-filter {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 10px 18px;
    background: #f1f6ff;
    border: 1px solid #cfe1ff;
    border-radius: 999px;
    color: #00469c;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(0, 70, 156, 0.08);
}

.distance-filter label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.95rem;
}

.filter-select {
    border: 1px solid #cfe1ff;
    background: #ffffff;
    color: #00469c;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    outline: none;
}

.filter-select:focus {
    border-color: #00469c;
    box-shadow: 0 0 0 3px rgba(0, 70, 156, 0.15);
}

.distance-filter.denied-state {
    background: #fff7ed;
    border-color: #fed7aa;
    color: #9a3412;
    font-weight: 500;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 10px 18px;
    border-radius: 999px;
}

.btn-retry-loc {
    border: none;
    background: #f97316;
    color: white;
    padding: 6px 14px;
    border-radius: 999px;
    cursor: pointer;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.btn-retry-loc:hover {
    background: #ea580c;
}

.loading-inline {
    text-align: center;
    color: #00469c;
    padding: 24px 0;
    font-weight: 600;
}

.empty-filter-state {
    text-align: center;
    padding: 32px 16px;
    color: #64748b;
}

.empty-filter-state i {
    font-size: 2rem;
    color: #cbd5e1;
    margin-bottom: 10px;
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

/* Dark mode — ผลลัพธ์ค้นหาร้านยา */
html.dark .status-msg.success {
  background: rgba(34, 197, 94, 0.14);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.28);
}
html.dark .status-msg.error {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.28);
}
html.dark .status-msg.info {
  background: rgba(59, 130, 246, 0.14);
  color: #93c5fd;
  border-color: rgba(59, 130, 246, 0.28);
}
html.dark .progress-container {
  background: rgba(148, 163, 184, 0.2);
}
html.dark .progress-bar {
  background: #38bdf8;
}
html.dark .results-container {
  background: rgba(15, 23, 42, 0.72) !important;
  border-top-color: rgba(125, 211, 252, 0.35);
  box-shadow: inset 0 1px 0 rgba(148, 163, 184, 0.08);
}
html.dark .partner-results {
  border-top-color: rgba(74, 222, 128, 0.45);
}
html.dark .section-subtitle {
  color: #7dd3fc !important;
}
html.dark .result-count {
  color: #94a3b8 !important;
}
html.dark .pharmacy-card {
  background: #1e293b !important;
  border-left-color: #38bdf8 !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}
html.dark .pharmacy-card h3 {
  color: #f8fafc !important;
}
html.dark .partner-card {
  background: linear-gradient(135deg, rgba(22, 163, 74, 0.18) 0%, #1e293b 72%) !important;
  border-left-color: #4ade80 !important;
}
html.dark .partner-head,
html.dark .shop-foot {
  background: transparent !important;
  background-color: transparent !important;
}
html.dark .shop-badge {
  background: #28a745 !important;
}
html.dark .shop-badge.nearest {
  background: linear-gradient(135deg, #f59e0b, #d97706) !important;
}
html.dark .address,
html.dark .phone {
  color: #cbd5e1 !important;
}
html.dark .shop-foot {
  border-top-color: rgba(148, 163, 184, 0.22);
}
html.dark .distance {
  color: #7dd3fc !important;
}
html.dark .no-distance {
  color: #94a3b8 !important;
}
html.dark .nav-btn {
  background: linear-gradient(135deg, #2563eb, #0284c7);
}
html.dark .nav-btn:hover {
  background: linear-gradient(135deg, #1d4ed8, #0369a1);
}
html.dark .distance-filter {
  background: rgba(30, 41, 59, 0.92);
  border-color: rgba(125, 211, 252, 0.22);
  color: #e2e8f0;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
}
html.dark .filter-select {
  background: #0b1220 !important;
  color: #e2e8f0 !important;
  border-color: rgba(148, 163, 184, 0.32) !important;
}
html.dark .filter-select:focus {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}
html.dark .distance-filter.denied-state {
  background: rgba(124, 45, 18, 0.22);
  border-color: rgba(251, 146, 60, 0.35);
  color: #fdba74;
}
html.dark .loading-inline {
  color: #7dd3fc;
}
html.dark .empty-filter-state {
  color: #94a3b8;
}
html.dark .empty-filter-state i {
  color: #64748b;
}
</style>