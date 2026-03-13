<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fetchPing, fetchUiMeta, type UiMeta } from './api.js';

	let meta: UiMeta | null = null;
	let online: boolean | null = null;
	let error: string | null = null;
	let timer: number | null = null;

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
			{/if}
		</div>
	</section>

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

