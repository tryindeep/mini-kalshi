import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const REGISTER_PATH = "/api/v1/auth/register";
const LOGIN_PATH = "/api/v1/auth/login";
const MARKET_PATH = "/api/v1/market";

const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 5_000,
    validateStatus: () => true,
});

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;

async function createAuthToken() {
    const credentials = {
        username: uniqueUsername(),
        password: "password@123",
    };

    const registration = await api.post(REGISTER_PATH, credentials);
    expect(registration.status).toBe(201);

    const login = await api.post(LOGIN_PATH, credentials);
    expect(login.status).toBe(200);
    expect(login.data).toHaveProperty("token");

    return login.data.token as string;
}

beforeAll(async () => {
    try {
        await api.get("/");
    } catch {
        throw new Error(
            `Backend not reachable at ${BACKEND_URL}. Start the server before running tests`,
        );
    }
});

describe(`POST ${MARKET_PATH}`, () => {
    test("returns 401 when the request is unauthenticated", async () => {
        const response = await api.post(MARKET_PATH, {
            title: "Will this market be created?",
            expiry: new Date(Date.now() + 60_000).toISOString(),
        });

        expect(response.status).toBe(401);
    });

    test("creates a market with a future expiry", async () => {
        const token = await createAuthToken();
        const response = await api.post(
            MARKET_PATH,
            {
                title: "Will this market be created?",
                expiry: new Date(Date.now() + 60_000).toISOString(),
            },
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(response.status).toBe(201);
        expect(response.data.message).toBe("market created successfully");
        expect(response.data.marketId).toBeTruthy();
    });

    test("returns 400 for invalid market data", async () => {
        const token = await createAuthToken();
        const response = await api.post(
            MARKET_PATH,
            { title: "", expiry: "not-a-date" },
            { headers: { Authorization: `Bearer ${token}` } },
        );

        expect(response.status).toBe(400);
    });
});