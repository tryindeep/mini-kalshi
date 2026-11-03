// import { beforeAll, describe, expect, test } from "bun:test";
// import axios from "axios";

// const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3001";
// const REGISTER_PATH = "/api/v1/auth/register";
// const LOGIN_PATH = "/api/v1/auth/login";
// const MARKET_PATH = "/api/v1/market";
// const CREATE_ORDER_PATH = "/api/v1/order/createOder";

// const api = axios.create({
//     baseURL: BACKEND_URL,
//     timeout: 5_000,
//     validateStatus: () => true,
// });


// const uniqueUsername = () => `test-${crypto.randomUUID().slice(0, 8)}`;

// async function createAuthToken() {
//     const credentials = {
//         username: uniqueUsername(),
//         password: "password@123",
//     };

//     const registration = await api.post(REGISTER_PATH, credentials);
//     expect(registration.status).toBe(201);

//     const login = await api.post(LOGIN_PATH, credentials);
//     expect(login.status).toBe(200);
//     expect(login.data).toHaveProperty("token");

//     return login.data.token as string;
// }

// async function getOpenMarketId() {
//     const response = await api.get(MARKET_PATH);
//     expect(response.status).toBe(200);
//     expect(Array.isArray(response.data.markets)).toBe(true);

//     const market = response.data.markets.find(
//         (item: { status?: string; expiry?: string }) =>
//             item.status === "OPEN" &&
//             item.expiry &&
//             new Date(item.expiry).getTime() > Date.now(),
//     );

//     expect(
//         market,
//         "Create an open market with a future expiry before running order tests",
//     ).toBeDefined();

//     return market._id as string;
// }

// beforeAll(async () => {
//     try {
//         await api.get("/");
//     } catch {
//         throw new Error(
//             `Backend not reachable at ${BACKEND_URL}. Start the server before running tests`,
//         );
//     }
// });

// describe(`POST ${CREATE_ORDER_PATH}`, () => {
//     test("returns 401 when the request is unauthenticated", async () => {
//         const response = await api.post(CREATE_ORDER_PATH, {});

//         expect(response.status).toBe(401);
//     });

//     test("returns 400 when the order payload is invalid", async () => {
//         const token = await createAuthToken();
//         const response = await api.post(
//             CREATE_ORDER_PATH,
//             { marketId: "invalid-market-id" },
//             { headers: { Authorization: `Bearer ${token}` } },
//         );

//         expect(response.status).toBe(400);
//     });

//     test("creates an order for an open market", async () => {
//         const token = await createAuthToken();
//         const marketId = await getOpenMarketId();
//         const response = await api.post(
//             CREATE_ORDER_PATH,
//             {
//                 marketId,
//                 stocktype: "BUY",
//                 side: "YES",
//                 price: 50,
//                 quantity: 2,
//             },
//             { headers: { Authorization: `Bearer ${token}` } },
//         );

//         expect(response.status).toBe(201);
//         expect(response.data).toHaveProperty("orderId");
//     });
// });