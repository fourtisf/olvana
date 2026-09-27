-- AlterTable
ALTER TABLE "alert_settings" ADD COLUMN     "liquidity" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "collateral_class" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'crypto';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "referralVoidReason" TEXT;

-- AlterTable
ALTER TABLE "vault_snapshot" ADD COLUMN     "netApy7d" DOUBLE PRECISION,
ADD COLUMN     "perfFee" DOUBLE PRECISION,
ADD COLUMN     "riskFlags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "utilization24h" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "status_notice" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "vault" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "status_notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "status_notice_active_idx" ON "status_notice"("active");

