-- CreateTable
CREATE TABLE "PlayerDisplay" (
    "tvId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "mapState" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerDisplay_pkey" PRIMARY KEY ("tvId")
);
