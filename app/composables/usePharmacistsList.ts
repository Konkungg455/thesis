type PharmacistRow = {
    id: number;
    name: string;
    time: string;
    image: string;
    store_id: number | null;
    store_name: string;
    store_address: string;
    store_lat: number | null;
    store_lng: number | null;
    distance_km: number | null;
};

type PharmacistsResponse = {
    status: string;
    data: PharmacistRow[];
    total?: number;
    message?: string;
};

/** รายชื่อเภสัช — หน้าแรกใช้ /api/home/summary (request เดียวกับรีวิว) */
export function usePharmacistsList() {
    const route = useRoute();
    const isHome = computed(() => route.path === '/');
    const gpsList = useState<PharmacistRow[] | null>('pharmacists-gps-list', () => null);

    const home = useHomeSummaryData();

    const standalone = useAsyncData<PharmacistsResponse>(
        'pharmacists-list',
        () => $fetch('/api/bff/get_pharmacists.php', { timeout: 25_000 }),
        {
            default: () => ({ status: 'success', data: [] }),
            immediate: route.path !== '/',
        },
    );

    const pharmaPayload = computed(() => (
        isHome.value ? home.data.value?.pharmacists : standalone.data.value
    ));

    const pending = computed(() => (
        isHome.value ? home.pending.value : standalone.pending.value
    ));

    const refresh = async () => {
        if (isHome.value) {
            await home.refresh();
        } else {
            await standalone.refresh();
        }
    };

    const pharmacists = computed(() => gpsList.value ?? pharmaPayload.value?.data ?? []);
    const total = computed(() => pharmaPayload.value?.total ?? pharmaPayload.value?.data?.length ?? 0);
    const loadError = computed(() => {
        if (pharmaPayload.value?.status === 'error') {
            return pharmaPayload.value.message || 'โหลดข้อมูลเภสัชไม่สำเร็จ';
        }
        return '';
    });
    const isLoading = computed(() => pending.value && pharmacists.value.length === 0 && !loadError.value);
    const isRefreshing = computed(() => pending.value && pharmacists.value.length > 0);

    const refreshWithGps = async (lat: number, lng: number) => {
        try {
            const res = await $fetch<PharmacistsResponse>(
                `/api/bff/get_pharmacists.php?lat=${lat}&lng=${lng}&nocache=1`,
                { timeout: 10_000 },
            );
            if (res?.status === 'success' && Array.isArray(res.data)) {
                gpsList.value = res.data;
            }
        } catch {
            /* ใช้รายการเดิมถ้า GPS refresh ล้มเหลว */
        }
    };

    return {
        pharmacists,
        total,
        loadError,
        isLoading,
        isRefreshing,
        pending,
        status: computed(() => (isHome.value ? home.status.value : standalone.status.value)),
        refresh,
        refreshWithGps,
    };
}
