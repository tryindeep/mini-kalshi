# Mini Kalshi

A backend-only prediction-market simulation built with **Bun, TypeScript, Express, MongoDB, and Mongoose**. Users can create binary YES/NO markets, add test funds, create or redeem paired contracts, and submit limit BUY/SELL orders. The matching engine processes compatible orders and records fills, balances, and transaction-ledger entries in MongoDB.

> **Project status:** Educational / demonstration project. This is not an official Kalshi product, does not connect to Kalshi, and does not process real deposits or withdrawals. The current code does not implement complete market resolution or winner payouts. Review the security and implementation limitations near the end of this README before deploying it anywhere public.

---

## Contents

- [What the project does](#what-the-project-does)
- [Core concepts](#core-concepts)
- [Technology stack](#technology-stack)
- [How the matching engine works](#how-the-matching-engine-works)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Run the server](#run-the-server)
- [API reference](#api-reference)
- [End-to-end example](#end-to-end-example)
- [Database model overview](#database-model-overview)
- [Balance and contract accounting](#balance-and-contract-accounting)
- [Order lifecycle](#order-lifecycle)
- [Project structure](#project-structure)
- [Tests](#tests)
- [Current limitations and security notes](#current-limitations-and-security-notes)

---

## What the project does

Mini Kalshi models a prediction market as a question with two possible outcomes: `YES` and `NO`.

The backend currently provides:

- User registration and login using bcrypt password hashing and JSON Web Tokens (JWT).
- A simulated wallet top-up endpoint (`onramp`).
- Market creation and market listing.
- One YES orderbook and one NO orderbook for every market.
- **Split:** exchange cash for one YES and one NO contract per pair.
- **Merge:** exchange one YES and one NO contract for 100 cents per pair.
- Limit BUY and SELL orders for either outcome.
- Database-backed order matching with price-time priority.
- Two fill mechanisms: `TRANSFER` and `MINT`.
- Partial fills and persistent open orders.
- Available and locked cash/contract balances.
- Fill records and a per-user transaction log.

The project is an API service. The repository does not currently provide a customer-facing web application or a live connection to the Kalshi exchange.

## Core concepts

| Term | Meaning |
|---|---|
| Market | A binary question, such as “Will Team A win?” |
| Outcome | One side of a market: `YES` or `NO`. |
| BUY / SELL | The action a user wants to take. |
| Limit price | The maximum price a buyer will pay or minimum price a seller will accept. |
| Contract | A YES or NO position in a market. |
| Orderbook | The container for orders of one outcome. Each market has a YES book and a NO book. |
| Maker | An order already resting in the database/orderbook. |
| Taker | The new order currently being submitted and matched. |
| Fill | A record of the quantity matched between a maker and a taker. |
| TRANSFER | An existing contract moves from a seller to a buyer. |
| MINT | Opposite-outcome BUY orders create a new YES/NO pair. |
| Split | A user pays 100 cents and receives one YES plus one NO contract. |
| Merge | A user returns one YES plus one NO contract and receives 100 cents. |

### Price and money convention

Prices and wallet amounts are represented as integer **cents** in the controller arithmetic:

- `1` means $0.01 per contract.
- `45` means $0.45 per contract.
- `60` means $0.60 per contract.
- `100` cents is the paired-contract value used by split, merge, and complementary BUY matching.

For example, buying 8 contracts at 35 cents reserves `8 × 35 = 280` cents ($2.80). Splitting 8 pairs costs `8 × 100 = 800` cents ($8.00).

The wallet fields include `Usd` in their names, but the trading code uses integer-cent arithmetic. A client displaying dollar amounts should divide stored cents by 100.

### `type` and `side` in a place-order request

These two request fields mean different things:

```json
{
  "type": "BUY",
  "side": "YES"
}
```

- `type` is the order action: `BUY` or `SELL`.
- `side` is the market outcome: `YES` or `NO`.

The `Order` document stores `BUY`/`SELL` in its `side` field. Its `orderbookId` identifies whether the order belongs to the YES or NO book.

---

## Technology stack

| Technology | Purpose |
|---|---|
| Bun | Runtime, dependency installation, scripts, and tests |
| TypeScript | Application language |
| Express 5 | HTTP API and routing |
| MongoDB | Persistent storage |
| Mongoose | Models, indexes, queries, and transactions |
| Zod | Request-body validation |
| bcrypt | Password hashing and verification |
| jsonwebtoken | JWT creation and verification |
| dotenv | Environment variable loading |

The repository also declares Axios as a dependency; the documented core workflows do not require an external exchange API.

---

## How the matching engine works

Orders are stored in MongoDB. The matcher queries MongoDB for the next best eligible maker order on each iteration; it does not depend on a process-local in-memory order array. The order, fills, balances, and ledger entries are therefore persisted through database writes.

### 1. BUY matches a SELL on the same outcome — `TRANSFER`

A BUY YES order can match a SELL YES order. A BUY NO order can match a SELL NO order.

The match condition is:

```text
Incoming BUY limit price >= maker SELL price
```

The trade executes at the maker's price.

Example:

- Maker: SELL YES at 40 cents for 6 contracts.
- Taker: BUY YES at 50 cents for 4 contracts.
- The orders cross because `50 >= 40`.
- Four YES contracts move from the seller to the buyer.
- The buyer pays `4 × 40 = 160` cents, not the 200 cents reserved at the 50-cent limit.
- The buyer receives the 40-cent price improvement as a refund to available balance.

This is a `TRANSFER`; `Market.totalIssued` does not change.

### 2. SELL matches a BUY on the same outcome — `TRANSFER`

A SELL YES order can match a BUY YES order. A SELL NO order can match a BUY NO order.

The match condition is:

```text
Maker BUY price >= incoming SELL limit price
```

The trade executes at the maker's BUY price. The seller receives the proceeds, and the buyer receives the contracts.

### 3. BUY matches an opposite-outcome BUY — `MINT`

A BUY YES order can match a BUY NO order, and vice versa, when the two limit prices together can fund a complete pair.

For an incoming BUY at price `P`, an opposite-outcome BUY maker is eligible when:

```text
maker opposite-outcome price >= 100 - P
```

The taker's effective execution price is:

```text
taker effective price = 100 - maker price
```

Example:

- Maker: BUY NO at 45 cents.
- Taker: BUY YES with a 60-cent limit.
- The maker qualifies because `45 >= 100 - 60 = 40`.
- The taker's effective YES price is `100 - 45 = 55` cents.
- The maker contributes 45 cents and the taker contributes 55 cents.
- Together, the two BUY orders fund a new YES/NO pair worth 100 cents.

This is a `MINT`; `Market.totalIssued` increases by the matched quantity.

### Maker selection and priority

The matcher selects one maker at a time from MongoDB:

- For an incoming BUY, it sorts by the lowest effective price first.
- For an incoming SELL, it sorts by the highest eligible BUY price first.
- At the same price, the oldest order is selected first (`createdAt` ascending).
- `_id` is used as a deterministic final tie-breaker.
- Orders belonging to the taker's own user ID are excluded from matching.

The matching loop continues until the incoming quantity is filled or no eligible maker remains.

### Partial fills

Suppose a user submits a BUY order for 10 contracts and the matcher executes 4 contracts. The order keeps its original `quantity` of 10, while `remainingQuantity` becomes 6 and status becomes `PARTIALLY_FILLED`.

If no further maker is available, the remaining 6 contracts stay open and the corresponding reservation stays locked.

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) installed.
- A MongoDB database whose deployment supports multi-document transactions. The project uses Mongoose transactions in market creation, split, merge, and order placement. MongoDB Atlas is one suitable option. A local standalone MongoDB server is not sufficient for these transaction workflows; configure a local replica set if you develop locally.
- A MongoDB connection string and a private JWT signing secret.

### 1. Clone the repository

```bash
git clone https://github.com/tryindeep/mini-kalshi.git
cd mini-kalshi
```

### 2. Install dependencies

```bash
bun install
```

### 3. Create the environment file

Create a `.env` file in the project root. See [Environment variables](#environment-variables) below.

### 4. Start the development server

```bash
bun run dev
```

The application connects to MongoDB before it starts listening for requests. By default, the API listens on port `3002`.

---

## Environment variables

Create `.env` in the repository root:

```env
PORT=3002
DATABASE_URL=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_USER_SECRET=replace_with_a_long_random_secret
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | MongoDB connection URI. The database deployment must support transactions. |
| `JWT_USER_SECRET` | Yes | Secret used to sign and verify user JWTs. The application throws an error if it is missing. |
| `PORT` | No | HTTP port. Defaults to `3002`. |

Keep `.env` out of version control. Never commit database credentials or JWT secrets.

---

## Run the server

The scripts declared in `package.json` are:

| Command | Purpose |
|---|---|
| `bun run dev` | Run the API with Bun watch mode (`bun --watch index.ts`). |
| `bun run start` | Start the API (`bun index.ts`). |
| `bun test` | Run Bun tests. |
| `bun run test:watch` | Run Bun tests in watch mode. |

Default local API base URL:

```text
http://localhost:3002/api/v1
```

There is no dedicated health-check endpoint in the current route set.

---

## API reference

All request and response examples below reflect the current controllers and validators. Replace the sample IDs and token with values from your own database and login response.

### Authentication

#### `POST /auth/register`

Create an account.

Request:

```json
{
  "username": "alice",
  "password": "StrongPassword123!"
}
```

The current validator requires a trimmed username of at least 3 characters and a password from 2 to 100 characters. It defaults `role` to `user` when omitted.

A successful request returns HTTP `201`:

```json
{
  "message": "User Registerd Sucessfully"
}
```

> **Security warning:** The current signup validator also accepts `"role": "admin"`. Do not expose this registration flow publicly as-is. The controller should assign `role: "user"` itself and reserve admin provisioning for a trusted process.

#### `POST /auth/login`

Verify credentials and receive a JWT.

Request:

```json
{
  "username": "alice",
  "password": "StrongPassword123!"
}
```

Successful response (HTTP `200`):

```json
{
  "token": "<JWT_TOKEN>"
}
```

The token contains the user's ID and expires after **2 hours**.

#### Authenticated requests

Send the JWT in the `Authorization` header for protected endpoints:

```http
Authorization: Bearer <JWT_TOKEN>
```

The authentication middleware reads the token from the second whitespace-separated part of this header and verifies it with `JWT_USER_SECRET`.

#### `POST /auth/onramp`

Add simulated test funds to the authenticated user's available balance. This endpoint does not charge a card or transfer real money.

Request:

```json
{
  "amount": 10000
}
```

The amount must be a positive safe integer. Under the cent convention, `10000` represents $100.00.

Successful response (HTTP `200`):

```json
{
  "message": "balance added successfully",
  "balance": 10000
}
```

#### `GET /auth/transactions`

Read the authenticated user's transaction-log records.

Example:

```bash
curl "$BASE_URL/auth/transactions" \
  -H "Authorization: Bearer $TOKEN"
```

Response shape:

```json
{
  "Transactions": [
    {
      "userId": "<USER_ID>",
      "action": "onramp",
      "qtyChange": 0,
      "balanceUSDChange": 10000,
      "createdAt": "<TIMESTAMP>"
    }
  ]
}
```

The current endpoint returns the user's matching records without pagination or an explicit sort order.

### Markets

#### `POST /market/`

Create a binary market. Authentication is required.

Request:

```json
{
  "title": "Will Team A win the championship?",
  "expiry": "2027-06-30T18:00:00.000Z"
}
```

The title must contain at least one non-whitespace character. The expiry is parsed as a date and must be in the future.

The controller creates the market and its YES and NO orderbooks in one MongoDB transaction.

Successful response (HTTP `201`):

```json
{
  "message": "market created successfully",
  "marketId": "<MARKET_ID>"
}
```

#### `GET /market/`

List all markets. Authentication is not required.

```bash
curl "$BASE_URL/market/"
```

The controller sorts markets by `createdAt` descending. There is currently no pagination, filter, or single-market detail endpoint.

### Trading: split and merge

#### `POST /order/split`

Create paired YES and NO contracts by paying 100 cents per pair.

Request:

```json
{
  "marketId": "<MARKET_ID>",
  "quantity": 10
}
```

Rules:

- `marketId` must be a 24-character MongoDB ObjectId string.
- `quantity` must be a positive integer.
- The market must exist, be `OPEN`, remain `PENDING`, and not have expired.
- The user must have at least `quantity × 100` cents available.

For 10 pairs, the user's available balance decreases by 1,000 cents, the user receives 10 YES and 10 NO contracts, and `Market.totalIssued` increases by 10.

Successful response (HTTP `200`, illustrative values):

```json
{
  "message": "Split successful",
  "data": {
    "availableUsdBalance": 9000,
    "yesBalance": 10,
    "noBalance": 10,
    "totalIssued": 10
  }
}
```

#### `POST /order/merge`

Redeem equal quantities of unlocked YES and NO contracts for 100 cents per pair.

Request:

```json
{
  "marketId": "<MARKET_ID>",
  "quantity": 4
}
```

Rules:

- The user must have enough **unlocked** YES and NO contracts.
- Unlocked quantity is `quantity - lockedQuantity`.
- The market must exist and have `resolution: "PENDING"`.
- The controller also requires `Market.totalIssued` to be at least the requested quantity.

For 4 pairs, the user receives 400 cents, their YES and NO quantities each decrease by 4, and `Market.totalIssued` decreases by 4.

Successful response (HTTP `200`, illustrative values):

```json
{
  "message": "Merge successful",
  "data": {
    "availableUsdBalance": 9400,
    "yesBalance": 6,
    "noBalance": 6,
    "totalIssued": 6
  }
}
```

Note that the current merge controller checks `resolution: "PENDING"`, but does not check market status or expiry. This is different from the split and place-order checks.

### Trading: place a limit order

#### `POST /order/placeOrder`

Submit a limit BUY or SELL order. Authentication is required.

Request:

```json
{
  "marketId": "<MARKET_ID>",
  "type": "BUY",
  "side": "YES",
  "price": 60,
  "quantity": 10
}
```

Fields:

| Field | Allowed value / rule | Meaning |
|---|---|---|
| `marketId` | 24-character MongoDB ObjectId string | Market to trade. |
| `type` | `BUY` or `SELL` | Order action. |
| `side` | `YES` or `NO` | Outcome being bought or sold. |
| `price` | Integer from 1 to 99 | Limit price in cents per contract. |
| `quantity` | Positive integer | Number of contracts. |

For a BUY order, the user reserves `price × quantity` cents. For a SELL order, the user reserves the requested number of unlocked contracts. Matching begins immediately after the incoming order is created.

Possible outcomes:

- `FILLED`: all requested contracts matched.
- `PARTIALLY_FILLED`: some contracts matched; the remainder is still open and reserved.
- `OPEN`: no contracts matched; the full order remains open and reserved.

Successful response (HTTP `201`, illustrative response):

```json
{
  "message": "Order processed successfully",
  "data": {
    "_id": "<ORDER_ID>",
    "orderbookId": "<ORDERBOOK_ID>",
    "marketId": "<MARKET_ID>",
    "userId": "<USER_ID>",
    "side": "BUY",
    "price": 60,
    "quantity": 10,
    "remainingQuantity": 10,
    "status": "OPEN"
  }
}
```

The stored order's `side` field contains `BUY` or `SELL`; the YES/NO outcome is represented by its referenced orderbook.

### Canonical routes and additional aliases

The server mounts the order router at both `/api/v1/order` and `/api/v1/`. Use the canonical `/order/...` paths shown above. The additional aliases currently exposed by the second mount are:

- `POST /api/v1/split`
- `POST /api/v1/merge`
- `POST /api/v1/placeOrder`

These aliases are not necessary for clients and may be removed in a future cleanup.

---

## End-to-end example

This sequence demonstrates one user creating a market and preparing contracts. It uses shell variables to avoid repeating the host and token.

```bash
export BASE_URL="http://localhost:3002/api/v1"

# 1. Register
curl -X POST "$BASE_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"StrongPassword123!"}'

# 2. Login and copy the returned token
curl -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"StrongPassword123!"}'

# Set the token returned by login before continuing
export TOKEN="<JWT_TOKEN>"

# 3. Add simulated funds: 10000 cents = $100.00
curl -X POST "$BASE_URL/auth/onramp" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount":10000}'

# 4. Create a market
curl -X POST "$BASE_URL/market/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Will Team A win?","expiry":"2027-06-30T18:00:00.000Z"}'

# 5. Split 10 pairs (replace MARKET_ID)
curl -X POST "$BASE_URL/order/split" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"marketId":"<MARKET_ID>","quantity":10}'

# 6. Place a SELL YES order (replace MARKET_ID)
curl -X POST "$BASE_URL/order/placeOrder" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"marketId":"<MARKET_ID>","type":"SELL","side":"YES","price":55,"quantity":4}'

# 7. Read this user's transaction log
curl "$BASE_URL/auth/transactions" \
  -H "Authorization: Bearer $TOKEN"
```

To test a match, use a second user account to submit a compatible order. For the example SELL YES at 55, another user can submit BUY YES with a limit of 55 or higher.

---

## Database model overview

MongoDB stores seven main Mongoose models. All seven schemas enable automatic `createdAt` and `updatedAt` timestamps.

### User

| Field | Description |
|---|---|
| `username` | Required, unique, trimmed username. |
| `password` | Required bcrypt hash. |
| `role` | `user` or `admin`; defaults to `user`. |
| `availableUsdBalance` | Spendable wallet amount, in cents. |
| `lockedUsdBalance` | Cash reserved by open BUY orders, in cents. |

### Market

| Field | Description |
|---|---|
| `creatorId` | Reference to the user who created the market. |
| `title` | Required market question. |
| `totalIssued` | Number of YES/NO pairs currently issued and not merged; defaults to 0. |
| `resolution` | `YES`, `NO`, or `PENDING`; defaults to `PENDING`. |
| `expiry` | Required market expiry date. |
| `status` | `OPEN`, `CLOSED`, or `RESOLVED`; defaults to `OPEN`. |
| `resolvedAt` | Optional resolution timestamp. |

### Orderbook

| Field | Description |
|---|---|
| `marketId` | Reference to a market. |
| `outcome` | `YES` or `NO`. |

A unique compound index on `{ marketId, outcome }` ensures one book per outcome per market. The model is a book identifier/container; the price levels and resting orders are represented by `Order` documents.

### Order

| Field | Description |
|---|---|
| `orderbookId` | Reference to the YES or NO orderbook. |
| `marketId` | Reference to the market. |
| `userId` | User who submitted the order. |
| `side` | `BUY` or `SELL`. |
| `price` | Integer-cent limit price from 1 to 99. |
| `quantity` | Original order quantity. |
| `remainingQuantity` | Quantity not yet filled; can be 0. |
| `status` | `OPEN`, `PARTIALLY_FILLED`, `FILLED`, or `CANCELLED`. |

Indexes support matching by orderbook, action, status, price and creation time, as well as user- and market-based queries.

### StockBalance

| Field | Description |
|---|---|
| `userId` | Contract owner. |
| `marketId` | Market in which the position exists. |
| `outcome` | `YES` or `NO`. |
| `quantity` | Total contracts owned. |
| `lockedQuantity` | Contracts reserved by open SELL orders. |

A unique compound index on `{ userId, marketId, outcome }` ensures one balance document per user/outcome/market combination.

### Fill

| Field | Description |
|---|---|
| `marketId` | Market where the match occurred. |
| `makerOrderId` / `takerOrderId` | The two orders involved. |
| `makerUserId` / `takerUserId` | The two users involved. |
| `kind` | `TRANSFER` or `MINT`. |
| `price` | Maker's price in cents. |
| `outcome` | Maker's outcome (`YES` or `NO`). |
| `quantity` | Number of contracts matched. |

For a MINT fill, the stored `price` is the maker's opposite-outcome price. The taker's effective price is derived as `100 - price`; the current Fill document does not store a separate taker execution price.

### TransactionLog

| Field | Description |
|---|---|
| `userId` | User whose account or position changed. |
| `marketId` | Optional market reference. |
| `orderId` | Optional order reference. |
| `fillId` | Optional fill reference. |
| `outcome` | `YES`, `NO`, or `null`. |
| `action` | `onramp`, `buy`, `sell`, `lock`, `unlock`, `split`, `merge`, `payout`, `refund`, or `cancel`. |
| `qtyChange` | Change in contract quantity. |
| `lockedQtyChange` | Change in reserved contract quantity. |
| `balanceUSDChange` | Change in available cash, in cents. |
| `lockedUSDChange` | Change in reserved cash, in cents. |

Transaction logs record deltas rather than a complete balance snapshot. A single fill may create separate entries for the maker and taker.

---

## Balance and contract accounting

### Cash balances

```text
availableUsdBalance = spendable cash
lockedUsdBalance    = cash reserved by open BUY orders
```

When a BUY order is submitted:

```text
reserved = limitPrice × requestedQuantity
availableUsdBalance -= reserved
lockedUsdBalance    += reserved
```

When a BUY fills, the locked amount for the matched portion is consumed. If the actual execution price is better than the taker's limit, the difference is refunded to available cash. Unfilled quantities remain reserved.

### Contract balances

```text
unlockedContracts = quantity - lockedQuantity
```

When a SELL order is submitted, the controller checks that enough unlocked contracts exist, then increases `lockedQuantity`. When a SELL fills, both `quantity` and `lockedQuantity` decrease by the matched quantity. Any unfilled remainder stays locked.

### Issuance accounting

| Operation | `Market.totalIssued` |
|---|---:|
| Split `q` pairs | `+q` |
| MINT `q` pairs | `+q` |
| TRANSFER `q` contracts | No change |
| Merge `q` pairs | `-q` |

This field tracks issued pairs, not the sum of all individual YES and NO holdings.

---

## Order lifecycle

| Event | `remainingQuantity` | Status | Reservation |
|---|---:|---|---|
| New order, no fill | Original quantity | `OPEN` | Full cash or contract quantity stays locked. |
| Partial fill | Greater than 0, below original quantity | `PARTIALLY_FILLED` | Only the unfilled remainder stays locked. |
| Full fill | 0 | `FILLED` | Reservation for the order is consumed/released. |
| Cancellation | Not currently available through an API route | `CANCELLED` exists in the schema, but there is no cancellation handler. | No cancellation/unlock flow is currently exposed. |

Multi-document changes in market creation, split, merge and place-order matching are performed inside Mongoose transactions. This is important because a fill can update orders, cash, stock, market issuance, fills, and transaction logs together.

---

## Project structure

The code is organized around the following application areas:

```text
mini-kalshi/
├── index.ts
├── package.json
├── bun.lock
├── tsconfig.json
└── src/
    ├── config/
    │   ├── config.ts
    │   └── db.ts
    ├── controller/
    │   ├── authController.ts
    │   ├── marketController.ts
    │   ├── orderController.ts
    │   └── resolveController.ts
    ├── middleware/
    │   ├── authMiddleware.ts
    │   └── adminMiddleware.ts
    ├── models/
    │   ├── userModel.ts
    │   ├── marketModel.ts
    │   ├── orderbookModel.ts
    │   ├── orderModel.ts
    │   ├── stockBalanceModel.ts
    │   ├── fillModel.ts
    │   └── transactionLogModel.ts
    ├── routes/
    │   ├── authRoutes.ts
    │   ├── marketRoutes.ts
    │   ├── orderRoutes.ts
    │   └── resolveRoutes.ts
    └── types/
        ├── authValidator.ts
        ├── marketValidator.ts
        └── orderValidator.ts
```

`index.ts` loads environment variables, configures Express JSON parsing, connects to MongoDB, and mounts the auth, market and order routers.

---

## Tests

The project defines these Bun test scripts:

```bash
bun test
bun run test:watch
```

Add tests for the flows most likely to affect financial consistency:

- BUY reservations and SELL contract locks.
- Same-outcome TRANSFER matching.
- Opposite-outcome BUY-to-BUY MINT matching.
- Partial fills and price improvement refunds.
- Split and merge accounting.
- Transaction rollback when one write in a multi-document operation fails.
- Multiple concurrent order submissions for the same market.

---

## Current limitations and security notes

The following points describe the current source, not a future roadmap.

1. **Public registration can request an admin role.** The signup validator accepts both `user` and `admin`, and the register controller stores the supplied role. Restrict public signups to `user` before exposing the API.
2. **Onramp is simulated money.** It directly increments the wallet and is not connected to a payment gateway. Protect or disable it outside development/testing.
3. **Onramp and its ledger write are not atomic.** The balance update and transaction-log insertion are separate writes. A failure between them can leave a balance change without a matching log entry.
4. **Market resolution is not implemented end to end.** A resolver controller file exists but its handler is empty. A resolver route file exists, but it is not imported or mounted by the current `index.ts`. There is no implemented final payout/settlement endpoint.
5. **Order cancellation is not exposed.** The schema contains `CANCELLED`, `cancel`, and `unlock` values, but no active cancellation controller/route releases the remaining reservation. An open order can therefore keep cash or contracts locked.
6. **No orderbook, order, or fill read endpoints are currently exposed.** There is no dedicated endpoint to retrieve a market's bid/ask view, a user's open orders, or fill history. The transaction endpoint returns ledger records only.
7. **The profile handler is not routed.** A profile controller function exists, but `authRoutes.ts` does not register a `GET /profile` route.
8. **Merge has a different market-state check from split and place-order.** Merge checks that the market remains `PENDING`, but it does not check `OPEN` status or future expiry. Split and place-order do check all three conditions.
9. **Concurrent matching needs additional protection.** The matching path uses transactions and conditional maker updates, but the visible controller does not introduce a market-level serialization/locking mechanism. Add concurrency tests and an explicit matching strategy before relying on it under simultaneous traffic.
10. **Market creators are not explicitly barred from trading.** The matcher prevents a user from matching against their own resting order, but the order controller does not reject the creator from trading in their own market.
11. **List endpoints are unpaginated.** Market listing and transaction history return all matching documents.
12. **Error handling is not fully standardized.** Some controller catch blocks map broad failures to HTTP 400, including errors that may be internal database failures.

### Before a production deployment

At minimum:

- Force public signups to the `user` role; provision admins through a trusted process.
- Disable the simulated onramp or replace it with authenticated, verified payment events.
- Make all balance and ledger changes atomic and idempotent.
- Implement cancellation with correct release of remaining cash/contracts.
- Implement and test market resolution, expiry policy, refunds, and winner payouts.
- Add market-level matching concurrency controls and stress tests.
- Add read endpoints, pagination, rate limits, structured error handling, and operational monitoring.
- Use TLS, secure secret storage, database access controls, and backups.

---

## License

No license terms are documented here. Check the repository's `LICENSE` file (if one is added) before redistributing or reusing this project.
