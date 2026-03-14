import './styles.css';
import App from './App.svelte';

import { mount } from 'svelte';

const target = document.getElementById('app');
if (!target) {
	throw new Error('Missing #app element');
}

// Replace the "Loading dashboard…" placeholder from index.html
target.innerHTML = '';

mount(App, {
	target,
});

