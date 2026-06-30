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

/** รายชื่อเภสัช — ใช้ useAsyncData ร่วมกันทุก component (ยิง API ครั้งเดียว + SSR ได้) */
export function usePharmacistsList() {
    const gpsList = useState<PharmacistRow[] | null>('pharmacists-gps-list', () => null);

    const { data, pending, refresh, status, error } = useAsyncData<PharmacistsResponse>(
        'pharmacists-list',
        () => $fetch('/api/bff/get_pharmacists.php', { timeout: 25_000 }),
        { default: () => ({ status: 'success', data: [] }) },
    );

    const pharmacists = computed(() => gpsList.value ?? data.value?.data ?? []);
    const total = computed(() => data.value?.total ?? data.value?.data?.length ?? 0);
    const loadError = computed(() => {
        if (data.value?.status === 'error') return data.value.message || 'โหลดข้อมูลเภสัชไม่สำเร็จ';
        if (error.value) return 'เชื่อมต่อ Supabase ไม่สำเร็จ — ลองรีเฟรช';
        return '';
    });
    const isLoading = computed(() => pending.value && pharmacists.value.length === 0 && !loadError.value);
    const isRefreshing = computed(() => pending.value && pharmacists.value.length > 0);

    const refreshWithGps = async (lat: number, lng: number) => {
        try {
            const res = await $fetch<PharmacistsResponse>(
                `/api/bff/get_pharmacists.php?lat=${lat}&lng=${lng}`,
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
        status,
        refresh,
        refreshWithGps,
    };
}
