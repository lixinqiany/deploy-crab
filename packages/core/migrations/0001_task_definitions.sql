CREATE TABLE `task_references` (
	`task_id` text NOT NULL,
	`referenced_task_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `referenced_task_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`referenced_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "task_references_self_check" CHECK("task_references"."task_id" <> "task_references"."referenced_task_id")
);
--> statement-breakpoint
CREATE INDEX `task_references_target_idx` ON `task_references` (`referenced_task_id`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text NOT NULL,
	`labels` text DEFAULT '[]' NOT NULL,
	`source_url` text,
	`definition` text NOT NULL,
	`revision` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "tasks_definition_json_check" CHECK(json_valid("tasks"."definition")),
	CONSTRAINT "tasks_revision_check" CHECK("tasks"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_name_key_unique` ON `tasks` (`name_key`);