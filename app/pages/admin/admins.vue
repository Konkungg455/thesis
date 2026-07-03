<script setup>
/**
 * /admin/admins — จัดการแอดมิน (เฉพาะ Super Admin)
 *  - ดู pending / approved / rejected / ทั้งหมด
 *  - อนุมัติ / ปฏิเสธ / เพิกถอน / ตั้งเป็น Super / ปลด Super
 */
import { ref, computed, onMounted } from 'vue'

useHead({ title: 'จัดการแอดมิน - Super Admin' })
definePageMeta({ middleware: 'super-admin-only' })

const { apiUrl, apiBase } = useApiBase()
const { user, syncFromServer } = useAuthUser()

const items = ref([])
const summary = ref({ all: 0, pending: 0, approved: 0, rejected: 0 })
const filter = ref('pending')
const isLoading = ref(false)
const errorMsg = ref('')

const meId = computed(() => Number(user.value?.id_account_admin || user.value?.id_account || 0))

const filteredItems = computed(() => {
    if (filter.value === 'all') return items.value
    return items.value.filter(i => i.admin_status === filter.value)
})

const loadList = async (status = 'all') => {
    isLoading.value = true
    errorMsg.value = ''
    try {
        const data = await $fetch(apiUrl(`admin-list-admins.php?status=${status}&t=${Date.now()}`), {
            credentials: 'include'
        })
        if (data?.status === 'success') {
            items.value = data.items || []
            summary.value = data.summary || summary.value
        } else {
            errorMsg.value = data?.message || 'โหลดข้อมูลไม่สำเร็จ'
        }
    } catch (e) {
        console.error('loadList', e)
        errorMsg.value = e?.data?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    } finally {
        isLoading.value = false
    }
}

// ===== Action modal =====
const showActionModal = ref(false)
const actionTarget = ref(null)
const actionType = ref('') // approve | reject | revoke | promote | demote
const actionNote = ref('')
const isProcessing = ref(false)

const openAction = (it, type) => {
    actionTarget.value = it
    actionType.value = type
    actionNote.value = ''
    showActionModal.value = true
}
const closeAction = () => {
    if (isProcessing.value) return
    showActionModal.value = false
    actionTarget.value = null
}

const actionLabelMap = {
    approve: { title: 'อนุมัติแอดมิน', verb: 'อนุมัติ', danger: false, icon: 'fa-circle-check', color: '#10b981' },
    reject:  { title: 'ปฏิเสธคำขอ',     verb: 'ปฏิเสธ', danger: true,  icon: 'fa-circle-xmark', color: '#ef4444' },
    revoke:  { title: 'เพิกถอนสิทธิ์',   verb: 'เพิกถอน', danger: true,  icon: 'fa-ban',         color: '#ef4444' },
    promote: { title: 'ตั้งเป็น Super Admin', verb: 'เลื่อนตำแหน่ง', danger: false, icon: 'fa-crown', color: '#f59e0b' },
    demote:  { title: 'ปลดจาก Super Admin',   verb: 'ปลดตำแหน่ง',   danger: true,  icon: 'fa-arrow-down', color: '#64748b' },
}
const currentActionMeta = computed(() => actionLabelMap[actionType.value] || {})

const confirmAction = async () => {
    if (!actionTarget.value || !actionType.value) return
    isProcessing.value = true
    try {
        const data = await $fetch(apiUrl('admin-review-admin.php'), {
            method: 'POST',
            body: {
                id: actionTarget.value.id,
                action: actionType.value,
                note: actionNote.value
            },
            credentials: 'include'
        })
        if (data?.status === 'success') {
            showActionModal.value = false
            actionTarget.value = null
            await loadList('all')
        } else {
            errorMsg.value = data?.message || 'ทำรายการไม่สำเร็จ'
        }
    } catch (e) {
        errorMsg.value = e?.data?.message || 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้'
    } finally {
        isProcessing.value = false
    }
}

const formatDate = (iso) => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
const MEDIA_AVATAR_VER = '20260703a'
const imgUrl = (file) => `${apiBase.value}/images_account/${file || 'default.png'}?v=${MEDIA_AVATAR_VER}`

const statusLabel = {
    pending: 'รออนุมัติ',
    approved: 'อนุมัติแล้ว',
    rejected: 'ถูกปฏิเสธ'
}
const statusIcon = {
    pending: 'fa-clock',
    approved: 'fa-circle-check',
    rejected: 'fa-circle-xmark'
}

