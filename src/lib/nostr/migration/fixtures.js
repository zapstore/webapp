/**
 * Test fixtures for legacy → modern event migration.
 * Real events pulled from relay.zapstore.dev
 */

// ═══════════════════════════════════════════════════════════════════
// LEGACY EVENTS (kind 1063 file metadata)
// ═══════════════════════════════════════════════════════════════════

/** Real kind 1063 File Metadata event from relay.zapstore.dev */
export const LEGACY_FILE_1063_PEACH = {
	kind: 1063,
	id: '3756da026282ebdc4491ebb88ecf921d5745ab084498089c8f6badd408cc1332',
	pubkey: 'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
	created_at: 1775561577,
	tags: [
		['f', 'android-arm64-v8a'],
		['apk_signature_hash', 'c68262135866db32897c0853d832a1a59cae6b5bf3bc415d3829077de89e6c31'],
		['version', '0.69.0'],
		['version_code', '340'],
		['min_sdk_version', '24'],
		['target_sdk_version', '36'],
		['m', 'application/vnd.android.package-archive'],
		['x', 'd186ac80f3f617040392c41e29436e54eeb691104bf0416d7fa8a16cae3a996d'],
		['size', '54970334'],
		[
			'url',
			'https://github.com/Peach2Peach/peach-app/releases/download/v0.69.0%28340%29/app-prod-arm64-v8a-release.apk'
		],
		['url', 'https://cdn.zapstore.dev/d186ac80f3f617040392c41e29436e54eeb691104bf0416d7fa8a16cae3a996d']
	],
	content: 'com.peachbitcoin.peach.mainnet@0.69.0',
	sig: 'b87a41b4b7ed0da7288911131505bf61e411c4c744ffb0009b4998e80c4f071c88aca5e4de987142758bf3e28969e91755c1272c35d56e42feeacbae1148aa24'
};

/** Real kind 1063 File Metadata event - Shosho app */
export const LEGACY_FILE_1063_SHOSHO = {
	kind: 1063,
	id: '57e527ebdc550e2ae78ba33a45b0e492930e74af1816059a5f9f7570b6cb0c19',
	pubkey: '85df00a2f6a91845354c8d2d9fbab4002bb85b4225baeab60fafb2587c5038ea',
	created_at: 1775545234,
	tags: [
		['f', 'android-arm64-v8a'],
		['f', 'android-armeabi-v7a'],
		['apk_signature_hash', '58c7eb1f7691e9e9a2448be9814b0876fdf31a9df37397d24ee5be4b605d689b'],
		['version', '0.15.1'],
		['version_code', '27'],
		['min_sdk_version', '24'],
		['target_sdk_version', '35'],
		['m', 'application/vnd.android.package-archive'],
		['x', '912321175ebfc5016cfd23071d3ef609ca68e4742bd28ffdea8b56fe4cd3b743'],
		['size', '81742130'],
		['url', 'https://github.com/r0d8lsh0p/shosho-releases/releases/download/v0.15.1/shosho-0.15.1.apk'],
		['url', 'https://cdn.zapstore.dev/912321175ebfc5016cfd23071d3ef609ca68e4742bd28ffdea8b56fe4cd3b743']
	],
	content: 'com.shosho.app@0.15.1',
	sig: '11ea3a05b723b70717212d108ab21fa7ecd9810e9ce082a09760f46e5c0931569b5f0301357a2adef9200955b59f67c218d990933525c1fb1d22e6f136645d17'
};

