import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const REGISTER_PATH = "/api/v1/auth/register";
const LOGIN_PATH = "/api/v1/auth/login";
const ONRAMP_PATH = "/api/v1/auth/onramp";
const TRANSACTIONS_PATH = "/api/v1/auth/transactions";
const MARKET_PATH = "/api/v1/market";
const SPLIT_PATH = "/api/v1/order/createOder";

const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 5_000,
    validateStatus: () => true,
});

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;
const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();
const missingMarketId = "507f1f77bcf86cd799439011";

function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
}

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

async function onramp(token: string, amount: number) {
    const response = await api.post(ONRAMP_PATH, { amount }, authHeaders(token));
    expect(response.status).toBe(200);
    return response.data.balance as number;
}

async function createOpenMarket(token: string) {
    const response = await api.post(
        MARKET_PATH,
        {
            title: `Split market ${crypto.randomUUID()}`,
            expiry: futureExpiry(),
        },
        authHeaders(token),
    );

    expect(response.status).toBe(201);
    expect(response.data.marketId).toBeTruthy();

    return response.data.marketId as string;
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

describe(`POST ${SPLIT_PATH}`, () => {
    test("returns 401 when the request is unauthenticated", async () => {
        const response = await api.post(SPLIT_PATH, {
            marketId: missingMarketId,
            quantity: 1,
        });

        expect(response.status).toBe(401);
    });

    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["marketId is missing", { quantity: 1 }],
        ["quantity is missing", { marketId: missingMarketId }],
        ["body is empty", {}],
        ["marketId is not an object id", { marketId: "not-an-id", quantity: 1 }],
        ["quantity is zero", { marketId: missingMarketId, quantity: 0 }],
        ["quantity is negative", { marketId: missingMarketId, quantity: -1 }],
        ["quantity is not an integer", { marketId: missingMarketId, quantity: 1.5 }],
    ];

    test.each(invalidBodies)("returns 400 when %s", async (_label, body) => {
        const token = await createAuthToken();
        const response = await api.post(SPLIT_PATH, body, authHeaders(token));

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Incorrect Format");
    });

    test("returns 400 when the market does not exist", async () => {
        const token = await createAuthToken();
        const response = await api.post(
            SPLIT_PATH,
            { marketId: missingMarketId, quantity: 1 },
            authHeaders(token),
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Market Not found");
    });

    test("returns 400 when the balance cannot cover the split", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        await onramp(token, 199);

        const response = await api.post(
            SPLIT_PATH,
            { marketId, quantity: 2 },
            authHeaders(token),
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Not sufficient balance");
    });

    test("splits USD into equal YES and NO balances", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        const fundedBalance = await onramp(token, 500);
        const quantity = 2;
        const cost = quantity * 100;

        const response = await api.post(
            SPLIT_PATH,
            { marketId, quantity },
            authHeaders(token),
        );

        expect(response.status).toBe(200);
        expect(response.data.message).toBe("Split successful");
        expect(response.data.data).toEqual({
            availableUsdBalance: fundedBalance - cost,
            yesBalance: quantity,
            noBalance: quantity,
            totalIssued: quantity,
        });

        const transactions = await api.get(TRANSACTIONS_PATH, authHeaders(token));
        expect(transactions.status).toBe(200);

        const splitLogs = transactions.data.Transactions.filter(
            (entry: { action?: string; marketId?: string }) =>
                entry.action === "split" && String(entry.marketId) === marketId,
        );
        expect(splitLogs).toHaveLength(3);
    });

    test("adds to existing YES and NO balances on a second split", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        await onramp(token, 500);

        const first = await api.post(
            SPLIT_PATH,
            { marketId, quantity: 2 },
            authHeaders(token),
        );
        expect(first.status).toBe(200);

        const second = await api.post(
            SPLIT_PATH,
            { marketId, quantity: 1 },
            authHeaders(token),
        );

        expect(second.status).toBe(200);
        expect(second.data.data).toEqual({
            availableUsdBalance: 200,
            yesBalance: 3,
            noBalance: 3,
            totalIssued: 3,
        });
    });
});
