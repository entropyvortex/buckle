import * as readline from 'node:readline';

/** Ask a yes/no question on stderr so --json stdout stays clean. Defaults to no. */
export async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    const ans = await new Promise<string>((resolve) => {
      rl.question(question, resolve);
    });
    const normalized = ans.trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}