onMounted(async () => {
    await syncFromServer()
    await loadList('all')
})
</script>

<template>
    <AdminLayout active-tab="admins">
        <div class="admins-wrap">
            <!-- ===== Hero ===== -->
            <div class="hero">
                <div class="hero-icon"><i class="fa-solid fa-user-shield"></i></div>
                <div class="hero-text">
                    <h2>จัดการผู้ดูแลระบบ</h2>
                    <p>
                        เฉพาะ <strong>Super Admin</strong> เท่านั้นที่สามารถอนุมัติ / ปฏิเสธ / เพิกถอน / ตั้งตำแหน่งแอดมินคนอื่น
                    </p>
                </div>
                <button class="btn-refresh" @click="loadList('all')" :disabled="isLoading">
                    <i class="fa-solid fa-rotate" :class="{ spin: isLoading }"></i> โหลดใหม่
                </button>
            </div>

            <!-- ===== Tabs ===== -->
            <div class="tabs">
                <button :class="{ active: filter === 'pending' }" @click="filter = 'pending'">
                    <i class="fa-solid fa-clock"></i> รออนุมัติ
                    <span class="badge badge-pending">{{ summary.pending }}</span>
                </button>
                <button :class="{ active: filter === 'approved' }" @click="filter = 'approved'">
                    <i class="fa-solid fa-circle-check"></i> อนุมัติแล้ว
                    <span class="badge badge-approved">{{ summary.approved }}</span>
                </button>
                <button :class="{ active: filter === 'rejected' }" @click="filter = 'rejected'">
                    <i class="fa-solid fa-circle-xmark"></i> ถูกปฏิเสธ
                    <span class="badge badge-rejected">{{ summary.rejected }}</span>
                </button>
                <button :class="{ active: filter === 'all' }" @click="filter = 'all'">
                    <i class="fa-solid fa-list"></i> ทั้งหมด
                    <span class="badge">{{ summary.all }}</span>
                </button>
            </div>

            <div v-if="errorMsg" class="error-banner">
                <i class="fa-solid fa-triangle-exclamation"></i> {{ errorMsg }}
            </div>

            <!-- ===== List ===== -->
            <div v-if="isLoading && !items.length" class="loading-state">
                <div class="spinner"></div>
                <p>กำลังโหลด...</p>
            </div>

            <div v-else-if="!filteredItems.length" class="empty-state">
                <div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div>
                <h4>ไม่มีรายการในกลุ่มนี้</h4>
            </div>

            <div v-else class="admin-grid">
                <div v-for="it in filteredItems" :key="it.id" class="admin-card" :class="`st-${it.admin_status}`">
                    <div class="ac-head">
                        <img :src="imgUrl(it.image)" class="avatar" alt="avatar"
                             @error="$event.target.src='https://ui-avatars.com/api/?name=' + encodeURIComponent(it.fullname || it.username) + '&background=00469c&color=fff'" />
                        <div class="ac-head-text">
                            <div class="ac-name">
                                {{ it.fullname || it.username }}
                                <span v-if="it.is_super_admin" class="super-badge" title="Super Admin">
                                    <i class="fa-solid fa-crown"></i> SUPER
                                </span>
                                <span v-if="it.is_me" class="me-badge">คุณ</span>
                            </div>
                            <div class="ac-username">@{{ it.username }}</div>
                        </div>
                        <span class="status-pill" :class="`st-${it.admin_status}`">
                            <i class="fa-solid" :class="statusIcon[it.admin_status]"></i>
                            {{ statusLabel[it.admin_status] }}
                        </span>
                    </div>

                    <div class="ac-body">
                        <div class="ac-row"><i class="fa-regular fa-envelope"></i> {{ it.email }}</div>
                        <div class="ac-row"><i class="fa-solid fa-phone"></i> {{ it.phone || '-' }}</div>
                        <div class="ac-row"><i class="fa-regular fa-calendar"></i> สมัคร: {{ formatDate(it.created_at) }}</div>
                        <div v-if="it.reviewed_at" class="ac-row ac-sub">
                            <i class="fa-solid fa-clipboard-check"></i>
                            ตรวจสอบเมื่อ: {{ formatDate(it.reviewed_at) }}
                            <span v-if="it.reviewed_by_name">โดย @{{ it.reviewed_by_name }}</span>
                        </div>
                        <div v-if="it.review_note" class="ac-note">
                            <i class="fa-solid fa-comment"></i> {{ it.review_note }}
                        </div>
                    </div>

                    <div v-if="!it.is_me" class="ac-actions">
                        <template v-if="it.admin_status === 'pending'">
                            <button class="btn btn-approve" @click="openAction(it, 'approve')">
                                <i class="fa-solid fa-circle-check"></i> อนุมัติ
                            </button>
                            <button class="btn btn-reject" @click="openAction(it, 'reject')">
                                <i class="fa-solid fa-circle-xmark"></i> ปฏิเสธ
                            </button>
                        </template>
                        <template v-else-if="it.admin_status === 'approved'">
                            <button v-if="!it.is_super_admin" class="btn btn-promote" @click="openAction(it, 'promote')">
                                <i class="fa-solid fa-crown"></i> ตั้ง Super
                            </button>
                            <button v-else class="btn btn-demote" @click="openAction(it, 'demote')">
                                <i class="fa-solid fa-arrow-down"></i> ปลด Super
                            </button>
                            <button v-if="!it.is_super_admin" class="btn btn-revoke" @click="openAction(it, 'revoke')">
                                <i class="fa-solid fa-ban"></i> เพิกถอน
                            </button>
                        </template>
                        <template v-else-if="it.admin_status === 'rejected'">
                            <button class="btn btn-approve" @click="openAction(it, 'approve')">
                                <i class="fa-solid fa-rotate-left"></i> อนุมัติใหม่
                            </button>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <template #overlays>
            <!-- ===== Action confirm modal ===== -->
            <transition name="fade">
                <div v-if="showActionModal" class="modal-overlay" @click.self="closeAction">
                    <div class="modal-card">
                        <div class="modal-head" :style="{ background: currentActionMeta.color }">
                            <i class="fa-solid" :class="currentActionMeta.icon"></i>
                            <h3>{{ currentActionMeta.title }}</h3>
                        </div>
                        <div class="modal-body">
                            <p>
                                คุณกำลังจะ <strong>{{ currentActionMeta.verb }}</strong>
                                บัญชี <strong>@{{ actionTarget?.username }}</strong>
                                ({{ actionTarget?.fullname }})
                            </p>
                            <label class="note-label">หมายเหตุ (ไม่บังคับ)</label>
                            <textarea
                                v-model="actionNote"
                                rows="3"
                                :placeholder="actionType === 'reject' || actionType === 'revoke' ? 'ระบุเหตุผล...' : 'หมายเหตุเพิ่มเติม...'"
                            ></textarea>
                        </div>
                        <div class="modal-foot">
                            <button class="btn btn-cancel" @click="closeAction" :disabled="isProcessing">ยกเลิก</button>
                            <button
                                class="btn btn-confirm"
                                :class="{ danger: currentActionMeta.danger }"
                                @click="confirmAction"
                                :disabled="isProcessing"
                            >
                                <i class="fa-solid" :class="isProcessing ? 'fa-spinner fa-spin' : currentActionMeta.icon"></i>
                                {{ isProcessing ? 'กำลังทำรายการ...' : `ยืนยัน${currentActionMeta.verb}` }}
                            </button>
                        </div>
                    </div>
                </div>
            </transition>
        </template>
    </AdminLayout>
