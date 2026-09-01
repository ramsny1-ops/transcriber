(() => {
	"use strict";

	const $ = (selector) => document.querySelector(selector);
	const csrfToken = document.body.dataset.csrfToken ?? "";
	const SpeechRecognitionCtor =
		window.SpeechRecognition || window.webkitSpeechRecognition;
	const reducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;

	const els = {
		canvas: $("#voice-canvas"),
		statusDot: $("#status-dot"),
		statusText: $("#status-text"),
		pitchMeter: $("#pitch-meter"),
		levelMeter: $("#level-meter"),
		captureState: $("#capture-state"),
		captionText: $("#caption-text"),
		interimText: $("#interim-text"),
		supportMessage: $("#support-message"),
		sessionTitle: $("#session-title"),
		startCapture: $("#start-capture"),
		stopCapture: $("#stop-capture"),
		clearCaption: $("#clear-caption"),
		savePreferences: $("#save-preferences"),
		backgroundMode: $("#background-mode"),
		backgroundColor: $("#background-color"),
		waveColor: $("#wave-color"),
		accentColor: $("#accent-color"),
		captionColor: $("#caption-color"),
		captionFont: $("#caption-font"),
		captionSize: $("#caption-size"),
		captionSizeOutput: $("#caption-size-output"),
		captionWeight: $("#caption-weight"),
		captionAlign: $("#caption-align"),
		captionCase: $("#caption-case"),
		captionShadow: $("#caption-shadow"),
		recognitionLang: $("#recognition-lang"),
		keywordList: $("#keyword-list"),
		keywordPhrase: $("#keyword-phrase"),
		keywordColor: $("#keyword-color"),
		addKeyword: $("#add-keyword"),
		exportFormat: $("#export-format"),
		exportCaption: $("#export-caption"),
		exportStatus: $("#export-status"),
		ttsText: $("#tts-text"),
		ttsVoice: $("#tts-voice"),
		ttsLang: $("#tts-lang"),
		ttsTone: $("#tts-tone"),
		ttsRate: $("#tts-rate"),
		ttsRateOutput: $("#tts-rate-output"),
		ttsPitch: $("#tts-pitch"),
		ttsPitchOutput: $("#tts-pitch-output"),
		ttsVolume: $("#tts-volume"),
		ttsVolumeOutput: $("#tts-volume-output"),
		ttsUseCaption: $("#tts-use-caption"),
		ttsPlay: $("#tts-play"),
		ttsPause: $("#tts-pause"),
		ttsStop: $("#tts-stop"),
		ttsStatus: $("#tts-status"),
		playRecording: $("#play-recording"),
	};

	const defaults = {
		backgroundMode: "oscilloscope",
		backgroundColor: "#090b0c",
		waveColor: "#f0f2ed",
		accentColor: "#9ed36a",
		captionColor: "#f7f7f2",
		captionFont: "system",
		captionSize: 56,
		captionWeight: 700,
		captionAlign: "center",
		captionCase: "natural",
		captionShadow: true,
		recognitionLang: "en-US",
		ttsVoice: null,
		ttsLang: "en-US",
		ttsRate: 1,
		ttsPitch: 1,
		ttsVolume: 1,
		ttsTone: "neutral",
		keywordRules: [],
	};

	const state = {
		preferences: structuredClone(defaults),
		sessionId: null,
		sessionStartedAt: 0,
		sequence: 0,
		transcript: "",
		lastSegmentEndMs: 0,
		recognition: null,
		shouldRecognize: false,
		audioStream: null,
		audioContext: null,
		analyser: null,
		waveform: null,
		animationId: 0,
		frame: 0,
		level: 0,
		pitch: 0,
		saveQueue: Promise.resolve(),
		voices: [],
		mediaRecorder: null,
		recordedBlobs: null,
	};

	async function api(path, options = {}) {
		const method = (options.method ?? "GET").toUpperCase();
		const headers = new Headers(options.headers ?? {});
		if (options.body && !headers.has("content-type"))
			headers.set("content-type", "application/json");
		if (!["GET", "HEAD", "OPTIONS"].includes(method))
			headers.set("x-csrf-token", csrfToken);

		const response = await fetch(path, {
			credentials: "same-origin",
			...options,
			method,
			headers,
		});

		if (response.status === 401) {
			window.location.assign("/login");
			throw new Error("Authentication required");
		}

		if (!response.ok) {
			let message = `Request failed with ${response.status}`;
			try {
				const body = await response.json();
				message = body.error ?? message;
			} catch {}
			throw new Error(message);
		}

		if (response.status === 204) return null;
		return response.json();
	}

	function setStatus(text, active = false) {
		els.statusText.textContent = text;
		els.statusDot.classList.toggle("active", active);
	}

	function setSupport(message, isError = false) {
		els.supportMessage.textContent = message;
		els.supportMessage.classList.toggle("error", isError);
	}

	function fontStack(name) {
		const map = {
			system:
				'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
			humanist: '"Trebuchet MS", "Segoe UI", sans-serif',
			mono: 'ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", monospace',
			serif: 'Georgia, "Times New Roman", serif',
			rounded: '"Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
		};
		return map[name] ?? map.system;
	}

	function readPreferencesFromControls() {
		state.preferences = {
			...state.preferences,
			backgroundMode: els.backgroundMode.value,
			backgroundColor: els.backgroundColor.value,
			waveColor: els.waveColor.value,
			accentColor: els.accentColor.value,
			captionColor: els.captionColor.value,
			captionFont: els.captionFont.value,
			captionSize: Number(els.captionSize.value),
			captionWeight: Number(els.captionWeight.value),
			captionAlign: els.captionAlign.value,
			captionCase: els.captionCase.value,
			captionShadow: els.captionShadow.checked,
			recognitionLang: els.recognitionLang.value.trim() || "en-US",
			ttsVoice: els.ttsVoice.value || null,
			ttsLang: els.ttsLang.value.trim() || "en-US",
			ttsRate: Number(els.ttsRate.value),
			ttsPitch: Number(els.ttsPitch.value),
			ttsVolume: Number(els.ttsVolume.value),
			ttsTone: els.ttsTone.value,
		};
		applyPreferences();
	}

	function fillPreferenceControls(p) {
		els.backgroundMode.value = p.backgroundMode;
		els.backgroundColor.value = p.backgroundColor;
		els.waveColor.value = p.waveColor;
		els.accentColor.value = p.accentColor;
		els.captionColor.value = p.captionColor;
		els.captionFont.value = p.captionFont;
		els.captionSize.value = String(p.captionSize);
		els.captionWeight.value = String(p.captionWeight);
		els.captionAlign.value = p.captionAlign;
		els.captionCase.value = p.captionCase;
		els.captionShadow.checked = p.captionShadow;
		els.recognitionLang.value = p.recognitionLang;
		els.ttsLang.value = p.ttsLang;
		els.ttsRate.value = String(p.ttsRate);
		els.ttsPitch.value = String(p.ttsPitch);
		els.ttsVolume.value = String(p.ttsVolume);
		els.ttsTone.value = p.ttsTone;
		updateOutputs();
		renderKeywordRules();
	}

	function applyPreferences() {
		const p = state.preferences;
		const root = document.documentElement;
		root.style.setProperty("--bg", p.backgroundColor);
		root.style.setProperty("--accent", p.accentColor);
		root.style.setProperty("--caption-color", p.captionColor);
		root.style.setProperty("--caption-font", fontStack(p.captionFont));
		root.style.setProperty("--caption-size", `${p.captionSize}px`);
		root.style.setProperty("--caption-weight", String(p.captionWeight));
		root.style.setProperty("--caption-align", p.captionAlign);
		root.style.setProperty(
			"--caption-transform",
			p.captionCase === "upper"
				? "uppercase"
				: p.captionCase === "lower"
					? "lowercase"
					: "none",
		);
		els.captionText.classList.toggle("has-shadow", p.captionShadow);
		document.body.style.backgroundColor = p.backgroundColor;
		updateOutputs();
		renderCaption();
		drawFrame(performance.now());
	}

	function updateOutputs() {
		els.captionSizeOutput.textContent = `${els.captionSize.value}px`;
		els.ttsRateOutput.textContent = Number(els.ttsRate.value).toFixed(2);
		els.ttsPitchOutput.textContent = Number(els.ttsPitch.value).toFixed(2);
		els.ttsVolumeOutput.textContent = Number(els.ttsVolume.value).toFixed(2);
	}

	function escapeRegex(value) {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	function renderCaption() {
		const text = state.transcript.trim();
		els.captionText.replaceChildren();
		if (!text) {
			els.captionText.textContent = "Press Start capture and speak.";
			return;
		}

		const rules = state.preferences.keywordRules
			.filter((rule) => rule.phrase.trim())
			.sort((a, b) => b.phrase.length - a.phrase.length);

		if (!rules.length) {
			els.captionText.textContent = text;
			return;
		}

		const regex = new RegExp(
			`(?<![\\p{L}\\p{N}_])(${rules.map((rule) => escapeRegex(rule.phrase)).join("|")})(?![\\p{L}\\p{N}_])`,
			"giu",
		);
		const parts = text.split(regex);

		for (const part of parts) {
			if (!part) continue;
			const rule = rules.find(
				(item) => item.phrase.toLocaleLowerCase() === part.toLocaleLowerCase(),
			);
			if (!rule) {
				els.captionText.append(document.createTextNode(part));
				continue;
			}
			const span = document.createElement("span");
			span.className = "keyword-hit";
			span.style.setProperty("--keyword-color", rule.color);
			span.textContent = part;
			els.captionText.append(span);
		}
	}

	function renderKeywordRules() {
		els.keywordList.replaceChildren();
		state.preferences.keywordRules.forEach((rule, index) => {
			const row = document.createElement("div");
			row.className = "keyword-row";

			const swatch = document.createElement("span");
			swatch.className = "keyword-swatch";
			swatch.style.setProperty("--keyword-color", rule.color);
			swatch.setAttribute("aria-hidden", "true");

			const phrase = document.createElement("span");
			phrase.className = "keyword-phrase";
			phrase.textContent = rule.phrase;

			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "keyword-remove";
			remove.textContent = "Remove";
			remove.addEventListener("click", () => {
				state.preferences.keywordRules.splice(index, 1);
				renderKeywordRules();
				renderCaption();
			});

			row.append(swatch, phrase, remove);
			els.keywordList.append(row);
		});

		if (!state.preferences.keywordRules.length) {
			const empty = document.createElement("p");
			empty.className = "setting-note";
			empty.textContent = "No selective colors yet.";
			els.keywordList.append(empty);
		}
	}

	async function savePreferences() {
		readPreferencesFromControls();
		els.savePreferences.disabled = true;
		const previous = els.savePreferences.textContent;
		els.savePreferences.textContent = "Saving";
		try {
			await api("/api/v1/preferences", {
				method: "PUT",
				body: JSON.stringify(state.preferences),
			});
			els.savePreferences.textContent = "Saved";
		} catch (error) {
			els.savePreferences.textContent = "Save failed";
			setSupport(`Settings were not saved: ${error.message}`, true);
		} finally {
			window.setTimeout(() => {
				els.savePreferences.disabled = false;
				els.savePreferences.textContent = previous;
			}, 900);
		}
				if (els.playRecording) els.playRecording.disabled = false;
	}

	function addKeywordRule() {
		const phrase = els.keywordPhrase.value.trim();
		const color = els.keywordColor.value;
		if (!phrase) return;
		const existing = state.preferences.keywordRules.find(
			(rule) => rule.phrase.toLocaleLowerCase() === phrase.toLocaleLowerCase(),
		);
		if (existing) existing.color = color;
		else if (state.preferences.keywordRules.length < 20)
			state.preferences.keywordRules.push({ phrase, color });
		els.keywordPhrase.value = "";
		renderKeywordRules();
		renderCaption();
	}

	async function startAudio() {
		if (state.audioStream) return;
		if (!navigator.mediaDevices?.getUserMedia)
			throw new Error("Microphone capture is not supported by this browser.");

		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: false,
				channelCount: 1,
			},
			video: false,
		});

		const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
		if (!AudioContextCtor) {
			stream.getTracks().forEach((track) => track.stop());
			throw new Error("Web Audio is not supported by this browser.");
		}

		const audioContext = new AudioContextCtor({ latencyHint: "interactive" });
		await audioContext.resume();
		const analyser = audioContext.createAnalyser();
		analyser.fftSize = 2048;
		analyser.smoothingTimeConstant = 0.25;
		const source = audioContext.createMediaStreamSource(stream);
		source.connect(analyser);

		state.audioStream = stream;
		state.audioContext = audioContext;
		state.analyser = analyser;
		state.waveform = new Float32Array(analyser.fftSize);
		if (!state.animationId)
			state.animationId = requestAnimationFrame(drawFrame);
	}

	async function stopAudio() {
		if (state.animationId) cancelAnimationFrame(state.animationId);
		state.animationId = 0;
		state.audioStream?.getTracks().forEach((track) => track.stop());
		state.audioStream = null;
		if (state.audioContext && state.audioContext.state !== "closed")
			await state.audioContext.close();
		state.audioContext = null;
		state.analyser = null;
		state.waveform = null;
		state.level = 0;
		state.pitch = 0;
		els.pitchMeter.textContent = "Pitch -- Hz";
		els.levelMeter.textContent = "Level 0%";
		drawFrame(performance.now());
	}

	function estimatePitch(buffer, sampleRate) {
		let energy = 0;
		for (let i = 0; i < buffer.length; i += 1) energy += buffer[i] * buffer[i];
		const rms = Math.sqrt(energy / buffer.length);
		if (rms < 0.012) return { pitch: 0, rms };

		const minLag = Math.floor(sampleRate / 500);
		const maxLag = Math.min(Math.floor(sampleRate / 60), buffer.length - 2);
		let bestLag = -1;
		let bestScore = 0;

		for (let lag = minLag; lag <= maxLag; lag += 1) {
			let cross = 0;
			let energyA = 0;
			let energyB = 0;
			const limit = buffer.length - lag;
			for (let i = 0; i < limit; i += 2) {
				const a = buffer[i];
				const b = buffer[i + lag];
				cross += a * b;
				energyA += a * a;
				energyB += b * b;
			}
			const denom = Math.sqrt(energyA * energyB) || 1;
			const score = cross / denom;
			if (score > bestScore) {
				bestScore = score;
				bestLag = lag;
			}
		}

		return {
			pitch: bestLag > 0 && bestScore > 0.55 ? sampleRate / bestLag : 0,
			rms,
		};
	}

	function resizeCanvas() {
		const rect = els.canvas.getBoundingClientRect();
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (els.canvas.width !== width || els.canvas.height !== height) {
			els.canvas.width = width;
			els.canvas.height = height;
		}
		return { width, height, dpr };
	}

	function drawGrid(ctx, width, height, dpr) {
		ctx.save();
		ctx.globalAlpha = 0.09;
		ctx.strokeStyle = state.preferences.waveColor;
		ctx.lineWidth = 1 * dpr;
		const step = 64 * dpr;
		ctx.beginPath();
		for (let x = 0; x <= width; x += step) {
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
		}
		for (let y = 0; y <= height; y += step) {
			ctx.moveTo(0, y);
			ctx.lineTo(width, y);
		}
		ctx.stroke();
		ctx.restore();
	}

	function drawPitchWave(ctx, width, height, dpr, now, offset = 0) {
		const normalizedPitch = state.pitch
			? Math.min(1, Math.max(0, (state.pitch - 70) / 330))
			: 0.12;
		const cycles = 1.4 + normalizedPitch * 6.4;
		const amplitude =
			(12 + state.level * Math.min(height * 0.2, 150 * dpr)) *
			(offset ? 0.7 : 1);
		const center = height * (0.5 + offset);
		const phase = state.analyser && !reducedMotion ? now * 0.0018 : 0;

		ctx.beginPath();
		for (let x = 0; x <= width; x += Math.max(3, 4 * dpr)) {
			const progress = x / width;
			const envelope = Math.sin(progress * Math.PI);
			const y =
				center +
				Math.sin(progress * Math.PI * 2 * cycles + phase) *
					amplitude *
					envelope;
			if (x === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}

	function drawOscilloscope(ctx, width, height, dpr) {
		if (!state.waveform) return;
		ctx.save();
		ctx.globalAlpha = 0.24 + Math.min(0.35, state.level * 2.4);
		ctx.strokeStyle = state.preferences.waveColor;
		ctx.lineWidth = 1.2 * dpr;
		ctx.beginPath();
		const step = Math.max(
			1,
			Math.floor(state.waveform.length / Math.max(200, width / dpr)),
		);
		let drawIndex = 0;
		const count = Math.ceil(state.waveform.length / step);
		for (let i = 0; i < state.waveform.length; i += step) {
			const x = (drawIndex / Math.max(1, count - 1)) * width;
			const y = height * 0.5 + state.waveform[i] * height * 0.28;
			if (drawIndex === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
			drawIndex += 1;
		}
		ctx.stroke();
		ctx.restore();
	}

	function drawFrame(now) {
		const ctx = els.canvas.getContext("2d", { alpha: false });
		if (!ctx) return;
		const { width, height, dpr } = resizeCanvas();
		ctx.fillStyle = state.preferences.backgroundColor;
		ctx.fillRect(0, 0, width, height);

		if (state.analyser && state.waveform) {
			state.analyser.getFloatTimeDomainData(state.waveform);
			state.frame += 1;
			if (state.frame % (reducedMotion ? 8 : 4) === 0) {
				const measured = estimatePitch(
					state.waveform,
					state.audioContext.sampleRate,
				);
				state.level = state.level * 0.78 + measured.rms * 0.22;
				if (measured.pitch)
					state.pitch = state.pitch
						? state.pitch * 0.72 + measured.pitch * 0.28
						: measured.pitch;
				else state.pitch *= 0.92;
				els.pitchMeter.textContent =
					state.pitch > 20
						? `Pitch ${Math.round(state.pitch)} Hz`
						: "Pitch -- Hz";
				els.levelMeter.textContent = `Level ${Math.min(100, Math.round(state.level * 420))}%`;
			}
		}

		if (state.preferences.backgroundMode === "grid")
			drawGrid(ctx, width, height, dpr);
		if (state.preferences.backgroundMode === "oscilloscope")
			drawOscilloscope(ctx, width, height, dpr);

		if (state.preferences.backgroundMode !== "solid") {
			ctx.save();
			ctx.strokeStyle = state.preferences.accentColor;
			ctx.lineWidth = 1.5 * dpr;
			ctx.globalAlpha = state.analyser ? 0.55 : 0.18;
			drawPitchWave(ctx, width, height, dpr, now, 0);
			if (state.preferences.backgroundMode === "bands") {
				ctx.globalAlpha *= 0.55;
				drawPitchWave(ctx, width, height, dpr, now, -0.2);
				drawPitchWave(ctx, width, height, dpr, now, 0.2);
			}
			ctx.restore();
		}

		if (state.analyser) state.animationId = requestAnimationFrame(drawFrame);
	}

	function setupRecognition() {
		if (!SpeechRecognitionCtor) return null;
		const recognition = new SpeechRecognitionCtor();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.maxAlternatives = 1;
		recognition.lang = state.preferences.recognitionLang;

		recognition.onstart = () => {
			setStatus("Listening", true);
			els.captureState.textContent = "Live capture";
		};

		recognition.onresult = (event) => {
			let interim = "";
			for (let i = event.resultIndex; i < event.results.length; i += 1) {
				const result = event.results[i];
				const alternative = result[0];
				const text = alternative?.transcript?.trim();
				if (!text) continue;
				if (result.isFinal)
					commitFinalSegment(
						text,
						Number.isFinite(alternative.confidence)
							? alternative.confidence
							: null,
					);
				else interim += `${text} `;
			}
			els.interimText.textContent = interim.trim();
		};

		recognition.onerror = (event) => {
			const fatal = [
				"not-allowed",
				"service-not-allowed",
				"language-not-supported",
			].includes(event.error);
			if (event.error !== "no-speech" && event.error !== "aborted") {
				setSupport(`Speech recognition: ${event.error}.`, fatal);
			}
			if (fatal) {
				state.shouldRecognize = false;
				setStatus("Recognition unavailable", false);
			}
		};

		recognition.onend = () => {
			if (!state.shouldRecognize) return;
			window.setTimeout(() => {
				if (!state.shouldRecognize) return;
				try {
					recognition.start();
				} catch {}
			}, 250);
		};

		return recognition;
	}

	function commitFinalSegment(text, confidence) {
		const nowMs = Math.max(
			0,
			Math.round(performance.now() - state.sessionStartedAt),
		);
		const startMs = state.lastSegmentEndMs;
		state.lastSegmentEndMs = nowMs;
		const sequence = state.sequence++;
		state.transcript = `${state.transcript} ${text}`.trim();
		els.interimText.textContent = "";
		renderCaption();

		if (!state.sessionId) return;
		const sessionId = state.sessionId;
		const payload = { sequence, text, confidence, startMs, endMs: nowMs };
		state.saveQueue = state.saveQueue
			.then(() =>
				api(`/api/v1/caption-sessions/${sessionId}/segments`, {
					method: "POST",
					body: JSON.stringify(payload),
				}),
			)
			.catch((error) =>
				setSupport(`Caption autosave failed: ${error.message}`, true),
			);
	}

	async function beginCapture() {
		if (state.audioStream) return;
		readPreferencesFromControls();
		setSupport("");
		els.startCapture.disabled = true;
		els.captureState.textContent = "Requesting microphone";

		if (els.playRecording) els.playRecording.disabled = true;
		try {
			await startAudio();

			if (!SpeechRecognitionCtor) {
				setStatus("Wave only", true);
				setSupport(
					"Your browser does not expose SpeechRecognition. The voice-reactive background is running, but live captions require a compatible browser or a future server transcription adapter.",
					true,
				);
				els.captureState.textContent = "Microphone visualization only";
				els.stopCapture.disabled = false;
				return;
			}

			const created = await api("/api/v1/caption-sessions", {
				method: "POST",
				body: JSON.stringify({
					title: els.sessionTitle.value.trim() || "Voice capture",
					language: state.preferences.recognitionLang,
				}),
			});

			state.sessionId = created.id;
			state.sessionStartedAt = performance.now();
			state.sequence = 0;
			state.lastSegmentEndMs = 0;
			state.transcript = "";
			renderCaption();
			// Setup media recorder to save a local recording for playback/export.
			try {
				state.recordedBlobs = [];
				const options = { mimeType: "audio/webm" };
				const recorder = new MediaRecorder(state.audioStream, options);
				recorder.ondataavailable = (ev) => {
					if (ev.data && ev.data.size) state.recordedBlobs.push(ev.data);
				};
				recorder.start();
				state.mediaRecorder = recorder;
			} catch (err) {
				// recording not available
				state.mediaRecorder = null;
				state.recordedBlobs = null;
			}

			state.shouldRecognize = true;
			state.recognition = setupRecognition();
			state.recognition.start();
			els.stopCapture.disabled = false;
			els.exportCaption.disabled = false;
		} catch (error) {
			setSupport(error.message, true);
			setStatus("Idle", false);
			els.captureState.textContent = "Not recording";
			await stopAudio();
			els.startCapture.disabled = false;
		}
	}

	async function stopCapture() {
		els.stopCapture.disabled = true;
		state.shouldRecognize = false;
		try {
			state.recognition?.stop();
		} catch {}
		state.recognition = null;
		await stopAudio();
		await state.saveQueue;
		// Stop media recorder and upload recorded blob if available
		try {
			if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
				await new Promise((resolve) => {
					state.mediaRecorder.onstop = resolve;
					state.mediaRecorder.stop();
				});
			}

			if (
				state.recordedBlobs &&
				state.recordedBlobs.length &&
				state.sessionId
			) {
				const blob = new Blob(state.recordedBlobs, { type: "audio/webm" });
				try {
					const headers = { "content-type": blob.type };
					await api(`/api/v1/caption-sessions/${state.sessionId}/recording`, {
						method: "POST",
						body: blob,
						headers,
					});
					setSupport("Recording uploaded.");
					if (els.playRecording) els.playRecording.disabled = false;
				} catch (err) {
					setSupport(`Recording upload failed: ${err.message}`, true);
				}
			}
		} catch (e) {
			console.warn("recording upload error", e);
		}

		if (state.sessionId) {
			try {
				await api(`/api/v1/caption-sessions/${state.sessionId}`, {
					method: "PATCH",
					body: JSON.stringify({
						title: els.sessionTitle.value.trim() || "Voice capture",
					}),
				});
			} catch (error) {
				setSupport(`Could not finalize the capture: ${error.message}`, true);
			}
		}

		setStatus("Stopped", false);
		els.captureState.textContent = state.sessionId
			? "Capture saved"
			: "Microphone stopped";
		els.startCapture.disabled = false;
		els.interimText.textContent = "";
	}

	async function exportCaptionFile() {
		if (!state.sessionId) return;
		els.exportCaption.disabled = true;
		els.exportStatus.textContent = "Building file from saved caption segments.";
		try {
			await state.saveQueue;
			const result = await api(
				`/api/v1/caption-sessions/${state.sessionId}/export`,
				{
					method: "POST",
					body: JSON.stringify({ format: els.exportFormat.value }),
				},
			);
			const link = document.createElement("a");
			link.href = result.downloadUrl;
			link.download = "";
			document.body.append(link);
			link.click();
			link.remove();
			els.exportStatus.textContent = `File ready. ${Math.max(1, Math.round(result.bytes / 1024))} KB, SHA-256 ${result.sha256.slice(0, 12)}…`;
		} catch (error) {
			els.exportStatus.textContent = `Export failed: ${error.message}`;
		} finally {
			els.exportCaption.disabled = false;
		}
	}

	function loadVoices() {
		if (!("speechSynthesis" in window)) {
			els.ttsPlay.disabled = true;
			els.ttsStatus.textContent =
				"Speech synthesis is not available in this browser.";
			return;
		}

		state.voices = window.speechSynthesis
			.getVoices()
			.slice()
			.sort(
				(a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
			);
		const selected = state.preferences.ttsVoice;
		els.ttsVoice.replaceChildren();
		const fallback = document.createElement("option");
		fallback.value = "";
		fallback.textContent = "System default";
		els.ttsVoice.append(fallback);

		for (const voice of state.voices) {
			const option = document.createElement("option");
			option.value = voice.voiceURI;
			option.textContent = `${voice.name} — ${voice.lang}${voice.localService ? " — local" : ""}`;
			els.ttsVoice.append(option);
		}
		if (selected && state.voices.some((voice) => voice.voiceURI === selected))
			els.ttsVoice.value = selected;
	}

	function toneModifiers(name) {
		const tones = {
			neutral: { rate: 1, pitch: 1 },
			calm: { rate: 0.86, pitch: 0.94 },
			deep: { rate: 0.9, pitch: 0.78 },
			bright: { rate: 1.02, pitch: 1.15 },
			urgent: { rate: 1.18, pitch: 1.05 },
		};
		return tones[name] ?? tones.neutral;
	}

	function clamp(value, min, max) {
		return Math.min(max, Math.max(min, value));
	}

	function speakText() {
		if (!("speechSynthesis" in window)) return;
		readPreferencesFromControls();
		const text = els.ttsText.value.trim();
		if (!text) {
			els.ttsStatus.textContent = "Add text before playback.";
			return;
		}

		window.speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(text);
		const modifiers = toneModifiers(state.preferences.ttsTone);
		utterance.rate = clamp(state.preferences.ttsRate * modifiers.rate, 0.1, 10);
		utterance.pitch = clamp(state.preferences.ttsPitch * modifiers.pitch, 0, 2);
		utterance.volume = clamp(state.preferences.ttsVolume, 0, 1);
		utterance.lang = state.preferences.ttsLang;
		const voice = state.voices.find(
			(item) => item.voiceURI === state.preferences.ttsVoice,
		);
		if (voice) utterance.voice = voice;

		utterance.onstart = () => {
			els.ttsStatus.textContent = `Speaking with ${voice?.name ?? "system default"}.`;
		};
		utterance.onend = () => {
			els.ttsStatus.textContent = "Playback finished.";
			els.ttsPause.textContent = "Pause";
		};
		utterance.onerror = (event) => {
			els.ttsStatus.textContent = `Playback error: ${event.error}.`;
		};
		window.speechSynthesis.speak(utterance);
	}

	function toggleTtsPause() {
		if (!("speechSynthesis" in window) || !window.speechSynthesis.speaking)
			return;
		if (window.speechSynthesis.paused) {
			window.speechSynthesis.resume();
			els.ttsPause.textContent = "Pause";
			els.ttsStatus.textContent = "Playback resumed.";
		} else {
			window.speechSynthesis.pause();
			els.ttsPause.textContent = "Resume";
			els.ttsStatus.textContent = "Playback paused.";
		}
	}

	function stopTts() {
		if (!("speechSynthesis" in window)) return;
		window.speechSynthesis.cancel();
		els.ttsPause.textContent = "Pause";
		els.ttsStatus.textContent = "Playback stopped.";
	}

	function bindEvents() {
		const visualControls = [
			els.backgroundMode,
			els.backgroundColor,
			els.waveColor,
			els.accentColor,
			els.captionColor,
			els.captionFont,
			els.captionSize,
			els.captionWeight,
			els.captionAlign,
			els.captionCase,
			els.captionShadow,
		];
		for (const control of visualControls) {
			control.addEventListener("input", () => {
				readPreferencesFromControls();
			});
		}

		for (const control of [els.ttsRate, els.ttsPitch, els.ttsVolume])
			control.addEventListener("input", updateOutputs);
		els.addKeyword.addEventListener("click", addKeywordRule);
		els.keywordPhrase.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				addKeywordRule();
			}
		});
		els.savePreferences.addEventListener("click", savePreferences);
		els.startCapture.addEventListener("click", beginCapture);
		els.stopCapture.addEventListener("click", stopCapture);
		els.clearCaption.addEventListener("click", () => {
			state.transcript = "";
			els.interimText.textContent = "";
			renderCaption();
			setSupport(
				"The display was cleared. Saved caption segments were not deleted.",
			);
		});
		els.playRecording.addEventListener("click", async () => {
			if (!state.recordedBlobs || !state.recordedBlobs.length) return;
			const blob = new Blob(state.recordedBlobs, {
				type: state.recordedBlobs[0].type || "audio/webm",
			});
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			audio.onended = () => URL.revokeObjectURL(url);
			audio
				.play()
				.catch((err) => setSupport(`Playback failed: ${err.message}`, true));
		});
		els.exportCaption.addEventListener("click", exportCaptionFile);

		els.ttsUseCaption.addEventListener("click", () => {
			els.ttsText.value = state.transcript;
			els.ttsStatus.textContent = state.transcript
				? "Current caption copied into TTS."
				: "There is no caption text yet.";
		});
		els.ttsPlay.addEventListener("click", speakText);
		els.ttsPause.addEventListener("click", toggleTtsPause);
		els.ttsStop.addEventListener("click", stopTts);
		window.addEventListener("resize", () => drawFrame(performance.now()), {
			passive: true,
		});
		window.addEventListener("beforeunload", () => {
			state.shouldRecognize = false;
			state.audioStream?.getTracks().forEach((track) => track.stop());
			if ("speechSynthesis" in window) window.speechSynthesis.cancel();
		});
	}

	async function init() {
		bindEvents();
		try {
			const { preferences } = await api("/api/v1/preferences");
			state.preferences = {
				...defaults,
				...preferences,
				keywordRules: Array.isArray(preferences.keywordRules)
					? preferences.keywordRules
					: [],
			};
		} catch (error) {
			setSupport(`Could not load saved settings: ${error.message}`, true);
		}

		fillPreferenceControls(state.preferences);
		applyPreferences();
		loadVoices();
		if ("speechSynthesis" in window)
			window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

		if (!SpeechRecognitionCtor) {
			setSupport(
				"SpeechRecognition is not available in this browser. Microphone waves and TTS can still work; live captions need a compatible browser or a server transcription adapter.",
				true,
			);
		} else {
			setSupport(
				"Ready. Final recognition results are autosaved to SQLite while capture is active.",
			);
		}
		setStatus("Idle", false);
	}

	init();
})();