/** Real kind 1063 File Metadata event - Meiso app */
export const LEGACY_FILE_1063_MEISO = {
	kind: 1063,
	id: 'f2163237732f9289ee0141a45504dc1ae155ec46a43e55999d8321aec789df34',
	pubkey: 'd7c6d014b342815ba29c48f3449e4f0073df84f4ad580ae173538041a6abb6b8',
	created_at: 1775504641,
	tags: [
		['f', 'android-arm64-v8a'],
		['f', 'android-armeabi-v7a'],
		['f', 'android-x86_64'],
		['apk_signature_hash', 'ba94cf068f152770bb90111e3ced0a365c3d8bea6434f49bc78a2989947c633c'],
		['version', '1.3.0'],
		['version_code', '377'],
		['min_sdk_version', '24'],
		['target_sdk_version', '36'],
		['m', 'application/vnd.android.package-archive'],
		['x', '7e98a1e42a4e8b3718009c64a7418af83f1a09b00f7bb2b3ab206dc801d8caa8'],
		['size', '49231483'],
		[
			'url',
			'https://github.com/higedamc/meiso/releases/download/v1.3.0/meiso-1.3.0%2B377-production.apk'
		],
		['url', 'https://cdn.zapstore.dev/7e98a1e42a4e8b3718009c64a7418af83f1a09b00f7bb2b3ab206dc801d8caa8']
	],
	content: 'jp.godzhigella.meiso@1.3.0',
	sig: '60ed4d5a5a5f8bbfd1a6bbc147f794b831e218ebe9c4d479d0eb441704b0b6b265ee3c3e6c6376f21e88bd0e0a891a1390b99a8edb6c8d0f89c4ec5127108c44'
};

// ═══════════════════════════════════════════════════════════════════
// MODERN EVENTS (kind 3063 asset)
// ═══════════════════════════════════════════════════════════════════

/** Real kind 3063 Software Asset event from relay.zapstore.dev */
export const MODERN_ASSET_3063_MERCASATS = {
	kind: 3063,
	id: '08d6ef327b3a2bb6a7a04985434606079349d4cce0ebe929f54f3ea8ee24df9c',
	pubkey: '0000000287d80000b421da1ef9556a969689c1c21d45582b6184cc5162799156',
	created_at: 1775842702,
	tags: [
		['i', 'com.kilombino.mercasats'],
		['x', 'de86f662adc9f3be9ee670d8fcbc925476d059f75cd06d6ba0586b6314187f68'],
		['version', '1.8.0'],
		[
			'url',
			'https://blossom.primal.net/de86f662adc9f3be9ee670d8fcbc925476d059f75cd06d6ba0586b6314187f68'
		],
		['m', 'application/vnd.android.package-archive'],
		['size', '3421344'],
		['f', 'android-arm64-v8a'],
		['f', 'android-armeabi-v7a'],
		['f', 'android-x86'],
		['f', 'android-x86_64'],
		['min_platform_version', '26'],
		['target_platform_version', '34'],
		['filename', 'mercasats-v1.8.0.apk'],
		['version_code', '13'],
		['apk_certificate_hash', 'e061195de1680cede938baa54979f5258a8148910091b4a888d0bb5170ff88ec']
	],
	content: '',
	sig: 'eddb22347f4a0281a9ce2fe6b4da84f428e00282746f29c7f002191ac7c96f78611e038c5482b566820e7b02ce82f1b1c637d9718755cd192b03425889d208a5'
};

/** Real kind 3063 Software Asset event - Thumb-Key */
export const MODERN_ASSET_3063_THUMBKEY = {
	kind: 3063,
	id: '1060fe983cdd1c714960c5c296517f9507b524a114ac4cd764c71e46eb71d9d2',
	pubkey: '78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d',
	created_at: 1775842936,
	tags: [
		['i', 'com.dessalines.thumbkey'],
		['x', 'ff18e65467811f78313faf9c0b3c8f35d971c3d017cbf2f50f29214c76906ace'],
		['version', '5.1.7'],
		['url', 'https://github.com/dessalines/thumb-key/releases/download/5.1.7/app-release.apk'],
		[
			'url',
			'https://cdn.zapstore.dev/ff18e65467811f78313faf9c0b3c8f35d971c3d017cbf2f50f29214c76906ace'
		],
		['m', 'application/vnd.android.package-archive'],
		['size', '4010797'],
		['f', 'android-x86'],
		['f', 'android-x86_64'],
		['f', 'android-arm64-v8a'],
		['f', 'android-armeabi-v7a'],
		['min_platform_version', '24'],
		['target_platform_version', '36'],
		['filename', '491e49677f2dad26ee83cb49276f0cb8_app-release.apk'],
		['version_code', '177'],
		['apk_certificate_hash', 'ea7195cfce638ae6b1a8002ddc0d4863366095ea5b8d95c1cd5e25db0fe2e7c3']
	],
	content: '',
	sig: '198124f7fb17a36ef836c480f0c4b79908e52b3bf26ee9017c4010a2c9e3dc5819ca51e5436865581107d8660939937bae3879271d83eb66621ed314c1044d8a'
};

