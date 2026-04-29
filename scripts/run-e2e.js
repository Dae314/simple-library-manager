import { execSync } from 'child_process';

let exitCode = 0;

try {
	execSync('npx playwright test', { stdio: 'inherit' });
} catch (error) {
	exitCode = error.status ?? 1;
} finally {
	execSync('npm run test:e2e:teardown', { stdio: 'inherit' });
}

process.exit(exitCode);
