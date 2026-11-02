import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const REGISTER_PATH = "/api/v1/auth/register";
const LOGIN_PATH = "/api/v1/auth/login";

const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 5_000,
    validateStatus: () => true,
})

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;

const validPayload = (overrides: Record<string, unknown> = {}) => ({
    username: uniqueUsername(),
    password: "password@123",
    ...overrides,
})

// Create an existing user for login tests
async function createTestUser() {
    const payload = validPayload();

    const response = await api.post(
        REGISTER_PATH,
        payload
    );

    expect(response.status).toBe(201);

    return payload;
}

beforeAll(async () => {
    try {
        await api.get("/");
    } catch {
        throw new Error(
            `Backend not reachable at ${BACKEND_URL}. Start the server before running tests`
        );
    }
});

describe(`POST ${LOGIN_PATH}`, () => {

    // checcking the zod schema rules 
    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["username is missing ", { password: "padf121423" }],
        ["password is missing  ", { username: uniqueUsername(), }],
        ["body empty ", {}],
        ["Password is not a string", validPayload({ password: 132421342345 })],
        ["username is too short ", validPayload({ username: "a" })],
    ];

    test.each(invalidBodies)("return 400 when %s", async (_label, body) => {
        const response = await api.post(REGISTER_PATH, body);

        expect(response.status).toBe(400);
    });

    test("logs in successfully with valid credentials", async () => {
        const credentials = await createTestUser();

        const response = await api.post(
            LOGIN_PATH,
            credentials
        );

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty("token");
        expect(typeof response.data.token).toBe("string");
        expect(response.data.token.length).toBeGreaterThan(0);
    });

    test("returns 401 when password is incorrect", async () => {
        const credentials = await createTestUser();

        const response = await api.post(
            LOGIN_PATH,
            {
                username: credentials.username,
                password: "wrong-password"
            }
        );

        expect(response.status).toBe(401);
        expect(response.data).toHaveProperty("message");
    });

    test("returns 403 when username does not exist", async () => {
        const response = await api.post(
            LOGIN_PATH,
            {
                username: uniqueUsername(),
                password: "password@123"
            }
        );

        expect(response.status).toBe(403);
        expect(response.data).toHaveProperty("message");
    });
    test("does not expose password or password hash", async () => {
        const credentials = await createTestUser();

        const response = await api.post(
            LOGIN_PATH,
            credentials
        );

        const body = JSON.stringify(response.data);

        expect(response.status).toBe(200);
        expect(response.data).not.toHaveProperty("password");
        expect(body).not.toContain(credentials.password);
        expect(body).not.toMatch(/\$2[aby]\$/);
    });

});