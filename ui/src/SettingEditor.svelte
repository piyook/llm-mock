<script lang="ts">
	// A value on a card with a "Change" button. The button swaps the value for
	// boxes to fill in, with Save and Cancel. The value itself (a badge) is
	// passed in as the content.
	type Value = number | string;
	type Field = {
		key: string;
		// Said before the box when a setting has more than one
		label?: string;
		value: Value;
		// A list to pick from, in place of a box for a number
		options?: string[];
		min?: number;
		max?: number;
	};

	// Ends the cy-data names, e.g. `change_delay`, `edit_delay_min`, `save_delay`
	export let name: string;
	export let fields: Field[];
	// False while the admin API is off: the value is shown with no button
	export let canChange: boolean;
	// Makes the change; resolves to whether it was made
	export let save: (values: Record<string, Value>) => Promise<boolean>;

	let editing = false;
	let drafts: Record<string, Value> = {};

	// The boxes start from the values in use
	function open() {
		drafts = Object.fromEntries(fields.map((field) => [field.key, field.value]));
		editing = true;
	}

	// Stays open when the change is refused, so the values can be put right
	async function submit() {
		if (await save(drafts)) editing = false;
	}
</script>

{#if editing}
	<form class="kvValue" on:submit|preventDefault={submit}>
		{#each fields as field (field.key)}
			<label class="editField">
				{#if field.label}<span class="muted">{field.label}</span>{/if}
				{#if field.options}
					<select
						class="editBox"
						cy-data="edit_{name}_{field.key}"
						bind:value={drafts[field.key]}
					>
						{#each field.options as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				{:else}
					<input
						class="editBox"
						type="number"
						step="1"
						required
						min={field.min}
						max={field.max}
						cy-data="edit_{name}_{field.key}"
						bind:value={drafts[field.key]}
					/>
				{/if}
			</label>
		{/each}
		<button class="fileLink switch" type="submit" cy-data="save_{name}">Save</button>
		<button class="fileLink switch" type="button" on:click={() => (editing = false)}>
			Cancel
		</button>
	</form>
{:else}
	<span class="kvValue">
		<slot />
		{#if canChange}
			<button
				class="fileLink switch"
				cy-data="change_{name}"
				title="Changes this on the running server. Reset or a restart puts it back"
				on:click={open}
			>
				Change
			</button>
		{/if}
	</span>
{/if}
