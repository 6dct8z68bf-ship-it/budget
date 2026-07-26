<script lang="ts">
  import { tick } from "svelte";
  import { t } from "$lib/stores/i18n";
  import { isAuthLocked } from "$lib/stores/auth";
  import {
    onboarding,
    nextOnboardingStep,
    prevOnboardingStep,
    stopOnboarding,
  } from "$lib/stores/onboarding";

  const CONFETTI_COLORS = ["#1967d2", "#34a853", "#fbbc04", "#ea4335", "#a142f4", "#24c1e0", "#ff6d00"];

  const step = $derived($onboarding.steps[$onboarding.stepIndex]);
  const visible = $derived($onboarding.active && !$isAuthLocked);
  const isWelcome = $derived(step?.layout === "welcome");
  const isFinish = $derived(step?.layout === "finish");
  const isContent = $derived(step?.layout === "content");
  const isLast = $derived($onboarding.stepIndex === $onboarding.steps.length - 1);

  const contentSteps = $derived($onboarding.steps.filter((s) => s.layout === "content"));
  const contentIndex = $derived(step ? contentSteps.indexOf(step) : -1);

  interface Spot { top: number; bottom: number; left: number; right: number; hlLeft: number; hlWidth: number; hlHeight: number; on: boolean }
  let spot = $state<Spot>({ top: 0, bottom: 0, left: 0, right: 0, hlLeft: 0, hlWidth: 0, hlHeight: 0, on: false });
  let confetti = $state<{ style: string }[]>([]);

  function measure() {
    if (!visible || !isContent || !step?.selector) {
      spot = { top: 0, bottom: 0, left: 0, right: 0, hlLeft: 0, hlWidth: 0, hlHeight: 0, on: false };
      return;
    }
    const target = document.querySelector(step.selector);
    if (!target) {
      spot = { top: 0, bottom: 0, left: 0, right: 0, hlLeft: 0, hlWidth: 0, hlHeight: 0, on: false };
      return;
    }
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const rect = target.getBoundingClientRect();
    const pad = 10;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const top = Math.max(0, rect.top - pad);
    spot = {
      top,
      bottom: Math.max(0, h - rect.bottom - pad),
      left: Math.max(0, rect.left - pad),
      right: Math.max(0, w - rect.right - pad),
      hlLeft: Math.max(0, rect.left - pad),
      hlWidth: rect.width + pad * 2,
      hlHeight: rect.height + pad * 2,
      on: true,
    };
  }

  // Re-measure the spotlight when the step changes (after the DOM/view settles).
  $effect(() => {
    void $onboarding.stepIndex;
    void visible;
    if (!visible) {
      spot = { top: 0, bottom: 0, left: 0, right: 0, hlLeft: 0, hlWidth: 0, hlHeight: 0, on: false };
      return;
    }
    void tick().then(() => requestAnimationFrame(() => requestAnimationFrame(measure)));
  });

  // Toggle body scroll-lock class while the tour is open.
  $effect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("onboarding-open", visible);
  });

  // Confetti burst on the finish step.
  $effect(() => {
    if (visible && isFinish) {
      confetti = Array.from({ length: 72 }, () => {
        const size = 6 + Math.random() * 7;
        return {
          style: [
            `left:${Math.random() * 100}%`,
            `background:${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]}`,
            `animation-delay:${(Math.random() * 0.9).toFixed(2)}s`,
            `animation-duration:${(1.3 + Math.random() * 0.9).toFixed(2)}s`,
            `width:${size.toFixed(1)}px`,
            `height:${(size * 1.3).toFixed(1)}px`,
            `border-radius:${Math.random() > 0.5 ? "50%" : "2px"}`,
            `transform:rotate(${Math.floor(Math.random() * 360)}deg)`,
          ].join(";"),
        };
      });
    } else {
      confetti = [];
    }
  });

  function onKeydown(event: KeyboardEvent) {
    if (!visible) return;
    if (event.key === "Escape") stopOnboarding({ completed: true });
    if (event.key === "ArrowRight" || event.key === "Enter") {
      event.preventDefault();
      nextOnboardingStep();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prevOnboardingStep();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} onresize={measure} />

<div id="onboardingOverlay" class="onboarding-overlay" class:hidden={!visible}>
  <div id="onboardingBackdropTop" class="ob-backdrop" class:hidden={!spot.on} style="height:{spot.top}px"></div>
  <div id="onboardingBackdropBottom" class="ob-backdrop ob-backdrop-bottom" class:hidden={!spot.on} style="height:{spot.bottom}px"></div>
  <div id="onboardingBackdropLeft" class="ob-backdrop" class:hidden={!spot.on} style="top:{spot.top}px;height:{spot.hlHeight}px;width:{spot.left}px"></div>
  <div id="onboardingBackdropRight" class="ob-backdrop" class:hidden={!spot.on} style="top:{spot.top}px;height:{spot.hlHeight}px;width:{spot.right}px;right:0;left:auto"></div>
  <div id="onboardingHighlight" class="ob-highlight" class:hidden={!spot.on} style="top:{spot.top}px;left:{spot.hlLeft}px;width:{spot.hlWidth}px;height:{spot.hlHeight}px"></div>

  {#if step}
    <div
      id="onboardingCard"
      class="onboarding-card"
      class:onboarding-card--center={isWelcome || isFinish}
      class:onboarding-card--corner={isContent}
      class:onboarding-card--welcome={isWelcome}
      class:onboarding-card--finish={isFinish}
    >
      <p id="onboardingStepLabel" class="ob-step-label" class:hidden={!isContent}>
        {isContent ? $t("guidedIntroProgress", contentIndex + 1, contentSteps.length) : ""}
      </p>
      <h3 id="onboardingTitle">{$t(step.titleKey, step.titleArg)}</h3>
      <p id="onboardingBody">{$t(step.bodyKey)}</p>
      <div id="onboardingDots" class="ob-dots">
        {#each $onboarding.steps as _, i}
          <span class="ob-dot" class:ob-dot--active={i === $onboarding.stepIndex}></span>
        {/each}
      </div>
      <div class="onboarding-actions">
        <button id="onboardingBackBtn" class="ghost-btn" type="button" disabled={$onboarding.stepIndex === 0} onclick={prevOnboardingStep}>
          {$t("guidedIntroBack")}
        </button>
        <button id="onboardingSkipBtn" class="ghost-btn" type="button" class:hidden={isFinish} onclick={() => stopOnboarding({ completed: true })}>
          {$t("guidedIntroSkip")}
        </button>
        <button id="onboardingNextBtn" class="primary-btn" type="button" onclick={nextOnboardingStep}>
          {isLast ? $t("guidedIntroFinish") : $t("guidedIntroNext")}
        </button>
      </div>
    </div>
  {/if}

  <div id="confettiContainer" class="ob-confetti-container" aria-hidden="true">
    {#each confetti as piece}<div class="ob-confetti" style={piece.style}></div>{/each}
  </div>
</div>
