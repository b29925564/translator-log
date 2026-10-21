// 每一頁都是：一個根元素＋顯示／隱藏＋處理這一頁的快捷鍵（回傳 true 表示處理掉了）。

export type Page = {
  el: HTMLElement;
  show(): void;
  hide(): void;
  onKey(e: KeyboardEvent): boolean;
};
