import type { ComponentInstance, EndpointHandler, MarkdownRenderOptions, Params, Props, Renderer, RouteData, SSRElement } from '../../@types/astro';
import type { LogOptions } from '../logger.js';

import { renderEndpoint, renderHead, renderToString } from '../../runtime/server/index.js';
import { getParams } from '../routing/index.js';
import { createResult } from './result.js';
import { findPathItemByKey, RouteCache, callGetStaticPaths } from './route-cache.js';
import { warn } from '../logger.js';

interface GetParamsAndPropsOptions {
	mod: ComponentInstance;
	route: RouteData | undefined;
	routeCache: RouteCache;
	pathname: string;
	logging: LogOptions;
}

export const enum GetParamsAndPropsError {
	NoMatchingStaticPath,
}

export async function getParamsAndProps(opts: GetParamsAndPropsOptions): Promise<[Params, Props] | GetParamsAndPropsError> {
	const { logging, mod, route, routeCache, pathname } = opts;
	// Handle dynamic routes
	let params: Params = {};
	let pageProps: Props;
	if (route && !route.pathname) {
		if (route.params.length) {
			const paramsMatch = route.pattern.exec(pathname);
			if (paramsMatch) {
				params = getParams(route.params)(paramsMatch);
			}
		}
		let routeCacheEntry = routeCache.get(route);
		// During build, the route cache should already be populated.
		// During development, the route cache is filled on-demand and may be empty.
		// TODO(fks): Can we refactor getParamsAndProps() to receive routeCacheEntry
		// as a prop, and not do a live lookup/populate inside this lower function call.
		if (!routeCacheEntry) {
			routeCacheEntry = await callGetStaticPaths(mod, route, true, logging);
			routeCache.set(route, routeCacheEntry);
		}
		const matchedStaticPath = findPathItemByKey(routeCacheEntry.staticPaths, params);
		if (!matchedStaticPath) {
			return GetParamsAndPropsError.NoMatchingStaticPath;
		}
		// Note: considered using Object.create(...) for performance
		// Since this doesn't inherit an object's properties, this caused some odd user-facing behavior.
		// Ex. console.log(Astro.props) -> {}, but console.log(Astro.props.property) -> 'expected value'
		// Replaced with a simple spread as a compromise
		pageProps = matchedStaticPath.props ? { ...matchedStaticPath.props } : {};
	} else {
		pageProps = {};
	}
	return [params, pageProps];
}

interface RenderOptions {
	legacyBuild: boolean;
	logging: LogOptions;
	links: Set<SSRElement>;
	markdownRender: MarkdownRenderOptions;
	mod: ComponentInstance;
	origin: string;
	pathname: string;
	scripts: Set<SSRElement>;
	resolve: (s: string) => Promise<string>;
	renderers: Renderer[];
	route?: RouteData;
	routeCache: RouteCache;
	site?: string;
}

export async function render(opts: RenderOptions): Promise<string> {
	const { legacyBuild, links, logging, origin, markdownRender, mod, pathname, scripts, renderers, resolve, route, routeCache, site } = opts;

	const paramsAndPropsRes = await getParamsAndProps({
		logging,
		mod,
		route,
		routeCache,
		pathname,
	});

	if (paramsAndPropsRes === GetParamsAndPropsError.NoMatchingStaticPath) {
		throw new Error(`[getStaticPath] route pattern matched, but no matching static path found. (${pathname})`);
	}
	const [params, pageProps] = paramsAndPropsRes;

	// For endpoints, render the content immediately without injecting scripts or styles
	if (route?.type === 'endpoint') {
		return renderEndpoint(mod as any as EndpointHandler, params);
	}

	// Validate the page component before rendering the page
	const Component = await mod.default;
	if (!Component) throw new Error(`Expected an exported Astro component but received typeof ${typeof Component}`);
	if (!Component.isAstroComponentFactory) throw new Error(`Unable to SSR non-Astro component (${route?.component})`);

	const result = createResult({
		legacyBuild,
		links,
		logging,
		markdownRender,
		origin,
		params,
		pathname,
		resolve,
		renderers,
		site,
		scripts,
	});

	let html = await renderToString(result, Component, pageProps, null);

	// handle final head injection if it hasn't happened already
	if (html.indexOf('<!--astro:head:injected-->') == -1) {
		html = (await renderHead(result)) + html;
	}
	// cleanup internal state flags
	html = html.replace('<!--astro:head:injected-->', '');

	// inject <!doctype html> if missing (TODO: is a more robust check needed for comments, etc.?)
	if (!legacyBuild && !/<!doctype html/i.test(html)) {
		html = '<!DOCTYPE html>\n' + html;
	}

	return html;
}
