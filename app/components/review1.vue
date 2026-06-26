<template>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;600;800&display=swap" rel="stylesheet">

  <section class="review-section">
    <h2 class="section-title">รีวิว</h2>

    <div class="filter-container">
      <button 
        class="filter-btn" 
        :class="{ active: selectedRating === 0 }"
        @click="selectedRating = 0"
      >
        รีวิวทุกคะแนน
      </button>
      <button 
        v-for="n in [5, 4, 3, 2, 1]" 
        :key="n" 
        class="filter-btn"
        :class="{ active: selectedRating === n }"
        @click="selectedRating = n"
      >
        {{ n }} ดาว
      </button>
    </div>

    <div class="review-container">
      <TransitionGroup name="list">
        <div 
          v-for="(review, index) in filteredReviews" 
          :key="index" 
          class="review-card"
        >
          <div class="profile-header">
            <div class="avatar">
              <img :src="review.image" :alt="review.name" @error="(e) => e.target.src = imagesAccount('default.png')" />
            </div>
          </div>

          <div class="stars">
            <i v-for="star in 5" :key="star" 
               :class="[star <= review.rating ? 'fa-solid' : 'fa-regular', 'fa-star']">
            </i>
          </div>

          <h3 class="user-name">{{ review.name }}</h3>

          <p class="review-text">
            {{ review.text }}
          </p>
        </div>
      </TransitionGroup>

      <div v-if="filteredReviews.length === 0" class="no-data">
        <p>ยังไม่มีรีวิวสำหรับคะแนน {{ selectedRating }} ดาว</p>
      </div>
    </div>

    <div class="review-actions">
      <NuxtLink to="/review_write" class="btn-dark-blue">เขียนรีวิว</NuxtLink>
      <button class="btn-light-blue" @click="fetchReviews">รีเฟรชข้อมูล</button>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useApiBase } from '~/composables/useApiBase';

const { apiUrl, imagesAccount } = useApiBase();
const allReviews = ref([]);
const selectedRating = ref(0); 

// ฟังก์ชันดึงข้อมูลจาก PHP
const fetchReviews = async () => {
  try {
    const data = await $fetch(apiUrl('review-get.php'), {
      credentials: 'include'
    });
    
    if (data && Array.isArray(data)) {
      allReviews.value = data.map(item => ({
        name: item.firstname + ' ' + item.lastname,
        rating: parseInt(item.rating),
        image: imagesAccount(item.images_account || 'default.png'),
        text: item.comment
      }));
    }
  } catch (err) {
    console.error("Fetch Reviews Error:", err);
  }
};

// ฟังก์ชันกรองข้อมูล (Client-side Filter)
const filteredReviews = computed(() => {
  if (selectedRating.value === 0) return allReviews.value;
  return allReviews.value.filter(item => item.rating === selectedRating.value);
});

onMounted(() => {
  fetchReviews();
});
</script>

<style scoped>
@import "@/assets/review1.css";

/* เพิ่มเติม CSS สำหรับ Transition */
.list-enter-active, .list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from, .list-leave-to {
  opacity: 0;
  transform: translateY(30px);
}
.no-data {
  text-align: center;
  padding: 40px;
  color: #888;
  font-family: 'Kanit', sans-serif;
}
.stars .fa-solid {
  color: #fcdb3a;
}
</style>