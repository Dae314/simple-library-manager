CREATE TABLE "attendees" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"id_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "shelf_category" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "attendee_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_attendees_name_unique" ON "attendees" USING btree (LOWER(TRIM("first_name")),LOWER(TRIM("last_name")));--> statement-breakpoint
CREATE INDEX "idx_attendees_first_name" ON "attendees" USING btree ("first_name");--> statement-breakpoint
CREATE INDEX "idx_attendees_last_name" ON "attendees" USING btree ("last_name");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_games_shelf_category" ON "games" USING btree ("shelf_category");--> statement-breakpoint
CREATE INDEX "idx_transactions_attendee_id" ON "transactions" USING btree ("attendee_id");