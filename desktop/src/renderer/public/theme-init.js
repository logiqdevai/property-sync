// Applies the saved theme before React renders, so the window never flashes the wrong theme.
try {
  var t = localStorage.getItem("theme");
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
} catch (e) {
  document.documentElement.setAttribute("data-theme", "dark");
}
