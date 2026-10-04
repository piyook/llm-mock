import './styles.css';

import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) {
	throw new Error('Missing #app element');
}

// Replace the "Loading dashboard…" placeholder from index.html
target.innerHTML = '';

mount(App, {
	target,
});
