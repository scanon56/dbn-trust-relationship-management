// tests/setupEnv.ts
// Silence dotenv marketing/tip logs before modules load.
process.env.DOTENV_CONFIG_SILENT = 'true';
const originalLog = console.log;
console.log = (...args: any[]) => {
	if (args.length && typeof args[0] === 'string' && args[0].includes('[dotenv@')) {
		return; // suppress
	}
	return originalLog(...args);
};
