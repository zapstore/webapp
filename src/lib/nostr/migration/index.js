/**
 * Migration module exports
 */

// App migration (1063 → 3063)
export {
	isLegacyRelease,
	isModernRelease,
	transformFile1063ToAsset3063,
	transformLegacyRelease,
	updateAppWithNewRelease,
	migrateApp
} from './migration.js';

// Stack migration (add missing h/f tags)
export {
	stackNeedsMigration,
	getStackMissingTags,
	transformStackForMigration,
	migrateStack
} from './stack-migration.js';
