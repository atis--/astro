export default {
	name: '@atis/renderer-grommet',
	client: './client.js',
	server: './server.js',
	jsxImportSource: 'react',
	jsxTransformOptions: async () => {
		const {
			default: { default: jsx },
		} = await import('@babel/plugin-transform-react-jsx');
		return {
			plugins: [
				jsx(
					{},
					{
						runtime: 'automatic',
						importSource: '@atis/renderer-grommet',
					}
				),
			],
		};
	},
	viteConfig() {
		return {
			optimizeDeps: {
				include: ['@atis/renderer-grommet/client.js', 'react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom'],
				exclude: ['@atis/renderer-grommet/server.js'],
			},
			resolve: {
				dedupe: ['react', 'react-dom'],
			},
			ssr: {
				external: ['react-dom/server.js'],
			},
		};
	},
};
