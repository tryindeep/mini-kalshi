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
            title: `Order market ${crypto.randomUUID()}`,
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
    return response.data.data;
}

function orderBody(
    marketId: string,
    overrides: Record<string, unknown> = {},
) {
    return {
        marketId,
        type: "BUY",
        side: "YES",
        price: 40,
        quantity: 1,
        ...overrides,
    };
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

describe(`POST ${PLACE_ORDER_PATH}`, () => {
    test("returns 401 when the request is unauthenticated", async () => {
        const response = await api.post(
            PLACE_ORDER_PATH,
            orderBody(missingMarketId),
        );

        expect(response.status).toBe(401);
    });

    const invalidBodies: Array<[string, Record<string, unknown>]> = [
        ["marketId is missing", { type: "BUY", side: "YES", price: 40, quantity: 1 }],
        ["type is missing", orderBody(missingMarketId, { type: undefined })],
        ["side is missing", orderBody(missingMarketId, { side: undefined })],
        ["price is missing", orderBody(missingMarketId, { price: undefined })],
        ["quantity is missing", orderBody(missingMarketId, { quantity: undefined })],
        ["body is empty", {}],
        ["marketId is not an object id", orderBody("not-an-id")],
        ["type is not BUY or SELL", orderBody(missingMarketId, { type: "HOLD" })],
        ["side is not YES or NO", orderBody(missingMarketId, { side: "MAYBE" })],
        ["price is zero", orderBody(missingMarketId, { price: 0 })],
        ["price is above 99", orderBody(missingMarketId, { price: 100 })],
        ["price is not an integer", orderBody(missingMarketId, { price: 40.5 })],
        ["quantity is zero", orderBody(missingMarketId, { quantity: 0 })],
        ["quantity is negative", orderBody(missingMarketId, { quantity: -1 })],
        ["quantity is not an integer", orderBody(missingMarketId, { quantity: 1.5 })],
    ];

    test.each(invalidBodies)("returns 400 when %s", async (_label, body) => {
        const token = await createAuthToken();
        const response = await api.post(PLACE_ORDER_PATH, body, authHeaders(token));

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Incorrect Format");
    });

    test("returns 404 when the market does not exist", async () => {
        const token = await createAuthToken();
        await onramp(token, 500);

        const response = await api.post(
            PLACE_ORDER_PATH,
            orderBody(missingMarketId),
            authHeaders(token),
        );

        expect(response.status).toBe(404);
        expect(response.data.message).toBe("Market Not found");
    });

    test("returns 400 when a buy cannot reserve the USD", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        await onramp(token, 50);

        const response = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { price: 40, quantity: 2 }),
            authHeaders(token),
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Insufficient available USD balance");
    });

    test("returns 400 when a sell has no unlocked contracts", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);

        const response = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { type: "SELL", quantity: 1 }),
            authHeaders(token),
        );

        expect(response.status).toBe(400);
        expect(response.data.message).toBe("Insufficient unlocked stock balance");
    });

    test("rests a buy on the book when nothing crosses", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        await onramp(token, 500);

        const response = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { price: 40, quantity: 2 }),
            authHeaders(token),
        );

        expect(response.status).toBe(201);
        expect(response.data.message).toBe("Order processed successfully");
        expect(response.data.data.status).toBe("OPEN");
        expect(response.data.data.side).toBe("BUY");
        expect(response.data.data.price).toBe(40);
        expect(response.data.data.quantity).toBe(2);
        expect(response.data.data.remainingQuantity).toBe(2);

        const transactions = await api.get(TRANSACTIONS_PATH, authHeaders(token));
        const locks = transactions.data.Transactions.filter(
            (entry: { action?: string; balanceUSDChange?: number }) =>
                entry.action === "lock" && entry.balanceUSDChange === -80,
        );
        expect(locks).toHaveLength(1);
    });

    test("does not match a user against their own opposite buy", async () => {
        const token = await createAuthToken();
        const marketId = await createOpenMarket(token);
        await onramp(token, 500);

        const yesOrder = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "YES", price: 60, quantity: 1 }),
            authHeaders(token),
        );
        expect(yesOrder.status).toBe(201);

        const noOrder = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "NO", price: 40, quantity: 1 }),
            authHeaders(token),
        );

        expect(noOrder.status).toBe(201);
        expect(noOrder.data.data.status).toBe("OPEN");
        expect(noOrder.data.data.remainingQuantity).toBe(1);
    });

    test("mints a YES and NO pair when opposite buys cross", async () => {
        const yesToken = await createAuthToken();
        const noToken = await createAuthToken();
        const marketId = await createOpenMarket(yesToken);
        await onramp(yesToken, 500);
        await onramp(noToken, 500);

        const maker = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "YES", price: 60, quantity: 2 }),
            authHeaders(yesToken),
        );
        expect(maker.status).toBe(201);
        expect(maker.data.data.status).toBe("OPEN");

        const taker = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "NO", price: 40, quantity: 2 }),
            authHeaders(noToken),
        );

        expect(taker.status).toBe(201);
        expect(taker.data.message).toBe("Order processed successfully");
        expect(taker.data.data.status).toBe("FILLED");
        expect(taker.data.data.remainingQuantity).toBe(0);
        expect(taker.data.data.quantity).toBe(2);
        expect(taker.data.data.price).toBe(40);

        const yesLogs = await api.get(TRANSACTIONS_PATH, authHeaders(yesToken));
        const yesBuys = yesLogs.data.Transactions.filter(
            (entry: { action?: string; outcome?: string; qtyChange?: number }) =>
                entry.action === "buy" &&
                entry.outcome === "YES" &&
                entry.qtyChange === 2,
        );
        expect(yesBuys).toHaveLength(1);

        const noLogs = await api.get(TRANSACTIONS_PATH, authHeaders(noToken));
        const noBuys = noLogs.data.Transactions.filter(
            (entry: { action?: string; outcome?: string; qtyChange?: number }) =>
                entry.action === "buy" &&
                entry.outcome === "NO" &&
                entry.qtyChange === 2,
        );
        expect(noBuys).toHaveLength(1);
    });

    test("leaves the remainder open when the opposite buy is smaller", async () => {
        const yesToken = await createAuthToken();
        const noToken = await createAuthToken();
        const marketId = await createOpenMarket(yesToken);
        await onramp(yesToken, 500);
        await onramp(noToken, 500);

        const maker = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "YES", price: 60, quantity: 1 }),
            authHeaders(yesToken),
        );
        expect(maker.status).toBe(201);

        const taker = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { side: "NO", price: 40, quantity: 2 }),
            authHeaders(noToken),
        );

        expect(taker.status).toBe(201);
        expect(taker.data.data.status).toBe("PARTIALLY_FILLED");
        expect(taker.data.data.quantity).toBe(2);
        expect(taker.data.data.remainingQuantity).toBe(1);
    });

    test("transfers YES contracts from a resting sell to a crossing buy", async () => {
        const sellerToken = await createAuthToken();
        const buyerToken = await createAuthToken();
        const marketId = await createOpenMarket(sellerToken);
        await onramp(sellerToken, 1_000);
        await onramp(buyerToken, 500);
        await split(sellerToken, marketId, 4);

        const sell = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { type: "SELL", side: "YES", price: 55, quantity: 2 }),
            authHeaders(sellerToken),
        );
        expect(sell.status).toBe(201);
        expect(sell.data.data.status).toBe("OPEN");
        expect(sell.data.data.side).toBe("SELL");
        expect(sell.data.data.remainingQuantity).toBe(2);

        const buy = await api.post(
            PLACE_ORDER_PATH,
            orderBody(marketId, { type: "BUY", side: "YES", price: 60, quantity: 2 }),
            authHeaders(buyerToken),
        );

        expect(buy.status).toBe(201);
        expect(buy.data.data.status).toBe("FILLED");
        expect(buy.data.data.remainingQuantity).toBe(0);
        expect(buy.data.data.price).toBe(60);

        const sellerLogs = await api.get(TRANSACTIONS_PATH, authHeaders(sellerToken));
        const sales = sellerLogs.data.Transactions.filter(
            (entry: { action?: string; balanceUSDChange?: number; qtyChange?: number }) =>
                entry.action === "sell" &&
                entry.balanceUSDChange === 110 &&
                entry.qtyChange === -2,
        );
        expect(sales).toHaveLength(1);

        const buyerLogs = await api.get(TRANSACTIONS_PATH, authHeaders(buyerToken));
        const purchases = buyerLogs.data.Transactions.filter(
            (entry: { action?: string; qtyChange?: number; balanceUSDChange?: number }) =>
                entry.action === "buy" &&
                entry.qtyChange === 2 &&
                entry.balanceUSDChange === 10,
        );
        expect(purchases).toHaveLength(1);
    });
});
