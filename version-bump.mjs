import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'manifest.json');
const packagePath = path.resolve(process.cwd(), 'package.json');
const versionsPath = path.resolve(process.cwd(), 'versions.json');

/** Bump the plugin version everywhere it is recorded. Usage: node version-bump.mjs 0.3.0 */
function main() {
	const targetVersion = process.argv[2];
	if (!targetVersion) {
		console.error('Usage: node version-bump.mjs <new-version>');
		process.exit(1);
	}
	if (!/^\d+\.\d+\.\d+$/.test(targetVersion)) {
		console.error(`Not a valid version: ${targetVersion}`);
		process.exit(1);
	}

	const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	const minAppVersion = manifest.minAppVersion;

	manifest.version = targetVersion;
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

	const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
	packageJson.version = targetVersion;
	fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, '  ') + '\n');

	let versions: Record<string, string> = {};
	if (fs.existsSync(versionsPath)) {
		versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
	}
	versions[targetVersion] = minAppVersion;
	fs.writeFileSync(versionsPath, JSON.stringify(versions, null, '\t') + '\n');

	console.log(`Bumped to ${targetVersion} (min app ${minAppVersion})`);
}

main();