</template>

<style scoped>
/* light mode — พื้นหลังเนื้อหาเป็นสีขาว */
:global(html:not(.dark) .admin-layout) {
    background: #ffffff;
}
:global(html:not(.dark) .admin-layout .view-container) {
    background: #ffffff;
}
:global(html:not(.dark) .admin-layout .main-content) {
    background: #ffffff;
}

.admins-wrap { padding: 24px 24px 60px; max-width: 1400px; margin: 0 auto; width: 100%; }

/* hero */
.hero {
    display: flex; align-items: center; gap: 18px;
    padding: 22px 24px;
    background: linear-gradient(135deg, #1e3a8a, #6366f1 60%, #a855f7);
    border-radius: 20px; color: #fff;
    margin-bottom: 24px;
    box-shadow: 0 12px 30px rgba(99,102,241,0.25);
}
.hero-icon {
    width: 64px; height: 64px; border-radius: 16px;
    background: rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 1.8rem; flex-shrink: 0;
}
.hero-text { flex: 1; }
.hero-text h2 { margin: 0 0 4px; font-size: 1.55rem; font-weight: 800; }
.hero-text p { margin: 0; font-size: 0.92rem; opacity: 0.95; }
.btn-refresh {
    background: rgba(255,255,255,0.2); color: #fff;
    border: 1px solid rgba(255,255,255,0.3);
    padding: 10px 18px; border-radius: 12px;
    font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
}
.btn-refresh:hover:not(:disabled) { background: rgba(255,255,255,0.3); }

/* tabs */
.tabs {
    display: inline-flex;
    background: #fff; border-radius: 14px;
    padding: 6px; gap: 4px; flex-wrap: wrap;
    border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(15,23,42,0.04);
    margin-bottom: 18px;
}
.tabs button {
    background: transparent; border: none;
    padding: 9px 16px; border-radius: 10px;
    font-weight: 600; color: #64748b; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 0.9rem;
}
.tabs button:hover { background: #f1f5f9; color: #334155; }
.tabs button.active {
    background: linear-gradient(135deg, #6366f1, #1e3a8a); color: #fff;
    box-shadow: 0 4px 10px rgba(99,102,241,0.3);
}
.badge {
    display: inline-block; background: #e2e8f0; color: #475569;
    padding: 2px 8px; border-radius: 999px;
    font-size: 0.72rem; font-weight: 700; min-width: 22px; text-align: center;
}
.tabs button.active .badge { background: rgba(255,255,255,0.25); color: #fff; }
.badge-pending { background: #fef3c7; color: #92400e; }
.badge-approved { background: #d1fae5; color: #065f46; }
.badge-rejected { background: #fee2e2; color: #991b1b; }

/* error / states */
.error-banner {
    background: #fef2f2; color: #991b1b;
    padding: 12px 16px; border-radius: 12px;
    border: 1px solid #fecaca; margin-bottom: 18px;
    display: flex; align-items: center; gap: 10px; font-weight: 600;
}
.loading-state, .empty-state {
    padding: 60px 20px; text-align: center; color: #64748b;
    background: #fff; border-radius: 16px; border: 1px solid #e2e8f0;
}
.spinner {
    width: 44px; height: 44px; border: 4px solid #e2e8f0;
    border-top-color: #6366f1; border-radius: 50%;
    animation: spin 0.9s linear infinite; margin: 0 auto 14px;
}
.empty-icon { font-size: 3rem; color: #cbd5e1; margin-bottom: 12px; }
.empty-state h4 { margin: 0; color: #334155; }

/* admin cards */
.admin-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 18px;
}
.admin-card {
    background: #fff; border-radius: 16px;
    border: 1px solid #e2e8f0; padding: 18px;
    box-shadow: 0 4px 14px rgba(15,23,42,0.06);
    position: relative; overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
}
.admin-card:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(15,23,42,0.1); }
.admin-card::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
}
.admin-card.st-pending::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
.admin-card.st-approved::before { background: linear-gradient(180deg, #10b981, #059669); }
.admin-card.st-rejected::before { background: linear-gradient(180deg, #ef4444, #b91c1c); }

.ac-head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.avatar {
    width: 52px; height: 52px; border-radius: 50%;
    object-fit: cover; border: 2px solid #e2e8f0;
}
.ac-head-text { flex: 1; min-width: 0; }
.ac-name {
    font-weight: 700; color: #0f172a; font-size: 1rem;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.super-badge {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #fff; font-size: 0.68rem; font-weight: 800;
    padding: 2px 8px; border-radius: 999px;
    display: inline-flex; align-items: center; gap: 4px;
    box-shadow: 0 2px 6px rgba(245,158,11,0.35);
}
.me-badge {
    background: #dbeafe; color: #1e40af;
    font-size: 0.7rem; font-weight: 700;
    padding: 2px 8px; border-radius: 999px;
}
.ac-username { color: #64748b; font-size: 0.82rem; }

.status-pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; border-radius: 999px;
    font-size: 0.74rem; font-weight: 700; white-space: nowrap;
}
.status-pill.st-pending { background: #fef3c7; color: #92400e; }
.status-pill.st-approved { background: #d1fae5; color: #065f46; }
.status-pill.st-rejected { background: #fee2e2; color: #991b1b; }

.ac-body {
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px 0; border-top: 1px dashed #e2e8f0;
    color: #475569; font-size: 0.88rem;
}
.ac-row { display: flex; align-items: center; gap: 8px; }
.ac-row i { color: #94a3b8; width: 16px; }
.ac-sub { color: #94a3b8; font-size: 0.82rem; }
.ac-note {
    background: #f8fafc; border-radius: 8px;
    padding: 8px 10px; color: #475569;
    font-size: 0.83rem; font-style: italic;
    display: flex; gap: 6px; margin-top: 4px;
}

.ac-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    padding-top: 12px; border-top: 1px dashed #e2e8f0; margin-top: 10px;
}
.btn {
    flex: 1; min-width: 110px;
    padding: 9px 12px; border: none; border-radius: 10px;
    font-weight: 700; font-size: 0.85rem;
    cursor: pointer; transition: 0.2s;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
}
.btn:hover:not(:disabled) { transform: translateY(-1px); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-approve { background: linear-gradient(135deg, #10b981, #059669); color: #fff; }
.btn-reject { background: linear-gradient(135deg, #ef4444, #b91c1c); color: #fff; }
.btn-promote { background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
.btn-demote { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
.btn-revoke { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

/* modal */
.modal-overlay {
    position: fixed; inset: 0;
    background: rgba(15,23,42,0.55);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999; padding: 20px;
    backdrop-filter: blur(3px);
}
.modal-card {
    background: #fff; border-radius: 18px;
    width: 100%; max-width: 480px;
    overflow: hidden;
    box-shadow: 0 30px 80px rgba(0,0,0,0.3);
}
.modal-head {
    padding: 20px 22px; color: #fff;
    display: flex; align-items: center; gap: 12px;
}
.modal-head i { font-size: 1.6rem; }
.modal-head h3 { margin: 0; font-size: 1.15rem; font-weight: 800; }
.modal-body { padding: 20px 22px; }
.modal-body p { margin: 0 0 14px; color: #334155; line-height: 1.6; }
.note-label { font-size: 0.85rem; color: #475569; font-weight: 600; margin-bottom: 6px; display: block; }
.modal-body textarea {
    width: 100%; padding: 11px 14px;
    border: 1.5px solid #e2e8f0; border-radius: 10px;
    font-family: inherit; font-size: 0.92rem;
    background: #f8fafc; resize: vertical;
}
.modal-body textarea:focus {
    outline: none; border-color: #6366f1;
    box-shadow: 0 0 0 4px rgba(99,102,241,0.15);
    background: #fff;
}
.modal-body textarea::placeholder { color: #64748b; opacity: 1; }

:global(html.dark) .modal-overlay { background: rgba(2, 6, 23, 0.78); }
:global(html.dark) .modal-card {
    background: #111827;
    border: 1px solid #334155;
    box-shadow: 0 30px 90px rgba(0,0,0,0.65);
}
:global(html.dark) .modal-body {
    background: #111827;
    color: #e5e7eb;
}
:global(html.dark) .modal-body p { color: #cbd5e1; }
:global(html.dark) .modal-body strong { color: #ffffff; }
:global(html.dark) .note-label { color: #cbd5e1; }
:global(html.dark) .modal-body textarea {
    background: #0f172a;
    border-color: #475569;
    color: #f8fafc;
}
:global(html.dark) .modal-body textarea:focus {
    background: #020617;
    border-color: #818cf8;
    box-shadow: 0 0 0 4px rgba(129,140,248,0.2);
}
:global(html.dark) .modal-body textarea::placeholder {
    color: #cbd5e1;
    opacity: 1;
}
:global(html.dark) .modal-foot {
    background: #111827;
    border-top-color: #334155;
}
.modal-foot {
    padding: 14px 22px 20px;
    display: flex; justify-content: flex-end; gap: 10px;
    border-top: 1px solid #f1f5f9;
}
.btn-cancel {
    background: #f1f5f9; color: #475569; padding: 10px 20px;
    border: none; border-radius: 10px; font-weight: 600; cursor: pointer;
}
.btn-confirm {
    background: linear-gradient(135deg, #10b981, #059669);
    color: #fff; padding: 10px 22px;
    border: none; border-radius: 10px; font-weight: 700; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px;
}
.btn-confirm.danger { background: linear-gradient(135deg, #ef4444, #b91c1c); }
.btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 768px) {
    .admins-wrap { padding: 14px 12px 60px; }
    .hero { flex-direction: column; text-align: center; padding: 18px; }
    .hero-icon { margin: 0 auto; }
    .btn-refresh { width: 100%; justify-content: center; }
    .admin-grid { grid-template-columns: 1fr; gap: 14px; }
    .tabs { overflow-x: auto; flex-wrap: nowrap; }
    .tabs button { white-space: nowrap; }
}
</style>
