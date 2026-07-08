<script setup>
const props = defineProps({
    show: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    tone: { type: String, default: 'danger' },
    title: { type: String, default: '' },
    message: { type: String, default: '' },
    detail: { type: String, default: '' },
    confirmText: { type: String, default: 'ยืนยัน' },
    cancelText: { type: String, default: 'ยกเลิก' },
    confirmOnly: { type: Boolean, default: false },
});

const emit = defineEmits(['confirm', 'cancel']);

const toneMeta = computed(() => {
    const map = {
        danger: { icon: 'fa-trash-can', className: 'tone-danger' },
        restore: { icon: 'fa-rotate-left', className: 'tone-restore' },
        success: { icon: 'fa-circle-check', className: 'tone-success' },
        error: { icon: 'fa-triangle-exclamation', className: 'tone-error' },
        info: { icon: 'fa-circle-info', className: 'tone-info' },
    };
    return map[props.tone] || map.info;
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
        <Transition name="action-fade">
            <div v-if="show" class="action-overlay" @click.self="onCancel">
                <Transition name="action-pop" appear>
                    <div v-if="show" class="action-dialog" :class="toneMeta.className" role="dialog" aria-modal="true">
                        <button class="action-close" :disabled="loading" @click="onCancel" aria-label="ปิด">
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                        <div class="action-hero">
                            <div class="action-icon">
                                <i class="fa-solid" :class="loading ? 'fa-spinner fa-spin' : toneMeta.icon"></i>
                            </div>
                        </div>

                        <div class="action-body">
                            <h3>{{ title }}</h3>
                            <p>{{ message }}</p>
                            <div v-if="detail" class="action-detail">{{ detail }}</div>
                        </div>

                        <div class="action-actions" :class="{ single: confirmOnly }">
                            <button v-if="!confirmOnly" class="action-btn action-btn-cancel" :disabled="loading" @click="onCancel">
                                {{ cancelText }}
                            </button>
                            <button class="action-btn action-btn-confirm" :disabled="loading" @click="onConfirm">
                                <i v-if="loading" class="fa-solid fa-spinner fa-spin"></i>
                                <span>{{ loading ? 'กำลังทำรายการ...' : confirmText }}</span>
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.action-overlay {
    position: fixed;
    inset: 0;
    z-index: 10050;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.58);
    backdrop-filter: blur(7px);
    -webkit-backdrop-filter: blur(7px);
}

.action-dialog {
    position: relative;
    width: 100%;
    max-width: 430px;
    overflow: hidden;
    border-radius: 26px;
    background: #ffffff;
    box-shadow: 0 30px 80px rgba(15, 23, 42, 0.28), 0 10px 24px rgba(15, 23, 42, 0.12);
    text-align: center;
}

.action-hero {
    height: 106px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #ef4444, #dc2626);
}
.tone-restore .action-hero { background: linear-gradient(135deg, #10b981, #059669); }
.tone-success .action-hero { background: linear-gradient(135deg, #22c55e, #16a34a); }
.tone-error .action-hero { background: linear-gradient(135deg, #f97316, #dc2626); }
.tone-info .action-hero { background: linear-gradient(135deg, #3b82f6, #4f46e5); }

.action-close {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 2;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.24);
    color: #fff;
    cursor: pointer;
}

.action-icon {
    width: 78px;
    height: 78px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 5px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    background: #fff;
    color: #dc2626;
    font-size: 2rem;
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.22);
}
.tone-restore .action-icon { color: #059669; }
.tone-success .action-icon { color: #16a34a; }
.tone-error .action-icon { color: #dc2626; }
.tone-info .action-icon { color: #2563eb; }

.action-body {
    padding: 24px 26px 18px;
    background: #ffffff;
}
.action-body h3 {
    margin: 0 0 8px;
    color: #0f172a;
    font-size: 1.3rem;
    font-weight: 900;
}
.action-body p {
    margin: 0;
    color: #475569;
    line-height: 1.65;
    font-weight: 600;
}
.action-detail {
    margin-top: 14px;
    padding: 10px 12px;
    border-radius: 14px;
    background: #f8fafc;
    color: #1e293b;
    font-weight: 800;
    word-break: break-word;
}

.action-actions {
    display: flex;
    gap: 10px;
    padding: 0 22px 22px;
    background: #ffffff;
}
.action-actions.single {
    justify-content: center;
}
.action-btn {
    flex: 1;
    min-height: 46px;
    border: 0;
    border-radius: 14px;
    font-weight: 900;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: transform 0.15s ease, filter 0.15s ease;
}
.action-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    filter: brightness(1.03);
}
.action-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}
.action-btn-cancel {
    background: #e2e8f0;
    color: #334155;
}
.action-btn-confirm {
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: #fff;
}
.tone-restore .action-btn-confirm,
.tone-success .action-btn-confirm {
    background: linear-gradient(135deg, #10b981, #059669);
}
.tone-info .action-btn-confirm {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
}

.action-fade-enter-active,
.action-fade-leave-active { transition: opacity 0.2s ease; }
.action-fade-enter-from,
.action-fade-leave-to { opacity: 0; }
.action-pop-enter-active { transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s; }
.action-pop-leave-active { transition: transform 0.18s ease, opacity 0.18s ease; }
.action-pop-enter-from { transform: scale(0.86) translateY(22px); opacity: 0; }
.action-pop-leave-to { transform: scale(0.96); opacity: 0; }

:global(html.dark) .action-overlay {
    background: rgba(2, 6, 23, 0.78);
}
:global(html.dark) .action-dialog {
    background: #0f172a;
    border: 1px solid rgba(147, 197, 253, 0.32);
}
:global(html.dark) .action-body {
    background: #0f172a;
}
:global(html.dark) .action-actions {
    background: #0f172a;
}
:global(html.dark) .action-body h3 {
    color: #ffffff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
:global(html.dark) .action-body p {
    color: #f8fafc;
    opacity: 1;
    font-weight: 800;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
}
:global(html.dark) .action-detail {
    background: #f8fafc;
    border: 1px solid rgba(226, 232, 240, 0.95);
    color: #0f172a;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.25);
}
:global(html.dark) .action-btn-cancel {
    background: #e2e8f0;
    color: #0f172a;
}
:global(html.dark) .action-btn-confirm {
    color: #ffffff;
    box-shadow: 0 10px 24px rgba(239, 68, 68, 0.28);
}
:global(html.dark) .tone-restore .action-btn-confirm,
:global(html.dark) .tone-success .action-btn-confirm {
    box-shadow: 0 10px 24px rgba(16, 185, 129, 0.28);
}

@media (max-width: 480px) {
    .action-dialog { border-radius: 22px; }
    .action-actions { flex-direction: column-reverse; }
}
</style>
