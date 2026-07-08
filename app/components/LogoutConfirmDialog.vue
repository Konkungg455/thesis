<script setup>
const props = defineProps({
    show: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    role: { type: String, default: 'user' },
});

const emit = defineEmits(['confirm', 'cancel']);

const roleMeta = computed(() => {
    switch (props.role) {
        case 'admin':
            return {
                icon: 'fa-shield-halved',
                title: 'ออกจากระบบผู้ดูแล',
                badge: 'ผู้ดูแลระบบ',
                tone: 'admin',
            };
        case 'pharmacist':
            return {
                icon: 'fa-user-doctor',
                title: 'ออกจากระบบเภสัชกร',
                badge: 'เภสัชกร',
                tone: 'pharmacist',
            };
        case 'store':
            return {
                icon: 'fa-store',
                title: 'ออกจากระบบร้านยา',
                badge: 'เจ้าของร้านยา',
                tone: 'store',
            };
        default:
            return {
                icon: 'fa-user',
                title: 'ออกจากระบบ',
                badge: 'ผู้ใช้งาน',
                tone: 'user',
            };
    }
});

const onConfirm = () => {
    if (props.loading) return;
    emit('confirm');
};

const onCancel = () => {
    if (props.loading) return;
    emit('cancel');
};
</script>

<template>
    <Teleport to="body">
        <Transition name="logout-fade">
            <div v-if="show" class="logout-overlay" @click.self="onCancel">
                <Transition name="logout-pop" appear>
                    <div v-if="show" class="logout-dialog" :class="`logout-${roleMeta.tone}`" role="dialog" aria-modal="true">
                        <button class="logout-close" :disabled="loading" @click="onCancel" aria-label="ปิด">
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                        <div class="logout-icon-wrap">
                            <div class="logout-icon-ring">
                                <i class="fa-solid" :class="roleMeta.icon"></i>
                            </div>
                        </div>

                        <div class="logout-body">
                            <span class="logout-badge">{{ roleMeta.badge }}</span>
                            <h3 class="logout-title">{{ roleMeta.title }}</h3>
                            <p class="logout-desc">
                                คุณต้องการออกจากระบบหรือไม่?<br />
                                หากออกจากระบบ คุณจะต้องเข้าสู่ระบบใหม่อีกครั้ง
                            </p>
                        </div>

                        <div class="logout-actions">
                            <button class="logout-btn logout-btn-cancel" :disabled="loading" @click="onCancel">
                                <i class="fa-solid fa-arrow-left"></i> ยกเลิก
                            </button>
                            <button class="logout-btn logout-btn-confirm" :disabled="loading" @click="onConfirm">
                                <i v-if="loading" class="fa-solid fa-spinner fa-spin"></i>
                                <i v-else class="fa-solid fa-right-from-bracket"></i>
                                {{ loading ? 'กำลังออกจากระบบ...' : 'ออกจากระบบ' }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.logout-overlay {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 20px;
}

.logout-dialog {
    position: relative;
    background: #ffffff;
    width: 100%;
    max-width: 420px;
    border-radius: 24px;
    padding: 32px 28px 24px;
    box-shadow: 0 25px 60px rgba(15, 23, 42, 0.25), 0 8px 20px rgba(15, 23, 42, 0.1);
    text-align: center;
    overflow: hidden;
}

.logout-dialog::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 90px;
    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
    z-index: 0;
}

.logout-user::before    { background: linear-gradient(135deg, #6366f1 0%, #818cf8 100%); }
.logout-pharmacist::before { background: linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%); }
.logout-store::before    { background: linear-gradient(135deg, #00469c 0%, #0066d6 100%); }
.logout-admin::before    { background: linear-gradient(135deg, #ea580c 0%, #f59e0b 100%); }

.logout-close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
    border-radius: 50%;
    cursor: pointer;
    font-size: 14px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}
.logout-close:hover:not(:disabled) { background: rgba(255, 255, 255, 0.4); }
.logout-close:disabled { opacity: 0.5; cursor: not-allowed; }

.logout-icon-wrap {
    position: relative;
    z-index: 1;
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
}

.logout-icon-ring {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: #fff;
    border: 4px solid #fff;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    color: #6366f1;
}
.logout-user .logout-icon-ring    { color: #6366f1; }
.logout-pharmacist .logout-icon-ring { color: #0ea5e9; }
.logout-store .logout-icon-ring    { color: #00469c; }
.logout-admin .logout-icon-ring    { color: #ea580c; }

.logout-body {
    position: relative;
    z-index: 1;
    margin-bottom: 24px;
}

.logout-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
    letter-spacing: 0.3px;
}

.logout-title {
    margin: 0 0 8px;
    font-size: 1.35rem;
    color: #0f172a;
    font-weight: 700;
}

.logout-desc {
    margin: 0;
    color: #64748b;
    font-size: 0.92rem;
    line-height: 1.6;
}

.logout-actions {
    display: flex;
    gap: 10px;
    position: relative;
    z-index: 1;
}

.logout-btn {
    flex: 1;
    padding: 12px 16px;
    border: none;
    border-radius: 12px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}

.logout-btn-cancel {
    background: #f1f5f9;
    color: #334155;
}
.logout-btn-cancel:hover:not(:disabled) {
    background: #e2e8f0;
    transform: translateY(-1px);
}

.logout-btn-confirm {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
    box-shadow: 0 6px 14px rgba(220, 38, 38, 0.35);
}
.logout-btn-confirm:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(220, 38, 38, 0.45);
}

.logout-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
}

.logout-fade-enter-active,
.logout-fade-leave-active {
    transition: opacity 0.2s ease;
}
.logout-fade-enter-from,
.logout-fade-leave-to {
    opacity: 0;
}

.logout-pop-enter-active {
    transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s;
}
.logout-pop-leave-active {
    transition: transform 0.18s ease, opacity 0.18s ease;
}
.logout-pop-enter-from {
    transform: scale(0.85) translateY(20px);
    opacity: 0;
}
.logout-pop-leave-to {
    transform: scale(0.95);
    opacity: 0;
}

@media (max-width: 480px) {
    .logout-dialog {
        padding: 28px 20px 20px;
        border-radius: 20px;
    }
    .logout-title { font-size: 1.2rem; }
    .logout-actions { flex-direction: column-reverse; }
    .logout-btn { width: 100%; }
}
</style>
