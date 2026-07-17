<script setup>
const props = defineProps({
    workTime: { type: String, default: '' },
    emptyText: { type: String, default: 'ไม่ได้ระบุตารางเวลา' },
});

const { formatScheduleList, formatTime } = usePharmacistStatus();

const rows = computed(() => formatScheduleList(props.workTime));
</script>

<template>
    <div class="work-schedule-display">
        <template v-if="rows.length">
            <div
                v-for="(row, index) in rows"
                :key="`${row.day}-${row.start}-${index}`"
                class="work-schedule-row"
            >
                <span class="work-schedule-day">
                    <i class="fa-regular fa-calendar-days" aria-hidden="true"></i>
                    {{ row.dayTH }}
                </span>
                <span class="work-schedule-time">
                    {{ formatTime(row.start) }} – {{ formatTime(row.end) }} น.
                </span>
            </div>
        </template>
        <div v-else class="work-schedule-empty">
            <i class="fa-regular fa-clock" aria-hidden="true"></i>
            {{ emptyText }}
        </div>
    </div>
</template>

<style scoped>
.work-schedule-display {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
}

.work-schedule-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    box-sizing: border-box;
}

.work-schedule-day {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    color: #334155;
    font-size: 0.95rem;
    white-space: nowrap;
}

.work-schedule-day i {
    color: #6366f1;
    font-size: 0.9rem;
}

.work-schedule-time {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: #0f766e;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 999px;
    padding: 4px 12px;
    font-size: 0.88rem;
    white-space: nowrap;
}

.work-schedule-empty {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    border: 1px dashed #cbd5e1;
    border-radius: 10px;
    background: #f8fafc;
    color: #94a3b8;
    font-size: 0.95rem;
}

html.dark .work-schedule-row {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border-color: #334155;
}

html.dark .work-schedule-day {
    color: #e2e8f0;
}

html.dark .work-schedule-time {
    color: #6ee7b7;
    background: #064e3b;
    border-color: #047857;
}

html.dark .work-schedule-empty {
    background: #1e293b;
    border-color: #475569;
    color: #94a3b8;
}
</style>
