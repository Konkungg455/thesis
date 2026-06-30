<template>
    <Teleport to="body">
        <transition name="vc-pop">
            <div
                v-if="visible"
                class="vc-shell"
                role="dialog"
                aria-label="วิดีโอคอล"
                @click.self="$emit('retry')"
            >
                <div class="vc-bg" aria-hidden="true">
                    <span class="vc-bg-orb vc-bg-orb--a"></span>
                    <span class="vc-bg-orb vc-bg-orb--b"></span>
                </div>

                <!-- Top bar -->
                <header class="vc-topbar">
                    <div class="vc-topbar__left">
                        <span class="vc-live-dot"></span>
                        <span class="vc-live-label">วิดีโอคอล</span>
                    </div>
                    <div class="vc-topbar__center">
                        <img :src="peerAvatar" class="vc-topbar__avatar" alt="" />
                        <div>
                            <div class="vc-topbar__name">{{ peerName }}</div>
                            <div class="vc-topbar__timer">
                                <i class="fa-solid fa-clock"></i> {{ timerText }}
                            </div>
                        </div>
                    </div>
                    <button type="button" class="vc-topbar__close" @click="$emit('end')" title="วางสาย">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </header>

                <!-- Main stage -->
                <div class="vc-stage-wrap">
                    <div class="vc-stage" @click="$emit('retry')">
                        <video
                            :ref="bindRef(remoteVideo)"
                            autoplay
                            playsinline
                            muted
                            class="vc-remote"
                        ></video>
                        <video
                            :ref="bindRef(remoteAudioSink)"
                            autoplay
                            playsinline
                            class="vc-audio-sink"
                        ></video>

                        <!-- Waiting for remote -->
                        <div v-if="!hasRemoteVideo" class="vc-waiting">
                            <div class="vc-waiting__ring"></div>
                            <img :src="peerAvatar" class="vc-waiting__avatar" alt="" />
                            <p class="vc-waiting__title">กำลังเชื่อมต่อภาพจากอีกฝ่าย</p>
                            <p class="vc-waiting__hint">คลิกที่จอเพื่อลองเชื่อมต่อใหม่</p>
                            <div class="vc-waiting__dots">
                                <span></span><span></span><span></span>
                            </div>
                        </div>

                        <!-- Local PIP -->
                        <div class="vc-pip">
                            <span class="vc-pip__label">คุณ</span>
                            <video
                                :ref="bindRef(localVideo)"
                                autoplay
                                playsinline
                                muted
                                class="vc-pip__video"
                            ></video>
                        </div>
                    </div>
                </div>

                <!-- Control dock -->
                <footer class="vc-dock">
                    <button
                        type="button"
                        class="vc-dock__btn"
                        :class="{ 'is-off': !isCamOn }"
                        @click.stop="$emit('toggle-cam')"
                        title="กล้อง"
                    >
                        <i :class="isCamOn ? 'fa-solid fa-video' : 'fa-solid fa-video-slash'"></i>
                        <span>{{ isCamOn ? 'กล้องเปิด' : 'กล้องปิด' }}</span>
                    </button>
                    <button type="button" class="vc-dock__hangup" @click.stop="$emit('end')" title="วางสาย">
                        <i class="fa-solid fa-phone-slash"></i>
                    </button>
                    <button
                        type="button"
                        class="vc-dock__btn"
                        :class="{ 'is-off': !isMicOn }"
                        @click.stop="$emit('toggle-mic')"
                        title="ไมโครโฟน"
                    >
                        <i :class="isMicOn ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash'"></i>
                        <span>{{ isMicOn ? 'ไมค์เปิด' : 'ไมค์ปิด' }}</span>
                    </button>
                </footer>
            </div>
        </transition>
    </Teleport>
</template>

<script setup>
defineProps({
    visible: { type: Boolean, default: false },
    peerName: { type: String, default: 'ผู้ติดต่อ' },
    peerAvatar: { type: String, default: '' },
    timerText: { type: String, default: '00:00' },
    hasRemoteVideo: { type: Boolean, default: false },
    isCamOn: { type: Boolean, default: true },
    isMicOn: { type: Boolean, default: true },
    localVideo: { type: Object, default: null },
    remoteVideo: { type: Object, default: null },
    remoteAudioSink: { type: Object, default: null },
});

defineEmits(['end', 'toggle-cam', 'toggle-mic', 'retry']);

/** bind composable ref → <video> element */
const bindRef = (r) => (el) => {
    if (r && typeof r === 'object' && 'value' in r) r.value = el;
};
</script>

<style scoped>
@import "@/assets/video-call.css";
</style>
