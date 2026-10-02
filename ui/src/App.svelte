<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		clearRequestLog,
		fetchPing,
		fetchRequestLog,
		fetchRuleFile,
		fetchStoredResponses,
		fetchUiMeta,
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

	let meta: UiMeta | null = null;
	let online: boolean | null = null;
	let error: string | null = null;
	let timer: number | null = null;
	let viewer: Viewer | null = null;
	let dialog: HTMLDialogElement;
	// Block shown by a paged view, and whether it is asking to confirm a clear
	let page = 0;
	let confirmingClear = false;

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
						'No request has been logged yet. Turn on validateRequests and logRequests, restart the server, then send a POST request.',
					],
				};
			}

			return {
				source: file,
				note: 'newest first',
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

	async function refresh() {
		try {
			const [m, p] = await Promise.all([fetchUiMeta(), fetchPing()]);
			meta = m;
			online = p;
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

<main>
	<header class="pageHeader">
		<section class="card">
			<div class="titleRow">
				<div class="titleGroup">
					<h1>Mock LLM Server</h1>
					{#if meta?.version}
						<span class="versionPill" cy-data="llmock_version" title="llmock version">
							v{meta.version}
						</span>
					{/if}
				</div>
				{#if online === null}
					<div class="statusPill statusOffline" cy-data="server_status">Checking…</div>
				{:else if online}
					<div class="statusPill statusOnline" cy-data="server_status">Running</div>
				{:else}
					<div class="statusPill statusOffline" cy-data="server_status">Not Running</div>
				{/if}
			</div>
			<p class="errorLine muted">{error ?? ''}</p>
		</section>
	</header>

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
				<span class="badge">{meta?.streamingStatus ?? 'DISABLED'}</span>
			</div>
		</div>
	</section>

	<section class="card" cy-data="responses">
		<h2>Responses</h2>
		<div class="grid">
			<div class="kv">
				<span class="muted">Response Type</span>
				<span class="badge">{meta?.mockResponseType || 'None'}</span>
			</div>
			<div class="kv">
				<span class="muted">Response Delay</span>
				<span class="badge" cy-data="response_delay">{delayLabel(meta)}</span>
			</div>
			{#if meta?.mockResponseType === 'lorem'}
				<div class="kv">
					<span class="muted">Maximum sentences</span>
					<span class="badge">{meta?.maxLoremParas ?? 'None'}</span>
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
	</section>

	<section class="card" cy-data="response_rules">
		<h2 style="margin: 0 0 4px 0;">Response rules</h2>
		<p class="muted" style="margin: 0 0 12px 0;">
			A request containing the text on the left gets the file's contents as its
			reply, instead of a {meta?.mockResponseType || 'generated'} response. The first
			matching rule wins.
		</p>
		<div class="rules">
			{#each meta?.responseRules ?? [] as rule, ruleIndex (ruleIndex)}
				<div class="rule">
					<div class="ruleMatch">
						<span class="muted">Request contains</span>
						<code>{rule.match}</code>
					</div>
					<div class="ruleFiles">
						<span class="muted">
							{rule.files.length > 1 ? 'Replies with one of, at random' : 'Replies with'}
						</span>
						{#each rule.files as file, fileIndex (fileIndex)}
							<button
								class="fileLink"
								cy-data="rule_file_link"
								title="View this file"
								on:click={() => viewRuleFile(rule.match, file, ruleIndex, fileIndex)}
							>
								{file}
							</button>
						{/each}
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

	<section class="card" cy-data="diagnostics">
		<h2>Diagnostics</h2>
		<div class="grid">
			<div class="kv">
				<span class="muted">Request Validation</span>
				<span class="badge">{meta?.validateRequests || 'OFF'}</span>
			</div>
			<div class="kv">
				<span class="muted">Debug Mode</span>
				<span class="badge">{meta?.debugMode ?? 'OFF'}</span>
			</div>
			<div class="kv">
				<span class="muted">Request Log</span>
				<span class="badge">{meta?.logRequests || 'OFF'}</span>
			</div>
			<div class="kv">
				<span class="muted">Max Logged Requests</span>
				<span class="badge" cy-data="max_logged_requests">
					{meta?.maxLoggedRequests ?? 10}
				</span>
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
		<p class="muted cardNote" cy-data="max_logged_requests_note">
			The log keeps the last {meta?.maxLoggedRequests ?? 10} requests. To change this,
			set <code>maxLoggedRequests</code> (1 to 100) in the model preset in
			<code>.llmockrc.json</code>, or start with
			<code>--maxLoggedRequests=&lt;num&gt;</code>.
		</p>
	</section>

	<div class="footerNote">
		Change settings in <code>.llmockrc.json</code> and restart the server.<br />
		<code>validateRequests</code> and <code>logRequests</code> must both be on to log POST
		requests.
	</div>
</main>

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
				<div class="viewerTexts">
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

