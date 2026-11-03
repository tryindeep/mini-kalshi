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

async function createTestMarket() {
    const credentials = {
        username: uniqueUsername(),
        password: "password@123",
    };

    const registration = await api.post(REGISTER_PATH, credentials);
    expect(registration.status).toBe(201);

    const login = await api.post(LOGIN_PATH, credentials);
    expect(login.status).toBe(200);
    expect(login.data).toHaveProperty("token");

    const title = `Market ${crypto.randomUUID()}`;
    const creation = await api.post(
        MARKET_PATH,
        {
            title,
            expiry: new Date(Date.now() + 60_000).toISOString(),
        },
        { headers: { Authorization: `Bearer ${login.data.token}` } },
    );

    expect(creation.status).toBe(201);
    return { id: creation.data.marketId, title };
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

describe(`GET ${MARKET_PATH}`, () => {
    test("returns the markets, including a recently created market", async () => {
        const createdMarket = await createTestMarket();
        const response = await api.get(MARKET_PATH);

        expect(response.status).toBe(200);
        expect(response.data.message).toBe("Markets fetched successfully");
        expect(Array.isArray(response.data.markets)).toBe(true);

        const market = response.data.markets.find(
            (item: { _id: string }) => item._id === createdMarket.id,
        );
        expect(market).toBeDefined();
        expect(market.title).toBe(createdMarket.title);
    });
});
