CREATE TABLE `planning_guards` (
	`keyHash` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('token','idempotency') NOT NULL,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `planning_guards_keyHash` PRIMARY KEY(`keyHash`)
);
--> statement-breakpoint
CREATE TABLE `planning_rates` (
	`keyHash` varchar(64) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `planning_rates_keyHash` PRIMARY KEY(`keyHash`)
);
