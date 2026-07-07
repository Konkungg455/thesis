<script setup>
definePageMeta({
    layout: false
});
</script>

<template>
    <Header />
    <div class="auth-page">
        <NuxtLink to="/" class="auth-back">
            <i class="fa-solid fa-arrow-left"></i> หน้าแรก
        </NuxtLink>

        <div class="auth-card">
            <div class="auth-header">
                <h1>เข้าสู่ระบบ</h1>
                <p>เลือกประเภทบัญชีของคุณ</p>
            </div>

            <div class="auth-hub-grid">
                <NuxtLink to="/auth/login-user" class="auth-hub-card user">
                    <div class="auth-hub-icon">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="auth-hub-text">
                        <strong>ผู้ใช้งาน</strong>
                        <span>ปรึกษาอาการ / รับใบสรุปรายการยาออนไลน์</span>
                    </div>
                </NuxtLink>

                <NuxtLink to="/auth/login-pharmacist" class="auth-hub-card">
                    <div class="auth-hub-icon">
                        <i class="fa-solid fa-user-doctor"></i>
                    </div>
                    <div class="auth-hub-text">
                        <strong>เภสัชกร</strong>
                        <span>ให้คำปรึกษาและจ่ายยา</span>
                    </div>
                </NuxtLink>

                <NuxtLink to="/auth/login-store" class="auth-hub-card store">
                    <div class="auth-hub-icon">
                        <i class="fa-solid fa-store"></i>
                    </div>
                    <div class="auth-hub-text">
                        <strong>เจ้าของร้าน</strong>
                        <span>จัดการร้านยาและพนักงาน</span>
                    </div>
                </NuxtLink>

                <NuxtLink to="/auth/login-admin" class="auth-hub-card admin">
                    <div class="auth-hub-icon">
                        <i class="fa-solid fa-shield-halved"></i>
                    </div>
                    <div class="auth-hub-text">
                        <strong>ผู้ดูแลระบบ</strong>
                        <span>จัดการผู้ใช้ / เภสัชกร / ร้านยา</span>
                    </div>
                </NuxtLink>
            </div>

            <div class="auth-footer" style="margin-top: 28px;">
                <span class="auth-footer-label">ยังไม่มีบัญชี? สมัครสมาชิกในฐานะ</span>
                <div class="auth-role-links">
                    <NuxtLink to="/auth/register-user" class="auth-role-chip">
                        <i class="fa-solid fa-user"></i> ผู้ใช้งาน
                    </NuxtLink>
                    <NuxtLink to="/auth/register-pharmacist" class="auth-role-chip">
                        <i class="fa-solid fa-user-doctor"></i> เภสัช
                    </NuxtLink>
                    <NuxtLink to="/auth/register-store" class="auth-role-chip">
                        <i class="fa-solid fa-store"></i> ร้านยา
                    </NuxtLink>
                    <NuxtLink to="/auth/register-admin" class="auth-role-chip">
                        <i class="fa-solid fa-shield-halved"></i> ผู้ดูแล
                    </NuxtLink>
                </div>
            </div>
        </div>
    </div>
    <Footer />
</template>


<style scoped>
@import "@/assets/auth-login.css";
</style>
