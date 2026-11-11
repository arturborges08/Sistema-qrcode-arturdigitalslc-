// Aplica o tema salvo (ou o do sistema) antes de a página aparecer, para não piscar branco no modo escuro.
(function () {
  try {
    var t = localStorage.getItem("tema");
    var dark = t === "escuro" || ((t === null || t === "sistema") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
