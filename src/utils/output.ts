import chalk from "chalk";

export function printHeader(title: string): void {
  console.log(chalk.bold.cyan(`\n${title}`));
}

export function printKeyValue(key: string, value: string): void {
  console.log(`${chalk.gray(key)} ${value}`);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
