<script lang="ts">
	// A switch for a setting that is on or off. It shows the state it is given
	// and passes its click on; it moves once the setting itself has changed.

	// The cy-data name, e.g. `switch_chaos`
	export let name: string;
	export let on: boolean;
	// Read out in place of words, as the switch has none of its own
	export let label: string;
	export let title = 'Changes this on the running server. Reset or a restart puts it back';
</script>

<button
	class="toggle"
	class:on
	type="button"
	role="switch"
	aria-checked={on}
	aria-label={label}
	cy-data={name}
	{title}
	on:click
>
	<span class="toggleThumb"></span>
</button>
