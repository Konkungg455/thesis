import bcrypt from 'bcryptjs';

export async function verifyPassword(
    password: string,
    salt: string,
    hash: string,
): Promise<boolean> {
    const stored = String(hash || '').trim();

    if (!stored) {
        return false;
    }

    if (await verifyCandidate(stored, `${password}${salt}`)) {
        return true;
    }

    // ร้านค้า: PHP ลองทั้ง password ล้วน และ password+salt
    if (await verifyCandidate(stored, password)) {
        return true;
    }

    return false;
}

async function verifyCandidate(stored: string, candidate: string): Promise<boolean> {
    if (stored.startsWith('$argon2')) {
        try {
            const argon2 = await import('argon2');
            return await argon2.verify(stored, candidate);
        } catch {
            return false;
        }
    }

    if (stored.startsWith('$2a$') || stored.startsWith('$2y$') || stored.startsWith('$2b$')) {
        const normalized = stored.startsWith('$2y$')
            ? `$2a$${stored.slice(4)}`
            : stored;
        return bcrypt.compareSync(candidate, normalized);
    }

    return false;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
    const argon2 = await import('argon2');
    return argon2.hash(`${password}${salt}`, { type: argon2.argon2id });
}
