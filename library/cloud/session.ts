import * as SecureStore from "expo-secure-store";
import {CloudError, post} from "./transport";

/**
 * The signed-in account.
 *
 * This is the only file in the app that ever holds a credential, which is the
 * point of it being its own file: "does the app store my password" is a
 * question answerable by reading one short module rather than auditing five.
 *
 * The password is an argument to `signIn` and nothing else. It is never
 * written, never returned, and never held beyond the call. What is stored is
 * the token, which xBloom can revoke and which grants nothing on any other
 * service.
 */

const KEY = "xbloom.session";

export type Session = {
    memberId: number;
    token: string;
    /** Shown in Settings so the user can see which account is connected. */
    email: string;
};

function isSession(value: unknown): value is Session {
    if (typeof value !== "object" || value === null) return false;
    const s = value as Partial<Session>;
    return (
        typeof s.memberId === "number" &&
        typeof s.token === "string" &&
        s.token.length > 0 &&
        typeof s.email === "string"
    );
}

export async function signIn(email: string, password: string): Promise<Session> {
    const response = await post(
        "tMemberLogin.thtml",
        {
            email,
            password,
            interfaceVersion: 20240918,
            skey: "testskey",
            phoneType: "Android",
            clientType: 2,
            languageType: 1,
            jpushId: "",
        },
        false
    );

    const token = response.token;
    const memberId = (response.member as {tableId?: unknown} | undefined)?.tableId;

    // A `result: success` carrying neither of the two things the session is
    // made of means their shape has moved. Failing here is much cheaper than
    // storing a session whose every later use fails for no visible reason.
    if (typeof token !== "string" || !token || typeof memberId !== "number") {
        throw new CloudError("server", "xBloom signed in but returned no session");
    }

    const session: Session = {memberId, token, email};
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
    return session;
}

export async function loadSession(): Promise<Session | null> {
    let raw: string | null;
    try {
        raw = await SecureStore.getItemAsync(KEY);
    } catch {
        // The keychain can be unavailable before first unlock. That is not a
        // reason to fail; it is a reason to look signed out.
        return null;
    }
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        return isSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function signOut(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
}
