<template>
    <section class="online-bar">
        <div class="left-section">
            <div class="store-icon">👨‍⚕️</div>
            <div class="text-group">
                <div class="title">
                    เภสัชกรทั้งหมดในระบบ
                </div>
                <div class="users">
                    <span v-if="isLoading" class="number">...</span>
                    <span v-else class="number">{{ totalPharmacists }}</span> ท่าน
                </div>
            </div>
        </div>
        <NuxtLink to="/pharmacist/all" class="action-btn">
            ดูทั้งหมด
        </NuxtLink>
    </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useApiBase } from '~/composables/useApiBase'

const { apiUrl } = useApiBase()
const totalPharmacists = ref(0)
const isLoading = ref(true)

onMounted(async () => {
    try {
        const response = await $fetch(apiUrl('get_pharmacists.php'), { credentials: 'include' })
        if (response.status === 'success') {
            totalPharmacists.value = response.total ?? response.data?.length ?? 0
        }
    } catch (err) {
        console.error('Error fetching pharmacist count:', err)
        totalPharmacists.value = 0
    } finally {
        isLoading.value = false
    }
})
</script>

<style scoped>
@import "@/assets/doctor_counte.css";
</style>
