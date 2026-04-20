<script lang="ts">
import { onDestroy, onMount } from "svelte"

const STORAGE_KEY = "muleta.brand_intro_played"

/**
 * Stages:
 *   0 rest — initial
 *   1 charge — cape raises, bull gallops in from right
 *   2 pass — bull through cape zone, cape sweeps
 *   3 flourish — bull exits left, cape settles, text fades in
 *   4 rest — final
 */
let stage = $state(0)
let timers: ReturnType<typeof setTimeout>[] = []

function clearTimers() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

function play() {
  clearTimers()
  stage = 0
  timers.push(setTimeout(() => (stage = 1), 20))
  timers.push(setTimeout(() => (stage = 2), 420))
  timers.push(setTimeout(() => (stage = 3), 860))
  timers.push(setTimeout(() => (stage = 4), 1600))
}

onMount(() => {
  const played = sessionStorage.getItem(STORAGE_KEY) === "1"
  if (played) {
    stage = 4
    return
  }
  const t = setTimeout(() => {
    play()
    sessionStorage.setItem(STORAGE_KEY, "1")
  }, 300)
  timers.push(t)
})

onDestroy(clearTimers)

function onHover() {
  if (stage === 4) play()
}
</script>

<div
  class="brand-intro stage-{stage}"
  onmouseenter={onHover}
  role="img"
  aria-label="muleta"
  title="muleta"
>
  <svg
    viewBox="0 0 88 24"
    width="88"
    height="24"
    class="brand-intro-svg"
    aria-hidden="true"
  >
    <!-- Dust cloud (stage 2 only) -->
    <g class="bi-dust">
      <circle cx="52" cy="20" r="1.5" fill="currentColor" opacity="0.25" />
      <circle cx="48" cy="21" r="1.2" fill="currentColor" opacity="0.2" />
      <circle cx="56" cy="21" r="1" fill="currentColor" opacity="0.18" />
    </g>

    <!-- The cape -->
    <g class="bi-cape">
      <path
        d="M4 20 L4 4 L13 8 L20 5 L20 14 L13 17 L4 20 Z"
        fill="currentColor"
        fill-opacity="0.18"
      />
      <path
        d="M4 4 L4 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M4 4 L13 8 L20 5"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M20 5 L20 14 L13 17 L4 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M13 8 L13 17"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        stroke-opacity="0.5"
        stroke-linecap="round"
      />
    </g>

    <!-- The bull — charges in from the right, passes through cape, exits left -->
    <g class="bi-bull" fill="currentColor">
      <path
        d="M0 18 L-1 16 L-2 14.5 L-1 13 L1 12.5 L5 12 L9 12.2 L12 13 L13 14.5 L12.5 16 L13 17 L13 19 L11 19 L10.5 18 L8 18 L7.5 19 L5.5 19 L5 18 L2 18 L1 19 L-0.5 19 Z"
      />
      <path d="M12.8 13.2 L14.5 12 L13.4 13.8 Z" />
      <path d="M3 18 L3 21 L3.8 21 L3.8 18 Z" opacity="0.8" />
      <path d="M9 18 L9 21 L9.8 21 L9.8 18 Z" opacity="0.8" />
    </g>

    <!-- "muleta" wordmark (letters fade in one by one during stage 3) -->
    <g class="bi-text">
      <text
        x="26"
        y="17"
        font-size="14"
        font-weight="600"
        letter-spacing="-0.09em"
      >
        <tspan class="bi-ch" style="animation-delay:0ms">m</tspan>
        <tspan class="bi-ch" style="animation-delay:40ms">u</tspan>
        <tspan class="bi-ch" style="animation-delay:80ms">l</tspan>
        <tspan class="bi-ch" style="animation-delay:120ms">e</tspan>
        <tspan class="bi-ch" style="animation-delay:160ms">t</tspan>
        <tspan class="bi-ch" style="animation-delay:200ms">a</tspan>
      </text>
    </g>
  </svg>
