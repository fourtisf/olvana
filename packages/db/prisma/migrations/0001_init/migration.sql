-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "user" (
    "address" TEXT NOT NULL,
    "refCode" TEXT NOT NULL,
    "referredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "vault_event" (
    "id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "user" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assets" DECIMAL(38,6) NOT NULL,
    "shares" DECIMAL(38,18) NOT NULL,
    "block" BIGINT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_snapshot" (
    "id" SERIAL NOT NULL,
    "vault" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "grossApy" DOUBLE PRECISION NOT NULL,
    "netApy" DOUBLE PRECISION NOT NULL,
    "tvl" DECIMAL(38,6) NOT NULL,
    "utilization" DOUBLE PRECISION NOT NULL,
    "liquidity" DECIMAL(38,6) NOT NULL,
    "collateral" JSONB NOT NULL,
    "oracle" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskGrade" TEXT NOT NULL,
    "riskParts" JSONB NOT NULL,

    CONSTRAINT "vault_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" SERIAL NOT NULL,
    "user" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "points" DECIMAL(38,4) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_settings" (
    "user" TEXT NOT NULL,
    "daily" BOOLEAN NOT NULL DEFAULT true,
    "utilization" BOOLEAN NOT NULL DEFAULT true,
    "collateral" BOOLEAN NOT NULL DEFAULT true,
    "threshold" INTEGER NOT NULL DEFAULT 95,
    "lastUtilAlert" JSONB,

    CONSTRAINT "alert_settings_pkey" PRIMARY KEY ("user")
);

-- CreateTable
CREATE TABLE "telegram_link" (
    "user" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_link_pkey" PRIMARY KEY ("user")
);

-- CreateTable
CREATE TABLE "collateral_class" (
    "symbol" TEXT NOT NULL,
    "address" TEXT,
    "quality" TEXT NOT NULL,

    CONSTRAINT "collateral_class_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "market_oracle" (
    "marketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "market_oracle_pkey" PRIMARY KEY ("marketId")
);

-- CreateTable
CREATE TABLE "curator_incident" (
    "id" SERIAL NOT NULL,
    "curator" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curator_incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_refCode_key" ON "user"("refCode");

-- CreateIndex
CREATE INDEX "user_referredBy_idx" ON "user"("referredBy");

-- CreateIndex
CREATE INDEX "vault_event_user_idx" ON "vault_event"("user");

-- CreateIndex
CREATE INDEX "vault_event_vault_idx" ON "vault_event"("vault");

-- CreateIndex
CREATE INDEX "vault_snapshot_vault_ts_idx" ON "vault_snapshot"("vault", "ts");

-- CreateIndex
CREATE INDEX "points_ledger_user_idx" ON "points_ledger"("user");

-- CreateIndex
CREATE INDEX "points_ledger_user_periodEnd_idx" ON "points_ledger"("user", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_link_chatId_key" ON "telegram_link"("chatId");

-- CreateIndex
CREATE INDEX "curator_incident_curator_idx" ON "curator_incident"("curator");

-- AddForeignKey
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_fkey" FOREIGN KEY ("user") REFERENCES "user"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_link" ADD CONSTRAINT "telegram_link_user_fkey" FOREIGN KEY ("user") REFERENCES "user"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

