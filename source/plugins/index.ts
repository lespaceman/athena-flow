export {registerPlugins} from './register.js';
export {readConfig, readGlobalConfig} from './config.js';
export type {AthenaConfig} from './config.js';
export {isMarketplaceRef, resolveMarketplacePlugin} from './marketplace.js';
export type {MarketplaceManifest, MarketplaceEntry} from './marketplace.js';
export type {
	PluginManifest,
	SkillFrontmatter,
	ParsedSkill,
	LoadedPlugin,
} from './types.js';