</div>

<style>
  .brand-intro {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    color: var(--color-primary);
    height: 24px;
  }
  .brand-intro-svg {
    display: block;
    overflow: visible;
  }
  .brand-intro-svg text {
    fill: var(--color-base-content);
    font-family: var(--font-sans);
    paint-order: stroke fill;
  }

  /* Resting poses — transitions carry elements between stages */
  .bi-cape {
    transform-origin: 12px 12px;
    transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .bi-bull {
    opacity: 0;
    transition:
      transform 0.4s linear,
      opacity 0.15s ease-out;
  }
  .bi-dust {
    opacity: 0;
    transition: opacity 0.2s ease-out;
  }
  .bi-ch {
    opacity: 0;
  }

  /* Stage 1 — charge: cape raises, bull gallops in from offstage right */
  .stage-1 .bi-cape {
    transform: translate(0, -2px) rotate(-8deg) scale(1.05, 0.95);
  }
  .stage-1 .bi-bull {
    opacity: 1;
    transform: translate(-28px, 0);
    animation: bi-gallop-in 0.38s cubic-bezier(0.45, 0, 0.35, 1);
  }
  @keyframes bi-gallop-in {
    0% {
      transform: translate(18px, 0);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    100% {
      transform: translate(-28px, 0);
      opacity: 1;
    }
  }

  /* Stage 2 — pass: bull through cape zone, cape sweeps to the right */
  .stage-2 .bi-cape {
    transform: translate(6px, 0) rotate(22deg) scale(1.1, 0.9) skewX(-6deg);
  }
  .stage-2 .bi-bull {
    opacity: 1;
    transform: translate(-70px, 0);
    animation: bi-gallop-through 0.44s linear;
  }
  @keyframes bi-gallop-through {
    0% {
      transform: translate(-28px, 0);
    }
    100% {
      transform: translate(-70px, 0);
    }
  }
  .stage-2 .bi-dust {
    opacity: 1;
    animation: bi-dust-puff 0.44s ease-out;
  }
  @keyframes bi-dust-puff {
    0% {
      opacity: 0;
      transform: scale(0.6);
      transform-origin: 50px 20px;
    }
    40% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(1.6) translate(-6px, -1px);
      transform-origin: 50px 20px;
    }
  }

  /* Stage 3 — flourish: bull gone, cape wobbles back to rest, letters fade in */
  .stage-3 .bi-cape {
    transform: translate(0, 0) rotate(0deg) scale(1, 1);
    animation: bi-flourish 0.68s cubic-bezier(0.25, 1.4, 0.5, 1);
  }
  @keyframes bi-flourish {
    0% {
      transform: translate(6px, 0) rotate(22deg) scale(1.1, 0.9);
    }
    40% {
      transform: translate(-2px, 0) rotate(-6deg) scale(1, 1.03);
    }
    70% {
      transform: translate(0, 0) rotate(3deg) scale(1, 1);
    }
    100% {
      transform: translate(0, 0) rotate(0deg) scale(1, 1);
    }
  }
  .stage-3 .bi-bull {
    opacity: 0;
    transform: translate(-88px, 0);
  }
  .stage-3 .bi-ch {
    animation: bi-letter-in 0.36s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  @keyframes bi-letter-in {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Stage 4 — rest: lock in final state */
  .stage-4 .bi-cape {
    transform: none;
  }
  .stage-4 .bi-bull {
    opacity: 0;
    transform: translate(28px, 0);
  }
  .stage-4 .bi-dust {
    opacity: 0;
  }
  .stage-4 .bi-ch {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .brand-intro *,
    .bi-cape,
    .bi-bull,
    .bi-dust,
    .bi-ch {
      animation: none !important;
      transition: none !important;
    }
    .bi-cape {
      transform: none !important;
    }
    .bi-bull,
    .bi-dust {
      opacity: 0 !important;
    }
    .bi-ch {
      opacity: 1 !important;
    }
  }
</style>
