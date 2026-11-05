CREATE TABLE `one_time_prekeys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`opk_pub` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `one_time_prekeys_user_key_unique` ON `one_time_prekeys` (`user_id`,`opk_pub`);--> statement-breakpoint
CREATE TABLE `user_keys` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`ik_pub` text NOT NULL,
	`spk_pub` text NOT NULL,
	`sig` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `iv` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `ek_pub` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `opk_pub` text;