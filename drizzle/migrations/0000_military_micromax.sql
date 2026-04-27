CREATE TABLE "convention_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"convention_name" text DEFAULT '' NOT NULL,
	"start_date" date,
	"end_date" date,
	"weight_tolerance" real DEFAULT 0.5 NOT NULL,
	"weight_unit" text DEFAULT 'oz' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"bgg_id" integer NOT NULL,
	"copy_number" integer NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"game_type" text DEFAULT 'standard' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "id_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "id_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"type" text NOT NULL,
	"attendee_first_name" text,
	"attendee_last_name" text,
	"id_type" text,
	"checkout_weight" real,
	"checkin_weight" real,
	"note" text,
	"is_correction" boolean DEFAULT false NOT NULL,
	"related_transaction_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_related_transaction_id_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_games_bgg_id" ON "games" USING btree ("bgg_id");--> statement-breakpoint
CREATE INDEX "idx_games_status" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_games_game_type" ON "games" USING btree ("game_type");--> statement-breakpoint
CREATE INDEX "idx_transactions_game_id" ON "transactions" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_type" ON "transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_transactions_created_at" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_transactions_attendee" ON "transactions" USING btree ("attendee_first_name","attendee_last_name");