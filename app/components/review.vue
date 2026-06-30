<template>
  <section class="review-section">
    <h2 class="section-title">รีวิวจากผู้ใช้บริการ</h2>
    
    <div class="review-container">
      <div v-if="isLoading" class="no-reviews">
        <p><i class="fa-solid fa-spinner fa-spin"></i> กำลังโหลดรีวิว...</p>
      </div>
      <div v-else-if="displayedReviews.length === 0" class="no-reviews">
        <p>ยังไม่มีข้อมูลรีวิวในขณะนี้</p>
      </div>

      <div v-for="(review, index) in displayedReviews" :key="index" class="review-card">
        <div class="review-header">
          <div class="profile">
            <div class="avatar">
              <img 
                :src="review.image" 
                alt="profile" 
                @error="(e) => e.target.src = imagesAccount('default.png')" 
              />
            </div>
            <span>{{ review.name }}</span>
          </div>
          <i class="fa-regular fa-heart heart"></i>
        </div>

        <div class="stars">
          <i
            v-for="star in 5"
            :key="star"
            :class="star <= review.rating ? 'fa-solid fa-star' : 'fa-regular fa-star'"
          ></i>
        </div>

        <p class="review-text">{{ review.text }}</p>
      </div>
    </div>

    <div class="review-buttons">
      <NuxtLink v-if="reviews.length > MAX_REVIEWS" to="/Review" class="btn-outline">
        ดูรีวิวทั้งหมด ({{ reviews.length }})
      </NuxtLink>
      <NuxtLink to="/review_write" class="btn-primary">
        <i class="fa-solid fa-pen-to-square"></i> เขียนรีวิว
      </NuxtLink>
      <button class="btn-outline" @click="fetchReviews">รีเฟรชข้อมูล</button>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useApiBase } from '~/composables/useApiBase'

const { imagesAccount } = useApiBase()
const { reviews, isLoading, fetchReviews } = useReviewsList()
const MAX_REVIEWS = 3

// แสดงเฉพาะรีวิวคะแนนสูงสุด สูงสุด 3 อัน (ของใหม่สุดมาก่อน หากคะแนนเท่ากัน)
const displayedReviews = computed(() => {
    const sorted = [...reviews.value].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    return sorted.slice(0, MAX_REVIEWS);
})
</script>

<style scoped>
@import "@/assets/review.css";

/* ปรับแต่งสีดาว */
.stars .fa-solid {
  color: #fcdb3a;
}
.stars .fa-regular {
  color: #ddd;
}
.no-reviews {
  text-align: center;
  padding: 50px;
  width: 100%;
  color: #888;
}
</style>