export function ui<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(text: string, action: () => void, className = "") {
  const node = ui("button", text, className);
  node.type = "button";
  // Webpage scripts can inspect an open shadow root, but cannot authorize a
  // model request or mutate vocabulary by dispatching a synthetic click.
  node.addEventListener("click", (event) => {
    if (event.isTrusted) action();
  });
  return node;
}
export function spriteIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [key, value] of Object.entries({
    width: "24",
    height: "24",
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.7",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
    class: "sprite",
  }))
    svg.setAttribute(key, value);
  const paths = [
    "M9 12 5 9.5l1.6 7A9.5 9.5 0 0 0 9.5 24L9 27l4-2a11 11 0 0 0 6 0l4 2-.5-3a9.5 9.5 0 0 0 2.9-7.5l1.6-7-4 2.5a10.5 10.5 0 0 0-14 0Z",
    "M16 9c-.5-3.8 1.4-5.8 4.5-6-.1 3-1.8 4.6-4.5 4.5",
    "M14 21c1.2 1.2 2.8 1.2 4 0",
  ];
  paths.forEach((d) => {
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  for (const cx of ["12", "20"]) {
    const eye = document.createElementNS(svg.namespaceURI, "ellipse");
    for (const [key, value] of Object.entries({
      cx,
      cy: "17.5",
      rx: "1.1",
      ry: "1.5",
      fill: "currentColor",
      stroke: "none",
    }))
      eye.setAttribute(key, value);
    svg.append(eye);
  }
  return svg;
}
export const UI_STYLE = `
:host{all:initial;color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#302b2d;font-size:14px;line-height:1.6}
.panel,.word-card{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;color:#302b2d}
*{box-sizing:border-box}button,input,select{font:inherit}button,select{cursor:pointer}button{border:1px solid #e7dce0;background:#fff;color:#51434a;padding:7px 11px;border-radius:10px;line-height:1.4}button:hover{background:#f9edf1}button:disabled{opacity:.55;cursor:wait}button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid #ad5677;outline-offset:3px}.primary{background:#8b5067;color:white;border-color:#8b5067}.primary:hover{background:#744256}.selected{background:#f8e3eb;border-color:#c48ba0}.quiet{border:0;background:transparent;padding:4px 7px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.between{justify-content:space-between}.muted{color:#766b70;font-size:12px}.notice{padding:10px;background:#faf4f6;border-radius:10px;font-size:12px;color:#6e5963}.error{color:#a02f49}.message{margin:10px 0 0;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}h2,h3,p{margin:0}h2{font-size:20px;font-weight:650;line-height:1.35;overflow-wrap:anywhere}h3{font-size:14px;font-weight:650}.stack{display:grid;gap:12px}select{border:1px solid #e7dce0;background:white;border-radius:8px;padding:5px;color:#51434a;max-width:100%}label{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px}strong{font-weight:650}.panel,.word-card{position:fixed;z-index:2147483647;right:18px;background:#fffdfd;border:1px solid #eadce2;border-radius:18px;box-shadow:0 10px 40px #38212c26;padding:17px;width:320px;max-width:calc(100vw - 24px)}.panel{bottom:18px;max-height:calc(100vh - 36px);overflow:auto}.panel.collapsed{width:auto;padding:8px 11px}.panel.collapsed .panel-body{display:none}.panel-body{margin-top:12px}.word-card{top:24px;max-height:calc(100vh - 48px);overflow:auto;width:360px}.word-card .meaning{font-size:17px;font-weight:550;margin-top:10px}.section{padding-top:12px;margin-top:12px;border-top:1px solid #eee5e9}.sentence{font-size:15px;margin-top:5px;overflow-wrap:anywhere}.word-card details p{font-size:13px;margin-top:7px}.word-card summary{cursor:pointer}.sprite{color:#a2677e;font-size:20px;line-height:1}.saved{font-size:12px;color:#71656a}.actions{margin-top:12px}.preview{font-size:12px;line-height:1.6;color:#73646b;max-height:100px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border-left:2px solid #e5b7c9}.close{font-size:19px;line-height:1;padding:4px 7px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}[hidden]{display:none!important}
@media(max-width:600px){.panel{right:10px;bottom:10px;max-height:50vh;width:calc(100vw - 20px);padding:12px}.panel.collapsed{width:auto}.word-card{top:auto;bottom:10px;right:10px;width:calc(100vw - 20px);max-height:55vh;padding:16px}.word-card h2{font-size:19px}}
`;
