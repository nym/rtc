export interface CommandBase {
  commandId: string;
}

export type DashboardCommand = CommandBase & {
  kind: 'worker.kill';
  workerId: string;
};
