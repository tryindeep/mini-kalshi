import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";
import { password } from "bun";


const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const REGISTER_PATH = "/api/v1/auth/register";

const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 5_000,
    validateStatus: () => true,
})

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;

const validPayload = (overrides: Record<string, unknown> = {}) => ({
    username: uniqueUsername(),
    password: "password@123",
    role: "user",
    ...overrides,
})

beforeAll(async () => {
    try {
        await api.get("/");
    } catch {
        throw new Error(
            `Backend not reachable at ${BACKEND_URL}. Start the server before running tests`
        );
    }
});


describe(`POST ${REGISTER_PATH}`, () => {
    test("regiter a new user and returns 201", async () => {
        const response = await api.post(REGISTER_PATH, validPayload());

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty("message");

    });

    test("never returned the password or it hash ", async () => {
        const payload = validPayload();

        const response = await api.post(REGISTER_PATH, payload);
        const body = JSON.stringify(response.data);

        expect(response.status).toBe(201);
        expect(body).not.toContain(payload.password);
        expect(body).not.toContain("$2b$");
    });

    test("returns 409 when the username is already taken ", async () => {
        const payload = validPayload();

        const first = await api.post(REGISTER_PATH, payload);
        const second = await api.post(REGISTER_PATH, payload);

        expect(first.status).toBe(201);
        expect(second.status).toBe(409);
    });

    // checcking the zod schema rules 
    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["username is missing ", { password: "padf121423", role: "user" }],
        ["password is missing  ", { username: uniqueUsername(), role: "user" }],
        ["body empty ", {}],
        ["Password is not a string", validPayload({password : 132421342345})],
        ["username is too short ", validPayload({username : "a"})],
    ];

    test.each(invalidBodies)("return 400 when %s", async (_label, body) => {
        const response = await api.post(REGISTER_PATH, body);

        expect(response.status).toBe(400);
    })

    test("does not let a caller register themselves as an admin", async () => {
        const response = await api.post(
            REGISTER_PATH,
            validPayload({ role: "admin" })
        );

        expect(response.status).toBe(400);
    });
});