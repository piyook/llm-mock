<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import SettingEditor from './SettingEditor.svelte';
	import Toggle from './Toggle.svelte';
	import {
		changeRuntimeSettings,
		clearRequestLog,
		fetchPing,
		fetchRequestLog,
		fetchRuleFile,
		fetchStoredResponses,
		fetchUiMeta,
		resetRuntimeChanges,
		type UiMeta,
	} from './api.js';

	// What the viewer dialog shows: a pool of stored responses or the logged
	// requests (`texts`, one block each), or a single rule fixture (one block,
	// exactly as written). `note` follows the source in the header. A `paged`
	// view shows one block at a time with back/next; `clearable` adds the
	// button that empties the request log.
	type Viewer = {
		title: string;
		source: string;
		note?: string;
		paged?: boolean;
		clearable?: boolean;
		texts: string[] | null;
		error: string | null;
	};
	type Loaded = Partial<Omit<Viewer, 'texts' | 'error'>> & { texts: string[] };

	// The pages of the dashboard, in the order the sidebar lists them. Each is
	// reached by its hash (`#/settings`); anything else shows the overview.
	const pages = [
		{
			id: 'overview',
			title: 'Overview',
			icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
		},
		{
			id: 'settings',
			title: 'Settings',
			icon: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 5v4M9 15v4',
		},
		{
			id: 'rules',
			title: 'Response rules',
			icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
		},
	] as const;
	type Route = (typeof pages)[number]['id'];

	function routeFromHash(): Route {
		const id = window.location.hash.replace(/^#\/?/, '');
		return pages.find((item) => item.id === id)?.id ?? 'overview';
	}

	let route: Route = routeFromHash();

	// A new page starts from its top
	function showRoute() {
		route = routeFromHash();
		window.scrollTo(0, 0);
	}

	type Theme = UiMeta['uiTheme'];
	// Also read by the script in index.html, before the page is drawn
	const THEME_KEY = 'llmock-theme';
	// The moon beside the sidebar's switch
	const darkIcon = 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z';

	// The theme picked with the sidebar's switch, kept by the browser; null
	// until one is picked, or if the browser keeps nothing
	function pickedTheme(): Theme | null {
		try {
			const picked = window.localStorage.getItem(THEME_KEY);
			return picked === 'light' || picked === 'dark' ? picked : null;
		} catch {
			return null;
		}
	}

	// The theme in view: the one picked here, otherwise the server's
	let theme: Theme =
		pickedTheme() ??
		(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

	function switchTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try {
			window.localStorage.setItem(THEME_KEY, theme);
		} catch {
			// Not kept, so the next visit starts from the server's theme
		}
	}

	let meta: UiMeta | null = null;
	let online: boolean | null = null;
	let error: string | null = null;
	let timer: number | null = null;
	let viewer: Viewer | null = null;
	let dialog: HTMLDialogElement;
	// Block shown by a paged view, and whether it is asking to confirm a clear
	let page = 0;
	let confirmingClear = false;
	// The admin card's reset: whether it is asking to confirm, and why it failed
	let confirmingReset = false;
	let resetError: string | null = null;

	// The switches on the cards work through the admin API, so they are only
	// there while it is on
	$: canChange = meta?.adminApi === 'ENABLED';
	// The card whose switch failed, and why
	let changeError: { card: string; message: string } | null = null;

	// Stored responses longer than this scroll inside a fixed height window
	const SCROLL_AFTER = 4;
	$: ruleCount = meta?.responseRules?.length ?? 0;
	// Rules added through the admin API while the server runs
	// Runtime rules are listed first, so a config rule's place among the config
	// rules (what /ui-rule-file goes by) is its place in the list less this
	$: runtimeRuleCount =
		meta?.responseRules?.filter((rule) => rule.source === 'runtime').length ?? 0;

	// Requests are only logged with both settings on
	$: loggingOn =
		meta?.logRequests?.toUpperCase() === 'ON' &&
		meta?.validateRequests?.toUpperCase() === 'ON';

	// What the overview lists as on or off, with a word on how each is set
	$: features = meta
		? [
				{ name: 'Streaming', on: meta.streamingStatus === 'ENABLED', detail: '' },
				{
					name: 'Response delay',
					on: meta.delayStatus === 'ENABLED',
					detail: meta.delayStatus === 'ENABLED' ? delayLabel(meta) : '',
				},
				{
					name: 'Chaos',
					on: meta.chaosStatus === 'ENABLED',
					detail: meta.chaosStatus === 'ENABLED' ? chaosFrequencyLabel(meta) : '',
				},
				{
					name: 'Embeddings',
					on: meta.embeddingsEnabled === 'ENABLED',
					detail:
						meta.embeddingsEnabled === 'ENABLED'
							? `${meta.embeddingDimension} dimensions`
							: '',
				},
				{ name: 'Request validation', on: meta.validateRequests?.toUpperCase() === 'ON', detail: '' },
				{
					name: 'Request log',
					on: meta.logRequests?.toUpperCase() === 'ON',
					detail: `last ${meta.maxLoggedRequests}`,
				},
				{ name: 'Debug mode', on: meta.debugMode === 'ON', detail: '' },
				{ name: 'Admin API', on: meta.adminApi === 'ENABLED', detail: '' },
			]
		: [];

	// Opens the dialog straight away and fills it once `load` settles; a
	// result for a view that has since been replaced is dropped
	async function openViewer(
		title: string,
		source: string,
		load: () => Promise<Loaded>,
	) {
		const opened: Viewer = { title, source, texts: null, error: null };
		viewer = opened;
		page = 0;
		confirmingClear = false;
		if (!dialog.open) dialog.showModal();

		try {
			const loaded = await load();
			if (viewer === opened) viewer = { ...opened, ...loaded };
		} catch (e) {
			if (viewer === opened) {
				viewer = {
					...opened,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}
	}

	function viewStoredResponses() {
		void openViewer(
			'Stored responses',
			meta?.storedResponsesFile ?? 'Bundled responses',
			async () => {
				const { file, responses } = await fetchStoredResponses();
				return {
					source: file ?? 'Bundled responses',
					note:
						responses.length > 1
							? `${responses.length} responses, one picked at random per request`
							: undefined,
					texts: responses,
				};
			},
		);
	}

	function viewRuleFile(match: string, file: string, rule: number, index: number) {
		void openViewer(`Reply when request contains "${match}"`, file, async () => {
			const { content } = await fetchRuleFile(rule, index);
			return { texts: [content] };
		});
	}

	// A rule that holds its reply as text has no file to fetch
	function viewRuleText(match: string, text: string) {
		void openViewer(`Reply when request contains "${match}"`, 'Text held by the rule', async () => ({
			texts: [text],
		}));
	}

	// Changes a setting on the running server, then shows the settings as they
	// now are. Resolves to whether the change was made.
	async function change(
		card: string,
		route: 'settings' | 'chaos' | 'delay',
		setting: object,
	): Promise<boolean> {
		try {
			await changeRuntimeSettings(route, setting);
			changeError = null;
			await refresh();
			return true;
		} catch (e) {
			changeError = { card, message: e instanceof Error ? e.message : String(e) };
			return false;
		}
	}

	// Undoes what the admin API changed, then shows the settings as they now are
	async function resetRuntime() {
		confirmingReset = false;
		try {
			await resetRuntimeChanges();
			resetError = null;
			changeError = null;
			await refresh();
		} catch (e) {
			resetError = e instanceof Error ? e.message : String(e);
		}
	}

	function viewRequestLog() {
		void openViewer('Last logged requests', 'Request log', async () => {
			const { file, log } = await fetchRequestLog();
			// A log from an older llmock may not be an array
			const entries = log === null ? [] : Array.isArray(log) ? log : [log];
			if (entries.length === 0) {
				return {
					source: file,
					paged: true,
					texts: [
						'No request has been logged yet. Turn on Request Validation and Request Log, then send a POST request.',
					],
				};
			}

			return {
				source: file,
				// The log file outlives a restart, so it can hold requests
				// from a run that had logging on
				note: loggingOn
					? 'newest first'
					: 'newest first · logging is off, these were logged earlier',
				paged: true,
				clearable: true,
				texts: entries.map((entry) => JSON.stringify(entry, null, 2)),
			};
		});
	}

	// Empties the request log, then shows the now empty view. A failure is
	// shown in place of the log.
	async function clearLog() {
		const clearing = viewer;
		confirmingClear = false;
		try {
			await clearRequestLog();
			if (viewer === clearing) viewRequestLog();
		} catch (e) {
			if (viewer === clearing && clearing) {
				viewer = {
					...clearing,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}
	}

	// Moves a paged view back or forward, stopping at either end
	function turnPage(step: number) {
		const last = (viewer?.texts?.length ?? 1) - 1;
		page = Math.min(Math.max(page + step, 0), last);
	}

	// The delay range as one value: "Off", "200ms" or "200–500ms"
	function delayLabel(m: UiMeta | null): string {
		if (!m || m.delayStatus !== 'ENABLED') return 'Off';
		const { responseDelayMinMs: min, responseDelayMaxMs: max } = m;
		return min === max ? `${min}ms` : `${min}–${max}ms`;
	}

	// How often a call fails: "Every call", "Every 3 calls" or "Random, 1 in 3"
	function chaosFrequencyLabel(m: UiMeta): string {
		if (m.chaosFrequency <= 1) return 'Every call';
		return m.chaosMode === 'random'
			? `Random, 1 in ${m.chaosFrequency}`
			: `Every ${m.chaosFrequency} calls`;
	}

	// When a failing stream is cut: "Straight away", "After 1 delta" or "After 3 deltas"
	function chaosAfterChunksLabel(m: UiMeta): string {
		if (m.chaosAfterChunks === 0) return 'Straight away';
		return `After ${m.chaosAfterChunks} ${m.chaosAfterChunks === 1 ? 'delta' : 'deltas'}`;
	}

	// How a failing rule fails, e.g. "http 529" or "stream-drop after 2 deltas".
	// Only the kinds that send an error have a status worth showing.
	function ruleFailLabel(fail: NonNullable<UiMeta['responseRules'][number]['fail']>): string {
		if (fail.kind === 'http') return `http ${fail.status}`;
		const status = fail.kind === 'stream-error' ? ` ${fail.status}` : '';
		const deltas = `${fail.afterChunks} ${fail.afterChunks === 1 ? 'delta' : 'deltas'}`;
		return `${fail.kind}${status} after ${deltas}`;
	}

	async function refresh() {
		try {
			const [m, p] = await Promise.all([fetchUiMeta(), fetchPing()]);
			meta = m;
			online = p;
			// The server sets its theme on the page it serves; this covers
			// the dashboard run on its own with `npm run ui-dev`. A theme
			// picked here wins over the server's.
			theme = pickedTheme() ?? m.uiTheme;
			document.documentElement.dataset.theme = theme;
			// Cleared only on success, so the message doesn't blink on every
			// retry while the server is down
			error = null;
		} catch (e) {
			online = false;
			error = e instanceof Error ? e.message : String(e);
		}
	}

	onMount(() => {
		void refresh();
		timer = window.setInterval(() => void refresh(), 2000);
	});

	onDestroy(() => {
		if (timer) window.clearInterval(timer);
	});
</script>

<svelte:window on:hashchange={showRoute} />

<div class="shell">
	<aside class="sidebar">
		<a class="brand" href="#/">
			<img src="/favicon.svg" alt="" width="28" height="28" />
			<span>llmock</span>
		</a>

		<nav class="nav" aria-label="Pages">
			{#each pages as item (item.id)}
				<a
					class="navLink"
					class:active={route === item.id}
					href={item.id === 'overview' ? '#/' : `#/${item.id}`}
					aria-current={route === item.id ? 'page' : undefined}
					cy-data="nav_{item.id}"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg>
					<span>{item.title}</span>
					{#if item.id === 'rules'}
						<span class="navCount">{ruleCount}</span>
					{/if}
				</a>
			{/each}
		</nav>

		<p class="navGroup">Server</p>
		<dl class="facts" cy-data="server_facts">
			<div class="fact">
				<dt>Port</dt>
				<dd>{meta?.serverPort ?? '–'}</dd>
			</div>
			<div class="fact">
				<dt>Template</dt>
				<dd>{meta?.llmName || '–'}</dd>
			</div>
			<div class="fact">
				<dt>Model</dt>
				<dd title={meta?.llmModel}>{meta?.llmModel || '–'}</dd>
			</div>
		</dl>

		<button
			class="navLink themeSwitch"
			cy-data="theme_switch"
			role="switch"
			aria-checked={theme === 'dark'}
			title="Kept by this browser. The server's own theme is set with uiTheme"
			on:click={switchTheme}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={darkIcon} /></svg>
			<span>Dark mode</span>
			<span class="toggle" class:on={theme === 'dark'}><span class="toggleThumb"></span></span>
		</button>
		<p class="sidebarFoot muted">Refreshes every 2 seconds</p>
	</aside>

	<main>
		<header class="pageHeader">
			<div class="titleRow">
				<h1>{pages.find((item) => item.id === route)?.title}</h1>
				<div class="titleGroup">
					{#if meta?.version}
						<span class="versionPill" cy-data="llmock_version" title="llmock version">
							v{meta.version}
						</span>
					{/if}
					{#if online === null}
						<div class="statusPill statusOffline" cy-data="server_status">Checking…</div>
					{:else if online}
						<div class="statusPill statusOnline" cy-data="server_status">Running</div>
					{:else}
						<div class="statusPill statusOffline" cy-data="server_status">Not Running</div>
					{/if}
				</div>
			</div>
			<p class="errorLine muted">{error ?? ''}</p>
		</header>

		{#if route === 'overview'}
			<div class="tiles">
				<a class="tile" href="#/settings" cy-data="tile_model">
					<span class="tileLabel">Model</span>
					<span class="tileValue">{meta?.llmName || 'None'}</span>
					<span class="tileNote">{meta?.llmModel || 'No model name'}</span>
				</a>
				<a class="tile" href="#/settings" cy-data="tile_responses">
					<span class="tileLabel">Responses</span>
					<span class="tileValue">{meta?.mockResponseType || 'None'}</span>
					<span class="tileNote">
						{meta?.delayStatus === 'ENABLED' ? `${delayLabel(meta)} delay` : 'No delay'}
					</span>
				</a>
				<a class="tile" href="#/settings" cy-data="tile_chaos">
					<span class="tileLabel">Chaos</span>
					<span class="tileValue">
						{meta?.chaosStatus === 'ENABLED' ? chaosFrequencyLabel(meta) : 'Off'}
					</span>
					<span class="tileNote">
						{meta?.chaosInjected ?? 0}
						{meta?.chaosInjected === 1 ? 'error' : 'errors'} injected
					</span>
				</a>
				<a class="tile" href="#/rules" cy-data="tile_rules">
					<span class="tileLabel">Response rules</span>
					<span class="tileValue">{ruleCount}</span>
					<span class="tileNote">{runtimeRuleCount} added while running</span>
				</a>
				<a class="tile" href="#/settings" cy-data="tile_request_log">
					<span class="tileLabel">Request log</span>
					<span class="tileValue">{loggingOn ? 'On' : 'Off'}</span>
					<span class="tileNote">Keeps the last {meta?.maxLoggedRequests ?? 10}</span>
				</a>
			</div>

			<div class="columns">
				<div class="column">
					<section class="card" cy-data="connect">
						<h2>Connect</h2>
						<div class="grid">
							<div class="kv kvWide">
								<span class="muted">Base URL</span>
								<span class="badge">http://localhost:{meta?.serverPort ?? ''}</span>
							</div>
						</div>
						<p class="muted groupLabel">Endpoints (GET &amp; POST)</p>
						<div class="endpoints">
							{#each meta?.apiLinks ?? [] as link (link.href)}
								<a class="endpointLink" href={link.href}>{link.label}</a>
							{/each}
						</div>
					</section>

					<section class="card" cy-data="request_log">
						<h2>Request log</h2>
						<p class="muted cardLead">
							{#if loggingOn}
								POST requests are being logged, newest first.
							{:else}
								Requests are not being logged. <code>validateRequests</code> and
								<code>logRequests</code> must both be on to log POST requests.
							{/if}
						</p>
						<div class="cardActions">
							<button
								class="fileLink"
								cy-data="request_log_link"
								title={`View the last ${meta?.maxLoggedRequests ?? 10} logged requests`}
								on:click={viewRequestLog}
							>
								View request log
							</button>
							<a class="fileLink" href="#/settings">Logging settings</a>
						</div>
					</section>
				</div>

				<div class="column">
					<section class="card" cy-data="features">
						<div class="cardHead">
							<h2>At a glance</h2>
							<a class="fileLink switch" href="#/settings">Settings</a>
						</div>
						<div class="featureList">
							{#each features as feature (feature.name)}
								<div class="kv" cy-data="feature">
									<span class="muted">{feature.name}</span>
									<span class="kvValue">
										{#if feature.detail}<span class="muted">{feature.detail}</span>{/if}
										<span class="state" class:on={feature.on}>{feature.on ? 'On' : 'Off'}</span>
									</span>
								</div>
							{/each}
						</div>
					</section>
				</div>
			</div>
		{:else if route === 'settings'}
			<div class="columns">
				<div class="column">
					<section class="card" cy-data="model">
						<h2>Model</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">LLM Template</span>
								<span class="badge">{meta?.llmName || 'None'}</span>
							</div>
							<div class="kv">
								<span class="muted">Model Name</span>
								<span class="badge">{meta?.llmModel || 'None'}</span>
							</div>
							<div class="kv">
								<span class="muted">Streaming</span>
								<span class="kvValue">
									<span class="badge" cy-data="streaming_status">
										{meta?.streamingStatus ?? 'DISABLED'}
									</span>
									<!-- The claude template streams when a request asks it to -->
									{#if canChange && meta?.llmName !== 'claude'}
										<Toggle
											name="switch_streaming"
											label="Streaming"
											on={meta?.streamingStatus === 'ENABLED'}
											on:click={() =>
												change('model', 'settings', { stream: meta?.streamingStatus !== 'ENABLED' })}
										/>
									{/if}
								</span>
							</div>
						</div>
						{#if changeError?.card === 'model'}
							<p class="viewerError cardNote" cy-data="change_error">{changeError.message}</p>
						{/if}
					</section>

					<section class="card" cy-data="responses">
						<h2>Responses</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">Response Type</span>
								<span class="kvValue">
									<span class="badge" cy-data="response_type">{meta?.mockResponseType || 'None'}</span>
									{#if canChange}
										<button
											class="fileLink switch"
											cy-data="switch_response_type"
											title="Changes this on the running server. Reset or a restart puts it back"
											on:click={() => change('responses', 'settings', {
													responseType: meta?.mockResponseType === 'stored' ? 'lorem' : 'stored',
												})}
										>
											Use {meta?.mockResponseType === 'stored' ? 'lorem' : 'stored'}
										</button>
									{/if}
								</span>
							</div>
							<div class="kv">
								<span class="muted">Response Delay</span>
								<SettingEditor
									name="delay"
									{canChange}
									fields={[
										{ key: 'min', label: 'min ms', value: meta?.responseDelayMinMs ?? 0, min: 0 },
										{ key: 'max', label: 'max ms', value: meta?.responseDelayMaxMs ?? 0, min: 0 },
									]}
									save={(values) => change('responses', 'delay', values)}
								>
									<span class="badge" cy-data="response_delay">{delayLabel(meta)}</span>
								</SettingEditor>
							</div>
							{#if meta?.mockResponseType === 'lorem'}
								<div class="kv">
									<span class="muted">Maximum sentences</span>
									<SettingEditor
										name="max_lorem"
										{canChange}
										fields={[{ key: 'maxLoremParas', value: meta?.maxLoremParas ?? 5, min: 1, max: 1000 }]}
										save={(values) => change('responses', 'settings', values)}
									>
										<span class="badge" cy-data="max_lorem">{meta?.maxLoremParas ?? 'None'}</span>
									</SettingEditor>
								</div>
							{:else if meta?.mockResponseType === 'stored'}
								<div class="kv">
									<span class="muted">Total Stored Responses</span>
									<span class="badge">{meta?.storedResponsesCount ?? 0}</span>
								</div>
								<div class="kv kvWide">
									<span class="muted">Stored Responses File</span>
									<button
										class="fileLink"
										cy-data="stored_responses_link"
										title="View the stored responses"
										on:click={viewStoredResponses}
									>
										{meta?.storedResponsesFile ?? 'Bundled'}
									</button>
								</div>
							{/if}
						</div>
						{#if changeError?.card === 'responses'}
							<p class="viewerError cardNote" cy-data="change_error">{changeError.message}</p>
						{/if}
					</section>

					<section class="card" cy-data="diagnostics">
						<h2>Diagnostics</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">Request Validation</span>
								<span class="kvValue">
									<span class="badge" cy-data="validate_requests">{meta?.validateRequests || 'OFF'}</span>
									{#if canChange}
										<Toggle
											name="switch_validate_requests"
											label="Request Validation"
											on={meta?.validateRequests === 'ON'}
											on:click={() => change('diagnostics', 'settings', { validateRequests: meta?.validateRequests !== 'ON' })}
										/>
									{/if}
								</span>
							</div>
							<div class="kv">
								<span class="muted">Debug Mode</span>
								<span class="badge">{meta?.debugMode ?? 'OFF'}</span>
							</div>
							<div class="kv">
								<span class="muted">Request Log</span>
								<span class="kvValue">
									<span class="badge" cy-data="log_requests">{meta?.logRequests || 'OFF'}</span>
									{#if canChange}
										<Toggle
											name="switch_log_requests"
											label="Request Log"
											on={meta?.logRequests?.toUpperCase() === 'ON'}
											on:click={() => change('diagnostics', 'settings', { logRequests: meta?.logRequests?.toUpperCase() !== 'ON' })}
										/>
									{/if}
								</span>
							</div>
							<div class="kv">
								<span class="muted">Max Logged Requests</span>
								<SettingEditor
									name="max_logged_requests"
									{canChange}
									fields={[{ key: 'maxLoggedRequests', value: meta?.maxLoggedRequests ?? 10, min: 1, max: 100 }]}
									save={(values) => change('diagnostics', 'settings', values)}
								>
									<span class="badge" cy-data="max_logged_requests">{meta?.maxLoggedRequests ?? 10}</span>
								</SettingEditor>
							</div>
							<div class="kv kvWide">
								<span class="muted">Last Logged Requests</span>
								<button
									class="fileLink"
									cy-data="request_log_link"
									title={`View the last ${meta?.maxLoggedRequests ?? 10} logged requests`}
									on:click={viewRequestLog}
								>
									View request log
								</button>
							</div>
						</div>
						{#if changeError?.card === 'diagnostics'}
							<p class="viewerError cardNote" cy-data="change_error">{changeError.message}</p>
						{/if}
						<p class="muted cardNote" cy-data="max_logged_requests_note">
							The log keeps the last {meta?.maxLoggedRequests ?? 10} requests. To change this,
							set <code>maxLoggedRequests</code> (1 to 100) in the model preset in
							<code>.llmockrc.json</code>, or start with
							<code>--maxLoggedRequests=&lt;num&gt;</code>.
						</p>
					</section>
				</div>

				<div class="column">
					<section class="card" cy-data="chaos">
						<h2>Chaos</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">Chaos</span>
								<span class="kvValue">
									<span class="badge" cy-data="chaos_status">{meta?.chaosStatus ?? 'DISABLED'}</span>
									{#if canChange}
										<Toggle
											name="switch_chaos"
											label="Chaos"
											on={meta?.chaosStatus === 'ENABLED'}
											on:click={() => change('chaos', 'chaos', { enabled: meta?.chaosStatus !== 'ENABLED' })}
										/>
									{/if}
								</span>
							</div>
							{#if meta?.chaosStatus === 'ENABLED'}
								<div class="kv">
									<span class="muted">Error Frequency</span>
									<SettingEditor
										name="chaos_frequency"
										{canChange}
										fields={[
											{ key: 'frequency', label: '1 in', value: meta.chaosFrequency, min: 1 },
											{ key: 'mode', value: meta.chaosMode, options: ['every', 'random'] },
										]}
										save={(values) => change('chaos', 'chaos', values)}
									>
										<span class="badge" cy-data="chaos_frequency">{chaosFrequencyLabel(meta)}</span>
									</SettingEditor>
								</div>
								<div class="kv">
									<span class="muted">Error Status</span>
									<SettingEditor
										name="chaos_status"
										{canChange}
										fields={[{ key: 'status', value: meta.chaosErrorStatus, min: 400, max: 599 }]}
										save={(values) => change('chaos', 'chaos', values)}
									>
										<span class="badge" cy-data="chaos_error_status">{meta.chaosErrorStatus}</span>
									</SettingEditor>
								</div>
								<div class="kv">
									<span class="muted">Failure Kind</span>
									<SettingEditor
										name="chaos_kind"
										{canChange}
										fields={[
											{
												key: 'kind',
												value: meta.chaosKind,
												options: ['http', 'stream-error', 'stream-drop', 'stream-stall'],
											},
										]}
										save={(values) => change('chaos', 'chaos', values)}
									>
										<span class="badge" cy-data="chaos_kind">{meta.chaosKind}</span>
									</SettingEditor>
								</div>
								{#if meta.chaosKind !== 'http'}
									<div class="kv">
										<span class="muted">Streams Fail</span>
										<SettingEditor
											name="chaos_after_chunks"
											{canChange}
											fields={[{ key: 'afterChunks', label: 'after deltas', value: meta.chaosAfterChunks, min: 0 }]}
											save={(values) => change('chaos', 'chaos', values)}
										>
											<span class="badge" cy-data="chaos_after_chunks">{chaosAfterChunksLabel(meta)}</span>
										</SettingEditor>
									</div>
								{/if}
								<div class="kv">
									<span class="muted">Errors Injected</span>
									<span class="badge" cy-data="chaos_injected">{meta.chaosInjected}</span>
								</div>
							{/if}
						</div>
						{#if changeError?.card === 'chaos'}
							<p class="viewerError cardNote" cy-data="change_error">{changeError.message}</p>
						{/if}
						<p class="muted cardNote" cy-data="chaos_note">
							Chaos answers some calls with an HTTP error in place of a reply, or fails a
							stream part-way through. Set <code>chaos</code> (<code>enabled</code>,
							<code>frequency</code>, <code>mode</code>, <code>status</code>, <code>kind</code>,
							<code>afterChunks</code>) in the model preset in <code>.llmockrc.json</code>,
							start with <code>--chaos=true --chaosFrequency=&lt;num&gt;</code>, or change it while
							the server runs with <code>PATCH /admin/chaos</code>.
						</p>
					</section>

					<section class="card" cy-data="embeddings">
						<h2>Embeddings</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">Embeddings</span>
								<span class="badge">{meta?.embeddingsEnabled ?? 'DISABLED'}</span>
							</div>
							{#if meta?.embeddingsEnabled === 'ENABLED'}
								<div class="kv">
									<span class="muted">Dimensions</span>
									<span class="badge">{meta.embeddingDimension}</span>
								</div>
							{/if}
						</div>
					</section>

					<section class="card" cy-data="admin">
						<h2>Admin API</h2>
						<div class="grid">
							<div class="kv">
								<span class="muted">Admin API</span>
								<span class="badge" cy-data="admin_status">{meta?.adminApi ?? 'DISABLED'}</span>
							</div>
							{#if meta?.adminApi === 'ENABLED'}
								<div class="kv">
									<span class="muted">Rules Added While Running</span>
									<span class="badge" cy-data="admin_runtime_rules">{runtimeRuleCount}</span>
								</div>
								<div class="kv kvWide">
									<span class="muted">Runtime Changes</span>
									{#if confirmingReset}
										<span>Undo every change made through the admin API?</span>
										<button class="fileLink danger" cy-data="admin_reset_confirm" on:click={resetRuntime}>
											Yes, reset
										</button>
										<button class="fileLink" on:click={() => (confirmingReset = false)}>Cancel</button>
									{:else}
										<button
											class="fileLink"
											cy-data="admin_reset"
											title="Remove the rules added while running and restore the settings changed while running"
											on:click={() => (confirmingReset = true)}
										>
											Reset
										</button>
									{/if}
								</div>
							{/if}
						</div>
						{#if resetError}
							<p class="viewerError" cy-data="admin_reset_error">{resetError}</p>
						{/if}
						<p class="muted cardNote" cy-data="admin_note">
							{#if meta?.adminApi === 'ENABLED'}
								A test can add response rules and change the chaos, delay and reply settings while
								the server runs, through the routes under <code>/admin</code>. Nothing is saved to
								<code>.llmockrc.json</code>. The buttons on this page do the same for the settings
								they sit beside. Reset removes those rules, puts the settings back to how the server
								started and sets the chaos count to 0.
							{:else}
								The routes under <code>/admin</code> are off. To use them, remove
								<code>"admin": false</code> from the <code>server</code> block of
								<code>.llmockrc.json</code>, or start without <code>--admin=false</code>.
							{/if}
						</p>
					</section>
				</div>
			</div>

			<div class="footerNote">
				Change settings in <code>.llmockrc.json</code> and restart the server, or change
				rules, chaos, delay and reply settings while it runs through the admin API.<br />
				<code>validateRequests</code> and <code>logRequests</code> must both be on to log POST
				requests.
			</div>
		{:else}
			<section class="card" cy-data="response_rules">
				<div class="cardHead">
					<h2>Matched in this order</h2>
					<span class="countPill" cy-data="response_rules_count" title="Total response rules">
						{ruleCount} {ruleCount === 1 ? 'rule' : 'rules'}
					</span>
				</div>
				<p class="muted cardLead">
					A request containing the text on the left gets the rule's file or text as its
					reply, instead of a {meta?.mockResponseType || 'generated'} response, or fails if
					the rule says so. The first matching rule wins.
				</p>
				<div class="rules">
					{#each meta?.responseRules ?? [] as rule, ruleIndex (ruleIndex)}
						<div class="rule">
							<div class="ruleMatch">
								<span class="muted">Request contains</span>
								<code>{rule.match}</code>
								{#if rule.source === 'runtime'}
									<span class="rulePills">
										<span
											class="countPill"
											cy-data="rule_runtime"
											title="Added through the admin API while the server runs; gone after a reset or a restart"
										>
											runtime
										</span>
										{#if rule.times !== null}
											<span
												class="countPill"
												cy-data="rule_times"
												title="How many more requests this rule answers before it is removed"
											>
												{rule.times} left
											</span>
										{/if}
									</span>
								{/if}
							</div>
							<div class="ruleFiles">
								{#if rule.files.length > 0}
									<span class="muted">
										{rule.files.length > 1 ? 'Replies with one of, at random' : 'Replies with'}
									</span>
								{/if}
								{#if rule.text !== null}
									<span class="muted">Replies with</span>
									<button
										class="fileLink"
										cy-data="rule_text_link"
										title="View this text"
										on:click={() => viewRuleText(rule.match, rule.text ?? '')}
									>
										its own text
									</button>
								{/if}
								{#each rule.files as file, fileIndex (fileIndex)}
									<button
										class="fileLink"
										cy-data="rule_file_link"
										title="View this file"
										on:click={() =>
											viewRuleFile(rule.match, file, ruleIndex - runtimeRuleCount, fileIndex)}
									>
										{file}
									</button>
								{/each}
								{#if rule.stopReason !== 'end'}
									<span class="muted">
										Ends with
										<span class="badge" cy-data="rule_stop_reason">{rule.stopReason}</span>
									</span>
								{/if}
								{#if rule.fail}
									<span class="muted">
										Fails with
										<span class="badge" cy-data="rule_fail">{ruleFailLabel(rule.fail)}</span>
									</span>
								{/if}
							</div>
						</div>
					{:else}
						<!-- The same row as a rule, with its two values left blank -->
						<div class="rule">
							<div class="ruleMatch">
								<span class="muted">Request contains</span>
								<code class="ruleBlank"></code>
							</div>
							<div class="ruleFiles">
								<span class="muted">Replies with</span>
								<span class="fileLink ruleBlank"></span>
							</div>
						</div>
						<p class="muted rulesEmpty" cy-data="response_rules_empty">
							No response rules set. Add <code>responseRules</code> to the model preset in
							<code>.llmockrc.json</code> to use them.
						</p>
					{/each}
				</div>
			</section>
		{/if}
	</main>
</div>

<dialog
	class="viewer"
	cy-data="viewer"
	bind:this={dialog}
	on:close={() => (viewer = null)}
	on:click={(event) => {
		// A click on the backdrop lands on the dialog element itself
		if (event.target === dialog) dialog.close();
	}}
	on:keydown={(event) => {
		if (!viewer?.paged) return;
		if (event.key === 'ArrowLeft') turnPage(-1);
		if (event.key === 'ArrowRight') turnPage(1);
	}}
>
	{#if viewer}
		<div class="viewerBody">
			<div class="viewerHeader">
				<div>
					<h2 style="margin: 0;">{viewer.title}</h2>
					<div class="muted viewerSource">
						{viewer.source}{viewer.note ? ` · ${viewer.note}` : ''}
					</div>
				</div>
				{#if !viewer.paged}
					<button class="fileLink" on:click={() => dialog.close()}>Close</button>
				{/if}
			</div>
			{#if viewer.error}
				<p class="viewerError">{viewer.error}</p>
			{:else if viewer.texts === null}
				<p class="muted">Loading…</p>
			{:else if viewer.paged}
				<div class="viewerTexts">
					<pre cy-data="viewer_text">{viewer.texts[page]}</pre>
				</div>
			{:else}
				<div class="viewerTexts" class:scrollList={viewer.texts.length > SCROLL_AFTER}>
					{#each viewer.texts as text, index (index)}
						<pre cy-data="viewer_text">{text}</pre>
					{/each}
				</div>
			{/if}
			{#if viewer.paged}
				<div class="viewerFooter">
					<div class="viewerFooterGroup">
						{#if confirmingClear}
							<span>Clear all logged requests?</span>
							<button
								class="fileLink danger"
								cy-data="viewer_clear_confirm"
								on:click={clearLog}
							>
								Yes, clear
							</button>
							<button class="fileLink" on:click={() => (confirmingClear = false)}>
								Cancel
							</button>
						{:else if viewer.clearable && !viewer.error}
							<button
								class="fileLink"
								cy-data="viewer_clear"
								on:click={() => (confirmingClear = true)}
							>
								Clear logs
							</button>
						{/if}
					</div>
					<div class="viewerFooterGroup">
						{#if viewer.clearable && viewer.texts && !viewer.error}
							<button
								class="fileLink"
								cy-data="viewer_back"
								disabled={page === 0}
								on:click={() => turnPage(-1)}
							>
								Back
							</button>
							<span class="muted" cy-data="viewer_position">
								{page + 1} of {viewer.texts.length}
							</span>
							<button
								class="fileLink"
								cy-data="viewer_next"
								disabled={page >= viewer.texts.length - 1}
								on:click={() => turnPage(1)}
							>
								Next
							</button>
						{/if}
						<button class="fileLink" on:click={() => dialog.close()}>Close</button>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</dialog>

