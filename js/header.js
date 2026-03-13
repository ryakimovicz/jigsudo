document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const shrinkThreshold = 120;
  const expandThreshold = 5;

  const handleScroll = () => {
    // If body is scroll-locked (modal open), don't update header state
    if (body.classList.contains("no-scroll")) return;

    const currentScrollY = window.scrollY;

    if (currentScrollY > shrinkThreshold) {
      if (!body.classList.contains("header-condensed")) {
        body.classList.add("header-condensed");
      }
    } else if (currentScrollY < expandThreshold) {
      if (body.classList.contains("header-condensed")) {
        body.classList.remove("header-condensed");
      }
    }
  };

  // Listen for scroll on window
  window.addEventListener("scroll", handleScroll, { passive: true });

  // Initial check
  handleScroll();
});
