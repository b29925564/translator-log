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
