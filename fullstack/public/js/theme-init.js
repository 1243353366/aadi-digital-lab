// Set theme before first paint to avoid a flash of the wrong theme.
(function () {
  "use strict";
  var t = "dark";
  try {
    t = localStorage.getItem("adl-theme") ||
        (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  } catch (e) {}
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.classList.add("js");
})();
