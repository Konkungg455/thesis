import bcrypt from 'bcryptjs';

let argon2Module: typeof import('argon2') | null = null;

async function getArgon2() {
    if (!argon2Module) {
        argon2Module = await import('argon2');
    }
    return argon2Module;
}

function isBcryptHash(stored: string) {
    return stored.startsWith('$2a$') || stored.startsWith('$2y$') || stored.startsWith('$2b$');
}

function verifyBcrypt(stored: string, candidate: string): boolean {
    const normalized = stored.startsWith('$2y$')
        ? `$2a$${stored.slice(4)}`
        : stored;
    return bcrypt.compareSync(candidate, normalized);
}

export async function verifyPassword(
    password: string,
    salt: string,
    hash: string,
    options?: { allowPlainPassword?: boolean },
): Promise<boolean> {
    const stored = String(hash || '').trim();

    if (!stored) {
        return false;
    }

    const withSalt = `${password}${salt}`;

    if (stored.startsWith('$argon2')) {
        try {
            const argon2 = await getArgon2();
            if (await argon2.verify(stored, withSalt)) return true;
            if (options?.allowPlainPassword) {
                return await argon2.verify(stored, password);
            }
            return false;
        } catch {
            return false;
        }
    }

    if (isBcryptHash(stored)) {
        if (verifyBcrypt(stored, withSalt)) return true;
        if (options?.allowPlainPassword) {
            return verifyBcrypt(stored, password);
        }
        return false;
    }

    return false;
}

export async function hashPassword(password: string, salt: string): Promise<string> {
    const argon2 = await import('argon2');
    return argon2.hash(`${password}${salt}`, { type: argon2.argon2id });
}
