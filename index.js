(function () {
	const processValue = [0, 0.04, 0.12, 0.15, 0.24, 0.33, 0.34, 0.35, 0.35];
	const startDay = 1762876800000;
	let targetFraction = 0.35;
	let progressInterval = null;
	let hasInitialProgressRendered = false;
	let accessPulseEnabled = true;
	let accessEntered = false;

	function parseBoolean(value, fallback) {
		if (value == null) return fallback;
		return value === '1' || value.toLowerCase() === 'true';
	}

	function parseNumber(value, fallback) {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}

	function getProgressFromDate(now) {
		const dayIndex = Math.floor((now - startDay) / (1000 * 60 * 60 * 24));
		return processValue[((dayIndex % processValue.length) + processValue.length) % processValue.length];
	}

	function getWebConfig() {
		const params = new URLSearchParams(window.location.search);
		const autoProgress = parseBoolean(params.get('autoProgress'), true);
		const manualProgress = Math.max(0, Math.min(100, parseNumber(params.get('progress'), 35)));
		const showAccessPulse = parseBoolean(params.get('accessPulse'), true);
		const noisePlay = parseBoolean(params.get('noisePlay'), true);
		const noiseVolume = Math.max(0, Math.min(100, parseNumber(params.get('noiseVolume'), 50)));
		return {
			autoProgress,
			manualProgress,
			showAccessPulse,
			noisePlay,
			noiseVolume,
		};
	}

	function applyAccessPulse(enabled) {
		const access = document.querySelector('.access-animation');
		const diamond = document.querySelector('.access-diamond');
		if (!access || !diamond) return;
		const stopPulse = () => {
			access.style.display = 'none';
			access.classList.remove('animate');
		};
		const startPulse = () => {
			if (!enabled) {
				stopPulse();
				return;
			}
			access.style.display = 'block';
			access.classList.add('animate');
		};

		if (!hasInitialProgressRendered) {
			diamond.style.display = 'none';
			diamond.classList.remove('entered');
			diamond.removeAttribute('data-entered');
			accessEntered = false;
			stopPulse();
			return;
		}

		if (!accessEntered) {
			diamond.style.display = 'block';
			diamond.classList.add('entered');
			accessEntered = true;
			startPulse();
			return;
		}

		diamond.style.display = 'block';
		diamond.classList.add('entered');
		startPulse();
	}

	function applyAudioSettings(shouldPlay, volumePercent) {
		const audio = document.querySelector('audio');
		if (!audio) return;
		audio.volume = volumePercent / 100;
		if (!shouldPlay) {
			audio.pause();
			return;
		}
		audio.autoplay = true;
		audio.preload = 'auto';
		audio.playsInline = true;

		let retryTimer = null;

		const removeUnlockListeners = () => {
			window.removeEventListener('pointerdown', unlockAudio);
			window.removeEventListener('keydown', unlockAudio);
			window.removeEventListener('touchstart', unlockAudio);
		};

		const cleanupAutoTry = () => {
			if (retryTimer) {
				clearInterval(retryTimer);
				retryTimer = null;
			}
			audio.removeEventListener('canplay', attemptAutoplay);
			window.removeEventListener('focus', attemptAutoplay);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};

		const onPlaybackStarted = () => {
			audio.muted = false;
			cleanupAutoTry();
			removeUnlockListeners();
		};

		const attemptAutoplay = () => {
			audio.muted = true;
			audio.play().then(onPlaybackStarted).catch(() => {});
		};

		const onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				attemptAutoplay();
			}
		};

		// Browsers may still block sound autoplay. Gesture unlock is a final fallback.
		const unlockAudio = () => {
			audio.muted = false;
			audio.play().then(() => {
				cleanupAutoTry();
				removeUnlockListeners();
			}).catch(() => {});
		};

		audio.addEventListener('canplay', attemptAutoplay);
		window.addEventListener('focus', attemptAutoplay);
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('pointerdown', unlockAudio, { once: true });
		window.addEventListener('keydown', unlockAudio, { once: true });
		window.addEventListener('touchstart', unlockAudio, { once: true });

		attemptAutoplay();
		retryTimer = setInterval(() => {
			if (!audio.paused) {
				onPlaybackStarted();
				return;
			}
			attemptAutoplay();
		}, 1000);
	}

	function applyProgressSettings(autoProgress, manualProgress) {
		targetFraction = autoProgress ? getProgressFromDate(Date.now()) : manualProgress / 100;
		if (hasInitialProgressRendered) {
			startProcessBarAnimation();
		}
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
		if (!autoProgress) return;
		progressInterval = setInterval(() => {
			const newProgress = getProgressFromDate(Date.now());
			if (newProgress !== targetFraction) {
				targetFraction = newProgress;
				if (hasInitialProgressRendered) {
					startProcessBarAnimation();
				}
			}
		}, 60000);
	}

	function initCycleAnimation() {
		const circle = document.querySelector('.cycle-circle');
		if (!circle) {
			return;
		}

		const r = circle.r.baseVal.value;
		const circumference = 2 * Math.PI * r;

		circle.style.strokeDasharray = String(circumference);
		circle.style.setProperty('--dashstart', String(-circumference));
		circle.style.strokeDashoffset = String(-circumference);

		requestAnimationFrame(() => {
			const onCircleEnd = () => {
				circle.removeEventListener('animationend', onCircleEnd);
				const mask = document.querySelector('.process-bar-mask');
				if (!mask) {
					startProcessBarAnimation(() => {
						hasInitialProgressRendered = true;
						applyAccessPulse(accessPulseEnabled);
					});
					return;
				}
				const onMaskEnd = () => {
					mask.removeEventListener('animationend', onMaskEnd);
					startProcessBarAnimation(() => {
						hasInitialProgressRendered = true;
						applyAccessPulse(accessPulseEnabled);
					});
				};
				mask.addEventListener('animationend', onMaskEnd);
				mask.classList.add('fade');
			};
			circle.addEventListener('animationend', onCircleEnd);
			circle.classList.add('animate');
		});
	}

	function initWebPageMode() {
		const config = getWebConfig();
		accessPulseEnabled = config.showAccessPulse;
		applyAccessPulse(false);
		applyAudioSettings(config.noisePlay, config.noiseVolume);
		applyProgressSettings(config.autoProgress, config.manualProgress);
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => {
			initWebPageMode();
			initCycleAnimation();
		});
	} else {
		initWebPageMode();
		initCycleAnimation();
	}

	function startProcessBarAnimation(onComplete) {
		const container = document.getElementById('cycle');
		const bar = document.querySelector('.process-bar');
		if (!container || !bar) return;

		let display = document.querySelector('.process-value');
		if (!display) {
			display = document.createElement('div');
			display.className = 'process-value';
			container.appendChild(display);
		}

		const barTargetHeight = targetFraction * 100;
		const DURATION = 1000;

		let start = null;
		const barStartHeight = bar.style.height ? parseInt(bar.style.height) : 0;
		const displayStartTop = display.style.top ? parseInt(display.style.top) : 100;
		let displayTargetTop;
		const diamondDangerArea = 4.75 * Math.SQRT2 / 2 * (container.clientWidth / container.clientHeight) / 100;
		const displayDangerArea = 2.5 * (container.clientWidth / container.clientHeight) / 100;
		if (0.5 - diamondDangerArea - displayDangerArea < targetFraction && targetFraction < 0.5 + diamondDangerArea) {
			displayTargetTop = (0.5 - diamondDangerArea) * 100;
		} else if (targetFraction >= 0.95) {
			displayTargetTop = 5;
		} else {
			displayTargetTop = (1 - targetFraction) * 100;
		}

		function step(ts) {
			if (!start) {
				start = ts;
			}
			const elapsed = ts - start;
			const t = Math.min(1, elapsed / DURATION);
			const ease = 1 - Math.pow(1 - t, 3);
			const current = barStartHeight + (barTargetHeight - barStartHeight) * ease;
			bar.style.height = current + '%';
			display.textContent = Math.round(current) + '%';
			display.style.top = (displayStartTop + (displayTargetTop - displayStartTop) * ease) + '%';

			if (t < 1) {
				requestAnimationFrame(step);
			} else {
				bar.style.height = barTargetHeight + '%';
				display.textContent = Math.round(targetFraction * 100) + '%';
				if (typeof onComplete === 'function') {
					onComplete();
				}
			}
		}
		display.style.opacity = '1';
		requestAnimationFrame(step);
	}
})();