// ═══════════════════════════════════════════════════════════════════
// MODERN RELEASE EVENTS (kind 30063)
// ═══════════════════════════════════════════════════════════════════

/** Real kind 30063 Software Release event - Thumb-Key */
export const MODERN_RELEASE_30063_THUMBKEY = {
	kind: 30063,
	id: '6751260c31710ba8e8efb15003e4fac45698bb70e30340f5fabc8f0d14519ed5',
	pubkey: '78ce6faa72264387284e647ba6938995735ec8c7d5c5a65737e55130f026307d',
	created_at: 1775842936,
	tags: [
		['i', 'com.dessalines.thumbkey'],
		['version', '5.1.7'],
		['d', 'com.dessalines.thumbkey@5.1.7'],
		['c', 'main'],
		['e', '1060fe983cdd1c714960c5c296517f9507b524a114ac4cd764c71e46eb71d9d2', 'wss://relay.zapstore.dev']
	],
	content:
		"## What's Changed\r\n\r\n* Adding freedroidwarn by @dessalines in https://github.com/dessalines/thumb-key/pull/1840\r\n\r\n**Full Changelog**: https://github.com/dessalines/thumb-key/compare/5.1.6...5.1.7",
	sig: '639659b24bdb245364219596094403f638c82717226442e46bae9456603f79833e5e44667308e05edc186a695249dccbe8f7b9759e4902ba933677e38be974b8'
};

/** Real kind 30063 Software Release event - MercaSats */
export const MODERN_RELEASE_30063_MERCASATS = {
	kind: 30063,
	id: '22a927cbcb9a738c3d929b385738ae6a35898922fa9efced47324454077df291',
	pubkey: '0000000287d80000b421da1ef9556a969689c1c21d45582b6184cc5162799156',
	created_at: 1775842702,
	tags: [
		['i', 'com.kilombino.mercasats'],
		['version', '1.8.0'],
		['d', 'com.kilombino.mercasats@1.8.0'],
		['c', 'main'],
		['e', '08d6ef327b3a2bb6a7a04985434606079349d4cce0ebe929f54f3ea8ee24df9c', 'wss://relay.zapstore.dev']
	],
	content:
		'- 📸 Fotos desde la galería al publicar anuncios (hasta 5)\n- Subida automática al servidor\n- Alternativa: pegar URL de foto\n- Previews con miniaturas antes de publicar',
	sig: 'adfebf526b5e1eb4f1f541166d5ad9dd08b0efe7c6d46d2b93b497795a06c52063a873a6edb21ec0549bc35b594f1d48d49e41edd76fbe24e5a39ff5091a2957'
};

// ═══════════════════════════════════════════════════════════════════
// SYNTHETIC LEGACY RELEASE (for testing - points to 1063 event)
// ═══════════════════════════════════════════════════════════════════

/** Synthetic legacy release pointing to kind 1063 file */
export const LEGACY_RELEASE_30063_PEACH = {
	kind: 30063,
	id: 'legacy-release-peach-test',
	pubkey: 'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
	created_at: 1775561600,
	tags: [
		['d', 'com.peachbitcoin.peach.mainnet@0.69.0'],
		[
			'a',
			'32267:a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2:com.peachbitcoin.peach.mainnet'
		],
		['e', '3756da026282ebdc4491ebb88ecf921d5745ab084498089c8f6badd408cc1332']
	],
	content: 'Bug fixes and performance improvements',
	sig: 'mock-signature'
};

/** Synthetic legacy app pointing to legacy release */
export const LEGACY_APP_32267_PEACH = {
	kind: 32267,
	id: 'legacy-app-peach-test',
	pubkey: 'a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2',
	created_at: 1775561500,
	tags: [
		['d', 'com.peachbitcoin.peach.mainnet'],
		['name', 'Peach Bitcoin'],
		['f', 'android-arm64-v8a'],
		['icon', 'https://cdn.zapstore.dev/peach-icon'],
		['repository', 'https://github.com/Peach2Peach/peach-app'],
		[
			'a',
			'30063:a47457722e10ba3a271fbe7040259a3c4da2cf53bfd1e198138214d235064fc2:com.peachbitcoin.peach.mainnet@0.69.0'
		]
	],
	content: 'P2P Bitcoin trading without KYC',
	sig: 'mock-signature'
};
