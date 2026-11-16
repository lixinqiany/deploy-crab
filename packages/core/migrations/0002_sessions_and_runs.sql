CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`parent_run_id` text,
	`request_id` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`snapshot` text NOT NULL,
	`plan` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `runs_session_created_idx` ON `runs` (`session_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `runs_parent_idx` ON `runs` (`parent_run_id`);--> statement-breakpoint
CREATE INDEX `runs_request_idx` ON `runs` (`session_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `runs_status_idx` ON `runs` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`draft` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
