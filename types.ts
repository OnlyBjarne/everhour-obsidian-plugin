export type User = {
	id: number;
	name: string;
	email: string;
};

export type Task = {
	id: string;
	name: string;
	projects: string[];
};

type Status = "active" | "stopped";
export type Timer = {
	duration: number;
	status: Status;
	task: Task;
	today: number;
	startedAt: string;
	comment?: string;
	user: User;
};

export type Project = {
	id: string;
	name: string;
};
