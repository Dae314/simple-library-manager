ALTER TABLE "games" RENAME COLUMN "game_type" TO "prize_type";--> statement-breakpoint
ALTER INDEX "idx_games_game_type" RENAME TO "idx_games_prize_type";
