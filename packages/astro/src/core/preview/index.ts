import type { AstroConfig } from '../../@types/astro';
import type { LogOptions } from '../logger';
import type { AddressInfo } from 'net';
import http from 'http';
import sirv from 'sirv';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import * as msg from '../messages.js';
import { error, info } from '../logger.js';
import { subpathNotUsedTemplate, notFoundTemplate } from '../../template/4xx.js';
import { getResolvedHostForHttpServer } from './util.js';

interface PreviewOptions {
	logging: LogOptions;
}

export interface PreviewServer {
	host?: string;
	port: number;
	server: http.Server;
	stop(): Promise<void>;
}

const HAS_FILE_EXTENSION_REGEXP = /^.*\.[^\\]+$/;

/** The primary dev action */
export default async function preview(config: AstroConfig, { logging }: PreviewOptions): Promise<PreviewServer> {
	const startServerTime = performance.now();
	const defaultOrigin = 'http://localhost';
	const trailingSlash = config.devOptions.trailingSlash;
	/** Base request URL. */
	let baseURL = new URL(config.buildOptions.site || '/', defaultOrigin);
	const staticFileServer = sirv(fileURLToPath(config.dist), {
		dev: true,
		etag: true,
		maxAge: 0,
	});
	// Create the preview server, send static files out of the `dist/` directory.
	const server = http.createServer((req, res) => {
		const requestURL = new URL(req.url as string, defaultOrigin);

		// respond 404 to requests outside the base request directory
		if (!requestURL.pathname.startsWith(baseURL.pathname)) {
			res.statusCode = 404;
			res.end(subpathNotUsedTemplate(baseURL.pathname, requestURL.pathname));
			return;
		}

		/** Relative request path. */
		const pathname = requestURL.pathname.slice(baseURL.pathname.length - 1);

		const isRoot = pathname === '/';
		const hasTrailingSlash = isRoot || pathname.endsWith('/');

		function sendError(message: string) {
			res.statusCode = 404;
			res.end(notFoundTemplate(pathname, message));
		}

		switch (true) {
			case hasTrailingSlash && trailingSlash == 'never' && !isRoot:
				sendError('Not Found (devOptions.trailingSlash is set to "never")');
				return;
			case !hasTrailingSlash && trailingSlash == 'always' && !isRoot && !HAS_FILE_EXTENSION_REGEXP.test(pathname):
				sendError('Not Found (devOptions.trailingSlash is set to "always")');
				return;
			default: {
				// HACK: rewrite req.url so that sirv finds the file
				req.url = '/' + req.url?.replace(baseURL.pathname, '');
				staticFileServer(req, res, () => sendError('Not Found'));
				return;
			}
		}
	});

	let { port } = config.devOptions;
	const host = getResolvedHostForHttpServer(config);

	let httpServer: http.Server;

	/** Expose dev server to `port` */
	function startServer(timerStart: number): Promise<void> {
		let showedPortTakenMsg = false;
		let showedListenMsg = false;
		return new Promise<void>((resolve, reject) => {
			const listen = () => {
				httpServer = server.listen(port, host, async () => {
					if (!showedListenMsg) {
						const devServerAddressInfo = server.address() as AddressInfo;
						info(logging, null, msg.devStart({ startupTime: performance.now() - timerStart, config, devServerAddressInfo, https: false, site: baseURL }));
					}
					showedListenMsg = true;
					resolve();
				});
				httpServer?.on('error', onError);
			};

			const onError = (err: NodeJS.ErrnoException) => {
				if (err.code && err.code === 'EADDRINUSE') {
					if (!showedPortTakenMsg) {
						info(logging, 'astro', msg.portInUse({ port }));
						showedPortTakenMsg = true; // only print this once
					}
					port++;
					return listen(); // retry
				} else {
					error(logging, 'astro', err.stack);
					httpServer?.removeListener('error', onError);
					reject(err); // reject
				}
			};

			listen();
		});
	}

	// Start listening on `hostname:port`.
	await startServer(startServerTime);

	return {
		host,
		port,
		server: httpServer!,
		stop: async () => {
			await new Promise((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve(undefined)));
			});
		},
	};
}
