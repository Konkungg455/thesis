<template>
  <div class="review-box">
    <h2>เขียนรีวิวของคุณ</h2>

    <p class="label">ให้คะแนนความพึงพอใจ</p>

    <div class="stars">
      <span
        v-for="n in 5"
        :key="n"
        class="star"
        :class="{ active: n <= rating }"
        @click="rating = n"
      >
        ★
      </span>
    </div>

    <p class="label">ความคิดเห็นเพิ่มเติม</p>

    <div class="textarea-box">
      <textarea
        v-model="comment"
        placeholder="แบ่งปันประสบการณ์การใช้งานของคุณ..."
      ></textarea>
    </div>

    <div class="buttons">
      <button class="submit" @click="submitReview" :disabled="loading">
        {{ loading ? 'กำลังส่ง...' : 'ส่งรีวิว' }}
      </button>
      <button class="cancel" @click="$router.back()">ยกเลิก</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue"
import { useRouter, useRoute } from "vue-router"

const router = useRouter()
const route = useRoute()
const rating = ref(5)
const comment = ref("")
const loading = ref(false)

const submitReview = async () => {
  if (!comment.value.trim()) {
    alert("กรุณากรอกความคิดเห็นก่อนส่งรีวิวครับ");
    return;
  }

  loading.value = true;
  const body = new FormData();
  body.append('rating', rating.value);
  body.append('comment', comment.value);
  // ผูกรีวิวกับรอบปรึกษา → ให้แจ้งเตือน "กรุณาประเมินเภสัช" หายหลังรีวิวรอบนั้น
  const consultId = Number(route.query.consult_id) || 0;
  if (consultId > 0) body.append('consult_id', String(consultId));

  try {
    const res = await $fetch(`${useNuxtApp().$getApiBase()}/review-send.php`, {
      method: 'POST',
      body,
      credentials: 'include' // สำคัญ: เพื่อให้ส่ง Session id_account ไปด้วย
    });

    if (res.status === 'success') {
      alert("ขอบคุณสำหรับรีวิวครับ!");
      router.push('/review'); 
    } else {
      alert(res.message || "เกิดข้อผิดพลาดในการส่งรีวิว");
    }
  } catch (err) {
    console.error("Submit Review Error:", err);
    alert("ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
@import "@/assets/review_write_part.css";
/* เพิ่มเติม CSS สำหรับสถานะ Disable */
.submit:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}
.star {
  cursor: pointer;
  font-size: 30px;
  color: #ddd;
  transition: 0.2s;
}
.star.active {
  color: #fcdb3a;
}
</style>