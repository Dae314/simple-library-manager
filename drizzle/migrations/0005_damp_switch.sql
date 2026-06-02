ALTER TABLE "games" ALTER COLUMN "prize_type" SET DEFAULT 'normal';--> statement-breakpoint
UPDATE "games" SET "prize_type" = 'normal' WHERE "prize_type" = 'standard';
