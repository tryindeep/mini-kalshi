import { beforeAll, describe, expect, test } from "bun:test";
import axios from "axios";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
const REGISTER_PATH = "/api/v1/auth/register";
const LOGIN_PATH = "/api/v1/auth/login";
const ONRAMP_PATH = "/api/v1/auth/onramp";
const TRANSACTIONS_PATH = "/api/v1/auth/transactions";
const MARKET_PATH = "/api/v1/market";
const SPLIT_PATH = "/api/v1/order/split";
const PLACE_ORDER_PATH = "/api/v1/order/placeOrder";
const RESOLVE_PATH = "/api/v1/market/resolve";

const api = axios.create({
    baseURL: BACKEND_URL,
    timeout: 10_000,
    validateStatus: () => true,
});

const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;
const futureExpiry = () => new Date(Date.now() + 60_000).toISOString();
const missingMarketId = "507f1f77bcf86cd799439011";

function authHeaders(token: string) {
    return { headers: { Authorization: `Bearer ${token}` } };
}

async function createAuthToken(role: "user" | "admin" = "user") {
    const credentials = {
        username: uniqueUsername(),
        password: "password@123",
        role,
    };

    const registration = await api.post(REGISTER_PATH, credentials);
    expect(registration.status).toBe(201);

    const login = await api.post(LOGIN_PATH, {
        username: credentials.username,
        password: credentials.password,
    });
    expect(login.status).toBe(200);
    expect(login.data).toHaveProperty("token");

    return login.data.token as string;
}

async function onramp(token: string, amount: number) {
    const response = await api.post(ONRAMP_PATH, { amount }, authHeaders(token));
    expect(response.status).toBe(200);
}

async function createOpenMarket(token: string) {
    const response = await api.post(
        MARKET_PATH,
        {
            title: `Resolve market ${crypto.randomUUID()}`,
            expiry: futureExpiry(),
        },
        authHeaders(token),
    );

    expect(response.status).toBe(201);
    expect(response.data.marketId).toBeTruthy();

    return response.data.marketId as string;
}

async function split(token: string, marketId: string, quantity: number) {
    const response = await api.post(
        SPLIT_PATH,
        { marketId, quantity },
        authHeaders(token),
    );
    expect(response.status).toBe(200);
}

