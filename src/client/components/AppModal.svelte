<script lang="ts">
  import { modalState, settleModal } from "$lib/stores/modal";

  let dialogEl: HTMLDialogElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);

  // Open/close the native <dialog> in response to store changes and focus the input.
  $effect(() => {
    const state = $modalState;
    if (!dialogEl) return;
    if (state.open && !dialogEl.open) {
      dialogEl.showModal();
      if (state.prompt) queueMicrotask(() => inputEl?.focus());
    } else if (!state.open && dialogEl.open) {
      dialogEl.close();
    }
  });

  function onConfirm() {
    const state = $modalState;
    settleModal(state.prompt ? $modalState.inputValue : true);
  }

  function onCancel() {
    const state = $modalState;
    settleModal(state.prompt ? null : state.showCancel ? false : true);
  }

  // Native dialog cancel (Escape) — resolve like a cancel.
  function onDialogCancel(event: Event) {
    event.preventDefault();
    onCancel();
  }
</script>

<dialog
  id="appModal"
  class="app-modal"
  class:dialog-danger={$modalState.tone === "danger"}
  aria-labelledby="appModalTitle"
  aria-describedby="appModalMessage"
  bind:this={dialogEl}
  oncancel={onDialogCancel}
>
  <form method="dialog" class="dialog-card" class:dialog-danger={$modalState.tone === "danger"}>
    <h3 id="appModalTitle" class:hidden={!$modalState.title}>{$modalState.title}</h3>
    <p id="appModalMessage" class="dialog-message" class:hidden={!$modalState.message}>{$modalState.message}</p>
    <label id="appModalFieldWrap" class="field app-modal-field" class:hidden={!$modalState.prompt}>
      <span id="appModalFieldLabel" class:hidden={!$modalState.fieldLabel}>{$modalState.fieldLabel}</span>
      <input id="appModalInput" type="text" autocomplete="off" bind:value={$modalState.inputValue} bind:this={inputEl} />
    </label>
    <div class="dialog-actions">
      <button id="appModalCancel" class="ghost-btn" type="button" class:hidden={!$modalState.showCancel} onclick={onCancel}>
        {$modalState.cancelLabel}
      </button>
      <button id="appModalConfirm" class="primary-btn" type="button" onclick={onConfirm}>
        {$modalState.confirmLabel}
      </button>
    </div>
  </form>
</dialog>
