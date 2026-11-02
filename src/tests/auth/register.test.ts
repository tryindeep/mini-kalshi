import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";
const REGISTER_PATH = "/api/v1/auth/register";

// Shared client: non-2xx responses come back as normal responses (no throwing).
const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 5_000,
    validateStatus: () => true,
});

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;

// A valid payload; pass overrides to break or change one field.
const validPayload = (overrides: Record<string, unknown> = {}) => ({
    username: uniqueUsername(),
    password: "password@123",
    role: "user",
    ...overrides,
});

// Fail fast with a clear message if the server isn't running.
beforeAll(async () => {
    try {
        await api.get("/");
    } catch {
        throw new Error(
            `Backend not reachable at ${BACKEND_URL}. Start the server before running tests.`
        );
    }
});

describe(`POST ${REGISTER_PATH}`, () => {
    test("registers a new user and does not leak the password or hash", async () => {
        const payload = validPayload();

        const response = await api.post(REGISTER_PATH, payload);
        const body = JSON.stringify(response.data);

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty("message");
        expect(body).not.toContain(payload.password);
        expect(body).not.toContain("$2b$"); // bcrypt hash prefix
    });

    test("registers a user when role is left out (defaults to user)", async () => {
        const { role, ...withoutRole } = validPayload();

        const response = await api.post(REGISTER_PATH, withoutRole);

        expect(response.status).toBe(201);
    });

    test("returns 409 when the username is already taken", async () => {
        const payload = validPayload();

        const first = await api.post(REGISTER_PATH, payload);
        const second = await api.post(REGISTER_PATH, payload);

        expect(first.status).toBe(201);
        expect(second.status).toBe(409);
    });

    test("simultaneous signups with the same username give one 201 and one 409", async () => {
        const payload = validPayload();

        const [a, b] = await Promise.all([
            api.post(REGISTER_PATH, payload),
            api.post(REGISTER_PATH, payload),
        ]);

        expect([a.status, b.status].sort()).toEqual([201, 409]);
    });

    // Each case is valid except for the one thing being tested.
    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["username is missing", { password: "password@123", role: "user" }],
        ["password is not a string", validPayload({ password: 132421342345 })],
        ["role is not allowed", validPayload({ role: "superuser" })],
        ["body is empty", {}],
    ];

    test.each(invalidBodies)("returns 400 when %s", async (_label, body) => {
        const response = await api.post(REGISTER_PATH, body);

        expect(response.status).toBe(400);
    });

    describe("admin signup", () => {
        test("rejects admin signup without the secret", async () => {
            const response = await api.post(
                REGISTER_PATH,
                validPayload({ role: "admin" })
            );

            expect(response.status).toBe(403);
        });

        test("rejects admin signup with the wrong secret", async () => {
            const response = await api.post(
                REGISTER_PATH,
                validPayload({ role: "admin", adminSecret: "wrong-secret" })
            );

            expect(response.status).toBe(403);
        });

        // Runs only if ADMIN_SECRET is set in .env (the server must use the same value).
        test.skipIf(!process.env.ADMIN_SECRET)(
            "allows admin signup with the correct secret",
            async () => {
                const response = await api.post(
                    REGISTER_PATH,
                    validPayload({
                        role: "admin",
                        adminSecret: process.env.ADMIN_SECRET,
                    })
                );

                expect(response.status).toBe(201);
            }
        );
    });
});