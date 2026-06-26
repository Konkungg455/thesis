import { ref, computed, watch } from 'vue';

/**
 * useTablePagination — pagination ใช้ซ้ำสำหรับตารางต่างๆ ในระบบ admin
 * รับ source เป็น Ref/computed ของ array แล้วคืนค่า paged list + control ทั้งหมด
 */
export function useTablePagination(source, options = {}) {
    const PAGE_SIZE_OPTIONS = options.sizes || [10, 20, 50, 100];
    const pageSize = ref(options.defaultSize || 20);
    const currentPage = ref(1);

    const safeList = computed(() => {
        const v = source?.value ?? source;
        return Array.isArray(v) ? v : [];
    });

    const totalItems = computed(() => safeList.value.length);

    const totalPages = computed(() =>
        Math.max(1, Math.ceil(totalItems.value / pageSize.value))
    );

    const pagedList = computed(() => {
        const start = (currentPage.value - 1) * pageSize.value;
        return safeList.value.slice(start, start + pageSize.value);
    });

    const pageStart = computed(() => {
        if (totalItems.value === 0) return 0;
        return (currentPage.value - 1) * pageSize.value + 1;
    });

    const pageEnd = computed(() =>
        Math.min(currentPage.value * pageSize.value, totalItems.value)
    );

    const pageNumbers = computed(() => {
        const total = totalPages.value;
        const cur = currentPage.value;
        if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1);
        }
        const pages = new Set([1, 2, total - 1, total, cur - 1, cur, cur + 1]);
        const sorted = [...pages]
            .filter((p) => p >= 1 && p <= total)
            .sort((a, b) => a - b);
        const result = [];
        for (let i = 0; i < sorted.length; i++) {
            result.push(sorted[i]);
            if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) {
                result.push('...');
            }
        }
        return result;
    });

    const goToPage = (p) => {
        if (typeof p !== 'number') return;
        if (p < 1 || p > totalPages.value) return;
        currentPage.value = p;
    };
    const goPrev = () => goToPage(currentPage.value - 1);
    const goNext = () => goToPage(currentPage.value + 1);

    watch([totalItems, pageSize], () => {
        if (currentPage.value > totalPages.value) {
            currentPage.value = totalPages.value;
        }
    });

    const resetPage = () => {
        currentPage.value = 1;
    };

    return {
        PAGE_SIZE_OPTIONS,
        pageSize,
        currentPage,
        pagedList,
        pageStart,
        pageEnd,
        pageNumbers,
        totalPages,
        totalItems,
        goToPage,
        goPrev,
        goNext,
        resetPage,
    };
}
