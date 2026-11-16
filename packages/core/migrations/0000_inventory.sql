CREATE TABLE `cluster_member_groups` (
	`cluster_id` text NOT NULL,
	`host_id` text NOT NULL,
	`group_name` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`cluster_id`, `host_id`, `group_name`),
	FOREIGN KEY (`cluster_id`,`host_id`) REFERENCES `cluster_members`(`cluster_id`,`host_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cluster_member_groups_position_check" CHECK("cluster_member_groups"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cluster_member_groups_position_unique` ON `cluster_member_groups` (`cluster_id`,`host_id`,`position`);--> statement-breakpoint
CREATE TABLE `cluster_members` (
	`cluster_id` text NOT NULL,
	`host_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`cluster_id`, `host_id`),
	FOREIGN KEY (`cluster_id`) REFERENCES `clusters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`host_id`) REFERENCES `hosts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "cluster_members_position_check" CHECK("cluster_members"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cluster_members_position_unique` ON `cluster_members` (`cluster_id`,`position`);--> statement-breakpoint
CREATE INDEX `cluster_members_host_id_idx` ON `cluster_members` (`host_id`);--> statement-breakpoint
CREATE TABLE `clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clusters_name_key_unique` ON `clusters` (`name_key`);--> statement-breakpoint
CREATE TABLE `hosts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`public_address` text,
	`private_address` text,
	`connect_via` text NOT NULL,
	`port` integer NOT NULL,
	`user` text NOT NULL,
	`auth` text NOT NULL,
	`jump_host_id` text,
	`labels` text NOT NULL,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`jump_host_id`) REFERENCES `hosts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "hosts_port_check" CHECK("hosts"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "hosts_connect_via_check" CHECK("hosts"."connect_via" IN ('public', 'private')),
	CONSTRAINT "hosts_address_check" CHECK(("hosts"."connect_via" = 'public' AND "hosts"."public_address" IS NOT NULL) OR ("hosts"."connect_via" = 'private' AND "hosts"."private_address" IS NOT NULL)),
	CONSTRAINT "hosts_jump_self_check" CHECK("hosts"."jump_host_id" IS NULL OR "hosts"."jump_host_id" <> "hosts"."id"),
	CONSTRAINT "hosts_auth_json_check" CHECK(json_valid("hosts"."auth")),
	CONSTRAINT "hosts_labels_json_check" CHECK(json_valid("hosts"."labels"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hosts_name_key_unique` ON `hosts` (`name_key`);--> statement-breakpoint
CREATE INDEX `hosts_jump_host_id_idx` ON `hosts` (`jump_host_id`);