// 確認對話框（原生 <dialog>：焦點會被困在對話框裡、Esc 關閉、螢幕閱讀器認得）。

import { h } from './dom';

export function confirmDialog(message: string, ok = '確定', cancel = '取消'): Promise<boolean> {
  return new Promise((resolve) => {
    const okBtn = h('button', { class: 'btn primary', value: 'ok' }, ok);
    const cancelBtn = h('button', { class: 'btn', value: 'cancel' }, cancel);
    const form = h('form', { method: 'dialog' }, h('p', {}, message), h('div', { class: 'dialog-actions' }, cancelBtn, okBtn));
    const dlg = h('dialog', { class: 'panel', 'aria-label': message }, form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'ok');
      dlg.remove();
    });
    dlg.showModal();
    okBtn.focus();
  });
}

/** 輸入一行文字（例如重新命名）。取消或空白時回傳 null。 */
export function promptDialog(message: string, value: string, ok = '確定'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'text', value, 'aria-label': message, maxlength: 80, class: 'dialog-input' });
    const okBtn = h('button', { class: 'btn primary', value: 'ok' }, ok);
    const cancelBtn = h('button', { class: 'btn', value: 'cancel', formnovalidate: true }, '取消');
    const form = h('form', { method: 'dialog' }, h('p', {}, message), input, h('div', { class: 'dialog-actions' }, cancelBtn, okBtn));
    const dlg = h('dialog', { class: 'panel', 'aria-label': message }, form);
    document.body.append(dlg);
    dlg.addEventListener('close', () => {
      const v = input.value.trim();
      resolve(dlg.returnValue === 'ok' && v ? v : null);
      dlg.remove();
    });
    dlg.showModal();
    input.select();
  });
}
