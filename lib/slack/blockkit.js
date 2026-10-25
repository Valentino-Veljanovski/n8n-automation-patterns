/**
 * Slack Block Kit builders. Each returns the exact object Slack expects, so
 * a block list can be logged, pasted into Block Kit Builder and compared in
 * tests without an API call.
 */

/** @param {string} text */
function plain(text) {
  return { type: "plain_text", text, emoji: true };
}

/** @param {string} text mrkdwn */
export function section(text) {
  return { type: "section", text: { type: "mrkdwn", text } };
}

/**
 * @param {string} text
 * @param {string} actionId
 * @param {"primary" | "danger"} [style]
 */
export function button(text, actionId, style) {
  /** @type {Record<string, any>} */
  const element = { type: "button", text: plain(text), action_id: actionId };
  if (style) element.style = style;
  return element;
}

export function divider() {
  return { type: "divider" };
}

/** @param {string} text */
export function header(text) {
  return { type: "header", text: { type: "plain_text", text } };
}

/** @param {string[]} texts mrkdwn snippets */
export function context(texts) {
  return { type: "context", elements: texts.map((text) => ({ type: "mrkdwn", text })) };
}

/** @param {Record<string, any>[]} elements */
export function actions(elements) {
  return { type: "actions", elements };
}

/** @param {Record<string, any>[]} blocks */
export function homeView(blocks) {
  return { type: "home", blocks };
}

/**
 * Body for `views.publish`.
 * @param {string} userId
 * @param {Record<string, any>[]} blocks
 */
export function publishHomePayload(userId, blocks) {
  return { user_id: userId, view: homeView(blocks) };
}

/**
 * @param {{ blockId: string, actionId: string, label: string, hint?: string, placeholder?: string, optional?: boolean }} options
 */
export function plainTextInput({ blockId, actionId, label, hint, placeholder, optional }) {
  /** @type {Record<string, any>} */
  const block = { type: "input", block_id: blockId };
  if (optional) block.optional = true;
  block.label = plain(label);
  if (hint) block.hint = plain(hint);
  /** @type {Record<string, any>} */
  const element = { type: "plain_text_input", action_id: actionId };
  if (placeholder) element.placeholder = { type: "plain_text", text: placeholder };
  block.element = element;
  return block;
}

/**
 * A modal view. `privateMetadata` may be an object; it is serialised so the
 * submission handler can read it back.
 * @param {{ callbackId: string, privateMetadata?: unknown, title: string, submit?: string, close?: string, blocks: Record<string, any>[] }} options
 */
export function modal({ callbackId, privateMetadata, title, submit, close, blocks }) {
  /** @type {Record<string, any>} */
  const view = { type: "modal", callback_id: callbackId };
  if (privateMetadata !== undefined) {
    view.private_metadata = typeof privateMetadata === "string" ? privateMetadata : JSON.stringify(privateMetadata);
  }
  view.title = plain(title);
  if (submit) view.submit = plain(submit);
  if (close) view.close = plain(close);
  view.blocks = blocks;
  return view;
}

/**
 * Body for `views.open`.
 * @param {string} triggerId
 * @param {Record<string, any>} view
 */
export function openModalPayload(triggerId, view) {
  return { trigger_id: triggerId, view };
}
