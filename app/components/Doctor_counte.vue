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
const { total, isLoading } = usePharmacistsList()
const totalPharmacists = total
</script>

<style scoped>
@import "@/assets/doctor_counte.css";
</style>
