function getRenderer() {
	return {
		name: '@astrojs/preact',
		clientEntrypoint: '@astrojs/preact/client',
		serverEntrypoint: '@astrojs/preact/server',
		jsxImportSource: 'preact',
		jsxTransformOptions: async () => {
			const {
				default: { default: jsx },
				// @ts-expect-error types not found
			} = await import('@babel/plugin-transform-react-jsx');
			return {
				plugins: [jsx({}, { runtime: 'automatic', importSource: 'preact' })],
			};
		},
	};
}

function getViteConfiguration() {
	return {
		optimizeDeps: {
			include: ['@astrojs/preact/client', 'preact', 'preact/jsx-runtime', 'preact-render-to-string'],
			exclude: ['@astrojs/preact/server'],
		},
		ssr: {
			external: ['preact-render-to-string'],
		},
	};
}

export default function () {
	return {
		name: '@astrojs/preact',
		hooks: {
			'astro:config:setup': ({ addRenderer }) => {
				addRenderer(getRenderer());
				return {
					vite: getViteConfiguration(),
				};
			},
		},
	};
}
