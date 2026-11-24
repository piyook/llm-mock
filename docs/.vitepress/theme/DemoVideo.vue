<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { withBase } from 'vitepress';

const video = ref<HTMLVideoElement>();
const reducedMotion = ref(false);

// Respect "reduce motion": show the poster with controls instead of autoplaying.
onMounted(() => {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		reducedMotion.value = true;
		video.value?.pause();
	}
});
</script>

<template>
	<div class="demo-video">
		<video
			ref="video"
			:src="withBase('/videos/llmock-demo.webm')"
			:poster="withBase('/videos/llmock-demo.jpg')"
			:autoplay="!reducedMotion"
			:controls="reducedMotion"
			muted
			loop
			playsinline
			preload="auto"
			width="1920"
			height="1080"
			aria-label="LLMock demo: a terminal sends requests to LLMock while its dashboard shows the request log, a response rule and chaos mode"
		></video>
	</div>
</template>

<style scoped>
.demo-video {
	margin: 16px 0;
	width: 100%;
	border-radius: 12px;
	overflow: hidden;
	box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
	aspect-ratio: 16 / 9;
	background: #0f1a1a;
}

.demo-video video {
	display: block;
	width: 100%;
	height: 100%;
}
</style>
