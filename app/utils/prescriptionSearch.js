/** รวมข้อความที่ใช้ค้นหาในรายการใบสรุป / ติดตามคนไข้ */
function fieldText(item, key) {
    const v = item?.[key];
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

const SEARCH_TOPIC_FIELDS = {
    patient: ['patient_name', 'patient_full_name', 'patient_address', 'patient_address_short'],
    med: ['med_details'],
    symptom: ['symptom_name'],
    hn: ['hn_no', 'customer_code', 'doc_no', 'id'],
    phone: ['patient_phone'],
    store: ['clinic_name', 'clinic_website', 'store_name', 'work_place', 'doctor_name', 'pharmacist_name', 'firstname_pharma', 'lastname_pharma', 'pharmacist_username'],
};

export const PRESCRIPTION_SEARCH_TOPICS = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'patient', label: 'ผู้ใช้บริการ' },
    { value: 'med', label: 'รายการยา' },
    { value: 'symptom', label: 'อาการ' },
    { value: 'hn', label: 'HN / รหัสลูกค้า' },
    { value: 'phone', label: 'เบอร์โทร' },
    { value: 'store', label: 'ร้านยา / เภสัช' },
];

export const PRESCRIPTION_SEARCH_PLACEHOLDERS = {
    all: 'ค้นหาผู้ใช้บริการ / HN / ยา / อาการ / เบอร์โทร / ร้าน...',
    patient: 'ค้นหาชื่อผู้ใช้บริการ / ที่อยู่...',
    med: 'ค้นหารายการยา...',
    symptom: 'ค้นหาอาการ เช่น เวียนศีรษะ...',
    hn: 'ค้นหา HN / รหัสลูกค้า / เลขที่บิล...',
    phone: 'ค้นหาเบอร์โทร เช่น 0982150751',
    store: 'ค้นหาร้านยา / ชื่อเภสัช...',
};

function prescriptionSearchHaystack(item, topic = 'all') {
    if (!item) return '';
    const allFields = [
        ...Object.values(SEARCH_TOPIC_FIELDS).flat(),
        'service_code',
    ];
    const fields = topic === 'all'
        ? allFields
        : (SEARCH_TOPIC_FIELDS[topic] || allFields);
    const uniq = [...new Set(fields)];
    return uniq
        .map((key) => fieldText(item, key))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

/** ค้นหาผู้ใช้บริการ / HN / ยา / เภสัช / ร้าน / เบอร์โทร */
export function matchPrescriptionSearch(item, rawQuery, topic = 'all') {
    const q = String(rawQuery || '').trim().toLowerCase();
    if (!q) return true;

    const hay = prescriptionSearchHaystack(item, topic);
    if (hay.includes(q)) return true;

    if (topic === 'all' || topic === 'phone') {
        const qDigits = q.replace(/\D/g, '');
        if (qDigits.length >= 3) {
            const phone = String(item?.patient_phone || '').replace(/\D/g, '');
            if (phone.includes(qDigits)) return true;
        }
    }

    return false;
}