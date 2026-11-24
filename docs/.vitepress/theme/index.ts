import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import DemoVideo from './DemoVideo.vue';
import './style.css';

export default {
	extends: DefaultTheme,
	enhanceApp({ app }) {
		// The demo video on the homepage, used as <DemoVideo /> in index.md.
		app.component('DemoVideo', DemoVideo);
	},
} satisfies Theme;
