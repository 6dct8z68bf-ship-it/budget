// Promise-based confirm/alert/prompt modal, ported from openModal/confirmDialog/
// alertDialog/promptDialog in app.js (5445-5502). AppModal.svelte renders the state
// and calls settleModal() with the user's answer.
import { writable } from "svelte/store";
import { translate } from "$lib/i18n";
import { getLanguage } from "$lib/stores/i18n";

export type ModalTone = "default" | "danger";
export type ModalResult = boolean | string | null;

export interface ModalState {
  open: boolean;
  title: string;
  message: string;
  tone: ModalTone;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  prompt: boolean;
  fieldLabel: string;
  inputValue: string;
}

const closedState: ModalState = {
  open: false,
  title: "",
  message: "",
  tone: "default",
  confirmLabel: "",
  cancelLabel: "",
  showCancel: true,
  prompt: false,
  fieldLabel: "",
  inputValue: "",
};

export const modalState = writable<ModalState>({ ...closedState });

let resolver: ((value: ModalResult) => void) | null = null;

function t(key: string): string {
  return translate(getLanguage(), key);
}

interface OpenModalOptions {
  title?: string;
  message?: string;
  tone?: ModalTone;
  confirmLabel?: string;
  cancelLabel?: string;
  showCancel?: boolean;
  prompt?: boolean;
  fieldLabel?: string;
  defaultValue?: string;
}

export function openModal(options: OpenModalOptions = {}): Promise<ModalResult> {
  return new Promise((resolve) => {
    resolver = resolve;
    modalState.set({
      open: true,
      title: options.title ?? "",
      message: options.message ?? "",
      tone: options.tone ?? "default",
      confirmLabel: options.confirmLabel || t("dialogConfirm"),
      cancelLabel: options.cancelLabel || t("cancel"),
      showCancel: options.showCancel ?? true,
      prompt: options.prompt ?? false,
      fieldLabel: options.fieldLabel ?? "",
      inputValue: options.defaultValue ?? "",
    });
  });
}

// Called by AppModal on confirm/cancel/escape.
export function settleModal(value: ModalResult): void {
  const resolve = resolver;
  resolver = null;
  modalState.set({ ...closedState });
  if (resolve) resolve(value);
}

export function confirmDialog(
  message: string,
  { title, tone = "danger", confirmLabel }: { title?: string; tone?: ModalTone; confirmLabel?: string } = {},
): Promise<ModalResult> {
  return openModal({ title: title || t("dialogConfirmTitle"), message, tone, confirmLabel, showCancel: true });
}

export function alertDialog(message: string, { title }: { title?: string } = {}): Promise<ModalResult> {
  return openModal({ title: title || t("dialogNoticeTitle"), message, showCancel: false, confirmLabel: t("dialogOk") });
}

export function promptDialog(
  message: string,
  { title, fieldLabel, defaultValue = "" }: { title?: string; fieldLabel?: string; defaultValue?: string } = {},
): Promise<ModalResult> {
  return openModal({
    title: title || t("dialogNoticeTitle"),
    message,
    prompt: true,
    fieldLabel,
    defaultValue,
    confirmLabel: t("dialogConfirm"),
  });
}