function payouts(
    transactions: Array<{ action?: string; outcome?: string; qtyChange?: number; balanceUSDChange?: number }>,
) {
    return transactions.filter((entry) => entry.action === "payout");
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

describe(`POST ${RESOLVE_PATH}`, () => {
    test("returns 401 when the request is unauthenticated", async () => {
        const response = await api.post(RESOLVE_PATH, {
            marketId: missingMarketId,
            resolution: "YES",
        });

        expect(response.status).toBe(401);
    });

    test("returns 403 when the user is not an admin", async () => {
        const token = await createAuthToken("user");
        const response = await api.post(
            RESOLVE_PATH,
            { marketId: missingMarketId, resolution: "YES" },
            authHeaders(token),
        );

        expect(response.status).toBe(403);
        expect(response.data.message).toBe("Admin access required");
    });

    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["marketId is missing", { resolution: "YES" }],
        ["resolution is missing", { marketId: missingMarketId }],
        ["body is empty", {}],
        ["resolution is lowercase", { marketId: missingMarketId, resolution: "yes" }],
        ["resolution is not YES or NO", { marketId: missingMarketId, resolution: "MAYBE" }],
    ];

    test.each(invalidBodies)("returns 400 when %s", async (_label, body) => {
        const token = await createAuthToken("admin");
        const response = await api.post(RESOLVE_PATH, body, authHeaders(token));

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Incorrect Format");
    });

    test("returns 404 when the market does not exist", async () => {
        const token = await createAuthToken("admin");
        const response = await api.post(
            RESOLVE_PATH,
            { marketId: missingMarketId, resolution: "YES" },
            authHeaders(token),
        );

        expect(response.status).toBe(404);
        expect(response.data.message).toBe("Market not found");
    });

    test("resolves an empty open market", async () => {
        const admin = await createAuthToken("admin");
        const creator = await createAuthToken("user");
        const marketId = await createOpenMarket(creator);

        const response = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "YES" },
            authHeaders(admin),
        );

        expect(response.status).toBe(200);
        expect(response.data.message).toBe("Market resolved successfully");
        expect(String(response.data.data.marketId)).toBe(marketId);
        expect(response.data.data).toMatchObject({
            resolution: "YES",
            status: "RESOLVED",
            cancelledOrders: 0,
            settledPositions: 0,
            totalWinners: 0,
            totalPayout: 0,
        });
    });

    test("pays YES holders and records a zero payout for NO", async () => {
        const admin = await createAuthToken("admin");
        const trader = await createAuthToken("user");
        const marketId = await createOpenMarket(trader);
        await onramp(trader, 500);
        await split(trader, marketId, 2);

        const response = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "YES" },
            authHeaders(admin),
        );

        expect(response.status).toBe(200);
        expect(response.data.data).toMatchObject({
            resolution: "YES",
            status: "RESOLVED",
            cancelledOrders: 0,
            settledPositions: 2,
            totalWinners: 1,
            totalPayout: 200,
        });

        const transactions = await api.get(TRANSACTIONS_PATH, authHeaders(trader));
        expect(transactions.status).toBe(200);
        expect(payouts(transactions.data.Transactions)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    outcome: "YES",
                    qtyChange: -2,
                    balanceUSDChange: 200,
                }),
                expect.objectContaining({
                    outcome: "NO",
                    qtyChange: -2,
                    balanceUSDChange: 0,
                }),
            ]),
        );
    });

    test("cancels a resting buy and refunds the locked USD", async () => {
        const admin = await createAuthToken("admin");
        const trader = await createAuthToken("user");
        const marketId = await createOpenMarket(trader);
        await onramp(trader, 500);

        const order = await api.post(
            PLACE_ORDER_PATH,
            { marketId, type: "BUY", side: "YES", price: 40, quantity: 2 },
            authHeaders(trader),
        );
        expect(order.status).toBe(201);

        const response = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "NO" },
            authHeaders(admin),
        );

        expect(response.status).toBe(200);
        expect(response.data.data).toMatchObject({
            resolution: "NO",
            status: "RESOLVED",
            cancelledOrders: 1,
            settledPositions: 0,
            totalWinners: 0,
            totalPayout: 0,
        });

        const transactions = await api.get(TRANSACTIONS_PATH, authHeaders(trader));
        const refunds = transactions.data.Transactions.filter(
            (entry: { action?: string; balanceUSDChange?: number; lockedUSDChange?: number }) =>
                entry.action === "cancel" &&
                entry.balanceUSDChange === 80 &&
                entry.lockedUSDChange === -80,
        );
        expect(refunds).toHaveLength(1);
    });

    test("unlocks a resting sell before paying the winning outcome", async () => {
        const admin = await createAuthToken("admin");
        const trader = await createAuthToken("user");
        const marketId = await createOpenMarket(trader);
        await onramp(trader, 500);
        await split(trader, marketId, 2);

        const sell = await api.post(
            PLACE_ORDER_PATH,
            { marketId, type: "SELL", side: "YES", price: 50, quantity: 1 },
            authHeaders(trader),
        );
        expect(sell.status).toBe(201);

        const response = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "YES" },
            authHeaders(admin),
        );

        expect(response.status).toBe(200);
        expect(response.data.data).toMatchObject({
            resolution: "YES",
            status: "RESOLVED",
            cancelledOrders: 1,
            settledPositions: 2,
            totalWinners: 1,
            totalPayout: 200,
        });

        const transactions = await api.get(TRANSACTIONS_PATH, authHeaders(trader));
        const unlocks = transactions.data.Transactions.filter(
            (entry: { action?: string; lockedQtyChange?: number; outcome?: string }) =>
                entry.action === "cancel" &&
                entry.outcome === "YES" &&
                entry.lockedQtyChange === -1,
        );
        expect(unlocks).toHaveLength(1);
    });

    test("returns 409 when the market is already resolved", async () => {
        const admin = await createAuthToken("admin");
        const creator = await createAuthToken("user");
        const marketId = await createOpenMarket(creator);

        const first = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "NO" },
            authHeaders(admin),
        );
        expect(first.status).toBe(200);

        const second = await api.post(
            RESOLVE_PATH,
            { marketId, resolution: "YES" },
            authHeaders(admin),
        );

        expect(second.status).toBe(409);
        expect(second.data.message).toBe("Market already resolved");
    });
});
