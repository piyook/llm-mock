<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		fetchPing,
		fetchRuleFile,
		fetchStoredResponses,
		fetchUiMeta,
		type UiMeta,
	} from './api.js';

	// What the viewer dialog shows: a pool of stored responses (`texts`, one
	// block each) or a single rule fixture (one block, exactly as written)
	type Viewer = {
		title: string;
		source: string;
		texts: string[] | null;
		error: string | null;
	};

	let meta: UiMeta | null = null;
	let online: boolean | null = null;
	let error: string | null = null;
	let timer: number | null = null;
	let viewer: Viewer | null = null;
	let dialog: HTMLDialogElement;

	// Opens the dialog straight away and fills it once `load` settles; a
	// result for a view that has since been replaced is dropped
	async function openViewer(
		title: string,
		source: string,
		load: () => Promise<{ source?: string; texts: string[] }>,
	) {
		const opened: Viewer = { title, source, texts: null, error: null };
		viewer = opened;
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
				return { source: file ?? 'Bundled responses', texts: responses };
			},
		);
	}

	function viewRuleFile(match: string, file: string, rule: number, index: number) {
		void openViewer(`Reply when request contains "${match}"`, file, async () => {
			const { content } = await fetchRuleFile(rule, index);
			return { texts: [content] };
		});
	}

	async function refresh() {
		try {
			error = null;
			const [m, p] = await Promise.all([fetchUiMeta(), fetchPing()]);
			meta = m;
			online = p;
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
	<section class="card">
		<div class="titleRow">
			<h1>Mock LLM Server</h1>
			{#if online === null}
				<div class="statusPill statusOffline" cy-data="server_status">Checking…</div>
			{:else if online}
				<div class="statusPill statusOnline" cy-data="server_status">Running</div>
			{:else}
				<div class="statusPill statusOffline" cy-data="server_status">Not Running</div>
			{/if}
		</div>
		<p class="errorLine muted" class:errorVisible={!!error}>{error ?? ''}</p>
	</section>

	<section class="card">
		<h2 style="margin: 0 0 12px 0;">Server</h2>
		<div class="grid">
			<div class="kv">
				<span class="muted">Server Address</span>
				<span class="badge">localhost</span>
			</div>
			<div class="kv">
				<span class="muted">Server Port</span>
				<span class="badge">{meta?.serverPort ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">Server URL</span>
				<span class="badge">{meta?.llmUrlEndpoint?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">LLM Template</span>
				<span class="badge">{meta?.llmName?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">Model Name</span>
				<span class="badge">{meta?.llmModel?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">Response Type</span>
				<span class="badge">{meta?.mockResponseType?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">Validation</span>
				<span class="badge">{meta?.validateRequests?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">HTTP Request Log</span>
				<span class="badge">{meta?.logRequests?.toUpperCase() ?? 'NONE'}</span>
			</div>
			<div class="kv">
				<span class="muted">Debug Mode</span>
				<span class="badge">{meta?.debugMode ?? 'OFF'}</span>
			</div>
			<div class="kv">
				<span class="muted">Response Delay Min</span>
				<span class="badge">{meta?.responseDelayMinMs ?? 0}ms</span>
			</div>
			<div class="kv">
				<span class="muted">Response Delay Max</span>
				<span class="badge">{meta?.responseDelayMaxMs ?? 0}ms</span>
			</div>
			<div class="kv">
				<span class="muted">Delay Status</span>
				<span class="badge">{meta?.delayStatus ?? 'DISABLED'}</span>
			</div>
			<div class="kv">
				<span class="muted">Streaming Status</span>
				<span class="badge">{meta?.streamingStatus ?? 'DISABLED'}</span>
			</div>
			<div class="kv">
				<span class="muted">Embeddings Status</span>
				<span class="badge">{meta?.embeddingsEnabled ?? 'DISABLED'}</span>
			</div>
			<div class="kv">
				<span class="muted">Embedding Dimensions</span>
				<span class="badge">{meta?.embeddingDimension ?? 128}</span>
			</div>
			{#if meta?.mockResponseType === 'lorem'}
				<div class="kv">
					<span class="muted">Maximum sentences</span>
					<span class="badge">{meta?.maxLoremParas ?? 'NONE'}</span>
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

	{#if meta?.responseRules?.length}
		<section class="card" cy-data="response_rules">
			<h2 style="margin: 0 0 4px 0;">Response rules</h2>
			<p class="muted" style="margin: 0 0 12px 0;">
				A request containing the text on the left gets the file's contents as its
				reply, instead of a {meta.mockResponseType || 'generated'} response. The first
				matching rule wins.
			</p>
			<div class="rules">
				{#each meta.responseRules as rule, ruleIndex (ruleIndex)}
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
				{/each}
			</div>
		</section>
	{/if}

	<section class="card">
		<h2 style="margin: 0 0 12px 0;">API endpoint (GET &amp; POST)</h2>
		<div class="endpoints">
			{#each meta?.apiLinks ?? [] as link (link.href)}
				<a class="endpointLink" href={link.href}>{link.label}</a>
			{/each}
		</div>
		<p class="muted" style="margin: 12px 0 0 0;">
			Logs URL: <a href="/logs" style="color: var(--accent);">/logs</a>
		</p>
	</section>

	<div class="footerNote">
		Modify settings in <code>.env</code> and restart the server.<br />
		LOG_REQUESTS and VALIDATE_REQUESTS must be 'ON' to log POST requests.
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
>
	{#if viewer}
		<div class="viewerBody">
			<div class="viewerHeader">
				<div>
					<h2 style="margin: 0;">{viewer.title}</h2>
					<div class="muted viewerSource">
						{viewer.source}{viewer.texts && viewer.texts.length > 1
							? ` · ${viewer.texts.length} responses, one picked at random per request`
							: ''}
					</div>
				</div>
				<button class="fileLink" on:click={() => dialog.close()}>Close</button>
			</div>
			{#if viewer.error}
				<p class="viewerError">{viewer.error}</p>
			{:else if viewer.texts === null}
				<p class="muted">Loading…</p>
			{:else}
				<div class="viewerTexts">
					{#each viewer.texts as text, index (index)}
						<pre cy-data="viewer_text">{text}</pre>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</dialog>

